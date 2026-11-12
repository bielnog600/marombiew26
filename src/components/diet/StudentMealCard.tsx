import React, { useCallback, useState } from 'react';
import { Check, ChevronDown, Plus, SlidersHorizontal, Trash2, ArrowRightLeft, X, UtensilsCrossed, Scale, Pencil, Sparkles, ScanBarcode } from 'lucide-react';
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
import { formatDayWeighLabel, type DayFoodWeigh } from '@/lib/mealWeigh';
import FoodSubstitutionDialog from './FoodSubstitutionDialog';

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

/** Selo da pesagem do dia, quando o alimento veio de "Pesar refeição". */
const foodWeigh = (food: ParsedFood): DayFoodWeigh | null => {
  const w = (food as ParsedFood & { weigh?: DayFoodWeigh }).weigh;
  return w && typeof w.status === 'string' ? w : null;
};

const EstimatedWeighBadge: React.FC = () => (
  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/60 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
    <Sparkles className="h-3 w-3" /> Estimado
  </span>
);

const ScannedWeighBadge: React.FC = () => (
  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
    <ScanBarcode className="h-3 w-3" /> Escaneado
  </span>
);

const WeighBadge: React.FC<{ weigh: DayFoodWeigh }> = ({ weigh }) => {
  // "Prato pronto": gramas estimadas pela foto, selo diferente de "Pesado".
  if (weigh.status === 'pesado' && weigh.estimado) return <EstimatedWeighBadge />;
  if (weigh.status === 'pesado' && weigh.escaneado) return <ScannedWeighBadge />;
  if (weigh.status === 'pesado') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
        <Scale className="h-3 w-3" /> Pesado
      </span>
    );
  }
  const label = weigh.status === 'fora_do_plano' ? 'Fora do plano' : weigh.status === 'nao_comeu' ? 'Não comeu' : 'Sem pesar';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
      weigh.status === 'fora_do_plano' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-secondary/60 text-muted-foreground'
    }`}>
      {weigh.status === 'fora_do_plano' && <Scale className="h-3 w-3" />} {label}
    </span>
  );
};

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
  /** Premium "Pesar refeição": o botão só aparece quando informado. */
  onWeigh?: () => void;
  /** Premium: ícone de balança em cada alimento (só lê o peso). */
  onWeighFood?: (foodIndex: number) => void;
  /** Só exibição (ex.: tradução); dados e callbacks seguem com o texto original. */
  displayText?: (text: string) => string;
  /** Refeição já pesada neste dia: mostra o consumido e trava a edição (pesar de novo substitui). */
  weighed?: boolean;
  /** Refeição pesada: abre o resumo editável da pesagem salva. */
  onEditWeigh?: () => void;
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
  onWeigh,
  onWeighFood,
  displayText,
  weighed,
  onEditWeigh,
}) => {
  const show = displayText ?? ((text: string) => text);
  const [adjustMode, setAdjustMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [draftQty, setDraftQty] = useState<Record<number, string>>({});

  const foods = meal.foods ?? [];
  // Selo da refeição: "Escaneado"/"Estimado" quando tudo veio do scanner ou do prato pronto; senão "Pesado".
  const registered = foods.map(foodWeigh).filter((w): w is DayFoodWeigh => !!w && (w.status === 'pesado' || w.status === 'fora_do_plano'));
  const mealBadge = registered.length > 0 && registered.every((w) => w.escaneado) ? 'Escaneado'
    : registered.length > 0 && registered.every((w) => w.estimado) ? 'Estimado' : 'Pesado';
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
              <span className="truncate text-sm font-semibold text-foreground">{show(meal.name)}</span>
              {weighed && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary" data-testid="meal-weighed-badge">
                  {mealBadge === 'Escaneado' ? <ScanBarcode className="h-3 w-3" /> : mealBadge === 'Estimado' ? <Sparkles className="h-3 w-3" /> : <Scale className="h-3 w-3" />} {mealBadge}
                </span>
              )}
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
                {!weighed && (<>
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
                </>)}
                {weighed && onEditWeigh && (
                  <button
                    type="button"
                    onClick={onEditWeigh}
                    className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar pesagem
                  </button>
                )}
                {onWeigh && (
                  <button
                    type="button"
                    onClick={onWeigh}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    <Scale className="h-3.5 w-3.5" />
                    {weighed ? 'Pesar de novo' : 'Pesar refeição'}
                  </button>
                )}
              </div>

              <div className="mt-3 rounded-xl bg-background/40">
                {foods.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum alimento nesta refeição.
                  </p>
                )}
                {foods.map((food, foodIndex) => {
                  const weigh = foodWeigh(food);
                  const locked = !!weighed;
                  // Refeição já pesada: a balança continua nos alimentos do plano para pesar/atualizar só aquele item.
                  const canWeighFood = !!onWeighFood && !adjustMode && (!locked || (!!weigh && weigh.status !== 'fora_do_plano'));
                  return (
                  <div
                    key={`${meal.name}-${food.food}-${foodIndex}`}
                    className="flex items-start gap-2 border-b border-border/30 px-3 py-2.5 last:border-0"
                  >
                    <div
                      role={adjustMode || locked ? undefined : 'button'}
                      tabIndex={adjustMode || locked ? undefined : 0}
                      onClick={adjustMode || locked ? undefined : () => setSubIndex(foodIndex)}
                      onKeyDown={
                        adjustMode || locked
                          ? undefined
                          : (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSubIndex(foodIndex);
                              }
                            }
                      }
                      aria-label={adjustMode || locked ? undefined : `Substituir ${food.food}`}
                      className={`min-w-0 flex-1 rounded-lg transition-colors ${
                        adjustMode || locked ? '' : 'cursor-pointer active:bg-primary/5'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className={`truncate text-sm font-medium ${weigh?.status === 'nao_comeu' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{show(food.food)}</p>
                        {weigh && <WeighBadge weigh={weigh} />}
                        {weigh?.status === 'fora_do_plano' && weigh.estimado && <EstimatedWeighBadge />}
                        {weigh?.status === 'fora_do_plano' && weigh.escaneado && <ScannedWeighBadge />}
                      </div>
                      {weigh && (weigh.status === 'pesado' || weigh.status === 'fora_do_plano' || weigh.status === 'nao_comeu') && (
                        <p className="mt-0.5 text-[11px] font-semibold text-primary" data-testid="meal-food-weigh-label">{formatDayWeighLabel(weigh)}</p>
                      )}
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
                    {(!locked || canWeighFood) && <div className="flex shrink-0 items-center gap-1">
                      {canWeighFood && (
                        <button
                          type="button"
                          onClick={() => onWeighFood?.(foodIndex)}
                          aria-label={`Pesar ${food.food}`}
                          className="p-1.5 text-primary transition-colors hover:text-primary/80"
                        >
                          <Scale className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!locked && moveTargets.length > 0 && (
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
                      {!locked && (
                      <button
                        type="button"
                        onClick={() => handleRemove(foodIndex)}
                        aria-label={`Remover ${food.food}`}
                        className="p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      )}
                    </div>}
                  </div>
                  );
                })}
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
