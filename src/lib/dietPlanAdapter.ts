/**
 * Adapter between the canonical DietPlan and the legacy ParsedMeal[] shape.
 *
 * Used to:
 *  - keep the existing UI (DietResultCards / MealCard) working while
 *    components migrate to consume DietPlan natively
 *  - lift legacy markdown-only plans into the canonical structure
 */
import type { ParsedFood, ParsedMeal } from './dietResultParser';
import { parseSections } from './dietResultParser';
import type {
  DietPlan,
  Meal,
  MealItem,
  Macros,
  DietDay,
  DietTargets,
} from './dietSchema';
import { DIET_PLAN_SCHEMA_VERSION } from './dietSchema';

const num = (v?: string | number): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const parseGrams = (qty?: string): number | undefined => {
  if (!qty) return undefined;
  const m = qty.match(/(\d+(?:[.,]\d+)?)\s*g/i);
  if (m) return Number(m[1].replace(',', '.'));
  const first = qty.match(/\d+(?:[.,]\d+)?/);
  return first ? Number(first[0].replace(',', '.')) : undefined;
};

/** ParsedMeal[] -> DietPlan (single "Padrão" day). */
export const parsedMealsToDietPlan = (
  meals: ParsedMeal[],
  targets: DietTargets,
  extra?: Partial<DietPlan['meta']>,
): DietPlan => {
  const planMeals: Meal[] = meals.map((meal, idx) => {
    const items: MealItem[] = meal.foods.map<MealItem>((f) => ({
      name: f.food,
      qtyGrams: parseGrams(f.qty),
      portionLabel: f.qty,
      substitution: f.sub || undefined,
      macros: {
        kcal: num(f.kcal),
        p: num(f.p),
        c: num(f.c),
        g: num(f.g),
      },
    }));
    const totals: Macros = items.reduce<Macros>(
      (acc, it) => ({
        kcal: acc.kcal + it.macros.kcal,
        p: acc.p + it.macros.p,
        c: acc.c + it.macros.c,
        g: acc.g + it.macros.g,
      }),
      { kcal: 0, p: 0, c: 0, g: 0 },
    );
    return {
      id: `m_${idx}_${meal.name.replace(/\s+/g, '_').slice(0, 20)}`,
      name: meal.name,
      time: meal.time,
      order: idx,
      items,
      totals,
    };
  });

  const dayTotals: Macros = planMeals.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + m.totals.kcal,
      p: acc.p + m.totals.p,
      c: acc.c + m.totals.c,
      g: acc.g + m.totals.g,
    }),
    { kcal: 0, p: 0, c: 0, g: 0 },
  );

  const day: DietDay = {
    label: 'Padrão',
    meals: planMeals,
    totals: dayTotals,
  };

  return {
    meta: {
      version: DIET_PLAN_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      ...(extra ?? {}),
    },
    targets,
    days: [day],
  };
};

/** Markdown legado -> DietPlan (best-effort, single day). */
export const markdownToDietPlan = (
  markdown: string,
  targets: DietTargets,
  extra?: Partial<DietPlan['meta']>,
): DietPlan | null => {
  const sections = parseSections(markdown);
  const meals = sections.flatMap((s) => (s.type === 'meal' ? s.meals || [] : []));
  if (meals.length === 0) return null;
  return parsedMealsToDietPlan(meals, targets, extra);
};

/** DietPlan -> ParsedMeal[] (uses first day). Drives the existing UI. */
export const dietPlanToParsedMeals = (plan: DietPlan, dayIndex = 0): ParsedMeal[] => {
  const day = plan.days[dayIndex] ?? plan.days[0];
  if (!day) return [];

  const formatNum = (n: number): string => {
    if (!Number.isFinite(n) || n <= 0) return '';
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
  };

  return day.meals.map<ParsedMeal>((meal) => ({
    name: meal.name,
    time: meal.time,
    foods: meal.items.map<ParsedFood>((it) => ({
      food: it.name,
      qty: it.qtyGrams
        ? `${formatNum(it.qtyGrams)} g`
        : it.portionLabel || '—',
      kcal: formatNum(it.macros.kcal),
      p: formatNum(it.macros.p),
      c: formatNum(it.macros.c),
      g: formatNum(it.macros.g),
      sub: it.substitution,
    })),
    totalKcal: formatNum(meal.totals.kcal) ? `${formatNum(meal.totals.kcal)} kcal` : undefined,
    totalP: formatNum(meal.totals.p),
    totalC: formatNum(meal.totals.c),
    totalG: formatNum(meal.totals.g),
  }));
};