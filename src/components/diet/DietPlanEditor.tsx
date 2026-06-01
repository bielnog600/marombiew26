import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Sliders, AlertTriangle, Clock, UtensilsCrossed } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { parseSections, type ParsedFood, type ParsedMeal } from '@/lib/dietResultParser';
 import { computeDayTotals, scaleMealsToTarget, stripG } from '@/lib/dietMarkdownSerializer';
import FoodSubstitutionDialog from './FoodSubstitutionDialog';
import AiEditDietDialog from './AiEditDietDialog';
import type { DietPlan } from '@/lib/dietSchema';
import { parsedMealsToDietPlan } from '@/lib/dietPlanAdapter';
import { finalizeDietPlan } from '@/lib/dietValidation';
import DietValidationBadge from './DietValidationBadge';
import TrainingContextSummary from './TrainingContextSummary';
import { buildCarbCycleDays } from '@/lib/dietAiActions';

interface DietPlanEditorProps {
  markdown: string;
  onMealsChange: (meals: ParsedMeal[]) => void;
  studentId?: string;
  onAiNotes?: (notes: string[]) => void;
  /** Canonical plan (when persisted as conteudo_json). */
  currentPlan?: DietPlan | null;
  /** Notified when the AI editor produces an updated canonical plan. */
  onPlanChange?: (plan: DietPlan) => void;
  /**
   * Notified when per-day editing produces a multi-day structure.
   * When provided, the parent should serialize via
   * `replaceMealTablesPerDayInMarkdown`.
   */
  onDaysChange?: (days: { label: string; meals: ParsedMeal[] }[]) => void;
}

const num = (v?: string) => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v: number) => Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1);

/** Canonical meal order for resorting after a rename/swap */
const MEAL_ORDER = [
  'café da manhã',
  'lanche da manhã',
  'almoço',
  'lanche da tarde',
  'pré-treino',
  'pós-treino',
  'jantar',
  'ceia',
  'lanche noturno',
];

const MEAL_OPTIONS = [
  'Café da Manhã',
  'Lanche da Manhã',
  'Almoço',
  'Lanche da Tarde',
  'Pré-Treino',
  'Pós-Treino',
  'Jantar',
  'Ceia',
  'Lanche Noturno',
];

/** Default times for each meal — used when renaming to update the time */
const MEAL_DEFAULT_TIMES: Record<string, string> = {
  'café da manhã': '07:00',
  'lanche da manhã': '09:30',
  'almoço': '12:00',
  'lanche da tarde': '15:30',
  'pré-treino': '17:00',
  'pós-treino': '19:00',
  'jantar': '19:30',
  'ceia': '21:00',
  'lanche noturno': '22:00',
};

const getDefaultTime = (name: string): string | undefined => {
  const key = normMealKey(name);
  for (const [mealKey, time] of Object.entries(MEAL_DEFAULT_TIMES)) {
    if (key.includes(normMealKey(mealKey)) || normMealKey(mealKey).includes(key)) return time;
  }
  return undefined;
};

const normMealKey = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const mealSortIndex = (name: string) => {
  const key = normMealKey(name);
  const idx = MEAL_ORDER.findIndex((m) => key.includes(normMealKey(m)) || normMealKey(m).includes(key));
  return idx >= 0 ? idx : 999;
};

const WEEKDAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const OPTION_TITLE_REGEX = /(op[cç][aã]o|card[aá]pio)/i;

/**
 * Try to recover a previously-applied carb cycle from the markdown notes
 * (saved as "🔄 Ciclo de Carboidratos" + "Low Carb: ..." / "High Carb: ...").
 * Returns undefined when no cycle is found.
 */
const extractCarbCycleFromMarkdown = (
  markdown: string,
): { lowCarbDays: string[]; highCarbDays: string[] } | undefined => {
  if (!markdown) return undefined;
  const text = markdown.toLowerCase();
  if (!text.includes('ciclo de carbo')) return undefined;
  const parseDays = (label: 'low carb' | 'high carb'): string[] => {
    const re = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i');
    const m = markdown.match(re);
    if (!m) return [];
    return m[1]
      .split(/[,;/]/)
      .map((s) => s.trim().toLowerCase().replace(/\(.*$/, '').trim())
      .filter(Boolean)
      .map((s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  };
  const low = parseDays('low carb');
  const high = parseDays('high carb');
  if (low.length === 0 && high.length === 0) return undefined;
  return { lowCarbDays: low, highCarbDays: high };
};

/** Extract every meal section as an editable day. */
const extractDays = (markdown: string): { label: string; meals: ParsedMeal[] }[] => {
  const sections = parseSections(markdown);
  const mealSections = sections.filter((s) => s.type === 'meal' && s.meals && s.meals.length > 0);
  if (mealSections.length === 0) return [];

  // If multiple sections already exist (carb cycling, options, weekday plan),
  // honor them as-is.
  if (mealSections.length > 1) {
    return mealSections.map((s, i) => ({
      label: (s.title || '').trim() || WEEKDAY_LABELS[i] || `Dia ${i + 1}`,
      meals: [...(s.meals || [])],
    }));
  }

  // Single meal block → expand to 7 weekdays (deep copy each) so admin can
  // customize per-day (e.g. carb cycling or aluno changes a Friday food).
  const base = mealSections[0].meals || [];

  // If the diet has a previously-applied carb cycle saved in notes, re-apply
  // it so each weekday shows its true carb quantities (otherwise we'd show
  // 7 identical days even though the plan is supposed to cycle).
  const cc = extractCarbCycleFromMarkdown(markdown);
  if (cc) {
    return buildCarbCycleDays(base, cc);
  }

  return WEEKDAY_LABELS.map((label) => ({
    label,
    meals: base.map((m) => ({
      ...m,
      foods: m.foods.map((f) => ({ ...f })),
    })),
  }));
};

/**
 * Extract meals from the markdown. If the diet has multiple "Cardápio/Opção"
 * sections, we only edit the FIRST one — otherwise we'd sum the calories of
 * every alternative menu and the totals (and "Editar com IA") would inflate
 * to 3x or more the real daily kcal.
 */
const extractMeals = (markdown: string): ParsedMeal[] => {
  const sections = parseSections(markdown);
  const mealSections = sections.filter((s) => s.type === 'meal' && s.meals && s.meals.length > 0);
  if (mealSections.length === 0) return [];
  // Only take the first menu/cardápio block to avoid summing alternatives
  return [...(mealSections[0].meals || [])];
};

const DietPlanEditor: React.FC<DietPlanEditorProps> = ({ markdown, onMealsChange, studentId, onAiNotes, currentPlan, onPlanChange, onDaysChange }) => {
  const initialDays = useMemo(() => extractDays(markdown), [markdown]);
  const [days, setDays] = useState<{ label: string; meals: ParsedMeal[] }[]>(initialDays);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const activeDayIdxRef = useRef(0);
  useEffect(() => { activeDayIdxRef.current = activeDayIdx; }, [activeDayIdx]);
  const meals = days[activeDayIdx]?.meals ?? [];
  const setMeals = useCallback((updater: React.SetStateAction<ParsedMeal[]>) => {
    setDays((prev) => {
      const idx = activeDayIdxRef.current;
      const next = [...prev];
      const current = next[idx]?.meals ?? [];
      const newMeals = typeof updater === 'function' ? (updater as (m: ParsedMeal[]) => ParsedMeal[])(current) : updater;
      if (next[idx]) next[idx] = { ...next[idx], meals: newMeals };
      return next;
    });
  }, []);
  const [target, setTarget] = useState<number>(() => Math.round(computeDayTotals(initialDays[0]?.meals ?? []).kcal));
  const [subTarget, setSubTarget] = useState<{ mealIdx: number; foodIdx: number } | null>(null);
  const [addingForMeal, setAddingForMeal] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  // Reset when source markdown changes
  useEffect(() => {
    const fresh = extractDays(markdown);
    setDays(fresh);
    setActiveDayIdx(0);
    setTarget(Math.round(computeDayTotals(fresh[0]?.meals ?? []).kcal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown]);

  // Notify parent — keep legacy single-day callback for fallback paths and
  // emit full per-day structure when supported.
  useEffect(() => {
    onMealsChange(days[0]?.meals ?? []);
    if (onDaysChange) onDaysChange(days);
  }, [days, onMealsChange, onDaysChange]);

  const hasMultipleDays = days.length > 1;
  const usesOptions = useMemo(
    () => days.some((d) => OPTION_TITLE_REGEX.test(d.label)),
    [days],
  );

  const renameActiveDay = useCallback((newLabel: string) => {
    setDays((prev) => prev.map((d, i) => i === activeDayIdx ? { ...d, label: newLabel } : d));
  }, [activeDayIdx]);

  const copyActiveDayTo = useCallback((targetIdx: number) => {
    setDays((prev) => {
      if (!prev[activeDayIdx] || !prev[targetIdx]) return prev;
      const sourceMeals = prev[activeDayIdx].meals.map((m) => ({
        ...m, foods: m.foods.map((f) => ({ ...f })),
      }));
      const next = [...prev];
      next[targetIdx] = { ...next[targetIdx], meals: sourceMeals };
      return next;
    });
    toast.success(`Copiado para ${days[targetIdx]?.label || 'dia'}`);
  }, [activeDayIdx, days]);

  const totals = useMemo(() => computeDayTotals(meals), [meals]);
  const diff = totals.kcal - target;
  const overTarget = diff > 25;          // tolerance ±25 kcal
  const underTarget = diff < -25;
  const offTarget = overTarget || underTarget;

  const updateMeals = useCallback((updater: (prev: ParsedMeal[]) => ParsedMeal[]) => {
    setMeals((prev) => updater(prev));
  }, []);

  const handleRenameMeal = useCallback((mealIdx: number, newName: string) => {
    updateMeals((prev) => {
      const updated = [...prev];
      const oldName = updated[mealIdx].name;
      if (normMealKey(oldName) === normMealKey(newName)) return prev;

      // Check if another meal already has this name → swap
      const existingIdx = updated.findIndex(
        (m, i) => i !== mealIdx && normMealKey(m.name) === normMealKey(newName)
      );

      if (existingIdx >= 0) {
        // Swap names
        const oldTime = updated[mealIdx].time;
        const existingTime = updated[existingIdx].time;
        updated[existingIdx] = { ...updated[existingIdx], name: oldName, time: oldTime || getDefaultTime(oldName) };
        updated[mealIdx] = { ...updated[mealIdx], name: newName, time: existingTime || getDefaultTime(newName) };
      } else {
        updated[mealIdx] = { ...updated[mealIdx], name: newName, time: getDefaultTime(newName) };
      }

      // Re-sort by canonical meal order
      updated.sort((a, b) => mealSortIndex(a.name) - mealSortIndex(b.name));
      return updated;
    });
    toast.success(`Refeição alterada para ${newName}`);
  }, [updateMeals]);

  const removeFood = (mealIdx: number, foodIdx: number) => {
    updateMeals((prev) => prev.map((m, mi) => mi !== mealIdx ? m : { ...m, foods: m.foods.filter((_, fi) => fi !== foodIdx) }));
  };

  const handleSubstitute = (newFood: ParsedFood) => {
    if (!subTarget) return;
    const { mealIdx, foodIdx } = subTarget;
    let nextMeals: ParsedMeal[] = [];
    updateMeals((prev) => {
      nextMeals = prev.map((m, mi) => mi !== mealIdx ? m : {
        ...m,
        foods: m.foods.map((f, fi) => fi === foodIdx ? { ...newFood, sub: f.sub } : f),
      });
      return nextMeals;
    });
    // Revalidate against the canonical plan + targets when available.
    if (currentPlan && onPlanChange) {
      try {
        const baseTargets = currentPlan.targets;
        const rebuilt = parsedMealsToDietPlan(nextMeals, baseTargets, {
          ...currentPlan.meta,
          generatedAt: new Date().toISOString(),
        });
        // Preserve trainingContext, tips, notes
        const nextPlan = finalizeDietPlan(
          { ...rebuilt, trainingContext: currentPlan.trainingContext, tips: currentPlan.tips, notes: currentPlan.notes },
          baseTargets,
        );
        onPlanChange(nextPlan);
        const prevStatus = currentPlan.validation?.status;
        const newStatus = nextPlan.validation?.status;
        if (newStatus === 'invalid' && prevStatus !== 'invalid') {
          toast.warning('A troca tirou o plano da meta. Ajuste porções.');
        } else if (newStatus === 'warning' && prevStatus === 'ok') {
          toast('Troca aplicada com aviso de validação.', { icon: '⚠️' });
        }
      } catch (e) {
        console.warn('post-sub validation failed', e);
      }
    }
    setSubTarget(null);
  };

  const handleAddFood = (mealIdx: number, food: ParsedFood) => {
    updateMeals((prev) => prev.map((m, mi) => mi !== mealIdx ? m : { ...m, foods: [...m.foods, food] }));
    setAddingForMeal(null);
  };

   const handleAdjustPortions = useCallback(() => {
     setMeals((prev) => scaleMealsToTarget(prev, target));
     toast.success(`Porções ajustadas para ${target} kcal`);
   }, [target]);

   const handlePortionChange = (mealIdx: number, foodIdx: number, newQtyStr: string) => {
     const newQty = num(newQtyStr);
     if (newQty <= 0) return;

     updateMeals((prev) => {
       const updated = [...prev];
       const meal = { ...updated[mealIdx] };
       const foods = [...meal.foods];
       const food = { ...foods[foodIdx] };

       const oldQty = num(stripG(food.qty));
       if (oldQty <= 0) return prev;

       const factor = newQty / oldQty;

       food.qty = `${newQty} g`;
       food.kcal = fmt(num(food.kcal) * factor);
       food.p = fmt(num(food.p) * factor);
       food.c = fmt(num(food.c) * factor);
       food.g = fmt(num(food.g) * factor);

       foods[foodIdx] = food;
       meal.foods = foods;
       updated[mealIdx] = meal;
       return updated;
     });
   };

  if (days.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma refeição reconhecida nesta dieta para edição visual.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Training context block */}
      {currentPlan?.trainingContext && (
        <TrainingContextSummary context={currentPlan.trainingContext} />
      )}

      {/* Day selector (weekdays or cardápio options) */}
      {hasMultipleDays && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {usesOptions ? 'Cardápio / Opção' : 'Dia da semana'}
            </span>
            {!usesOptions && (
              <Select
                onValueChange={(val) => copyActiveDayTo(Number(val))}
                value=""
              >
                <SelectTrigger className="h-7 w-auto min-w-[150px] text-[11px]">
                  <SelectValue placeholder="Copiar este dia para..." />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d, i) => i !== activeDayIdx && (
                    <SelectItem key={i} value={String(i)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {days.map((d, i) => {
              const isActive = i === activeDayIdx;
              const short = d.label.length > 10 ? d.label.slice(0, 3) : d.label;
              return (
                <button
                  key={`${d.label}-${i}`}
                  type="button"
                  onClick={() => setActiveDayIdx(i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                  }`}
                  title={d.label}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI quick action */}
      <div className="flex justify-end items-center gap-2">
        {currentPlan?.validation && (
          <DietValidationBadge report={currentPlan.validation} />
        )}
        <Button
          size="sm"
          variant="default"
          className="h-8 gap-1 bg-gradient-to-r from-primary to-primary/80"
          onClick={() => setAiOpen(true)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Editar com IA
        </Button>
      </div>

      {/* Target / totals banner */}
      <Card className={`border ${offTarget ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5'}`}>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Sliders className="h-4 w-4 text-primary" />
              Meta diária
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value) || 0)}
                className="h-8 w-24 text-xs"
              />
              <span className="text-xs text-muted-foreground">kcal</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Kcal atual</div>
              <div className={`font-bold ${offTarget ? 'text-destructive' : 'text-foreground'}`}>{fmt(totals.kcal)}</div>
            </div>
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Proteína</div>
              <div className="font-bold">{fmt(totals.p)} g</div>
            </div>
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Carbo</div>
              <div className="font-bold">{fmt(totals.c)} g</div>
            </div>
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Gordura</div>
              <div className="font-bold">{fmt(totals.g)} g</div>
            </div>
          </div>
          {offTarget && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-destructive/10 p-2">
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span>
                  {overTarget ? `Ultrapassou em ${fmt(diff)} kcal` : `Faltam ${fmt(-diff)} kcal`} para a meta.
                </span>
              </div>
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleAdjustPortions}>
                <Sliders className="h-3 w-3 mr-1" /> Ajustar porções
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meals */}
      {meals.map((meal, mealIdx) => (
        <Card key={`${meal.name}-${mealIdx}`} className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UtensilsCrossed className="h-4 w-4 text-primary" />
                <Select
                  value={meal.name}
                  onValueChange={(val) => handleRenameMeal(mealIdx, val)}
                >
                  <SelectTrigger className="h-7 w-auto min-w-[140px] border-none bg-transparent px-1 text-sm font-semibold shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {meal.time && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
                    <Clock className="h-3 w-3" /> {meal.time}
                  </span>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setAddingForMeal(mealIdx)}>
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>

            <div className="px-1 py-1">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 px-2">Alimento</TableHead>
                    <TableHead className="h-8 px-2">Qtd</TableHead>
                    <TableHead className="h-8 px-2 text-right">Kcal</TableHead>
                    <TableHead className="h-8 px-2 text-right">P</TableHead>
                    <TableHead className="h-8 px-2 text-right">C</TableHead>
                    <TableHead className="h-8 px-2 text-right">G</TableHead>
                    <TableHead className="h-8 px-2 w-[40px] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meal.foods.map((food, foodIdx) => (
                    <TableRow key={`${food.food}-${foodIdx}`}>
                      <TableCell
                        className="px-2 py-1.5 font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                        onClick={() => setSubTarget({ mealIdx, foodIdx })}
                        title="Clique para substituir"
                      >
                        {food.food}
                      </TableCell>
                       <TableCell className="px-2 py-1.5 text-muted-foreground">
                         <Input
                           type="text"
                           value={food.qty || ''}
                           onChange={(e) => handlePortionChange(mealIdx, foodIdx, e.target.value)}
                           className="h-7 w-20 text-xs px-1 bg-transparent border-dashed border-muted-foreground/30 focus:border-primary transition-all"
                         />
                       </TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.kcal || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.p || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.c || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.g || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" title="Remover" onClick={() => removeFood(mealIdx, foodIdx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {meal.foods.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="px-2 py-3 text-center text-xs text-muted-foreground">
                        Sem alimentos. Use “Adicionar”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Substitute dialog */}
      {subTarget && (
        <FoodSubstitutionDialog
          open={true}
          onOpenChange={(open) => { if (!open) setSubTarget(null); }}
          originalFood={meals[subTarget.mealIdx].foods[subTarget.foodIdx]}
          onSubstitute={handleSubstitute}
          mealTotals={(() => {
            const m = meals[subTarget.mealIdx];
            return {
              kcal: m.foods.reduce((a, f) => a + num(f.kcal), 0),
              p: m.foods.reduce((a, f) => a + num(f.p), 0),
              c: m.foods.reduce((a, f) => a + num(f.c), 0),
              g: m.foods.reduce((a, f) => a + num(f.g), 0),
            };
          })()}
          targets={currentPlan?.targets ?? null}
        />
      )}

      {/* Add-food picker */}
      {addingForMeal !== null && (
        <AddFoodPicker
          open={true}
          onOpenChange={(open) => { if (!open) setAddingForMeal(null); }}
          onAdd={(food) => handleAddFood(addingForMeal, food)}
        />
      )}

      {/* AI editor */}
      <AiEditDietDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        currentMeals={meals}
        studentId={studentId}
        currentPlan={currentPlan ?? null}
        targets={currentPlan?.targets ?? null}
        onApply={(newMeals, notes, nextPlan, daysFromAi) => {
          if (daysFromAi && daysFromAi.length > 1) {
            // Carb cycle expanded into 7 weekday variants — replace the
            // editor's per-day state so each weekday shows its own carbs.
            setDays(daysFromAi);
            setActiveDayIdx(0);
            if (onDaysChange) onDaysChange(daysFromAi);
          } else {
            setMeals(newMeals);
          }
          if (notes.length && onAiNotes) onAiNotes(notes);
          if (nextPlan && onPlanChange) onPlanChange(nextPlan);
        }}
      />
    </div>
  );
};

/* ---------------- Add-food picker ---------------- */

interface AddFoodPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (food: ParsedFood) => void;
}

const AddFoodPicker: React.FC<AddFoodPickerProps> = ({ open, onOpenChange, onAdd }) => {
  const [search, setSearch] = useState('');
  const [portion, setPortion] = useState<number>(100);

  const { data: foods = [] } = useQuery({
    queryKey: ['foods-add-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('foods').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return foods.slice(0, 25);
    return foods.filter((f: any) => f.name.toLowerCase().includes(q)).slice(0, 25);
  }, [foods, search]);

  const handlePick = (dbFood: any) => {
    const base = dbFood.portion_size || 100;
    const scale = portion / base;
    onAdd({
      food: dbFood.name,
      qty: `${portion} g`,
      kcal: fmt(num(String(dbFood.calories)) * scale),
      p: fmt(num(String(dbFood.protein)) * scale),
      c: fmt(num(String(dbFood.carbs)) * scale),
      g: fmt(num(String(dbFood.fats)) * scale),
    });
    setSearch('');
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3 ${open ? '' : 'hidden'}`}
      onClick={() => onOpenChange(false)}
    >
      <Card className="w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-3 space-y-2 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Adicionar alimento</h4>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Buscar alimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={portion}
                onChange={(e) => setPortion(Number(e.target.value) || 0)}
                className="h-9 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">g</span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhum alimento encontrado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((f: any) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="w-full text-left py-2 px-2 hover:bg-muted/50 rounded text-xs flex justify-between gap-2"
                      onClick={() => handlePick(f)}
                    >
                      <span className="font-medium truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {f.calories}kcal / {f.portion_size}g
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DietPlanEditor;