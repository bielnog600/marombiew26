import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canToggleSessionVariation, isSessionVariationActive, sessionVariationButtonLabel, type SessionExercise } from '@/lib/sessionVariation';

/** Botão do Modo Treino admin: troca o exercício da sessão pela variação do plano (e volta). */
export function SessionVariationButton({ ex, onToggle, className = '' }: { ex: SessionExercise | null | undefined; onToggle: () => void; className?: string }) {
  if (!ex || !canToggleSessionVariation(ex)) return null;
  const active = isSessionVariationActive(ex);
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onToggle}
      aria-pressed={active}
      title={active ? 'Voltar ao exercício original do plano (só nesta sessão)' : 'Trocar pela variação do plano (só nesta sessão)'}
      className={`h-auto min-h-7 max-w-full justify-start gap-1.5 whitespace-normal px-2.5 py-1 text-left text-[10px] font-bold uppercase tracking-wider ${active ? '' : 'border-primary/40 text-primary hover:bg-primary/10'} ${className}`}
    >
      <Repeat className="h-3 w-3 shrink-0" />
      <span className="min-w-0 break-words">{sessionVariationButtonLabel(ex)}</span>
    </Button>
  );
}
