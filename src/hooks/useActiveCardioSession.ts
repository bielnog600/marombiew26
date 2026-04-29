import { useEffect, useState, useCallback } from 'react';
import type { CardioProtocol } from '@/lib/cardioParser';

const STORAGE_KEY = 'mw_active_cardio_session';

type Phase = 'idle' | 'prep' | 'block' | 'done';

export interface PersistedCardio {
  protocol: CardioProtocol;
  phase: Phase;
  blockIndex: number;
  secondsLeft: number;
  paused: boolean;
  anchorMs: number;
}

function read(): PersistedCardio | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCardio;
    if (!parsed || parsed.phase === 'idle' || parsed.phase === 'done') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useActiveCardioSession() {
  const [session, setSession] = useState<PersistedCardio | null>(() => read());

  const refresh = useCallback(() => setSession(read()), []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === STORAGE_KEY) refresh();
    };
    const onFocus = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    // poll occasionally so cross-tab changes & current-tab updates without storage event reflect
    const id = setInterval(refresh, 2000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(id);
    };
  }, [refresh]);

  const clear = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setSession(null);
  }, []);

  return { session, refresh, clear };
}

// Compute remaining seconds for current block, accounting for elapsed wall-clock since anchor
export function computeRemainingSec(s: PersistedCardio): number {
  if (s.paused) return s.secondsLeft;
  const elapsed = Math.floor((Date.now() - s.anchorMs) / 1000);
  return Math.max(0, s.secondsLeft - elapsed);
}
