/**
 * Diet plan validation layer.
 *
 * Pure functions used after generation, edition and substitution. Recompute
 * totals from items (never trusts AI sums), compare against targets and
 * produce structured warnings/errors.
 */
import type {
  DietPlan,
  DietDay,
  Meal,
  MealItem,
  Macros,
  DietTargets,
  ValidationIssue,
  ValidationReport,
} from './dietSchema';

const ZERO: Macros = { kcal: 0, p: 0, c: 0, g: 0 };

const round = (n: number, decimals = 1) => {
  if (!Number.isFinite(n)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
};

const sumMacros = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  p: a.p + b.p,
  c: a.c + b.c,
  g: a.g + b.g,
});

const roundMacros = (m: Macros): Macros => ({
  kcal: round(m.kcal, 0),
  p: round(m.p, 1),
  c: round(m.c, 1),
  g: round(m.g, 1),
});

/** Macros consistency: kcal ≈ p*4 + c*4 + g*9 (±15%). */
const itemMacrosLookConsistent = (item: MealItem): boolean => {
  const calc = item.macros.p * 4 + item.macros.c * 4 + item.macros.g * 9;
  if (item.macros.kcal <= 0 && calc <= 0) return true;
  if (item.macros.kcal <= 0) return false;
  const ratio = calc / item.macros.kcal;
  return ratio > 0.78 && ratio < 1.22;
};

/**
 * Recompute meal and day totals from items, returning a new plan with
 * authoritative totals. Does NOT mutate the input.
 */
export const recomputePlanTotals = (plan: DietPlan): DietPlan => {
  const days: DietDay[] = plan.days.map((day) => {
    const meals: Meal[] = day.meals.map((meal) => {
      const totals = roundMacros(meal.items.reduce<Macros>((acc, it) => sumMacros(acc, it.macros), ZERO));
      return { ...meal, totals };
    });
    const dayTotals = roundMacros(meals.reduce<Macros>((acc, m) => sumMacros(acc, m.totals), ZERO));
    return { ...day, meals, totals: dayTotals };
  });
  return { ...plan, days };
};

const KCAL_WARN_PCT = 0.05;
const KCAL_ERR_PCT = 0.12;
const MACRO_WARN_G = 10;
const MACRO_WARN_PCT = 0.15;
const MACRO_ERR_PCT = 0.30;

const classifyDelta = (delta: number, targetValue: number, warnAbs: number) => {
  const pct = targetValue > 0 ? Math.abs(delta) / targetValue : 0;
  if (pct >= MACRO_ERR_PCT) return 'error' as const;
  if (Math.abs(delta) >= warnAbs || pct >= MACRO_WARN_PCT) return 'warning' as const;
  return null;
};

/**
 * Validate a (recomputed) plan against targets. Returns the issues and
 * computed deltas based on the FIRST day's totals (which is the reference
 * day; for carb_cycle the average of training days is used).
 */
export const validateDietPlan = (
  inputPlan: DietPlan,
  targets?: DietTargets,
): ValidationReport => {
  const plan = recomputePlanTotals(inputPlan);
  const t = targets ?? plan.targets;
  const issues: ValidationIssue[] = [];

  // Reference totals: training days average if carb_cycle, otherwise first day
  const referenceDays =
    plan.meta.strategy === 'carb_cycle'
      ? plan.days.filter((d) => d.trainingDay || d.carbBias === 'high')
      : [plan.days[0]];
  const baseline = (referenceDays.length > 0 ? referenceDays : plan.days);
  const avg: Macros = baseline.reduce<Macros>((acc, d) => sumMacros(acc, d.totals), ZERO);
  const avgKcal = avg.kcal / baseline.length;
  const avgP = avg.p / baseline.length;
  const avgC = avg.c / baseline.length;
  const avgG = avg.g / baseline.length;

  const kcalDelta = round(avgKcal - t.kcal, 0);
  const macroDeltas = {
    p: round(avgP - t.p, 1),
    c: round(avgC - t.c, 1),
    g: round(avgG - t.g, 1),
  };

  // kcal
  if (t.kcal > 0) {
    const pct = Math.abs(kcalDelta) / t.kcal;
    if (pct >= KCAL_ERR_PCT) {
      issues.push({
        code: 'kcal_off',
        severity: 'error',
        message: `Calorias fora da meta: ${kcalDelta > 0 ? '+' : ''}${kcalDelta} kcal (${Math.round(pct * 100)}%)`,
      });
    } else if (pct >= KCAL_WARN_PCT) {
      issues.push({
        code: 'kcal_off',
        severity: 'warning',
        message: `Calorias acima da tolerância: ${kcalDelta > 0 ? '+' : ''}${kcalDelta} kcal (${Math.round(pct * 100)}%)`,
      });
    }
  }

  // macros
  const macroChecks: Array<[keyof typeof macroDeltas, number, string]> = [
    ['p', t.p, 'Proteína'],
    ['c', t.c, 'Carboidrato'],
    ['g', t.g, 'Gordura'],
  ];
  for (const [key, targetValue, label] of macroChecks) {
    const delta = macroDeltas[key];
    const sev = classifyDelta(delta, targetValue, MACRO_WARN_G);
    if (sev) {
      issues.push({
        code: `macro_${key}_off`,
        severity: sev,
        message: `${label} fora da meta: ${delta > 0 ? '+' : ''}${delta} g (meta ${Math.round(targetValue)} g)`,
      });
    }
  }

  // per-item kcal consistency
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const item of meal.items) {
        if (!itemMacrosLookConsistent(item)) {
          issues.push({
            code: 'item_macros_inconsistent',
            severity: 'warning',
            message: `Macros incoerentes em "${item.name}" (${day.label} · ${meal.name})`,
            path: `${day.label}/${meal.name}/${item.name}`,
          });
        }
      }
    }
  }

  // strategy-specific: carb_cycle must vary carbs between days
  if (plan.meta.strategy === 'carb_cycle' && plan.days.length > 1) {
    const carbs = plan.days.map((d) => d.totals.c);
    const min = Math.min(...carbs);
    const max = Math.max(...carbs);
    if (max <= 0 || (max - min) / max < 0.15) {
      issues.push({
        code: 'carb_cycle_flat',
        severity: 'warning',
        message: 'Ciclagem de carboidratos pouco evidente entre os dias (<15% de variação).',
      });
    }
  }

  const status: ValidationReport['status'] = issues.some((i) => i.severity === 'error')
    ? 'invalid'
    : issues.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'ok';

  return {
    status,
    kcalDelta,
    macroDeltas,
    issues,
    recomputedAt: new Date().toISOString(),
  };
};

/** Convenience: recompute + validate + attach validation report. */
export const finalizeDietPlan = (plan: DietPlan, targets?: DietTargets): DietPlan => {
  const recomputed = recomputePlanTotals(plan);
  const validation = validateDietPlan(recomputed, targets);
  return { ...recomputed, validation };
};