import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { ParsedFood } from '@/lib/dietResultParser';
import type { DietTargets } from '@/lib/dietSchema';

interface FoodSubstitutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalFood: ParsedFood;
  onSubstitute: (newFood: ParsedFood) => void;
  /** Optional totals of the meal that contains this item (for impact preview). */
  mealTotals?: { kcal: number; p: number; c: number; g: number };
  /** Daily kcal target for soft warning when swap pushes meal off-meta. */
  targets?: DietTargets | null;
}

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const FoodSubstitutionDialog: React.FC<FoodSubstitutionDialogProps> = ({
  open,
  onOpenChange,
  originalFood,
  onSubstitute,
  mealTotals,
  targets,
}) => {
  const [search, setSearch] = useState('');

  const { data: foods = [] } = useQuery({
    queryKey: ['foods-for-substitution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const origKcal = parseNum(originalFood.kcal);
  const origP = parseNum(originalFood.p);
  const origC = parseNum(originalFood.c);
  const origG = parseNum(originalFood.g);

  // Per-day kcal share if we have a target — used to flag swaps that push the meal far off.
  const dayKcalTarget = targets?.kcal ?? 0;

  // Score: lower = closer macros. Compares absolute macro values scaled to equivalent portion.
  const macroScore = useCallback((food: typeof foods[number]) => {
    const kcalPer100 = food.calories > 0 ? food.calories / (food.portion_size || 100) : 0;
    let scale = 1;
    if (kcalPer100 > 0 && origKcal > 0) {
      const newPortion = origKcal / kcalPer100;
      scale = newPortion / (food.portion_size || 100);
    }
    const scaledP = food.protein * scale;
    const scaledC = food.carbs * scale;
    const scaledG = food.fats * scale;

    // Weighted absolute difference — protein and carbs matter more
    return Math.abs(scaledP - origP) * 2 + Math.abs(scaledC - origC) * 2 + Math.abs(scaledG - origG);
  }, [origKcal, origP, origC, origG]);

  const filtered = useMemo(() => {
    let list = foods;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = foods.filter((f) => f.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => macroScore(a) - macroScore(b));
  }, [foods, search, macroScore]);


  const handleSelect = useCallback(
    (food: typeof foods[number]) => {
      // Calculate portion to match original kcal
      const kcalPer100 = food.calories > 0 ? food.calories / (food.portion_size || 100) : 0;
      let newPortionG: number;
      let newKcal: number;
      let newP: number;
      let newC: number;
      let newG: number;

      if (kcalPer100 > 0 && origKcal > 0) {
        // Scale portion so kcal matches original
        newPortionG = Math.round((origKcal / kcalPer100) * 10) / 10;
        const scale = newPortionG / (food.portion_size || 100);
        newKcal = Math.round(food.calories * scale);
        newP = Math.round(food.protein * scale * 10) / 10;
        newC = Math.round(food.carbs * scale * 10) / 10;
        newG = Math.round(food.fats * scale * 10) / 10;
      } else {
        newPortionG = food.portion_size || 100;
        newKcal = food.calories;
        newP = food.protein;
        newC = food.carbs;
        newG = food.fats;
      }

      onSubstitute({
        food: food.name,
        qty: `${newPortionG} g`,
        kcal: String(newKcal),
        p: String(newP),
        c: String(newC),
        g: String(newG),
        sub: originalFood.sub,
      });
      onOpenChange(false);
      setSearch('');
    },
    [origKcal, onSubstitute, onOpenChange, originalFood.sub],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col fixed top-[5vh] translate-y-0 sm:top-[50%] sm:-translate-y-1/2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Substituir alimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          {/* Original food info */}
          <div className="rounded-lg bg-secondary/60 p-3 shrink-0">
            <p className="text-xs text-muted-foreground mb-1">Alimento atual</p>
            <p className="text-sm font-semibold">{originalFood.food}</p>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>{originalFood.qty}</span>
              <span>{originalFood.kcal} kcal</span>
              <span>P:{originalFood.p}</span>
              <span>C:{originalFood.c}</span>
              <span>G:{originalFood.g}</span>
            </div>
            {mealTotals && (
              <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex flex-wrap gap-x-3">
                <span>Refeição: <strong className="text-foreground">{Math.round(mealTotals.kcal)} kcal</strong></span>
                <span>P:{Math.round(mealTotals.p)}</span>
                <span>C:{Math.round(mealTotals.c)}</span>
                <span>G:{Math.round(mealTotals.g)}</span>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar alimento substituto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Food list */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch" style={{ maxHeight: '50vh', WebkitOverflowScrolling: 'touch' }}>
            <div className="space-y-1 pr-3">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Nenhum alimento encontrado
                </p>
              ) : (
                filtered.map((food) => {
                  const kcalPer100 = food.calories > 0 ? food.calories / (food.portion_size || 100) : 0;
                  const newPortion = kcalPer100 > 0 && origKcal > 0
                    ? Math.round((origKcal / kcalPer100) * 10) / 10
                    : food.portion_size || 100;
                  const scale = newPortion / (food.portion_size || 100);
                  const scaledKcal = Math.round(food.calories * scale);
                  const scaledP = Math.round(food.protein * scale * 10) / 10;
                  const scaledC = Math.round(food.carbs * scale * 10) / 10;
                  const scaledG = Math.round(food.fats * scale * 10) / 10;

                  // Impact deltas vs the original item.
                  const dKcal = scaledKcal - origKcal;
                  const dP = Math.round((scaledP - origP) * 10) / 10;
                  const dC = Math.round((scaledC - origC) * 10) / 10;
                  const dG = Math.round((scaledG - origG) * 10) / 10;
                  // Flag swap that shifts the day target by >3% (rough proxy).
                  const heavyShift = dayKcalTarget > 0 && Math.abs(dKcal) / dayKcalTarget > 0.03;
                  const macroShift =
                    Math.abs(dP) >= 8 || Math.abs(dC) >= 12 || Math.abs(dG) >= 5;
                  const showWarn = heavyShift || macroShift;

                  return (
                    <button
                      key={food.id}
                      onClick={() => handleSelect(food)}
                      className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-primary/10 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                          {food.name}
                          {showWarn && (
                            <AlertTriangle
                              className="h-3 w-3 text-yellow-400 shrink-0"
                              aria-label="Troca pode tirar a refeição da meta"
                            />
                          )}
                        </p>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="text-primary font-medium">{newPortion}g</span>
                          <span>≈{scaledKcal} kcal</span>
                          <span>P:{scaledP}</span>
                          <span>C:{scaledC}</span>
                          <span>G:{scaledG}</span>
                        </div>
                        {showWarn && (
                          <div className="mt-0.5 text-[10px] text-yellow-400/90 flex flex-wrap gap-2">
                            <span>Δ {dKcal > 0 ? '+' : ''}{dKcal} kcal</span>
                            {Math.abs(dP) >= 0.5 && <span>ΔP {dP > 0 ? '+' : ''}{dP}g</span>}
                            {Math.abs(dC) >= 0.5 && <span>ΔC {dC > 0 ? '+' : ''}{dC}g</span>}
                            {Math.abs(dG) >= 0.5 && <span>ΔG {dG > 0 ? '+' : ''}{dG}g</span>}
                          </div>
                        )}
                      </div>
                      <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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

export default FoodSubstitutionDialog;
