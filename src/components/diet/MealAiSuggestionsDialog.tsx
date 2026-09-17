/**
 * HOTFIX UX — 3 sugestões de IA para UMA refeição (editor canônico do ADMIN).
 *
 * A IA só devolve foodId + qtyGrams; todos os números exibidos aqui são
 * calculados pelo nutritionCore. Nada altera a dieta até "Aplicar esta sugestão".
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, RefreshCw, Loader2, AlertTriangle, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FoodRecord, EngineMacros } from '@/lib/nutritionEngine';
import type { DayTarget } from '@/lib/dietDayTargets';
import {
  buildMealSuggestionRequest,
  validateMealSuggestions,
  SUGGESTION_PRIORITY_LABELS,
  type SuggestionPriority,
  type ValidatedSuggestion,
} from '@/lib/mealAiSuggestions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: any;
  dayIndex: number;
  mealIndex: number;
  mealName: string;
  foods: FoodRecord[];
  target?: DayTarget | null;
  dayType?: string | null;
  studentContext?: Record<string, unknown> | null;
  trainingContext?: string | null;
  onApply: (items: Array<{ foodId: string; qtyGrams: number }>) => void;
}

const line = (m: EngineMacros | null | undefined) =>
  m ? `${Math.round(m.kcal)} kcal · ${Math.round(m.p)}P · ${Math.round(m.c)}C · ${Math.round(m.g)}G` : '—';

const PRIORITIES: SuggestionPriority[] = ['varied', 'similar', 'simple'];

const MealAiSuggestionsDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  plan,
  dayIndex,
  mealIndex,
  mealName,
  foods,
  target,
  dayType,
  studentContext,
  trainingContext,
  onApply,
}) => {
  const [priority, setPriority] = useState<SuggestionPriority>('varied');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ValidatedSuggestion[] | null>(null);
  const [discarded, setDiscarded] = useState(0);

  const currentMeal = plan?.days?.[dayIndex]?.meals?.[mealIndex];

  /** Só roda sob clique explícito do treinador. */
  const generate = async () => {
    setLoading(true);
    try {
      const body = buildMealSuggestionRequest({
        plan,
        dayIndex,
        mealIndex,
        priority,
        foods,
        target,
        dayType,
        studentContext,
        trainingContext,
      });
      const { data, error } = await supabase.functions.invoke('diet-edit-agent', { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const result = validateMealSuggestions({
        raw: data,
        plan,
        dayIndex,
        mealIndex,
        foods,
        target,
      });
      setSuggestions(result.suggestions);
      setDiscarded(result.discarded);
      if (result.suggestions.length === 0) {
        toast.warning('Nenhuma sugestão válida foi retornada. Tente novamente.');
      } else if (result.discarded > 0) {
        toast.warning(
          `${result.discarded} sugestão${result.discarded > 1 ? 'ões' : ''} descartada${
            result.discarded > 1 ? 's' : ''
          } por conter alimento inválido.`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível gerar sugestões agora.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Sugestões para {mealName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="rounded-lg bg-secondary/60 p-3 space-y-1">
            <p className="text-muted-foreground">
              Atual: <strong className="text-foreground">{line(currentMeal?.totals)}</strong>
            </p>
            <p className="text-muted-foreground">
              Meta do dia: <strong className="text-foreground">{line(target as any)}</strong>
              {dayType ? <span className="ml-2">({dayType})</span> : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-muted-foreground">Prioridade:</span>
            {PRIORITIES.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={priority === p ? 'default' : 'outline'}
                className="h-7 text-[11px]"
                onClick={() => setPriority(p)}
              >
                {SUGGESTION_PRIORITY_LABELS[p]}
              </Button>
            ))}
          </div>

          <Button size="sm" className="w-full" onClick={generate} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : suggestions ? (
              <RefreshCw className="mr-1 h-3 w-3" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            {loading ? 'Gerando...' : suggestions ? 'Gerar outras 3' : 'Gerar 3 sugestões'}
          </Button>

          {discarded > 0 && suggestions && suggestions.length > 0 && (
            <p className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              {discarded} sugestão descartada por conter alimento inválido.
            </p>
          )}

          {(suggestions ?? []).map((sug, i) => (
            <div key={`${sug.title}-${i}`} className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-bold">{sug.title}</p>
              <div className="space-y-0.5">
                {sug.items.map((it) => (
                  <p key={`${it.foodId}-${it.qtyGrams}`} className="text-muted-foreground">
                    {it.name} — <strong className="text-foreground">{it.qtyGrams} g</strong>
                  </p>
                ))}
              </div>
              <p className="text-foreground">{line(sug.mealTotals)}</p>
              <div className="text-muted-foreground">
                <p>Impacto no dia:</p>
                <p>Atual: {Math.round(sug.dayTotalsBefore.kcal)} kcal</p>
                <p>Com esta opção: {Math.round(sug.dayTotalsAfter.kcal)} kcal</p>
                {target && <p>Meta: {Math.round(target.kcal)} kcal</p>}
              </div>
              {sug.withinTarget !== null && (
                <Badge
                  variant="outline"
                  className={
                    sug.withinTarget
                      ? 'border-green-500/50 text-[10px] text-green-500'
                      : 'border-yellow-500/50 text-[10px] text-yellow-500'
                  }
                >
                  {sug.withinTarget ? 'Dentro da meta' : 'Fora da meta'}
                </Badge>
              )}
              {sug.reason && <p className="italic text-muted-foreground">{sug.reason}</p>}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  onApply(sug.items.map((it) => ({ foodId: it.foodId, qtyGrams: it.qtyGrams })));
                  onOpenChange(false);
                  setSuggestions(null);
                  setDiscarded(0);
                }}
              >
                <Check className="mr-1 h-3 w-3" /> Aplicar esta sugestão
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MealAiSuggestionsDialog;
