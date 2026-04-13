import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

type UserRole = 'admin' | 'aluno';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, nome: string, role?: UserRole) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

// Cache role in localStorage to avoid refetching on every reload
const ROLE_CACHE_KEY = 'marombiew_user_role';
const SESSION_CACHE_KEY = 'marombiew_cached_session';

const getCachedRole = (userId: string): UserRole | null => {
  try {
    const cached = localStorage.getItem(ROLE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.userId === userId) return parsed.role as UserRole;
    }
  } catch {}
  return null;
};

const setCachedRole = (userId: string, role: UserRole) => {
  try {
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role }));
  } catch {}
};

const cacheSession = (session: Session | null) => {
  try {
    if (session) {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
        user: { id: session.user.id, email: session.user.email },
        timestamp: Date.now()
      }));
    } else {
      localStorage.removeItem(SESSION_CACHE_KEY);
    }
  } catch {}
};

const getCachedSession = () => {
  try {
    const cached = localStorage.getItem(SESSION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Cache valid for 30 days
      if (Date.now() - parsed.timestamp < 30 * 24 * 60 * 60 * 1000) {
        return parsed;
      }
    }
  } catch {}
  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const intentionalSignOut = useRef(false);

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

      // If session is null but we didn't intentionally sign out,
      // try to recover before clearing state
      if (!nextSession?.user && !intentionalSignOut.current) {
        const cachedInfo = getCachedSession();
        if (cachedInfo) {
          // Don't clear user state yet - might be a transient network issue
          // Try to refresh the session
          try {
            const { data: refreshData } = await supabase.auth.refreshSession();
            if (refreshData?.session) {
              nextSession = refreshData.session;
            }
          } catch {
            // Offline or network error - keep existing state if we have it
            if (user && role) {
              console.log('Offline: mantendo sessão existente');
              return;
            }
          }
        }
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        if (intentionalSignOut.current) {
          setRole(null);
          cacheSession(null);
          localStorage.removeItem(ROLE_CACHE_KEY);
          intentionalSignOut.current = false;
        }
        return;
      }

      cacheSession(nextSession);
      const userRole = await fetchRole(nextSession.user.id);
      if (mounted) setRole(userRole);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Only clear on explicit sign out
      if (event === 'SIGNED_OUT' && !intentionalSignOut.current) {
        // This might be an automatic token refresh failure
        // Try to recover silently
        console.log('Sessão perdida inesperadamente, tentando recuperar...');
        supabase.auth.refreshSession().then(({ data }) => {
          if (data?.session && mounted) {
            applySession(data.session);
          } else if (mounted) {
            // Really signed out
            setSession(null);
            setUser(null);
            setRole(null);
            setLoading(false);
          }
        }).catch(() => {
          // Offline - keep cached state
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
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Erro ao recuperar sessão:', error);
          // Try cached session info to avoid logout
          const cached = getCachedSession();
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
        const cached = getCachedSession();
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
    cacheSession(null);
    localStorage.removeItem(ROLE_CACHE_KEY);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, loading,
      signIn, signUp, signOut,
      isAdmin: role === 'admin'
    }}>
      {children}
    </AuthContext.Provider>
  );
};
