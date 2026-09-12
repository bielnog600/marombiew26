import React, { useCallback, useState } from 'react';
import { Check, ChevronDown, Plus, SlidersHorizontal, Trash2, ArrowRightLeft, X, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import type { ParsedFood, ParsedMeal } from '@/lib/dietResultParser';
import { scaleFood, parseNumeric } from '@/lib/dailyDietRebalance';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AddFoodDialog from './AddFoodDialog';
import FoodSubstitutionDialog from './FoodSubstitutionDialog';

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

export interface MealTarget {
  index: number;
  name: string;
}

interface StudentMealCardProps {
  meal: ParsedMeal;
  expanded: boolean;
  onToggleExpand: () => void;
  isCompleted?: boolean;
  onToggleComplete?: () => void;
  onFoodsChange: (foods: ParsedFood[]) => void;
  /** Outras refeições do dia, para mover alimentos. */
  moveTargets: MealTarget[];
  onMoveFood: (food: ParsedFood, targetMealIndex: number) => void;
  /** Destaque da refeição sugerida pelo horário atual. */
  isCurrent?: boolean;
}

const StudentMealCard: React.FC<StudentMealCardProps> = ({
  meal,
  expanded,
  onToggleExpand,
  isCompleted,
  onToggleComplete,
  onFoodsChange,
  moveTargets,
  onMoveFood,
  isCurrent,
}) => {
  const [adjustMode, setAdjustMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [draftQty, setDraftQty] = useState<Record<number, string>>({});

  const foods = meal.foods ?? [];
  const totalKcal = foods.reduce((s, f) => s + parseNum(f.kcal), 0);

  const handleRemove = useCallback(
    (foodIndex: number) => {
      onFoodsChange(foods.filter((_, i) => i !== foodIndex));
      toast.success('Alimento removido — refeições futuras reajustadas');
    },
    [foods, onFoodsChange],
  );

  const handleAdd = useCallback(
    (newFood: ParsedFood) => {
      onFoodsChange([...foods, newFood]);
      toast.success('Alimento adicionado — refeições futuras reajustadas');
    },
    [foods, onFoodsChange],
  );

  const commitQty = (foodIndex: number) => {
    const raw = draftQty[foodIndex];
    if (raw === undefined) return;
    const target = Number(String(raw).replace(',', '.'));
    const original = parseNumeric(foods[foodIndex]?.qty);
    setDraftQty((prev) => {
      const next = { ...prev };
      delete next[foodIndex];
      return next;
    });
    if (!Number.isFinite(target) || target <= 0 || original <= 0 || target === original) return;
    const factor = target / original;
    onFoodsChange(foods.map((f, i) => (i === foodIndex ? scaleFood(f, factor) : f)));
    toast.success('Quantidade atualizada — refeições futuras reajustadas');
  };

  return (
    <>
      <div
        className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
          expanded
            ? 'border-primary/35 bg-gradient-to-br from-primary/[0.07] to-background'
            : 'border-border/50 bg-secondary/20'
        } ${isCurrent && !expanded ? 'ring-1 ring-primary/25' : ''}`}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              isCompleted ? 'bg-green-500/15 text-green-500' : 'bg-primary/12 text-primary'
            }`}
          >
            {isCompleted ? <Check className="h-4 w-4" /> : <UtensilsCrossed className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {meal.time && <span className="text-xs font-semibold text-primary">{meal.time}</span>}
              <span className="truncate text-sm font-semibold text-foreground">{meal.name}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {totalKcal > 0 ? `Aprox. ${round(totalKcal)} kcal` : 'Sem calorias registradas'}
              {foods.length > 0 ? ` · ${foods.length} ${foods.length === 1 ? 'item' : 'itens'}` : ''}
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div
          className={`grid transition-all duration-300 ease-out ${
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border/50 px-3 pb-3 pt-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustMode((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    adjustMode
                      ? 'bg-primary/15 text-primary'
                      : 'bg-secondary/70 text-foreground hover:bg-secondary'
                  }`}
                >
                  {adjustMode ? <X className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
                  {adjustMode ? 'Concluir' : 'Ajustar'}
                </button>
              </div>

              <div className="mt-3 rounded-xl bg-background/40">
                {foods.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum alimento nesta refeição.
                  </p>
                )}
                {foods.map((food, foodIndex) => (
                  <div
                    key={`${meal.name}-${food.food}-${foodIndex}`}
                    className="flex items-start gap-2 border-b border-border/30 px-3 py-2.5 last:border-0"
                  >
                    <div
                      role={adjustMode ? undefined : 'button'}
                      tabIndex={adjustMode ? undefined : 0}
                      onClick={adjustMode ? undefined : () => setSubIndex(foodIndex)}
                      onKeyDown={
                        adjustMode
                          ? undefined
                          : (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSubIndex(foodIndex);
                              }
                            }
                      }
                      aria-label={adjustMode ? undefined : `Substituir ${food.food}`}
                      className={`min-w-0 flex-1 rounded-lg transition-colors ${
                        adjustMode ? '' : 'cursor-pointer active:bg-primary/5'
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-foreground">{food.food}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                        {adjustMode ? (
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={draftQty[foodIndex] ?? String(parseNumeric(food.qty) || '')}
                            onChange={(e) => setDraftQty((prev) => ({ ...prev, [foodIndex]: e.target.value }))}
                            onBlur={() => commitQty(foodIndex)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                            className="h-7 w-20 px-2 text-xs"
                            aria-label={`Quantidade de ${food.food}`}
                          />
                        ) : (
                          <span className="text-muted-foreground">{food.qty || '—'}</span>
                        )}
                        <span className="font-semibold text-primary">{food.kcal ? `${food.kcal} kcal` : '—'}</span>
                        <span className="text-chart-2">P {food.p || '0'}</span>
                        <span className="text-chart-3">C {food.c || '0'}</span>
                        <span className="text-chart-5">G {food.g || '0'}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {moveTargets.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Mover ${food.food} para outra refeição`}
                              className="p-1.5 text-muted-foreground transition-colors hover:text-primary"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="text-xs">Mover para</DropdownMenuLabel>
                            {moveTargets.map((t) => (
                              <DropdownMenuItem
                                key={t.index}
                                className="text-xs"
                                onClick={() => onMoveFood(food, t.index)}
                              >
                                {t.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemove(foodIndex)}
                        aria-label={`Remover ${food.food}`}
                        className="p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {onToggleComplete && (
                <button
                  type="button"
                  onClick={onToggleComplete}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                    isCompleted
                      ? 'bg-green-500/15 text-green-500'
                      : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <Check className={`h-4 w-4 ${isCompleted ? '' : 'opacity-40'}`} />
                  {isCompleted ? 'Refeição concluída' : 'Registrar refeição'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddFoodDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAdd} />

      {subIndex !== null && foods[subIndex] && (
        <FoodSubstitutionDialog
          open
          onOpenChange={(o) => !o && setSubIndex(null)}
          originalFood={foods[subIndex]}
          mealTotals={{
            kcal: foods.reduce((s, f) => s + parseNum(f.kcal), 0),
            p: foods.reduce((s, f) => s + parseNum(f.p), 0),
            c: foods.reduce((s, f) => s + parseNum(f.c), 0),
            g: foods.reduce((s, f) => s + parseNum(f.g), 0),
          }}
          onSubstitute={(newFood) => {
            const idx = subIndex;
            setSubIndex(null);
            onFoodsChange(foods.map((f, i) => (i === idx ? newFood : f)));
            toast.success('Alimento substituído — refeições futuras reajustadas');
          }}
        />
      )}
    </>
  );
};

export default StudentMealCard;
