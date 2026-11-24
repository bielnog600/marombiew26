import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { AccessStatus, SuspensionReason } from '@/lib/accessControl';
import { LAST_ACTIVE_THROTTLE_MS } from '@/lib/accessControl';
import {
  cacheOfflineUser,
  getCachedOfflineUser,
  getCachedRole,
  setCachedRole,
} from '@/lib/offlineAuth';

type UserRole = 'admin' | 'aluno';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  loading: boolean;
  accessStatus: AccessStatus | null;
  suspensionReason: SuspensionReason | null;
  lastActiveAt: string | null;
  accessLoading: boolean;
  refreshAccessStatus: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, nome: string, role?: UserRole) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);


/** Mesmo usuário com os mesmos dados (a renovação do token não muda nada disso). */
export const isSameUser = (a: User | null, b: User | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.id !== b.id || a.email !== b.email || a.updated_at !== b.updated_at) return false;
  try {
    return JSON.stringify(a.user_metadata ?? null) === JSON.stringify(b.user_metadata ?? null)
      && JSON.stringify(a.app_metadata ?? null) === JSON.stringify(b.app_metadata ?? null);
  } catch {
    return false;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const accessStatusRef = useRef<AccessStatus | null>(null);
  accessStatusRef.current = accessStatus;
  const [suspensionReason, setSuspensionReason] = useState<SuspensionReason | null>(null);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const intentionalSignOut = useRef(false);
  const isRefreshing = useRef(false);

  const fetchRole = async (userId: string): Promise<UserRole> => {
    // Try cache first
    const cached = getCachedRole(userId);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar role:', error);
        // If offline, try to use cached role
        const fallback = getCachedRole(userId);
        return fallback ?? 'aluno';
      }

      const userRole = (data?.role as UserRole) ?? 'aluno';
      setCachedRole(userId, userRole);
      return userRole;
    } catch (err) {
      console.error('Erro de rede ao buscar role:', err);
      const fallback = getCachedRole(userId);
      return fallback ?? 'aluno';
    }
  };

  useEffect(() => {
    let mounted = true;

    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return;

      // Sem rede, a cópia local é suficiente para abrir o app. O token será
      // renovado pelo Supabase ao reconectar; nunca deslogamos por expiração offline.
      if (!nextSession?.user && !intentionalSignOut.current && !navigator.onLine) {
        const cachedUser = getCachedOfflineUser();
        if (cachedUser) {
          setSession(null);
          setUser(prev => (isSameUser(prev, cachedUser) ? prev : cachedUser));
          setRole(getCachedRole(cachedUser.id) ?? 'aluno');
          return;
        }
      }

      if (!nextSession?.user && !intentionalSignOut.current && !isRefreshing.current) {
        const cachedInfo = getCachedOfflineUser();
        if (cachedInfo) {
          try {
            isRefreshing.current = true;
            const { data: refreshData } = await supabase.auth.refreshSession();
            if (refreshData?.session) {
              nextSession = refreshData.session;
            }
          } catch {
            if (user && role) {
              console.log('Offline: mantendo sessão existente');
              return;
            }
          } finally {
            isRefreshing.current = false;
          }
        }
      }

      setSession(nextSession);
      // Renovação do token (a cada hora e ao voltar para o app) traz um objeto
      // de usuário novo com os mesmos dados; manter a mesma referência evita
      // que telas inteiras recarreguem os dados e pisquem.
      const nextUser = nextSession?.user ?? null;
      setUser(prev => (isSameUser(prev, nextUser) ? prev : nextUser));

      if (!nextSession?.user) {
        if (intentionalSignOut.current) {
          setRole(null);
          cacheOfflineUser(null);
          localStorage.removeItem('marombiew_user_role');
          intentionalSignOut.current = false;
        }
        return;
      }

      cacheOfflineUser(nextSession.user);
      const userRole = await fetchRole(nextSession.user.id);
      if (mounted) setRole(userRole);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Only clear on explicit sign out
      if (event === 'SIGNED_OUT' && !intentionalSignOut.current && !isRefreshing.current) {
        // This might be an automatic token refresh failure
        // Try to recover silently
        console.log('Sessão perdida inesperadamente, tentando recuperar...');
        isRefreshing.current = true;
        supabase.auth.refreshSession().then(({ data }) => {
          isRefreshing.current = false;
          if (data?.session && mounted) {
            applySession(data.session);
          } else if (mounted) {
            if (!navigator.onLine && getCachedOfflineUser()) {
              void applySession(null);
            } else {
              setSession(null);
              setUser(null);
              setRole(null);
            }
            setLoading(false);
          }
        }).catch(() => {
          isRefreshing.current = false;
          if (mounted && !navigator.onLine && getCachedOfflineUser()) void applySession(null);
          if (mounted) setLoading(false);
        });
        return;
      }

      void (async () => {
        try {
          await applySession(nextSession);
        } catch (error) {
          console.error('Erro no onAuthStateChange:', error);
          // Don't clear role on errors - keep cached state
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    });

    void (async () => {
      try {
        if (!navigator.onLine) {
          await applySession(null);
          return;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Erro ao recuperar sessão:', error);
          // Try cached session info to avoid logout
          const cached = getCachedOfflineUser();
          if (cached) {
            // Try refresh
            try {
              const { data: refreshData } = await supabase.auth.refreshSession();
              if (refreshData?.session) {
                await applySession(refreshData.session);
                return;
              }
            } catch {}
          }
        }
        await applySession(data.session ?? null);
      } catch (error) {
        console.error('Erro inesperado ao inicializar sessão:', error);
        // Don't clear state if we have cached info
        const cached = getCachedOfflineUser();
        if (!cached && mounted) {
          setSession(null);
          setUser(null);
          setRole(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ---- Access status (suspensão por inatividade / manual) ----
  // Ordem: AUTH -> ROLE -> ACCESS STATUS. Suspenso nunca renova last_active_at
  // (o heartbeat no banco é quem decide, e é ele que aplica a rede de proteção dos 15 dias).
  const runHeartbeat = useCallback(async (force = false) => {
    if (!navigator.onLine) {
      setAccessStatus(prev => prev ?? 'active');
      setAccessLoading(false);
      return;
    }
    if (!user || role !== 'aluno') {
      setAccessStatus(role === 'admin' ? 'active' : null);
      setSuspensionReason(null);
      setLastActiveAt(null);
      setAccessLoading(false);
      return;
    }
    const throttleKey = `marombiew_access_hb_${user.id}`;
    const last = Number(localStorage.getItem(throttleKey) ?? 0);
    // Read the latest status through a ref: the visibility listener keeps the first callback,
    // whose captured status was null, so the throttle never applied and every return to the app
    // called the heartbeat.
    const withinThrottle = !force && accessStatusRef.current === 'active' && Date.now() - last < LAST_ACTIVE_THROTTLE_MS;
    if (withinThrottle) return;

    try {
      const { data, error } = await (supabase as any).rpc('student_access_heartbeat');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setAccessStatus((row.access_status as AccessStatus) ?? 'active');
        setSuspensionReason((row.suspension_reason as SuspensionReason) ?? null);
        setLastActiveAt((row.last_active_at as string) ?? null);
        if (row.access_status === 'active') {
          try { localStorage.setItem(throttleKey, String(Date.now())); } catch {}
        }
      } else {
        // Sem students_profile: não bloquear o app.
        setAccessStatus('active');
        setSuspensionReason(null);
        setLastActiveAt(null);
      }
    } catch (err) {
      console.error('Erro ao verificar status de acesso:', err);
      // Offline / falha de rede: não bloquear indevidamente.
      setAccessStatus(prev => prev ?? 'active');
    } finally {
      setAccessLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAccessStatus(null);
      setSuspensionReason(null);
      setLastActiveAt(null);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    void runHeartbeat(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role, loading]);

  const signIn = async (email: string, password: string) => {
    intentionalSignOut.current = false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, nome: string, role: UserRole = 'aluno') => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome, role } }
    });
    return { error };
  };

  const signOut = async () => {
    intentionalSignOut.current = true;
    cacheOfflineUser(null);
    localStorage.removeItem('marombiew_user_role');
    setAccessStatus(null);
    setSuspensionReason(null);
    setLastActiveAt(null);
    // Use scope: 'local' to ensure signout only affects the current device
    await supabase.auth.signOut({ scope: 'local' });
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, loading,
      accessStatus, suspensionReason, lastActiveAt, accessLoading,
      refreshAccessStatus: () => runHeartbeat(true),
      signIn, signUp, signOut,
      isAdmin: role === 'admin'
    }}>
      {children}
    </AuthContext.Provider>

  );
};
