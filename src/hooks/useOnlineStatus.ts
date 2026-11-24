import { useEffect, useState } from 'react';
import { flushQueue, onQueueChange, pendingCount } from '@/lib/offlineQueue';

/**
 * Status de conexão + tamanho da fila offline.
 * Quando volta online, dispara flush automático.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refreshPending = () => {
      pendingCount().then((n) => mounted && setPending(n)).catch(() => {});
    };
    refreshPending();
    const off = onQueueChange(refreshPending);

    const onOnline = async () => {
      setOnline(true);
      setSynced(false);
      setSyncing(true);
      try {
        const result = await flushQueue();
        if (mounted && result.remaining === 0) {
          setSynced(true);
          window.setTimeout(() => { if (mounted) setSynced(false); }, 2500);
        }
      } finally { if (mounted) setSyncing(false); }
    };
    const onOffline = () => { setOnline(false); setSynced(false); };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        pendingCount().then(n => { if (n > 0) void onOnline(); });
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    // Tenta dar flush logo ao montar caso esteja online com itens pendentes
    if (navigator.onLine) {
      pendingCount().then((n) => {
        if (n > 0) onOnline();
      });
    }

    // Re-tenta a cada 30s enquanto houver pendências
    const interval = setInterval(() => {
      if (navigator.onLine) {
        pendingCount().then((n) => { if (n > 0) onOnline(); });
      }
    }, 30_000);

    return () => {
      mounted = false;
      off();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, []);

  return { online, pending, syncing, synced };
}