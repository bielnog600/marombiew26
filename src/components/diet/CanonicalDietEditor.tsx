/**
 * FASE 5 / 5.1 — editor canônico (STRUCTURED).
 *
 * Trabalha diretamente sobre o DietPlan canônico: foodId + qtyGrams +
 * nutritionCore. Nunca passa por markdown/ParsedMeal, nunca resolve alimento
 * por nome/aproximação e nunca escala macros manualmente.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Lock,
  LockOpen,
  Trash2,
  Sliders,
  Undo2,
  AlertTriangle,
  Plus,
  Replace,
  Copy,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DietPlan } from '@/lib/dietSchema';
import {
  buildFoodIndex,
  computeDayTotals,
  foodRecordFromRow,
  type FoodRecord,
} from '@/lib/nutritionEngine';
import { recomputeDayFromFoods } from '@/lib/dietFoodResolution';
import { relinkResolvableUnresolvedFoods } from '@/lib/dietFoodRelink';
import {
  optimizeDietDay,
  isWithinTolerance,
  AUTO_ADJUST_MESSAGES,
  type AutoAdjustResult,
} from '@/lib/dietAutoAdjust';
import type { DayTarget } from '@/lib/dietDayTargets';
import {
  simulateCopyDayToWeek,
  dayIsFullyResolved,
  COPY_DAY_MESSAGES,
  normalizeDayType,
  allDestinationIndexes,
  sameTypeDestinationIndexes,
  type CopyDayResult,
} from '@/lib/dietCopyDay';
import AutoAdjustPreviewDialog from './AutoAdjustPreviewDialog';
import CanonicalFoodPickerDialog from './CanonicalFoodPickerDialog';
import MealAiSuggestionsDialog from './MealAiSuggestionsDialog';
import { applyMealSuggestion } from '@/lib/mealAiSuggestions';

interface Props {
  plan: DietPlan;
  /** Base alimentar; quando ausente é carregada aqui. */
  foods?: FoodRecord[];
  /** Target FINAL por índice de dia (linear = global, carb cycling = weekday). */
  targetsByDay?: Array<DayTarget | null | undefined>;
  /** LOW/MEDIUM/HIGH por índice de dia, quando existir (carb cycling). */
  dayTypesByDay?: Array<string | null | undefined>;
  onChange: (plan: DietPlan) => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Aceita "18", "18,5" e "18.5"; só converte no commit. Quantidade deve ser > 0. */
export const parseGrams = (text: string): number | null => {
  const normalized = String(text ?? '').replace(',', '.').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));

const line = (m: { kcal: number; p: number; c: number; g: number } | null | undefined) =>
  m ? `${Math.round(m.kcal)} kcal · ${Math.round(m.p)}P · ${Math.round(m.c)}C · ${Math.round(m.g)}G` : '—';

const CanonicalDietEditor: React.FC<Props> = ({ plan, foods, targetsByDay, dayTypesByDay, onChange }) => {
  const [dayIndex, setDayIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<AutoAdjustResult | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<DietPlan | null>(null);
  const [picker, setPicker] = useState<
    { mode: 'add'; mealIdx: number } | { mode: 'replace'; mealIdx: number; itemIdx: number } | null
  >(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyStep, setCopyStep] = useState<'select' | 'preview'>('select');
  const [copySelected, setCopySelected] = useState<Set<number>>(new Set());
  const [copySim, setCopySim] = useState<
    { plan: DietPlan; results: CopyDayResult[]; sourceLabel: string } | null
  >(null);
  const [aiMealIdx, setAiMealIdx] = useState<number | null>(null);



  const { data: loadedFoods } = useQuery({
    queryKey: ['canonical-editor-foods'],
    enabled: !foods,
    queryFn: async (): Promise<FoodRecord[]> => {
      const { data, error } = await supabase
        .from('foods')
        .select('id, name, calories, protein, carbs, fats, portion, portion_size, brand, source')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row: any) => foodRecordFromRow(row));
    },
  });

  const foodRecords = foods ?? loadedFoods ?? [];
  const index = useMemo(() => buildFoodIndex(foodRecords), [foodRecords]);

  /**
   * HOTFIX — quando o catálogo muda (alimento recém-adicionado à base),
   * religa automaticamente apenas os itens com correspondência exata única.
   * `onChange` só é chamado quando algo realmente mudou (sem loop).
   */
  useEffect(() => {
    if (!plan || !foodRecords.length) return;
    const relinked = relinkResolvableUnresolvedFoods<DietPlan>(plan, foodRecords);
    if (relinked.changed) onChange(relinked.plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, foodRecords]);

  const days = plan?.days ?? [];
  const activeIndex = Math.min(dayIndex, Math.max(0, days.length - 1));
  const day = days[activeIndex];

  const computed = useMemo(() => {
    if (!day) return null;
    return computeDayTotals(
      (day.meals ?? []).map((m) => ({
        items: (m.items ?? []).map((it) => ({
          foodId: it.foodId ?? null,
          name: it.name,
          qtyGrams: Number(it.qtyGrams) || 0,
        })),
      })),
      index,
      'draft',
      'strict_id',
    );
  }, [day, index]);

  const target = targetsByDay?.[activeIndex] ?? null;
  const diff: DayTarget | null =
    target && computed
      ? {
          kcal: computed.totals.kcal - target.kcal,
          p: computed.totals.p - target.p,
          c: computed.totals.c - target.c,
          g: computed.totals.g - target.g,
        }
      : null;
  const within = diff ? isWithinTolerance(diff) : null;

  const hasUnresolved = !!computed?.meals.some((m) => m.items.some((i) => i.status === 'unresolved'));
  const adjustableCount = (day?.meals ?? []).reduce(
    (acc, meal) =>
      acc +
      (meal.items ?? []).filter(
        (it) => it.manualLocked !== true && it.foodId && index.byId.get(String(it.foodId)),
      ).length,
    0,
  );

  const applyPlan = (next: DietPlan) => {
    if (next.days?.[activeIndex]) recomputeDayFromFoods(next.days[activeIndex], foodRecords);
    onChange(next);
  };

  const commitQty = (mealIdx: number, itemIdx: number, text: string) => {
    const grams = parseGrams(text);
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[`${activeIndex}-${mealIdx}-${itemIdx}`];
      return copy;
    });
    if (grams === null) {
      toast.error('Informe uma quantidade maior que zero. Para retirar o alimento, use a lixeira.');
      return;
    }
    const next = clone(plan);
    const item: any = next.days[activeIndex].meals[mealIdx].items[itemIdx];
    if (!item || Number(item.qtyGrams) === grams) return;
    item.qtyGrams = grams;
    item.manualLocked = true;
    setUndoSnapshot(null);
    applyPlan(next);
  };

  const toggleLock = (mealIdx: number, itemIdx: number) => {
    const next = clone(plan);
    const item: any = next.days[activeIndex].meals[mealIdx].items[itemIdx];
    item.manualLocked = item.manualLocked !== true;
    setUndoSnapshot(null);
    applyPlan(next);
  };

  const removeItem = (mealIdx: number, itemIdx: number) => {
    const next = clone(plan);
    next.days[activeIndex].meals[mealIdx].items.splice(itemIdx, 1);
    setUndoSnapshot(null);
    applyPlan(next);
  };

  const handlePickFood = (food: FoodRecord) => {
    if (!picker) return;
    const next = clone(plan);
    const meal: any = next.days[activeIndex].meals[picker.mealIdx];
    if (picker.mode === 'add') {
      meal.items.push({
        foodId: food.id,
        name: food.name,
        qtyGrams: 100,
        resolutionStatus: 'resolved_by_id',
        manualLocked: true,
        macros: { kcal: 0, p: 0, c: 0, g: 0 },
      });
    } else {
      const item: any = meal.items[picker.itemIdx];
      if (!item) return;
      item.foodId = food.id;
      item.name = food.name;
      item.resolutionStatus = 'resolved_by_id';
      item.manualLocked = true;
      delete item.nutritionSnapshot;
    }
    setPicker(null);
    setUndoSnapshot(null);
    applyPlan(next);
  };

  const runOptimizer = () => {
    if (!target) {
      toast.warning('Meta diária indisponível.');
      return;
    }
    const result = optimizeDietDay<DietPlan>({
      plan,
      dayIndex: activeIndex,
      target,
      foods: foodRecords,
    });
    if (
      result.status === 'blocked_unresolved' ||
      result.status === 'no_adjustable_items' ||
      result.status === 'invalid_target'
    ) {
      toast.warning(result.reason ?? AUTO_ADJUST_MESSAGES.infeasible);
      return;
    }
    if (result.status === 'already_within_target') {
      toast.info(AUTO_ADJUST_MESSAGES.already_within_target);
      return;
    }
    setPreview(result);
  };

  /** HOTFIX UX — o preview é editável: recebe o plano final já montado. */
  const applyPreviewPlan = (nextPlan: DietPlan, withinTarget: boolean) => {
    if (!nextPlan) return;
    setUndoSnapshot(clone(plan));
    onChange(nextPlan);
    setPreview(null);
    toast.success(
      withinTarget
        ? 'Porções ajustadas dentro da meta.'
        : 'Alterações aplicadas — a dieta continua fora da meta.',
    );
  };

  /** HOTFIX UX — aplica uma sugestão de IA apenas naquela refeição (draft). */
  const applyAiSuggestion = (mealIdx: number, items: Array<{ foodId: string; qtyGrams: number }>) => {
    const next = applyMealSuggestion<DietPlan>({
      plan,
      dayIndex: activeIndex,
      mealIndex: mealIdx,
      items,
      foods: foodRecords,
    });
    setUndoSnapshot(clone(plan));
    onChange(next);
    setAiMealIdx(null);
    toast.success('Sugestão aplicada.');
  };

  const dayName = (d: any, i: number) =>
    (d?.weekday ?? d?.label ?? `Dia ${i + 1}`).toString().toUpperCase();

  const dayTypeAt = (i: number) =>
    normalizeDayType(
      dayTypesByDay?.[i] ?? (days[i] as any)?.dayType ?? (days[i] as any)?.type ?? null,
    );

  const openCopyDay = () => {
    if (!dayIsFullyResolved(plan, activeIndex, foodRecords)) {
      toast.warning(COPY_DAY_MESSAGES.unresolved);
      return;
    }
    setCopySelected(new Set());
    setCopySim(null);
    setCopyStep('select');
    setCopyOpen(true);
  };

  const closeCopyDay = () => {
    setCopyOpen(false);
    setCopyStep('select');
    setCopySelected(new Set());
    setCopySim(null);
  };

  const toggleCopyDestination = (i: number) => {
    if (i === activeIndex) return;
    setCopySelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const runCopySimulation = () => {
    const destinationIndexes = Array.from(copySelected).sort((a, b) => a - b);
    if (!destinationIndexes.length) {
      toast.warning('Selecione ao menos um dia.');
      return;
    }
    const sim = simulateCopyDayToWeek<DietPlan>({
      plan,
      sourceIndex: activeIndex,
      targetsByDay,
      foods: foodRecords,
      destinationIndexes,
    });
    if (sim.blocked) {
      toast.warning(sim.blocked);
      return;
    }
    setCopySim({ plan: sim.plan, results: sim.results, sourceLabel: dayName(day, activeIndex) });
    setCopyStep('preview');
  };


  if (!day) return null;

  return (
    <div className="space-y-3">
      {days.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {days.map((d, i) => (
            <Button
              key={`${d.label}-${i}`}
              size="sm"
              variant={i === activeIndex ? 'default' : 'outline'}
              className="h-7 text-[11px]"
              onClick={() => setDayIndex(i)}
            >
              {dayName(d, i)}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={openCopyDay}
            title="Copiar este cardápio para os outros dias, ajustando cada um à sua meta."
          >
            <Copy className="mr-1 h-3 w-3" /> Copiar dia
          </Button>
        </div>
      )}

      <Card
        className={`border ${
          !target
            ? 'border-border'
            : within
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-yellow-500/40 bg-yellow-500/5'
        }`}
      >
        <CardContent className="space-y-2 p-4 text-xs">
          <p className="text-sm font-bold">Ajuste de porções</p>
          {!target ? (
            <p className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-3 w-3" /> Meta diária indisponível.
            </p>
          ) : (
            <>
              <div className="grid gap-1 text-muted-foreground sm:grid-cols-3">
                <span>Meta: <strong className="text-foreground">{line(target)}</strong></span>
                <span>Atual: <strong className="text-foreground">{line(computed?.totals)}</strong></span>
                <span>Diferença: <strong className="text-foreground">{line(diff)}</strong></span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {within ? (
                  <Badge variant="outline" className="border-green-500/50 text-[10px] text-green-500">
                    Dentro da meta
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runOptimizer}
                    disabled={hasUnresolved || adjustableCount === 0}
                  >
                    <Sliders className="mr-1 h-3 w-3" /> Ajustar automaticamente
                  </Button>
                )}
                {undoSnapshot && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onChange(undoSnapshot);
                      setUndoSnapshot(null);
                    }}
                  >
                    <Undo2 className="mr-1 h-3 w-3" /> Desfazer ajuste
                  </Button>
                )}
              </div>
              {hasUnresolved && (
                <p className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-3 w-3" /> {AUTO_ADJUST_MESSAGES.blocked_unresolved}
                </p>
              )}
              {!hasUnresolved && adjustableCount === 0 && (
                <p className="text-yellow-600 dark:text-yellow-400">
                  {AUTO_ADJUST_MESSAGES.no_adjustable_items}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {(day.meals ?? []).map((meal, mealIdx) => (
        <Card key={meal.id ?? mealIdx} className="border-border">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between text-xs">
              <p className="text-sm font-bold">
                {meal.name}
                {meal.time ? <span className="ml-2 text-muted-foreground">{meal.time}</span> : null}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {line(computed?.meals[mealIdx]?.totals)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-[11px]"
                  onClick={() => setAiMealIdx(mealIdx)}
                  title="Gerar 3 alternativas para esta refeição"
                >
                  <Sparkles className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Sugestão IA</span>
                  <span className="ml-1 sm:hidden">IA</span>
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              {(meal.items ?? []).map((item, itemIdx) => {
                const key = `${activeIndex}-${mealIdx}-${itemIdx}`;
                const calc = computed?.meals[mealIdx]?.items[itemIdx];
                const locked = item.manualLocked === true;
                const unresolved = calc?.status === 'unresolved';
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-[8rem] flex-1 text-foreground">
                      <button
                        type="button"
                        className="min-h-[32px] cursor-pointer rounded px-1 py-1 text-left underline-offset-2 hover:bg-primary/10 hover:underline"
                        title="Clique para substituir este alimento"
                        aria-label={`Substituir ${item.name}`}
                        onClick={() => setSubstitution({ mealIdx, itemIdx })}
                      >
                        {item.name}
                      </button>
                      {unresolved && (
                        <Badge variant="outline" className="ml-2 border-amber-500/50 text-[9px] text-amber-500">
                          NÃO VALIDADO
                        </Badge>
                      )}
                    </span>
                    <Input
                      className="h-7 w-20 text-xs"
                      inputMode="decimal"
                      value={drafts[key] ?? String(item.qtyGrams ?? 0)}
                      onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                      onBlur={(e) => commitQty(mealIdx, itemIdx, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                    />
                    <span className="text-muted-foreground">g</span>
                    <span className="w-40 text-right text-muted-foreground">
                      {calc
                        ? `${Math.round(calc.macros.kcal)} kcal · ${fmt(calc.macros.p)}P · ${fmt(calc.macros.c)}C · ${fmt(calc.macros.g)}G`
                        : '—'}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title={
                        locked
                          ? 'Quantidade alterada manualmente. O ajuste automático não modificará este item.'
                          : 'Livre para o ajuste automático.'
                      }
                      onClick={() => toggleLock(mealIdx, itemIdx)}
                    >
                      {locked ? (
                        <Lock className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <LockOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => removeItem(mealIdx, itemIdx)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => setPicker({ mode: 'add', mealIdx })}
            >
              <Plus className="mr-1 h-3 w-3" /> Adicionar alimento
            </Button>
          </CardContent>
        </Card>
      ))}

      {aiMealIdx !== null && (
        <MealAiSuggestionsDialog
          open
          onOpenChange={(o) => !o && setAiMealIdx(null)}
          plan={plan}
          dayIndex={activeIndex}
          mealIndex={aiMealIdx}
          mealName={String(day.meals?.[aiMealIdx]?.name ?? 'refeição')}
          foods={foodRecords}
          target={target}
          dayType={(day as any)?.dayType ?? (day as any)?.type ?? null}
          onApply={(items) => applyAiSuggestion(aiMealIdx, items)}
        />
      )}


      <AutoAdjustPreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        result={preview}
        dayIndex={activeIndex}
        target={target}
        foods={foodRecords}
        onApply={(nextPlan, withinTarget) => applyPreviewPlan(nextPlan as DietPlan, withinTarget)}
      />

      <Dialog open={copyOpen} onOpenChange={(o) => !o && closeCopyDay()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copiar {dayName(day, activeIndex)} para:</DialogTitle>
          </DialogHeader>

          {copyStep === 'select' ? (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => setCopySelected(new Set(allDestinationIndexes(days.length, activeIndex)))}
                >
                  Selecionar todos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => setCopySelected(new Set())}
                >
                  Limpar
                </Button>
                {dayTypeAt(activeIndex) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      setCopySelected(
                        new Set(
                          sameTypeDestinationIndexes(
                            days.map((_, i) => dayTypeAt(i)),
                            activeIndex,
                          ),
                        ),
                      )
                    }
                  >
                    Selecionar mesmo tipo
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                {days.map((d, i) => {
                  const type = dayTypeAt(i);
                  const isSource = i === activeIndex;
                  return (
                    <label
                      key={`copy-dest-${i}`}
                      className={`flex items-center gap-2 rounded-lg border border-border px-2 py-2 ${
                        isSource ? 'opacity-60' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        disabled={isSource}
                        checked={copySelected.has(i)}
                        onChange={() => toggleCopyDestination(i)}
                        aria-label={dayName(d, i)}
                      />
                      <span className="font-semibold text-foreground">{dayName(d, i)}</span>
                      {isSource ? (
                        <Badge variant="outline" className="text-[10px]">ORIGEM</Badge>
                      ) : (
                        type && (
                          <Badge variant="outline" className="text-[10px]">{type}</Badge>
                        )
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-muted-foreground">
                O dia de origem não muda. Cada dia selecionado recebe o mesmo cardápio como ponto
                de partida e tem as porções ajustadas à meta dele.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {(copySim?.results ?? []).map((r) => (
                <div
                  key={r.dayIndex}
                  className="space-y-0.5 rounded-lg border border-border px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {(r.weekday ?? r.label ?? `Dia ${r.dayIndex + 1}`).toString().toUpperCase()}
                    </span>
                    {dayTypeAt(r.dayIndex) && (
                      <Badge variant="outline" className="text-[10px]">{dayTypeAt(r.dayIndex)}</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground">Meta: {line(r.target)}</p>
                  {r.status === 'ok' ? (
                    <p className="text-green-600 dark:text-green-400">
                      Resultado: {line(r.totals)} · Dentro da meta
                    </p>
                  ) : (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      {r.message ?? COPY_DAY_MESSAGES.infeasible} — dia mantido como está
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeCopyDay}>
              Cancelar
            </Button>
            {copyStep === 'select' ? (
              <Button size="sm" disabled={copySelected.size === 0} onClick={runCopySimulation}>
                Calcular ajustes
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setCopyStep('select')}>
                  Voltar
                </Button>
                <Button
                  size="sm"
                  disabled={!copySim?.results.some((r) => r.status === 'ok')}
                  onClick={() => {
                    if (!copySim) return;
                    setUndoSnapshot(clone(plan));
                    onChange(copySim.plan);
                    const okCount = copySim.results.filter((r) => r.status === 'ok').length;
                    const failed = copySim.results.length - okCount;
                    closeCopyDay();
                    toast.success(
                      failed > 0
                        ? `Cardápio copiado para ${okCount} dia(s). ${failed} dia(s) mantido(s) sem alterações.`
                        : `Cardápio copiado para ${okCount} dia(s).`,
                    );
                  }}
                >
                  Aplicar aos {copySim?.results.filter((r) => r.status === 'ok').length ?? 0} dias válidos
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <CanonicalFoodPickerDialog
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        foods={foodRecords}
        title={picker?.mode === 'replace' ? 'Substituir alimento' : 'Adicionar alimento'}
        onSelect={handlePickFood}
      />
    </div>
  );
};

export default CanonicalDietEditor;
