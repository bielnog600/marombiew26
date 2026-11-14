import { useEffect } from 'react';

/**
 * Mantém a tela ligada enquanto `active` (Screen Wake Lock API).
 * Sem suporte ou permissão negada: não faz nada. Solta ao desativar/desmontar
 * e pede de novo quando o app volta para a frente (o navegador solta ao esconder).
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    const wl = (navigator as any).wakeLock;
    if (!wl?.request) return;
    let lock: { release: () => Promise<void>; released?: boolean } | null = null;
    let cancelled = false;
    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (lock && !lock.released) return;
      try {
        const next = await wl.request('screen');
        if (cancelled) { next?.release?.().catch(() => {}); return; }
        lock = next;
      } catch { /* não suportado / negado */ }
    };
    void request();
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { lock?.release().catch(() => {}); } catch { /* noop */ }
      lock = null;
    };
  }, [active]);
}
