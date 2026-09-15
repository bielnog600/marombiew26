/**
 * Fase 4.2 — validação de um plano STRUCTURED usando EXCLUSIVAMENTE foodId.
 *
 * Nunca converte o plano canônico para markdown para validar e nunca resolve
 * alimento por nome: policy `strict_id`, FoodIndex com IDs reais, cálculo em
 * precisão integral pelo nutritionCore e arredondamento só na apresentação.
 *
 * `validateDietMacros(markdown, ...)` continua existindo apenas para o fluxo
 * LEGACY (markdown).
 */
import { buildFoodIndex, computeDayTotals, type FoodIndex, type FoodRecord } from '@/lib/nutritionEngine';
import { OFFICIAL_MACRO_TOLERANCE, OFFICIAL_MACRO_TOLERANCE_LABELS } from '@/lib/macroTolerances';
import type {
  DietMacroTargets,
  DietMacroTotals,
  DietMacroValidationReport,
  MealMacroTotal,
} from '@/lib/dietMacroValidation';
import type { DietDaysMacroValidationReport, DayMacroValidationEntry } from '@/lib/dietDayValidation';
import { WEEKDAY_KEYS, type DayTarget, type WeekdayKey } from '@/lib/dietDayTargets';

interface CanonicalItem {
  foodId?: string | null;
  name?: string | null;
  qtyGrams?: number | null;
}

interface CanonicalMeal {
  name?: string | null;
  items?: CanonicalItem[] | null;
}

interface CanonicalDay {
  weekday?: string | null;
  label?: string | null;
  meals?: CanonicalMeal[] | null;
}

export interface CanonicalPlanLike {
  days?: CanonicalDay[] | null;
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const toEngineMeals = (day: CanonicalDay) =>
  (day?.meals ?? []).map((meal) => ({
    items: (meal?.items ?? []).map((item) => ({
      foodId: item?.foodId ?? null,
      name: String(item?.name ?? ''),
      qtyGrams: Number(item?.qtyGrams) || 0,
    })),
  }));

interface DayComputed {
  totals: DietMacroTotals;
  mealTotals: MealMacroTotal[];
  unresolved: string[];
}

/** Totais de um dia canônico, calculados só por foodId (strict_id). */
const computeCanonicalDay = (day: CanonicalDay, index: FoodIndex): DayComputed => {
  const computed = computeDayTotals(toEngineMeals(day), index, 'draft', 'strict_id');
  const mealTotals: MealMacroTotal[] = computed.meals.map((meal, i) => ({
    meal: String(day?.meals?.[i]?.name ?? `Refeição ${i + 1}`),
    calories: Math.round(meal.totals.kcal),
    protein: Math.round(meal.totals.p),
    carbs: Math.round(meal.totals.c),
    fats: Math.round(meal.totals.g),
  }));
  return {
    totals: {
      calories: Math.round(computed.totals.kcal),
      protein: Math.round(computed.totals.p),
      carbs: Math.round(computed.totals.c),
      fats: Math.round(computed.totals.g),
    },
    mealTotals,
    unresolved: computed.unresolvedNames,
  };
};

const buildIndex = (foods: FoodRecord[]): FoodIndex =>
  buildFoodIndex(
    (foods ?? []).map((f) => ({
      ...f,
      id: String(f.id ?? ''),
      portion_size: f.portion_size ?? 100,
    })),
  );

const reasonsForDiff = (diff: DietMacroTotals, prefix = ''): string[] => {
  const out: string[] = [];
  if (Math.abs(diff.calories) > OFFICIAL_MACRO_TOLERANCE.kcal) out.push(`${prefix}Calorias ${sign(diff.calories)} kcal fora da tolerância.`);
  if (Math.abs(diff.protein) > OFFICIAL_MACRO_TOLERANCE.p) out.push(`${prefix}Proteína ${sign(diff.protein)} g fora da tolerância.`);
  if (Math.abs(diff.carbs) > OFFICIAL_MACRO_TOLERANCE.c) out.push(`${prefix}Carboidrato ${sign(diff.carbs)} g fora da tolerância.`);
  if (Math.abs(diff.fats) > OFFICIAL_MACRO_TOLERANCE.g) out.push(`${prefix}Gordura ${sign(diff.fats)} g fora da tolerância.`);
  return out;
};

/** Validação global (carb cycling OFF) direto sobre o JSON canônico. */
export const validateCanonicalDietTarget = ({
  plan,
  target,
  foods,
}: {
  plan: CanonicalPlanLike | null | undefined;
  target: DietMacroTargets;
  foods: FoodRecord[];
}): DietMacroValidationReport => {
  const index = buildIndex(foods);
  const days = (plan?.days ?? []).filter(Boolean) as CanonicalDay[];
  const computedDays = days.map((d) => computeCanonicalDay(d, index));

  const first = computedDays[0];
  const generated: DietMacroTotals = first?.totals ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const difference: DietMacroTotals = {
    calories: generated.calories - target.calories,
    protein: generated.protein - target.protein,
    carbs: generated.carbs - target.carbs,
    fats: generated.fats - target.fats,
  };

  const reasons: string[] = [];
  if (computedDays.length === 0) reasons.push('Plano estruturado sem dias.');
  computedDays.forEach((d, i) => {
    const label = days[i]?.label ?? days[i]?.weekday ?? `dia ${i + 1}`;
    const diff: DietMacroTotals = {
      calories: d.totals.calories - target.calories,
      protein: d.totals.protein - target.protein,
      carbs: d.totals.carbs - target.carbs,
      fats: d.totals.fats - target.fats,
    };
    reasons.push(...reasonsForDiff(diff, computedDays.length > 1 ? `${label}: ` : ''));
  });

  return {
    target,
    generated,
    difference,
    valid: reasons.length === 0,
    tolerances: OFFICIAL_MACRO_TOLERANCE_LABELS,
    mealTotals: first?.mealTotals ?? [],
    unmatchedFoods: Array.from(new Set(computedDays.flatMap((d) => d.unresolved))),
    reasons,
  };
};

/** Validação por weekday (carb cycling ON) direto sobre o JSON canônico. */
export const validateCanonicalDietDayTargets = ({
  plan,
  dayTargets,
  foods,
}: {
  plan: CanonicalPlanLike | null | undefined;
  dayTargets: Partial<Record<WeekdayKey, DayTarget & { type?: string | null }>>;
  foods: FoodRecord[];
}): DietDaysMacroValidationReport => {
  const index = buildIndex(foods);
  const byWeekday = new Map<WeekdayKey, CanonicalDay>();
  for (const day of plan?.days ?? []) {
    const wd = String(day?.weekday ?? '') as WeekdayKey;
    if (wd && !byWeekday.has(wd)) byWeekday.set(wd, day);
  }

  const out: Partial<Record<WeekdayKey, DayMacroValidationEntry>> = {};
  const missingDays: WeekdayKey[] = [];

  for (const wd of WEEKDAY_KEYS) {
    const target = dayTargets[wd];
    if (!target) continue;
    const day = byWeekday.get(wd);
    if (!day) {
      missingDays.push(wd);
      continue;
    }
    const computed = computeCanonicalDay(day, index);
    const generated: DayTarget = {
      kcal: computed.totals.calories,
      p: computed.totals.protein,
      c: computed.totals.carbs,
      g: computed.totals.fats,
    };
    const difference: DayTarget = {
      kcal: generated.kcal - target.kcal,
      p: generated.p - target.p,
      c: generated.c - target.c,
      g: generated.g - target.g,
    };
    const reasons = reasonsForDiff({
      calories: difference.kcal,
      protein: difference.p,
      carbs: difference.c,
      fats: difference.g,
    });
    out[wd] = {
      weekday: wd,
      type: target.type ?? null,
      target: { kcal: target.kcal, p: target.p, c: target.c, g: target.g },
      generated,
      difference,
      valid: reasons.length === 0,
      reasons,
      unmatchedFoods: computed.unresolved,
    };
  }

  const valid =
    missingDays.length === 0 &&
    Object.keys(out).length > 0 &&
    WEEKDAY_KEYS.every((wd) => !dayTargets[wd] || out[wd]?.valid === true);

  return { valid, days: out, missingDays, tolerances: OFFICIAL_MACRO_TOLERANCE_LABELS };
};
