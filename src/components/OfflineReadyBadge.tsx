import { useEffect, useState } from 'react';
import { CloudDownload } from 'lucide-react';
import { getOfflineReady, type OfflineReadyState } from '@/lib/offlineCache';

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const OfflineReadyBadge = ({ userId }: { userId: string }) => {
  const [ready, setReady] = useState<OfflineReadyState | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = () => { void getOfflineReady(userId).then(value => { if (mounted) setReady(value); }); };
    load();
    window.addEventListener('mw-offline-ready-changed', load);
    return () => {
      mounted = false;
      window.removeEventListener('mw-offline-ready-changed', load);
    };
  }, [userId]);
  if (!ready?.complete) return null;
  return (
    <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground" data-testid="offline-ready">
      <CloudDownload className="h-3.5 w-3.5 text-primary" />
      Disponível offline · atualizado às {timeLabel(ready.updatedAt)}
    </p>
  );
};

export default OfflineReadyBadge;
