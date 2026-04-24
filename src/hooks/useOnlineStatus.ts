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

  useEffect(() => {
    let mounted = true;
    const refreshPending = () => {
      pendingCount().then((n) => mounted && setPending(n)).catch(() => {});
    };
    refreshPending();
    const off = onQueueChange(refreshPending);

    const onOnline = async () => {
      setOnline(true);
      setSyncing(true);
      try { await flushQueue(); } finally { if (mounted) setSyncing(false); }
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

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
      clearInterval(interval);
    };
  }, []);

  return { online, pending, syncing };
}