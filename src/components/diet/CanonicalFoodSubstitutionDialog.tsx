/**
 * Modal canônico de substituição (ALUNO e ADMIN).
 * Determinístico: sem IA; toda porção, combo e macro vem do nutritionEngine.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, ArrowRightLeft, AlertTriangle, Check, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import { buildFoodIndex, type EngineMacros, type FoodRecord } from '@/lib/nutritionEngine';
import {
  buildBestSubstitutionChoices,
  buildProteinCombinations,
  buildSmartSubstitutionCandidates,
  bestSubstitutionTip,
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

const n0 = (v: number) => Math.round(v);
const n1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const sign = (v: number, digits: 0 | 1 = 1) =>
  `${v > 0 ? '+' : ''}${digits === 0 ? n0(v) : n1(v)}`;
const macroLine = (m: EngineMacros) =>
  `${n0(m.kcal)} kcal · P ${n1(m.p)} g · C ${n1(m.c)} g · G ${n1(m.g)} g`;

const LEVEL_CLASS: Record<SubstitutionCandidate['level'], string> = {
  equivalent: 'border-chart-3/60 bg-chart-3/10 text-chart-3',
  close: 'border-primary/50 text-primary',
  different: 'border-primary/40 text-primary',
};

const CanonicalFoodSubstitutionDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  foods,
  currentName,
  currentQtyGrams,
  currentMacros,
  mealTotals,
  dayTotals,
  dayTarget,
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
  const index = useMemo(() => buildFoodIndex(foods ?? []), [foods]);
  const [profileObjective, setProfileObjective] = useState<string | null>(null);
  const [unitWeights, setUnitWeights] = useState<FoodUnitWeight[]>([]);
  useEffect(() => {
    if (!open || !studentId || objective != null) return;
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

  const smart = useMemo(() => {
    if (!open) return { proteinSource: false, candidates: [] };
    const list = filterFoodsBySearch(foods ?? [], search);
    return buildSmartSubstitutionCandidates(list, currentMacros, currentName, index, unitWeights);
  }, [open, foods, search, currentMacros, currentName, index, unitWeights]);

  const bestChoices = useMemo(() => {
    if (!open || search.trim()) return [];
    return buildBestSubstitutionChoices({
      foods: foods ?? [], currentName, currentQtyGrams, currentMacros, index, unitWeights,
      preference: { objective: objective ?? profileObjective, dietPhase, mealName, mealTime, workoutTime, trainingContext },
    });
  }, [open, search, foods, currentName, currentQtyGrams, currentMacros, index, unitWeights, objective, profileObjective, dietPhase, mealName, mealTime, workoutTime, trainingContext]);
  const bestTip = bestSubstitutionTip(bestChoices[0]);

  const hasEquivalentAlternative = smart.candidates.some((candidate) =>
    candidate.food.name.localeCompare(currentName, 'pt-BR', { sensitivity: 'base' }) !== 0 &&
    [candidate.sameProtein, candidate.sameCalories].some((option) => option?.level === 'equivalent'));
  const combinations = useMemo(() => {
    if (!open || !smart.proteinSource || hasEquivalentAlternative || search.trim()) return [];
    return buildProteinCombinations(foods ?? [], currentMacros, index, unitWeights, 3, currentName);
  }, [open, smart.proteinSource, hasEquivalentAlternative, search, foods, currentMacros, index, unitWeights, currentName]);

  const close = () => {
    onOpenChange(false);
    setSearch('');
  };

  const optionButton = (
    option: SubstitutionCandidate,
    mode: 'protein' | 'calories',
    proteinSource: boolean,
  ) => {
    const proteinMode = mode === 'protein';
    const warnings = substitutionWarnings(option.macros, currentMacros);
    const mealAfter = mealTotals ? totalsAfterSwap(mealTotals, currentMacros, option.macros) : null;
    const dayAfter = dayTotals ? totalsAfterSwap(dayTotals, currentMacros, option.macros) : null;
    return (
      <button
        key={mode}
        type="button"
        data-testid={`substitution-option-${option.food.id}-${mode}`}
        onClick={() => { onSelect(option.food, option.qtyGrams); close(); }}
        className={`min-w-0 rounded-xl border p-2.5 text-left transition-colors ${proteinMode ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-background/50 hover:bg-secondary/60'}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[11px] font-bold ${proteinMode ? 'text-primary' : 'text-foreground'}`}>
            {proteinMode ? 'Mesma proteína' : 'Mesmas calorias'}
          </span>
          {proteinMode && <span className="text-[9px] font-semibold uppercase text-primary">Recomendada</span>}
        </div>
        <p className="mt-1.5 text-xs font-semibold text-primary">
          {formatSubstitutionQuantity(option.food, option.qtyGrams, unitWeights)}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">≈ {macroLine(option.macros)}</p>
        <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
          Δ {sign(option.diff.kcal, 0)} kcal · ΔP {sign(option.diff.p)} g · ΔC {sign(option.diff.c)} g · ΔG {sign(option.diff.g)} g
        </p>
        {proteinMode && option.proteinLimitedByCalories && (option.proteinShortfall ?? 0) >= 0.05 && (
          <p className="mt-1 text-[10px] font-semibold text-primary">−{n1(option.proteinShortfall!).replace(/,0$/, '')} g P por causa do limite de calorias</p>
        )}
        <Badge variant="outline" className={`mt-2 text-[9px] ${LEVEL_CLASS[option.level]}`}>
          {option.level === 'equivalent' ? <Check className="mr-1 h-2.5 w-2.5" /> : <AlertTriangle className="mr-1 h-2.5 w-2.5" />}
          {option.level === 'equivalent' ? 'Equivalente' : option.level === 'close' ? 'Próximo' : proteinSource ? 'Fora da equivalência proteica' : 'Perfil nutricional diferente'}
        </Badge>
        {warnings.map((warning) => <p key={warning} className="mt-1.5 text-[10px] font-medium leading-relaxed text-primary">{warning}</p>)}
        {mealAfter && <p className="mt-1.5 text-[9px] text-muted-foreground">Refeição depois: {macroLine(mealAfter)}</p>}
        {dayAfter && <p className="text-[9px] text-muted-foreground">Dia depois: {macroLine(dayAfter)}</p>}
      </button>
    );
  };

  const combinationButton = (combo: SubstitutionCombination) => {
    const warnings = substitutionWarnings(combo.macros, currentMacros);
    return (
      <button
        key={combo.id}
        type="button"
        data-testid={`substitution-combo-${combo.items.map((i) => i.food.id).join('-')}`}
        onClick={() => { onSelectCombination(combo.items); close(); }}
        className="w-full rounded-xl border border-border bg-background/50 p-3 text-left transition-colors hover:bg-secondary/60"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold">{combo.name}</p>
          <Badge variant="outline" className={`shrink-0 text-[9px] ${LEVEL_CLASS[combo.level]}`}>
            {combo.level === 'equivalent' ? 'Equivalente' : 'Próximo'}
          </Badge>
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-primary">
          {combo.items.map((item) => formatSubstitutionQuantity(item.food, item.qtyGrams, unitWeights)).join(' + ')}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">≈ {macroLine(combo.macros)}</p>
        <p className="mt-1 text-[9px] text-muted-foreground">
          Δ {sign(combo.diff.kcal, 0)} kcal · ΔP {sign(combo.diff.p)} g · ΔC {sign(combo.diff.c)} g · ΔG {sign(combo.diff.g)} g
        </p>
        {warnings.map((warning) => <p key={warning} className="mt-1 text-[10px] font-medium text-primary">{warning}</p>)}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`fixed top-[3vh] flex max-h-[92vh] max-w-lg translate-y-0 flex-col sm:top-[50%] sm:-translate-y-1/2 ${elevated ? 'z-[90]' : ''}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowRightLeft className="h-4 w-4 text-primary" /> Substituir alimento
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">Compare porções por proteína ou calorias e escolha um alimento ou combinação.</DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col space-y-3">
          <div className="shrink-0 rounded-lg bg-secondary/60 p-3">
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Atual</p>
            <p className="text-sm font-semibold">{currentName}</p>
            <p className="text-xs text-muted-foreground">{n0(currentQtyGrams)} g</p>
            <p className="mt-1 text-xs text-foreground">{macroLine(currentMacros)}</p>
            {mealTotals && <p className="mt-2 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">Refeição: {macroLine(mealTotals)}</p>}
            {dayTotals && <p className="text-[10px] text-muted-foreground">Dia: {macroLine(dayTotals)}</p>}
            {dayTarget && <p className="text-[10px] text-muted-foreground">Meta: {macroLine(dayTarget)}</p>}
          </div>

          <p className="shrink-0 text-[11px] text-muted-foreground">
            {smart.proteinSource
              ? 'Fonte de proteína: compare a mesma proteína com as mesmas calorias. A escolha continua liberada mesmo quando houver aviso.'
              : 'A quantidade é calculada para ficar nutricionalmente próxima, mantendo a regra por calorias e macros.'}
          </p>

          {keepCurrent && (
            <Button type="button" variant="outline" className="shrink-0 text-xs" onClick={() => { keepCurrent.onSelect(); close(); }}>
              {keepCurrent.label}
            </Button>
          )}

          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Buscar alimento substituto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            {bestChoices.length > 0 && (
              <section className="mb-3 rounded-xl border border-primary/35 bg-primary/5 p-3" data-testid="best-food-choices">
                <p className="flex items-center gap-1.5 text-xs font-bold text-primary"><Star className="h-3.5 w-3.5" /> Melhor para você</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Da mesma família, de acordo com seu objetivo e esta refeição.</p>
                {bestTip && <p className="mt-2 rounded-lg bg-background/60 p-2 text-[11px] leading-relaxed text-foreground" data-testid="best-food-tip">{bestTip}</p>}
                <div className="mt-2 space-y-2">
                  {bestChoices.map((choice) => (
                    <button key={choice.food.id} type="button" data-testid={`best-food-${choice.food.id}`}
                      onClick={() => { onSelect(choice.option.food, choice.option.qtyGrams); close(); }}
                      className="w-full rounded-lg border border-border bg-background/70 p-2.5 text-left transition-colors hover:border-primary/50">
                      <p className="text-xs font-semibold text-foreground">{choice.food.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {choice.reasons.map((reason) => <Badge key={reason} variant="outline" className="border-primary/40 text-[9px] text-primary">{reason}</Badge>)}
                      </div>
                      <p className="mt-1.5 text-xs font-semibold text-primary">{formatSubstitutionQuantity(choice.food, choice.option.qtyGrams, unitWeights)}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">≈ {macroLine(choice.option.macros)}</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground">ΔP {sign(choice.option.diff.p)} g · ΔC {sign(choice.option.diff.c)} g · Δ {sign(choice.option.diff.kcal, 0)} kcal</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {combinations.length > 0 && (
              <div className="mb-3 space-y-2" data-testid="protein-substitution-combinations">
                <p className="text-xs font-semibold">Combinações para chegar mais perto da proteína</p>
                <p className="text-[10px] text-muted-foreground">Cada opção entra como dois alimentos no lugar de {currentName}.</p>
                {combinations.map(combinationButton)}
              </div>
            )}
            <div className="space-y-2">
              {smart.candidates.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Nenhum alimento encontrado</p>
              ) : smart.candidates.map((candidate) => (
                <div key={candidate.food.id} className="rounded-xl bg-secondary/30 p-2" data-testid={`substitution-food-${candidate.food.id}`}>
                  <p className="truncate px-1 pb-2 pt-0.5 text-sm font-medium">{candidate.food.name}</p>
                  <div className={`grid gap-2 ${smart.proteinSource && candidate.sameProtein ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {smart.proteinSource && candidate.sameProtein && optionButton(candidate.sameProtein, 'protein', true)}
                    {optionButton(candidate.sameCalories, 'calories', smart.proteinSource)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CanonicalFoodSubstitutionDialog;
