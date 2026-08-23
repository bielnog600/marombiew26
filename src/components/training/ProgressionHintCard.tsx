import { TrendingUp } from 'lucide-react';
import { formatSessionHint, type SessionRecommendation } from '@/lib/sessionProgression';

/**
 * Sugestão de progressão (consultiva) do exercício atual.
 * Não altera inputs, não preenche carga/reps e não grava nada.
 */
export const ProgressionHintCard = ({
  recommendation,
  variant = 'default',
}: {
  recommendation: SessionRecommendation | null;
  variant?: 'default' | 'compact';
}) => {
  const hint = formatSessionHint(recommendation);
  if (!hint) return null;

  if (variant === 'compact') {
    return (
      <div className="rounded border border-border/40 bg-secondary/20 px-2 py-1.5 mb-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
            Sugestão · {hint.label}
          </span>
          {hint.estimated && (
            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/60">estimado</span>
          )}
        </div>
        <p className="text-[11px] text-foreground mt-0.5 leading-tight">{hint.text}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Sugestão · {hint.label}
        </span>
        {hint.estimated && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">estimado</span>
        )}
      </div>
      <p className="text-sm text-foreground mt-0.5 leading-snug">{hint.text}</p>
    </div>
  );
};

export default ProgressionHintCard;
