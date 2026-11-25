import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const AUTH_SCREEN_PATHS = ['/login', '/cadastro'];

/** Remove a trava das telas de acesso se, por qualquer caminho, ela ficou presa fora delas. */
export function releaseStaleAuthScreenLock(pathname: string, root: HTMLElement = document.documentElement) {
  if (AUTH_SCREEN_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) return false;
  if (!root.classList.contains('auth-screen-open')) return false;
  root.classList.remove('auth-screen-open');
  return true;
}

const AuthScreenLockGuard = () => {
  const { pathname } = useLocation();
  useEffect(() => { releaseStaleAuthScreenLock(pathname); }, [pathname]);
  return null;
};

export default AuthScreenLockGuard;
