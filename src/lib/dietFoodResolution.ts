/**
 * Resolução manual de alimento (sem IA).
 *
 * Toda a matemática usa o motor único (nutritionCore): o item é recalculado
 * pela base, a refeição e o dia são recalculados em precisão integral e o
 * arredondamento acontece apenas na apresentação.
 */
import {
  buildFoodIndex,
  computeDayTotals,
  roundForDisplay,
  type FoodRecord,
} from './nutritionEngine';

export interface DietFoodItemRef {
  dayIdx: number;
  mealIdx: number;
  itemIdx: number;
}

const toEngineItems = (items: any[]) =>
  (items ?? []).map((it) => ({
    foodId: it?.foodId ?? null,
    name: String(it?.name ?? it?.foodName ?? ''),
    qtyGrams: Number(it?.qtyGrams) || 0,
    nutritionSnapshot: it?.nutritionSnapshot,
  }));

/** Recalcula um dia inteiro a partir da base, em precisão integral. */
export const recomputeDayFromFoods = (day: any, foods: FoodRecord[]): any => {
  const index = buildFoodIndex(foods);
  const meals = (day?.meals ?? []).map((m: any) => ({ items: toEngineItems(m?.items) }));
  const computedDay = computeDayTotals(meals, index, 'draft', 'strict_id');

  (day?.meals ?? []).forEach((meal: any, mi: number) => {
    const mealComputation = computedDay.meals[mi];
    (meal?.items ?? []).forEach((item: any, ii: number) => {
      const computed = mealComputation.items[ii];
      item.macros = roundForDisplay(computed.macros);
      item.resolutionStatus = computed.status;
    });
    meal.totals = roundForDisplay(mealComputation.totals);
  });
  day.totals = roundForDisplay(computedDay.totals);
  return day;
};

/**
 * Vincula um item não resolvido a um alimento real da base e recalcula
 * item → refeição → dia pelo motor único.
 */
export const resolveDietFoodItem = (
  plan: any,
  ref: DietFoodItemRef,
  food: FoodRecord,
  foods: FoodRecord[],
): any => {
  const next = JSON.parse(JSON.stringify(plan ?? {}));
  const day = next?.days?.[ref.dayIdx];
  const meal = day?.meals?.[ref.mealIdx];
  const item = meal?.items?.[ref.itemIdx];
  if (!item) return next;

  item.foodId = food.id;
  item.name = food.name;
  item.resolutionStatus = 'resolved_by_id';

  recomputeDayFromFoods(day, foods);

  return next;
};

export const countUnresolvedItems = (plan: any): number =>
  (plan?.days ?? []).reduce(
    (acc: number, day: any) =>
      acc +
      (day?.meals ?? []).reduce(
        (a: number, meal: any) =>
          a + (meal?.items ?? []).filter((i: any) => i?.resolutionStatus === 'unresolved').length,
        0,
      ),
    0,
  );
