import { TrendingUp } from 'lucide-react';
import { formatSessionHint, type SessionRecommendation } from '@/lib/sessionProgression';

/**
 * Sugestão de progressão (consultiva) do exercício atual.
 * Não altera inputs, não preenche carga/reps e não grava nada.
 */
export const ProgressionHintCard = ({
  recommendation,
}: {
  recommendation: SessionRecommendation | null;
}) => {
  const hint = formatSessionHint(recommendation);
  if (!hint) return null;

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
