/**
 * Bottom sheet canônico de substituição (ALUNO e ADMIN).
 * Determinístico: sem IA; toda porção, combo e macro vem do nutritionEngine.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, ArrowRightLeft, AlertTriangle, Check, Star, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import { substitutionFamilyTier, substitutionDisplayDelta } from '@/lib/foodPreference';
import { buildFoodIndex, type EngineMacros, type FoodRecord } from '@/lib/nutritionEngine';
import {
  buildBestSubstitutionChoices,
  buildProteinCombinations,
  buildSmartSubstitutionCandidates,
  bestSubstitutionTip,
  filterSubstitutionFoods,
  formatSubstitutionQuantity,
  substitutionWarnings,
  totalsAfterSwap,
  type FoodUnitWeight,
  type SubstitutionCandidate,
  type SubstitutionCombination,
  type SubstitutionCombinationItem,
} from '@/lib/canonicalFoodSubstitution';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: FoodRecord[];
  currentFoodId?: string | null;
  currentName: string;
  currentQtyGrams: number;
  /** Macros REAIS do item atual, calculados pelo nutritionCore. */
  currentMacros: EngineMacros;
  mealTotals?: EngineMacros | null;
  dayTotals?: EngineMacros | null;
  dayTarget?: EngineMacros | null;
  /** Contexto somente para ordenar a mesma família; não altera a equivalência. */
  studentId?: string | null;
  objective?: string | null;
  dietPhase?: string | null;
  mealName?: string | null;
  mealTime?: string | null;
  workoutTime?: string | null;
  trainingContext?: string | null;
  onSelect: (food: FoodRecord, qtyGrams: number) => void;
  /** Uma combinação substitui o original por TODOS estes itens. */
  onSelectCombination: (items: SubstitutionCombinationItem[]) => void;
  /** Scanner: preservar o peso real escaneado continua sendo uma escolha explícita. */
  keepCurrent?: { label: string; onSelect: () => void } | null;
  /** Tela cheia do scanner usa z-[70]; eleva o conteúdo sem mudar os demais diálogos. */
  elevated?: boolean;
}

type SubstitutionMode = 'protein' | 'calories';
type Selection = {
  key: string;
  name: string;
  macros: EngineMacros;
  diff: EngineMacros;
  food?: FoodRecord;
  qtyGrams?: number;
  combination?: SubstitutionCombination;
  proteinNote?: string;
};

const n0 = (v: number) => Math.round(v);
const n1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const sign = (v: number, digits: 0 | 1 = 1) =>
  `${v > 0 ? '+' : ''}${digits === 0 ? n0(v) : n1(v)}`;
const macroLine = (m: EngineMacros) =>
  `${n0(m.kcal)} kcal · P ${n1(m.p)} · C ${n1(m.c)} · G ${n1(m.g)}`;

const LEVEL_CLASS: Record<SubstitutionCandidate['level'], string> = {
  equivalent: 'border-chart-3/50 bg-chart-3/10 text-chart-3',
  close: 'border-border bg-secondary/50 text-muted-foreground',
  different: 'border-chart-5/50 bg-chart-5/10 text-chart-5',
};

const shortFoodName = (name: string): string => name.split(/\s*[([].*/)[0].trim() || name;
const combinationItemLabel = (item: SubstitutionCombinationItem, unitWeights: FoodUnitWeight[]): string => {
  const quantity = formatSubstitutionQuantity(item.food, item.qtyGrams, unitWeights);
  return quantity.includes('(') ? quantity.replace(/\s*\([^)]*\)/g, '') : item.food.name;
};

const CanonicalFoodSubstitutionDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  foods,
  currentFoodId,
  currentName,
  currentQtyGrams,
  currentMacros,
  mealTotals,
  dayTotals,
  studentId,
  objective,
  dietPhase,
  mealName,
  mealTime,
  workoutTime,
  trainingContext,
  onSelect,
  onSelectCombination,
  keepCurrent,
  elevated = false,
}) => {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<SubstitutionMode>('protein');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const index = useMemo(() => buildFoodIndex(foods ?? []), [foods]);
  const [profileObjective, setProfileObjective] = useState<string | null>(null);
  const [unitWeights, setUnitWeights] = useState<FoodUnitWeight[]>([]);

  useEffect(() => {
    setProfileObjective(null);
    if (!open || !studentId || objective?.trim()) return;
    let cancelled = false;
    void supabase.from('students_profile').select('objetivo').eq('user_id', studentId).maybeSingle().then(({ data }) => {
      if (!cancelled) setProfileObjective((data as any)?.objetivo ?? null);
    });
    return () => { cancelled = true; };
  }, [open, studentId, objective]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void supabase.from('food_unit_weights').select('food_id, tamanho, gramas').then(({ data, error }) => {
      if (!cancelled) setUnitWeights(error ? [] : ((data ?? []) as FoodUnitWeight[]));
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMode('protein');
    setSelection(null);
    setDragY(0);
  }, [open, currentName]);

  const availableFoods = useMemo(() => filterSubstitutionFoods({
    foods: foods ?? [], currentFoodId, currentName, currentQtyGrams, currentMacros,
  }), [foods, currentFoodId, currentName, currentQtyGrams, currentMacros]);

  const smart = useMemo(() => {
    if (!open) return { proteinSource: false, candidates: [] };
    const list = filterFoodsBySearch(availableFoods, search);
    const result = buildSmartSubstitutionCandidates(list, currentMacros, currentName, index, unitWeights, list.length);
    const original = foods.find(food => food.id === currentFoodId) ?? { id: 'current-food', name: currentName, calories: 0, protein: 0, carbs: 0, fats: 0 };
    const tier = (food: FoodRecord) => substitutionFamilyTier(original, food);
    return { ...result, candidates: result.candidates.sort((a, b) => tier(a.food) - tier(b.food)).slice(0, 60) };
  }, [open, availableFoods, search, currentMacros, currentName, currentFoodId, foods, index, unitWeights]);

  const originalFood = foods.find(food => food.id === currentFoodId) ?? { id: 'current-food', name: currentName, calories: 0, protein: 0, carbs: 0, fats: 0 };
  const primaryCandidates = smart.candidates.filter(candidate => substitutionFamilyTier(originalFood, candidate.food) < 2);
  const otherCandidates = smart.candidates.filter(candidate => substitutionFamilyTier(originalFood, candidate.food) === 2);

  const bestChoices = useMemo(() => {
    if (!open || search.trim()) return [];
    return buildBestSubstitutionChoices({
      foods: availableFoods, currentName, currentQtyGrams, currentMacros, index, unitWeights,
      preference: { objective: objective?.trim() || profileObjective, dietPhase, mealName, mealTime, workoutTime, trainingContext },
    });
  }, [open, search, availableFoods, currentName, currentQtyGrams, currentMacros, index, unitWeights, objective, profileObjective, dietPhase, mealName, mealTime, workoutTime, trainingContext]);

  const displayedBestChoices = useMemo(() => bestChoices.map((choice) => {
    const candidate = buildSmartSubstitutionCandidates(
      [choice.food], currentMacros, currentName, index, unitWeights, 1,
    ).candidates[0];
    const option = mode === 'protein'
      ? candidate?.sameProtein ?? candidate?.sameCalories ?? choice.option
      : candidate?.sameCalories ?? choice.option;
    return { ...choice, option };
  }), [bestChoices, currentMacros, currentName, index, unitWeights, mode]);
  const bestTip = bestSubstitutionTip(displayedBestChoices[0]);

  const hasEquivalentAlternative = smart.candidates.some((candidate) =>
    [candidate.sameProtein, candidate.sameCalories].some((option) => option?.level === 'equivalent'));
  const combinations = useMemo(() => {
    if (!open || !smart.proteinSource || hasEquivalentAlternative || search.trim()) return [];
    return buildProteinCombinations(availableFoods, currentMacros, index, unitWeights, 3, currentName);
  }, [open, smart.proteinSource, hasEquivalentAlternative, search, availableFoods, currentMacros, index, unitWeights, currentName]);

  const close = () => {
    onOpenChange(false);
    setSearch('');
    setSelection(null);
    setDragY(0);
    dragStart.current = null;
  };

  const changeMode = (next: SubstitutionMode) => {
    setMode(next);
    setSelection(null);
  };

  const chooseOption = (option: SubstitutionCandidate, key: string) => {
    setSelection({
      key,
      name: option.food.name,
      macros: option.macros,
      diff: option.diff,
      food: option.food,
      qtyGrams: option.qtyGrams,
      proteinNote: option.proteinLimitedByCalories && (option.proteinShortfall ?? 0) >= 0.05
        ? `−${n1(option.proteinShortfall ?? 0).replace(/,0$/, '')} g P por causa do limite de calorias`
        : undefined,
    });
  };

  const confirmSelection = () => {
    if (!selection) return;
    if (selection.food && selection.qtyGrams != null) onSelect(selection.food, selection.qtyGrams);
    else if (selection.combination) onSelectCombination(selection.combination.items);
    close();
  };

  const levelBadge = (level: SubstitutionCandidate['level']) => (
    <Badge variant="outline" className={`h-5 shrink-0 gap-0.5 px-1.5 text-[9px] font-medium ${LEVEL_CLASS[level]}`}>
      {level === 'equivalent' && <Check className="h-2.5 w-2.5" />}
      {level === 'equivalent' ? 'Equivalente' : level === 'close' ? 'Próximo' : 'Diferente'}
    </Badge>
  );

  const optionRow = (
    option: SubstitutionCandidate,
    key: string,
    testId: string,
    reasons?: string[],
  ) => {
    const delta = substitutionDisplayDelta(option.diff, currentMacros.kcal);
    const selected = selection?.key === key;
    return (
      <button
        key={key}
        type="button"
        data-testid={testId}
        aria-pressed={selected}
        onClick={() => chooseOption(option, key)}
        className={`min-h-[60px] w-full min-w-0 rounded-xl border px-3 py-2 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border/60 bg-secondary/35 hover:border-primary/45 hover:bg-secondary/50'}`}
      >
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[13px] font-semibold leading-5 text-foreground">{option.food.name}</span>
          <span className="shrink-0 text-right text-xs font-bold leading-5 text-primary">
            {formatSubstitutionQuantity(option.food, option.qtyGrams, unitWeights)}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4">
          <span className="min-w-0 truncate text-muted-foreground">{macroLine(option.macros)}</span>
          {reasons?.length ? (
            <span className="ml-auto max-w-[48%] shrink-0 truncate rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              {reasons.map((reason, index) => index === 0 ? reason : reason.charAt(0).toLowerCase() + reason.slice(1)).join(' · ')}
            </span>
          ) : levelBadge(option.level)}
          {delta && <span className={`shrink-0 text-[10px] font-semibold ${delta.positive ? 'text-chart-3' : 'text-chart-5'}`}>{delta.text}</span>}
        </span>
      </button>
    );
  };

  const combinationRow = (combo: SubstitutionCombination) => {
    const key = `combo-${combo.id}`;
    const selected = selection?.key === key;
    const delta = substitutionDisplayDelta(combo.diff, currentMacros.kcal);
    return (
      <button
        key={combo.id}
        type="button"
        data-testid={`substitution-combo-${combo.items.map((i) => i.food.id).join('-')}`}
        aria-pressed={selected}
        onClick={() => setSelection({ key, name: combo.name, macros: combo.macros, diff: combo.diff, combination: combo })}
        className={`min-h-[60px] w-full min-w-0 rounded-xl border px-3 py-2 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border/60 bg-secondary/35 hover:border-primary/45 hover:bg-secondary/50'}`}
      >
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[13px] font-semibold leading-5">
            {combo.items.map((item) => combinationItemLabel(item, unitWeights)).join(' + ')}
          </span>
          <span className="shrink-0 text-right text-xs font-bold leading-5 text-primary">
            {combo.items.map((item) => `${n0(item.qtyGrams)} g`).join(' + ')}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4">
          <span className="min-w-0 truncate text-muted-foreground">{macroLine(combo.macros)}</span>
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[9px] font-medium text-muted-foreground">combinação</Badge>
          {levelBadge(combo.level)}
          {delta && <span className={`shrink-0 text-[10px] font-semibold ${delta.positive ? 'text-chart-3' : 'text-chart-5'}`}>{delta.text}</span>}
        </span>
      </button>
    );
  };

  const mealAfter = mealTotals && selection ? totalsAfterSwap(mealTotals, currentMacros, selection.macros) : null;
  const candidateRows = (candidates: typeof smart.candidates) => candidates.map(candidate => {
    const option = mode === 'protein' && smart.proteinSource ? candidate.sameProtein ?? candidate.sameCalories : candidate.sameCalories;
    const activeMode = mode === 'protein' && candidate.sameProtein ? 'protein' : 'calories';
    return <div key={candidate.food.id} data-testid={`substitution-food-${candidate.food.id}`}>
      {optionRow(option, `food-${candidate.food.id}-${activeMode}`, `substitution-option-${candidate.food.id}-${activeMode}`)}
    </div>;
  });
  const dayAfter = dayTotals && selection ? totalsAfterSwap(dayTotals, currentMacros, selection.macros) : null;
  const warnings = selection ? substitutionWarnings(selection.macros, currentMacros) : [];

  const dragStartHandler = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const dragMoveHandler = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStart.current == null) return;
    setDragY(Math.max(0, event.clientY - dragStart.current));
  };
  const dragEndHandler = () => {
    if (dragY > 90) close();
    else setDragY(0);
    dragStart.current = null;
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); else onOpenChange(true); }}>
      <DialogContent
        className={`inset-x-0 bottom-0 top-auto mx-auto flex h-[calc(100dvh-env(safe-area-inset-top,0px)-8px)] max-h-[860px] w-full max-w-lg translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-3xl border-b-0 p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom [&>button:last-child]:hidden ${elevated ? 'z-[90]' : ''}`}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragStart.current != null ? 'none' : undefined }}
        data-testid="food-substitution-sheet"
      >
        <DialogDescription className="sr-only">Compare porções por proteína ou calorias e escolha um alimento ou combinação.</DialogDescription>

        <div className="shrink-0 border-b border-border/60 bg-background px-4 pb-3">
          <div
            className="flex h-6 cursor-grab items-start justify-center pt-[7px] touch-none active:cursor-grabbing"
            onPointerDown={dragStartHandler}
            onPointerMove={dragMoveHandler}
            onPointerUp={dragEndHandler}
            onPointerCancel={dragEndHandler}
            data-testid="substitution-drag-handle"
          >
            <span className="h-1.5 w-11 rounded-full bg-muted-foreground/45" />
          </div>
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
              <ArrowRightLeft className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">Substituir alimento</span>
            </DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Fechar substituição"
              data-testid="substitution-close"
              onClick={close}
              className="mr-1 h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-full bg-secondary/60 p-0 text-foreground hover:bg-secondary"
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>

          <div className="mt-2 rounded-xl bg-secondary/45 px-3 py-2" data-testid="current-food-card">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Atual</span>
              <span className="min-w-0 truncate text-[13px] font-bold">{currentName}</span>
              <span className="ml-auto shrink-0 text-xs font-bold text-primary">{n0(currentQtyGrams)} g</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{macroLine(currentMacros)}</p>
            {mealTotals && <p className="mt-1 truncate text-[10px] text-muted-foreground">Refeição: {macroLine(mealTotals)}</p>}
          </div>

          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar alimento substituto..."
              value={search}
              onChange={(event) => { setSearch(event.target.value); setSelection(null); }}
              className="h-[42px] pl-9"
            />
          </div>

          {smart.proteinSource && (
            <div className="mt-2 grid h-10 grid-cols-2 rounded-xl bg-secondary/55 p-1" data-testid="substitution-mode-control">
              <button type="button" data-testid="substitution-mode-protein" aria-pressed={mode === 'protein'} onClick={() => changeMode('protein')}
                className={`rounded-lg text-xs font-semibold transition-colors ${mode === 'protein' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                Mesma proteína
              </button>
              <button type="button" data-testid="substitution-mode-calories" aria-pressed={mode === 'calories'} onClick={() => changeMode('calories')}
                className={`rounded-lg text-xs font-semibold transition-colors ${mode === 'calories' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                Mesmas calorias
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" style={{ WebkitOverflowScrolling: 'touch' }} data-testid="substitution-list">
          {keepCurrent && (
            <Button type="button" variant="outline" className="mb-3 h-auto min-h-10 w-full whitespace-normal text-xs" onClick={() => { keepCurrent.onSelect(); close(); }}>
              {keepCurrent.label}
            </Button>
          )}

          {displayedBestChoices.length > 0 && (
            <section className="mb-4" data-testid="best-food-choices">
              <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary"><Star className="h-3 w-3" /> Melhor para você</h3>
              {bestTip && <p className="mb-2 mt-1 text-[10px] leading-4 text-muted-foreground" data-testid="best-food-tip">{bestTip}</p>}
              <div className="mt-2 space-y-1.5">
                {displayedBestChoices.map((choice) => (
                  <div key={choice.food.id}>
                    {optionRow(choice.option, `best-${choice.food.id}-${mode}`, `best-food-${choice.food.id}`, choice.reasons)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {combinations.length > 0 && (
            <section className="mb-4" data-testid="protein-substitution-combinations">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Combinações</h3>
              <p className="mb-2 mt-1 text-[10px] text-muted-foreground">Todos os itens entram no lugar de {currentName}.</p>
              <div className="space-y-1.5">{combinations.map(combinationRow)}</div>
            </section>
          )}

          <section data-testid="primary-substitutes">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Substitutos{smart.proteinSource ? ` · ${mode === 'protein' ? 'mesma proteína' : 'mesmas calorias'}` : ''}
            </h3>
            <div className="space-y-1.5">
              {smart.candidates.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Nenhum alimento encontrado</p>
              ) : candidateRows(primaryCandidates)}
            </div>
          </section>
          {otherCandidates.length > 0 && (
            <details className="mt-4" data-testid="other-substitutes">
              <summary className="cursor-pointer py-2 text-xs font-medium text-muted-foreground">Outras opções</summary>
              <div className="mt-2 space-y-1.5">{candidateRows(otherCandidates)}</div>
            </details>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }} data-testid="substitution-footer">
          {selection && (
            <div className="mb-3" data-testid="selected-substitution-summary">
              {mealAfter && <p className="text-[11px] leading-4 text-foreground"><strong>Refeição depois:</strong> {macroLine(mealAfter)} <span className="text-muted-foreground">({sign(selection.diff.kcal, 0)} kcal · {sign(selection.diff.p)} g P)</span></p>}
              {dayAfter && <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">Dia depois: {macroLine(dayAfter)}</p>}
              {selection.proteinNote && <p className="mt-1 text-[10px] font-medium text-chart-5">{selection.proteinNote}</p>}
              {warnings.map((warning) => <p key={warning} className="mt-1 flex items-start gap-1 text-[10px] font-medium leading-4 text-chart-5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{warning}</p>)}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={close} className="h-11 shrink-0 px-5">Cancelar</Button>
            <Button type="button" disabled={!selection} onClick={confirmSelection} className="h-11 min-w-0 flex-1 font-semibold" data-testid="confirm-substitution">
              <span className="truncate">{selection ? `Trocar por ${selection.combination ? 'combinação' : shortFoodName(selection.name)}` : 'Escolhe um alimento'}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CanonicalFoodSubstitutionDialog;
