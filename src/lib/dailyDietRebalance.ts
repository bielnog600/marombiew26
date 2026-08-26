/**
 * Deterministic daily diet rebalancing.
 *
 * When the student edits a meal (add / remove / change quantity / substitute),
 * the prescribed daily target must NOT change. Instead, the difference is
 * redistributed only across the FUTURE meals of the same day.
 *
 * Rules:
 * - COMPLETED meals are frozen (never touched).
 * - The CURRENT meal (the one the student just edited) is frozen exactly as
 *   the student left it.
 * - FUTURE meals absorb the remaining daily macros, proportionally to their
 *   original share, adjusting the foods whose dominant macro matches the gap.
 *
 * 100% deterministic — no AI, no network.
 */
import type { ParsedFood, ParsedMeal } from './dietResultParser';

export interface Macros {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export type MealState = 'completed' | 'current' | 'future';
export type FoodClass = 'protein' | 'carb' | 'fat' | 'mixed' | 'low_calorie';

/** Minimum / maximum scaling allowed per food item during a rebalance. */
const MIN_FACTOR = 0.4;
const MAX_FACTOR = 3;

export const ZERO_MACROS: Macros = { kcal: 0, p: 0, c: 0, g: 0 };

export const parseNumeric = (value?: string | number | null): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const n = Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const foodMacros = (food: ParsedFood): Macros => ({
  kcal: parseNumeric(food.kcal),
  p: parseNumeric(food.p),
  c: parseNumeric(food.c),
  g: parseNumeric(food.g),
});

export const addMacros = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  p: a.p + b.p,
  c: a.c + b.c,
  g: a.g + b.g,
});

export const subMacros = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal - b.kcal,
  p: a.p - b.p,
  c: a.c - b.c,
  g: a.g - b.g,
});

export const mealMacros = (meal: ParsedMeal): Macros =>
  (meal.foods ?? []).reduce<Macros>((acc, f) => addMacros(acc, foodMacros(f)), ZERO_MACROS);

export const sumMealMacros = (meals: ParsedMeal[]): Macros =>
  meals.reduce<Macros>((acc, m) => addMacros(acc, mealMacros(m)), ZERO_MACROS);

/** Derive the functional class of a food from its predominant macro. */
export const classifyFood = (food: ParsedFood): FoodClass => {
  const { p, c, g, kcal } = foodMacros(food);
  const pk = p * 4;
  const ck = c * 4;
  const gk = g * 9;
  const total = pk + ck + gk;
  if (total < 25 && kcal < 40) return 'low_calorie';
  if (total <= 0) return 'low_calorie';
  const shares: Array<[FoodClass, number]> = [
    ['protein', pk / total],
    ['carb', ck / total],
    ['fat', gk / total],
  ];
  shares.sort((a, b) => b[1] - a[1]);
  return shares[0][1] >= 0.5 ? shares[0][0] : 'mixed';
};

/** Macro key a food should be used to compensate (mixed → dominant macro). */
const compensationKey = (food: ParsedFood): 'p' | 'c' | 'g' | null => {
  const cls = classifyFood(food);
  if (cls === 'protein') return 'p';
  if (cls === 'carb') return 'c';
  if (cls === 'fat') return 'g';
  if (cls === 'low_calorie') return null;
  const { p, c, g } = foodMacros(food);
  const ranked: Array<['p' | 'c' | 'g', number]> = [
    ['p', p * 4],
    ['c', c * 4],
    ['g', g * 9],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : null;
};

const roundValue = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

const formatNumber = (n: number) => String(roundValue(n));

/** Scale the numeric part of a quantity string ("150 g" → "180 g"). */
export const scaleQuantity = (qty: string, factor: number): string => {
  if (!qty) return qty;
  const match = qty.match(/^\s*([\d.,]+)\s*(.*)$/);
  if (!match) return qty;
  const n = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return qty;
  const scaled = roundValue(n * factor);
  const numStr = String(scaled).replace('.', ',');
  return match[2] ? `${numStr} ${match[2]}`.trim() : numStr;
};

/** Scale a food item (quantity + kcal + macros) by a factor. */
export const scaleFood = (food: ParsedFood, factor: number): ParsedFood => {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.01) return food;
  const m = foodMacros(food);
  return {
    ...food,
    qty: scaleQuantity(food.qty, factor),
    kcal: formatNumber(m.kcal * factor),
    p: formatNumber(m.p * factor),
    c: formatNumber(m.c * factor),
    g: formatNumber(m.g * factor),
  };
};

const clamp = (n: number) => Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, n));

/**
 * Adjust a meal so its macros approach `target`, scaling each food only on the
 * macro it is a natural source of (protein food → protein gap, etc.).
 */
export const adjustMealToMacros = (meal: ParsedMeal, target: Macros): ParsedMeal => {
  const foods = meal.foods ?? [];
  if (foods.length === 0) return meal;

  const keys: Array<'p' | 'c' | 'g'> = ['p', 'c', 'g'];
  const assignment = foods.map((f) => compensationKey(f));

  const factors = new Array<number>(foods.length).fill(1);

  for (const key of keys) {
    const contributorIdx = foods
      .map((_, i) => i)
      .filter((i) => assignment[i] === key && foodMacros(foods[i])[key] > 0);
    if (contributorIdx.length === 0) continue;
    const contributorSum = contributorIdx.reduce((s, i) => s + foodMacros(foods[i])[key], 0);
    const fixedSum = foods.reduce(
      (s, f, i) => (contributorIdx.includes(i) ? s : s + foodMacros(f)[key]),
      0,
    );
    const desired = target[key] - fixedSum;
    if (contributorSum <= 0) continue;
    const factor = clamp(desired / contributorSum);
    for (const i of contributorIdx) factors[i] = factor;
  }

  const nextFoods = foods.map((f, i) => scaleFood(f, factors[i]));
  const totals = nextFoods.reduce<Macros>((acc, f) => addMacros(acc, foodMacros(f)), ZERO_MACROS);

  return {
    ...meal,
    foods: nextFoods,
    totalKcal: `${Math.round(totals.kcal)} kcal`,
    totalP: formatNumber(totals.p),
    totalC: formatNumber(totals.c),
    totalG: formatNumber(totals.g),
  };
};

export interface RebalanceInput {
  /** All meals of the day, in order. */
  meals: ParsedMeal[];
  /** Indexes of meals already consumed (frozen). */
  completedIndexes: number[];
  /** Index of the meal the student just edited (frozen as-is). -1 when none. */
  currentIndex: number;
  /** Prescribed daily target (immutable). */
  dailyTarget: Macros;
}

export interface RebalanceResult {
  meals: ParsedMeal[];
  /** Macros still available for the future meals before redistribution. */
  remaining: Macros;
  futureIndexes: number[];
  /** Difference between daily target and the resulting day total. */
  residual: Macros;
  applied: boolean;
}

/** Which meals can be auto-adjusted for a given edit. */
export const resolveMealStates = (
  count: number,
  completedIndexes: number[],
  currentIndex: number,
): MealState[] =>
  Array.from({ length: count }, (_, i) => {
    if (completedIndexes.includes(i)) return 'completed';
    if (i === currentIndex) return 'current';
    return i > currentIndex ? 'future' : 'completed';
  });

/**
 * Redistribute the remaining daily macros across the future meals only.
 * Completed meals and the meal being edited are never modified.
 */
export const rebalanceFutureMeals = ({
  meals,
  completedIndexes,
  currentIndex,
  dailyTarget,
}: RebalanceInput): RebalanceResult => {
  const states = resolveMealStates(meals.length, completedIndexes, currentIndex);
  const futureIndexes = states
    .map((s, i) => (s === 'future' ? i : -1))
    .filter((i) => i >= 0);

  if (futureIndexes.length === 0 || dailyTarget.kcal <= 0) {
    return {
      meals,
      remaining: ZERO_MACROS,
      futureIndexes,
      residual: subMacros(dailyTarget, sumMealMacros(meals)),
      applied: false,
    };
  }

  const frozenTotals = meals.reduce<Macros>(
    (acc, m, i) => (futureIndexes.includes(i) ? acc : addMacros(acc, mealMacros(m))),
    ZERO_MACROS,
  );

  const remainingRaw = subMacros(dailyTarget, frozenTotals);
  const remaining: Macros = {
    kcal: Math.max(0, remainingRaw.kcal),
    p: Math.max(0, remainingRaw.p),
    c: Math.max(0, remainingRaw.c),
    g: Math.max(0, remainingRaw.g),
  };

  // Global per-macro compensation across ALL future meals: each food is only
  // used to compensate the macro it is a natural source of, and every source
  // of that macro is scaled by the same factor — which preserves the original
  // proportion between the future meals.
  // Sources overlap between macros (ex: carne carrega gordura e proteína), so
  // the pass is iterated a few times until the factors converge.
  const keys: Array<'p' | 'c' | 'g'> = ['p', 'c', 'g'];
  const factors = new Map<string, number>();
  const entries: Array<{ id: string; food: ParsedFood; key: 'p' | 'c' | 'g' | null }> = [];
  for (const mealIndex of futureIndexes) {
    (meals[mealIndex].foods ?? []).forEach((f, foodIndex) => {
      const id = `${mealIndex}:${foodIndex}`;
      entries.push({ id, food: f, key: compensationKey(f) });
      factors.set(id, 1);
    });
  }

  for (let iteration = 0; iteration < 6; iteration++) {
    for (const key of keys) {
      let contributorSum = 0;
      let fixedSum = 0;
      const contributors: string[] = [];
      for (const entry of entries) {
        const scaled = foodMacros(entry.food)[key] * (factors.get(entry.id) ?? 1);
        if (entry.key === key && foodMacros(entry.food)[key] > 0) {
          contributorSum += scaled;
          contributors.push(entry.id);
        } else {
          fixedSum += scaled;
        }
      }
      if (contributorSum <= 0) continue;
      const step = (remaining[key] - fixedSum) / contributorSum;
      if (!Number.isFinite(step) || step <= 0) continue;
      for (const id of contributors) {
        factors.set(id, clamp((factors.get(id) ?? 1) * step));
      }
    }
  }


  const nextMeals = [...meals];
  for (const mealIndex of futureIndexes) {
    const source = meals[mealIndex];
    const nextFoods = (source.foods ?? []).map((f, foodIndex) =>
      scaleFood(f, factors.get(`${mealIndex}:${foodIndex}`) ?? 1),
    );
    const totals = nextFoods.reduce<Macros>((acc, f) => addMacros(acc, foodMacros(f)), ZERO_MACROS);
    nextMeals[mealIndex] = {
      ...source,
      foods: nextFoods,
      totalKcal: `${Math.round(totals.kcal)} kcal`,
      totalP: formatNumber(totals.p),
      totalC: formatNumber(totals.c),
      totalG: formatNumber(totals.g),
    };
  }


  return {
    meals: nextMeals,
    remaining,
    futureIndexes,
    residual: subMacros(dailyTarget, sumMealMacros(nextMeals)),
    applied: true,
  };
};
