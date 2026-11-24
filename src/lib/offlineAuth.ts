import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const ROLE_CACHE_KEY = 'marombiew_user_role';
export const SESSION_CACHE_KEY = 'marombiew_cached_session';

export type CachedRole = 'admin' | 'aluno';
interface CachedSessionInfo {
  user: User;
  timestamp: number;
}

export function getCachedRole(userId: string): CachedRole | null {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.userId === userId && (parsed.role === 'admin' || parsed.role === 'aluno') ? parsed.role : null;
  } catch {
    return null;
  }
}

export function setCachedRole(userId: string, role: CachedRole): void {
  try { localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role })); } catch { /* noop */ }
}

/** Guarda o usuário completo, não só o email: o ProtectedRoute precisa dele offline. */
export function cacheOfflineUser(user: User | null): void {
  try {
    if (user) {
      const info: CachedSessionInfo = { user, timestamp: Date.now() };
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(info));
    } else {
      localStorage.removeItem(SESSION_CACHE_KEY);
    }
  } catch { /* noop */ }
}

export function getCachedOfflineUser(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSessionInfo;
    if (!parsed.user?.id) return null;
    return parsed.user;
  } catch {
    return null;
  }
}

/** Leitura local para fluxos que antes chamavam getUser() e travavam offline. */
export async function getLocalUserId(): Promise<string | null> {
  try {
    const { data } = await Promise.race([
      // getSession lê a sessão persistida; o timeout cobre refresh de token lento.
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
    ]);
    if (data.session?.user?.id) return data.session.user.id;
  } catch { /* tenta o caminho legado somente online */ }
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const { data } = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ]);
      if (data.user?.id) return data.user.id;
    } catch { /* usa a cópia local abaixo */ }
  }
  return getCachedOfflineUser()?.id ?? null;
}
