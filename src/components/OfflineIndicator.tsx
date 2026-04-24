import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Indicador discreto de status de conexão e sincronização.
 * Aparece como pill flutuante no topo quando offline ou com itens pendentes.
 */
const OfflineIndicator = () => {
  const { online, pending, syncing } = useOnlineStatus();

  // Não renderiza se está tudo OK
  if (online && pending === 0 && !syncing) return null;

  const label = !online
    ? pending > 0
      ? `Offline · ${pending} pendente${pending > 1 ? 's' : ''}`
      : 'Offline'
    : syncing
    ? `Sincronizando${pending > 0 ? ` (${pending})` : ''}…`
    : `${pending} pendente${pending > 1 ? 's' : ''}`;

  return (
    <div
      className="pointer-events-none fixed left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
    >
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-lg backdrop-blur',
          !online
            ? 'bg-destructive/90 text-destructive-foreground'
            : 'bg-primary/90 text-primary-foreground'
        )}
      >
        {!online ? (
          <CloudOff className="h-3.5 w-3.5" />
        ) : syncing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Cloud className="h-3.5 w-3.5" />
        )}
        <span>{label}</span>
      </div>
    </div>
  );
};

export default OfflineIndicator;