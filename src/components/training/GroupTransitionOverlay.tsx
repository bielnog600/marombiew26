import { Button } from '@/components/ui/button';
import type { GroupPause } from '@/hooks/useWorkoutGroupFlow';

/**
 * Overlay em tela cheia para as transições de Superset/Bi-set: pausa A→B
 * ("Agora: B — …") e descanso do grupo ("Próximo: A — …"). Anel de contagem
 * regressiva, miniatura do próximo exercício, "Ir agora"/"Pular" e +tempo.
 */
export function GroupTransitionOverlay({ groupLabel, pause, remaining, title, subtitle, thumbnail, onSkip, onAdd }: {
  groupLabel: string;
  pause: GroupPause;
  remaining: number;
  title: string;
  subtitle?: string;
  thumbnail?: string | null;
  onSkip: () => void;
  onAdd: (seconds: number) => void;
}) {
  const isSwap = pause.kind === 'swap';
  const progress = pause.total > 0 ? Math.max(0, Math.min(1, remaining / pause.total)) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm px-6 text-center"
      data-testid="group-transition"
      role="dialog"
      aria-label={title}
    >
      <p className="text-xs font-bold tracking-widest text-primary uppercase">{groupLabel} · A1 / A2</p>
      <h2 className="text-2xl font-bold text-foreground leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="relative mt-2">
        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" strokeWidth="8" className="stroke-secondary" />
          <circle
            cx="70" cy="70" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-200"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-foreground tabular-nums">
          {remaining}
        </span>
      </div>
      {thumbnail && (
        <img src={thumbnail} alt="" className="h-20 w-20 rounded-lg object-cover border border-border/50" />
      )}
      <div className="flex items-center gap-3 mt-2">
        <Button size="lg" className="min-h-11 px-8 font-bold" onClick={onSkip}>
          {isSwap ? 'Ir agora' : 'Pular'}
        </Button>
        <Button size="lg" variant="outline" className="min-h-11" onClick={() => onAdd(isSwap ? 10 : 15)}>
          {isSwap ? '+10s' : '+15s'}
        </Button>
      </div>
    </div>
  );
}

/** "Superset concluído ✓" — mostrado ~2s antes de seguir para o próximo exercício. */
export function GroupFinishedOverlay({ label }: { label: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
      data-testid="group-finished"
      role="status"
    >
      <p className="text-2xl font-bold text-primary">{label}</p>
    </div>
  );
}
