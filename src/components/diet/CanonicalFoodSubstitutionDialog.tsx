/**
 * MICRO-HOTFIX UX — modal de substituição canônica (ADMIN, structured).
 *
 * Determinístico: sem IA, sem optimizer do dia. A quantidade equivalente é
 * calculada pelo helper puro e os macros vêm sempre do nutritionCore.
 */
import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import {
  buildFoodIndex,
  type EngineMacros,
  type FoodRecord,
} from '@/lib/nutritionEngine';
import {
  buildSubstitutionCandidates,
  totalsAfterSwap,
  EQUIVALENCE_LABEL,
  type SubstitutionCandidate,
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
  onSelect: (food: FoodRecord, qtyGrams: number) => void;
}

const n0 = (v: number) => Math.round(v);
const n1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const sign = (v: number, digits: 0 | 1 = 1) =>
  `${v > 0 ? '+' : ''}${digits === 0 ? n0(v) : n1(v)}`;
const macroLine = (m: EngineMacros) =>
  `${n0(m.kcal)} kcal · P ${n1(m.p)}g · C ${n1(m.c)}g · G ${n1(m.g)}g`;

const LEVEL_CLASS: Record<SubstitutionCandidate['level'], string> = {
  equivalent: 'border-green-500/50 text-green-500',
  close: 'border-sky-500/50 text-sky-400',
  different: 'border-yellow-500/50 text-yellow-400',
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
  onSelect,
}) => {
  const [search, setSearch] = useState('');

  const index = useMemo(() => buildFoodIndex(foods ?? []), [foods]);

  const candidates = useMemo(() => {
    if (!open) return [];
    const list = filterFoodsBySearch(foods ?? [], search);
    return buildSubstitutionCandidates(list, currentMacros, index);
  }, [open, foods, search, currentMacros, index]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed top-[5vh] flex max-h-[85vh] max-w-md translate-y-0 flex-col sm:top-[50%] sm:-translate-y-1/2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Substituir alimento
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col space-y-3">
          <div className="shrink-0 rounded-lg bg-secondary/60 p-3">
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Atual</p>
            <p className="text-sm font-semibold">{currentName}</p>
            <p className="text-xs text-muted-foreground">{currentQtyGrams} g</p>
            <p className="mt-1 text-xs text-foreground">{macroLine(currentMacros)}</p>
            {mealTotals && (
              <p className="mt-2 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                Refeição: {macroLine(mealTotals)}
              </p>
            )}
            {dayTotals && (
              <p className="text-[10px] text-muted-foreground">Dia: {macroLine(dayTotals)}</p>
            )}
            {dayTarget && (
              <p className="text-[10px] text-muted-foreground">Meta: {macroLine(dayTarget)}</p>
            )}
          </div>

          <p className="shrink-0 text-[11px] text-muted-foreground">
            Escolha um alimento abaixo. A quantidade é calculada automaticamente para ficar
            nutricionalmente o mais próxima possível do alimento atual.
          </p>

          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar alimento substituto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={{ maxHeight: '50vh', WebkitOverflowScrolling: 'touch' }}
          >
            <div className="space-y-1 pr-2">
              {candidates.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum alimento encontrado
                </p>
              ) : (
                candidates.map((c) => {
                  const mealAfter = mealTotals
                    ? totalsAfterSwap(mealTotals, currentMacros, c.macros)
                    : null;
                  const dayAfter = dayTotals
                    ? totalsAfterSwap(dayTotals, currentMacros, c.macros)
                    : null;
                  return (
                    <button
                      key={c.food.id}
                      type="button"
                      onClick={() => {
                        onSelect(c.food, c.qtyGrams);
                        onOpenChange(false);
                        setSearch('');
                      }}
                      className="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.food.name}</p>
                        <Badge variant="outline" className={`shrink-0 text-[9px] ${LEVEL_CLASS[c.level]}`}>
                          {c.level === 'different' && <AlertTriangle className="mr-1 h-2.5 w-2.5" />}
                          {EQUIVALENCE_LABEL[c.level]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs">
                        <span className="font-medium text-primary">{c.qtyGrams} g</span>
                        <span className="ml-2 text-muted-foreground">≈ {macroLine(c.macros)}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Δ {sign(c.diff.kcal, 0)} kcal · ΔP {sign(c.diff.p)}g · ΔC {sign(c.diff.c)}g ·
                        ΔG {sign(c.diff.g)}g
                      </p>
                      {mealAfter && (
                        <p className="text-[10px] text-muted-foreground">
                          Refeição depois: {macroLine(mealAfter)}
                        </p>
                      )}
                      {dayAfter && (
                        <p className="text-[10px] text-muted-foreground">
                          Dia depois: {macroLine(dayAfter)}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CanonicalFoodSubstitutionDialog;
