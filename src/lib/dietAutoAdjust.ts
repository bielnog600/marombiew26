/**
 * FASE 5 — Optimizer determinístico de porções.
 *
 * Ajusta SOMENTE `MealItem.qtyGrams` de alimentos já existentes, sempre por
 * `foodId` + nutritionCore. Nunca altera foodId, refeição, ordem ou meta, nunca
 * chama IA/rede, nunca usa nome/fuzzy/densidade do markdown e nunca usa
 * 4/4/9 como kcal do alimento (a kcal vem de `foods.calories`).
 *
 * Determinismo absoluto: mesmo input → mesmo output (sem Math.random).
 */
import {
  buildFoodIndex,
  computeDayTotals,
  type FoodIndex,
  type FoodRecord,
} from '@/lib/nutritionEngine';
import { OFFICIAL_MACRO_TOLERANCE } from '@/lib/macroTolerances';
import { recomputeDayFromFoods } from '@/lib/dietFoodResolution';
import type { DayTarget, WeekdayKey } from '@/lib/dietDayTargets';

export type AutoAdjustStatus =
  | 'already_within_target'
  | 'feasible'
  | 'infeasible'
  | 'blocked_unresolved'
  | 'no_adjustable_items'
  | 'invalid_target';

export interface AutoAdjustMacros {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface AutoAdjustChange {
  dayIndex: number;
  mealIndex: number;
  itemIndex: number;
  weekday?: WeekdayKey | string;
  mealName: string;
  foodId: string;
  foodName: string;
  beforeGrams: number;
  afterGrams: number;
  deltaGrams: number;
  beforeMacros: AutoAdjustMacros;
  afterMacros: AutoAdjustMacros;
  manualLocked: boolean;
}

export interface AutoAdjustResult<TPlan = any> {
  status: AutoAdjustStatus;
  originalPlan: TPlan;
  /**
   * Plano aplicável — preenchido SOMENTE quando a solução fecha dentro das
   * tolerâncias. Nunca contém a "melhor tentativa".
   */
  adjustedPlan?: TPlan;
  /** Alias explícito de `adjustedPlan` (Fase 5.1: API sem ambiguidade). */
  feasibleAdjustedPlan?: TPlan;
  /** Melhor aproximação quando o dia é inviável — não é uma solução válida. */
  bestAttemptPlan?: TPlan;
  target: DayTarget;
  before: AutoAdjustMacros;
  after?: AutoAdjustMacros;
  beforeDiff: DayTarget;
  afterDiff?: DayTarget;
  changes: AutoAdjustChange[];
  changedItems: number;
  withinTolerance: boolean;
  reason?: string;
}

export interface PortionAdjustmentRule {
  minGrams: number;
  maxGrams: number;
  stepGrams: number;
}

export interface AutoAdjustOptions {
  /** Máximo de candidatos ranqueados considerados. */
  maxCandidates?: number;
  /** Máximo de itens alterados simultaneamente. */
  maxChangedItems?: number;
  /** Iterações do refinamento local. */
  maxIterations?: number;
}

const DEFAULTS: Required<AutoAdjustOptions> = {
  maxCandidates: 10,
  maxChangedItems: 6,
  maxIterations: 200,
};

const TOL = OFFICIAL_MACRO_TOLERANCE;

export const AUTO_ADJUST_MESSAGES = {
  blocked_unresolved: 'Resolva todos os alimentos antes de ajustar automaticamente as porções.',
  no_adjustable_items: 'Todos os alimentos estão bloqueados para ajuste.',
  infeasible: 'Não foi possível fechar os macros apenas ajustando quantidades.',
  already_within_target: 'A dieta já está dentro das tolerâncias definidas.',
  invalid_target: 'Meta indisponível para o ajuste automático.',
} as const;

/* -------------------------------------------------------------------------- */
/* Regras de quantidade                                                       */
/* -------------------------------------------------------------------------- */

export const stepForQuantity = (current: number): number => {
  if (current <= 20) return 1;
  if (current <= 100) return 5;
  return 10;
};

/** Bounds derivados apenas da quantidade atual — nunca por nome/categoria. */
export const buildPortionRule = (current: number): PortionAdjustmentRule => {
  const stepGrams = stepForQuantity(current);
  const rawMin = Math.max(stepGrams, current * 0.5);
  const rawMax = current * 1.6;
  const minGrams = Math.max(stepGrams, Math.ceil(rawMin / stepGrams) * stepGrams);
  const maxGrams = Math.max(minGrams, Math.round(rawMax / stepGrams) * stepGrams);
  return { minGrams, maxGrams, stepGrams };
};

/* -------------------------------------------------------------------------- */
/* Helpers internos                                                           */
/* -------------------------------------------------------------------------- */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const portionOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 100;
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const zero: AutoAdjustMacros = { kcal: 0, p: 0, c: 0, g: 0 };

const macroDiff = (current: AutoAdjustMacros, target: DayTarget): DayTarget => ({
  kcal: current.kcal - target.kcal,
  p: current.p - target.p,
  c: current.c - target.c,
  g: current.g - target.g,
});

/** Erro normalizado pelas tolerâncias oficiais (comparar kcal com gramas). */
export const normalizedError = (diff: DayTarget): number[] => [
  diff.kcal / TOL.kcal,
  diff.p / TOL.p,
  diff.c / TOL.c,
  diff.g / TOL.g,
];

export const isWithinTolerance = (diff: DayTarget): boolean =>
  Math.abs(diff.kcal) <= TOL.kcal &&
  Math.abs(diff.p) <= TOL.p &&
  Math.abs(diff.c) <= TOL.c &&
  Math.abs(diff.g) <= TOL.g;

export interface AdjustmentScore {
  feasible: boolean;
  changedItemCount: number;
  maxNormalizedResidual: number;
  sumNormalizedResidual: number;
  totalRelativeChange: number;
  totalAbsoluteGramChange: number;
}

/** Score puro e testável (item 58 da spec). */
export const scoreAdjustmentCandidate = (input: {
  diff: DayTarget;
  changedItemCount: number;
  totalRelativeChange: number;
  totalAbsoluteGramChange: number;
}): AdjustmentScore => {
  const errs = normalizedError(input.diff).map(Math.abs);
  return {
    feasible: isWithinTolerance(input.diff),
    changedItemCount: input.changedItemCount,
    maxNormalizedResidual: Math.max(...errs),
    sumNormalizedResidual: errs.reduce((a, b) => a + b, 0),
    totalRelativeChange: input.totalRelativeChange,
    totalAbsoluteGramChange: input.totalAbsoluteGramChange,
  };
};

const EPS = 1e-9;

/** Comparação lexicográfica: negativo = `a` melhor. */
export const compareScores = (a: AdjustmentScore, b: AdjustmentScore): number => {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  if (a.feasible && b.feasible) {
    if (a.changedItemCount !== b.changedItemCount) return a.changedItemCount - b.changedItemCount;
  }
  const keys: Array<keyof AdjustmentScore> = [
    'maxNormalizedResidual',
    'sumNormalizedResidual',
    'totalRelativeChange',
    'totalAbsoluteGramChange',
  ];
  for (const k of keys) {
    const d = (a[k] as number) - (b[k] as number);
    if (Math.abs(d) > EPS) return d;
  }
  if (!a.feasible && a.changedItemCount !== b.changedItemCount) {
    return a.changedItemCount - b.changedItemCount;
  }
  return 0;
};

/* -------------------------------------------------------------------------- */
/* Candidatos                                                                 */
/* -------------------------------------------------------------------------- */

interface Candidate {
  mealIndex: number;
  itemIndex: number;
  mealName: string;
  foodId: string;
  foodName: string;
  /** Macros por grama (kcal SEMPRE de foods.calories). */
  perGram: AutoAdjustMacros;
  current: number;
  rule: PortionAdjustmentRule;
}

const perGramVector = (food: FoodRecord): AutoAdjustMacros => {
  const base = portionOf(food.portion_size);
  return {
    kcal: num(food.calories) / base,
    p: num(food.protein) / base,
    c: num(food.carbs) / base,
    g: num(food.fats) / base,
  };
};

const hasNutritionalImpact = (v: AutoAdjustMacros): boolean =>
  Math.abs(v.kcal) > 1e-6 || Math.abs(v.p) > 1e-6 || Math.abs(v.c) > 1e-6 || Math.abs(v.g) > 1e-6;

/** Grade válida de quantidades: current + k*step, dentro dos bounds. */
const quantize = (value: number, c: Candidate): number => {
  const { stepGrams, minGrams, maxGrams } = c.rule;
  const k = Math.round((value - c.current) / stepGrams);
  let out = c.current + k * stepGrams;
  if (out < minGrams) out = c.current + Math.ceil((minGrams - c.current) / stepGrams) * stepGrams;
  if (out > maxGrams) out = c.current + Math.floor((maxGrams - c.current) / stepGrams) * stepGrams;
  return Math.max(c.rule.minGrams, Math.min(c.rule.maxGrams, out));
};

/* -------------------------------------------------------------------------- */
/* Solver contínuo (mínimos quadrados regularizado, sem dependência externa)   */
/* -------------------------------------------------------------------------- */

const solveLinearSystem = (A: number[][], b: number[]): number[] | null => {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = M[pivot];
      M[pivot] = M[col];
      M[col] = tmp;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let cc = col; cc <= n; cc++) M[r][cc] -= f * M[col][cc];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
};

/** Resolve deltas contínuos que aproximam A·delta ≈ residual (ponderado). */
const solveContinuousDeltas = (
  subset: Candidate[],
  residual: DayTarget,
  lambda = 0.01,
): number[] => {
  const w = [1 / TOL.kcal, 1 / TOL.p, 1 / TOL.c, 1 / TOL.g];
  const rows: number[][] = subset.map((c) => [c.perGram.kcal, c.perGram.p, c.perGram.c, c.perGram.g]);
  const r = [residual.kcal, residual.p, residual.c, residual.g];
  const n = subset.length;
  const AtA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Atb: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let m = 0; m < 4; m++) s += rows[i][m] * rows[j][m] * w[m] * w[m];
      AtA[i][j] = s + (i === j ? lambda : 0);
    }
    let s = 0;
    for (let m = 0; m < 4; m++) s += rows[i][m] * r[m] * w[m] * w[m];
    Atb[i] = s;
  }
  const sol = solveLinearSystem(AtA, Atb);
  return sol ?? new Array(n).fill(0);
};

/* -------------------------------------------------------------------------- */
/* Avaliação                                                                  */
/* -------------------------------------------------------------------------- */

const combinations = (n: number, k: number): number[][] => {
  const out: number[][] = [];
  const cur: number[] = [];
  const walk = (start: number) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      walk(i + 1);
      cur.pop();
    }
  };
  walk(0);
  return out;
};

/* -------------------------------------------------------------------------- */
/* Otimização de UM dia                                                       */
/* -------------------------------------------------------------------------- */

/** kcal > 0; P/C/G podem ser zero (meta válida) mas nunca negativos. */
export const isValidTarget = (t: DayTarget | null | undefined): t is DayTarget =>
  !!t &&
  Number.isFinite(t.kcal) &&
  Number.isFinite(t.p) &&
  Number.isFinite(t.c) &&
  Number.isFinite(t.g) &&
  t.kcal > 0 &&
  t.p >= 0 &&
  t.c >= 0 &&
  t.g >= 0;

export interface OptimizeDayInput<TPlan = any> {
  plan: TPlan;
  dayIndex: number;
  target: DayTarget;
  foods: FoodRecord[];
  options?: AutoAdjustOptions;
}

const engineMealsOf = (day: any) =>
  (day?.meals ?? []).map((m: any) => ({
    items: (m?.items ?? []).map((it: any) => ({
      foodId: it?.foodId ?? null,
      name: String(it?.name ?? ''),
      qtyGrams: num(it?.qtyGrams),
    })),
  }));

const dayTotals = (day: any, index: FoodIndex): AutoAdjustMacros => {
  const computed = computeDayTotals(engineMealsOf(day), index, 'draft', 'strict_id');
  return { ...computed.totals };
};

export function optimizeDietDay<TPlan = any>({
  plan,
  dayIndex,
  target,
  foods,
  options,
}: OptimizeDayInput<TPlan>): AutoAdjustResult<TPlan> {
  const opts = { ...DEFAULTS, ...(options ?? {}) };
  const index = buildFoodIndex(
    (foods ?? []).map((f) => ({ ...f, id: String(f.id ?? ''), portion_size: f.portion_size ?? 100 })),
  );
  const day = (plan as any)?.days?.[dayIndex];

  const base = (): AutoAdjustResult<TPlan> => ({
    status: 'invalid_target',
    originalPlan: plan,
    target: target ?? { kcal: 0, p: 0, c: 0, g: 0 },
    before: zero,
    beforeDiff: { kcal: 0, p: 0, c: 0, g: 0 },
    changes: [],
    changedItems: 0,
    withinTolerance: false,
  });

  if (!day) return { ...base(), reason: 'Dia inexistente no plano.' };
  if (!isValidTarget(target)) return { ...base(), reason: AUTO_ADJUST_MESSAGES.invalid_target };

  const before = dayTotals(day, index);
  const beforeDiff = macroDiff(before, target);

  // 1. unresolved bloqueia o optimizer (macro zero não é valor real).
  const computed = computeDayTotals(engineMealsOf(day), index, 'draft', 'strict_id');
  const hasUnresolved = computed.meals.some((m) => m.items.some((i) => i.status === 'unresolved'));
  if (hasUnresolved) {
    return {
      status: 'blocked_unresolved',
      originalPlan: plan,
      target,
      before,
      beforeDiff,
      changes: [],
      changedItems: 0,
      withinTolerance: false,
      reason: AUTO_ADJUST_MESSAGES.blocked_unresolved,
    };
  }

  if (isWithinTolerance(beforeDiff)) {
    return {
      status: 'already_within_target',
      originalPlan: plan,
      target,
      before,
      after: before,
      beforeDiff,
      afterDiff: beforeDiff,
      changes: [],
      changedItems: 0,
      withinTolerance: true,
      reason: AUTO_ADJUST_MESSAGES.already_within_target,
    };
  }

  // 2. candidatos ajustáveis (manualLocked fora; vetor ~zero fora).
  const candidates: Candidate[] = [];
  (day.meals ?? []).forEach((meal: any, mealIndex: number) => {
    (meal?.items ?? []).forEach((item: any, itemIndex: number) => {
      if (item?.manualLocked === true) return;
      const foodId = item?.foodId ? String(item.foodId) : '';
      const food = foodId ? index.byId.get(foodId) : undefined;
      if (!food) return;
      const current = num(item?.qtyGrams);
      if (current <= 0) return;
      const perGram = perGramVector(food);
      if (!hasNutritionalImpact(perGram)) return;
      candidates.push({
        mealIndex,
        itemIndex,
        mealName: String(meal?.name ?? `Refeição ${mealIndex + 1}`),
        foodId,
        foodName: String(food.name ?? item?.name ?? ''),
        perGram,
        current,
        rule: buildPortionRule(current),
      });
    });
  });

  if (candidates.length === 0) {
    return {
      status: 'no_adjustable_items',
      originalPlan: plan,
      target,
      before,
      beforeDiff,
      changes: [],
      changedItems: 0,
      withinTolerance: false,
      reason: AUTO_ADJUST_MESSAGES.no_adjustable_items,
    };
  }

  // 3. ranking por redução potencial do erro normalizado (sem heurística textual).
  const errNorm = (diff: DayTarget) =>
    normalizedError(diff).reduce((a, b) => a + b * b, 0);
  const currentErr = errNorm(beforeDiff);
  const potential = (c: Candidate): number => {
    let best = 0;
    for (const dir of [1, -1]) {
      const next = quantize(c.current + dir * c.rule.stepGrams, c);
      const d = next - c.current;
      if (d === 0) continue;
      const diff: DayTarget = {
        kcal: beforeDiff.kcal + c.perGram.kcal * d,
        p: beforeDiff.p + c.perGram.p * d,
        c: beforeDiff.c + c.perGram.c * d,
        g: beforeDiff.g + c.perGram.g * d,
      };
      best = Math.max(best, currentErr - errNorm(diff));
    }
    return best;
  };
  const ranked = candidates
    .map((c, i) => ({ c, i, score: potential(c) }))
    .sort((a, b) =>
      Math.abs(b.score - a.score) > EPS
        ? b.score - a.score
        : a.c.mealIndex - b.c.mealIndex || a.c.itemIndex - b.c.itemIndex,
    )
    .slice(0, opts.maxCandidates)
    .map((r) => r.c);

  // Totais da parte fixa do dia (todos os itens) menos os candidatos.
  const fixed: AutoAdjustMacros = { ...before };
  for (const c of ranked) {
    fixed.kcal -= c.perGram.kcal * c.current;
    fixed.p -= c.perGram.p * c.current;
    fixed.c -= c.perGram.c * c.current;
    fixed.g -= c.perGram.g * c.current;
  }

  const totalsFor = (grams: number[]): AutoAdjustMacros => {
    const out = { ...fixed };
    ranked.forEach((c, i) => {
      out.kcal += c.perGram.kcal * grams[i];
      out.p += c.perGram.p * grams[i];
      out.c += c.perGram.c * grams[i];
      out.g += c.perGram.g * grams[i];
    });
    return out;
  };

  const evaluate = (grams: number[]): AdjustmentScore => {
    const diff = macroDiff(totalsFor(grams), target);
    let changed = 0;
    let rel = 0;
    let abs = 0;
    ranked.forEach((c, i) => {
      const d = grams[i] - c.current;
      if (Math.abs(d) < EPS) return;
      changed += 1;
      rel += Math.abs(d) / c.current;
      abs += Math.abs(d);
    });
    return scoreAdjustmentCandidate({
      diff,
      changedItemCount: changed,
      totalRelativeChange: rel,
      totalAbsoluteGramChange: abs,
    });
  };

  const currentGrams = ranked.map((c) => c.current);

  const refine = (startGrams: number[], subsetIdx: number[]): number[] => {
    const grams = [...startGrams];
    let best = evaluate(grams);
    for (let iter = 0; iter < opts.maxIterations; iter++) {
      let improved = false;
      for (const i of subsetIdx) {
        const c = ranked[i];
        for (const mult of [1, -1, 2, -2]) {
          const next = quantize(grams[i] + mult * c.rule.stepGrams, c);
          if (next === grams[i]) continue;
          const trial = [...grams];
          trial[i] = next;
          const score = evaluate(trial);
          if (compareScores(score, best) < 0) {
            grams[i] = next;
            best = score;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    return grams;
  };

  let bestGrams: number[] | null = null;
  let bestScore: AdjustmentScore | null = null;

  const consider = (grams: number[]) => {
    const score = evaluate(grams);
    if (!bestScore || compareScores(score, bestScore) < 0) {
      bestScore = score;
      bestGrams = grams;
    }
  };

  const maxK = Math.min(opts.maxChangedItems, ranked.length);
  for (let k = 1; k <= maxK; k++) {
    for (const subsetIdx of combinations(ranked.length, k)) {
      const subset = subsetIdx.map((i) => ranked[i]);
      const residual: DayTarget = {
        kcal: -beforeDiff.kcal,
        p: -beforeDiff.p,
        c: -beforeDiff.c,
        g: -beforeDiff.g,
      };
      // solução contínua com fixação iterativa nos bounds
      const deltas = new Array(subset.length).fill(0);
      const freeIdx = subset.map((_, i) => i);
      let res = { ...residual };
      for (let pass = 0; pass < 4 && freeIdx.length > 0; pass++) {
        const sol = solveContinuousDeltas(freeIdx.map((i) => subset[i]), res);
        let clampedAny = false;
        for (let j = freeIdx.length - 1; j >= 0; j--) {
          const i = freeIdx[j];
          const c = subset[i];
          const raw = c.current + (sol[j] ?? 0);
          const clamped = Math.max(c.rule.minGrams, Math.min(c.rule.maxGrams, raw));
          if (Math.abs(clamped - raw) > EPS) {
            deltas[i] = clamped - c.current;
            res = {
              kcal: res.kcal - c.perGram.kcal * deltas[i],
              p: res.p - c.perGram.p * deltas[i],
              c: res.c - c.perGram.c * deltas[i],
              g: res.g - c.perGram.g * deltas[i],
            };
            freeIdx.splice(j, 1);
            clampedAny = true;
          } else {
            deltas[i] = sol[j] ?? 0;
          }
        }
        if (!clampedAny) break;
      }
      const grams = [...currentGrams];
      subsetIdx.forEach((globalIdx, localIdx) => {
        grams[globalIdx] = quantize(subset[localIdx].current + deltas[localIdx], subset[localIdx]);
      });
      consider(refine(grams, subsetIdx));
    }
    if (bestScore && (bestScore as AdjustmentScore).feasible) break;
  }

  const finalGrams = bestGrams ?? currentGrams;

  // 4. aplicar ao plano e recalcular SEMPRE pelo nutritionCore.
  const nextPlan = clone(plan) as any;
  const nextDay = nextPlan.days[dayIndex];
  const changes: AutoAdjustChange[] = [];
  ranked.forEach((c, i) => {
    const grams = finalGrams[i];
    if (Math.abs(grams - c.current) < c.rule.stepGrams - EPS) return;
    const item = nextDay.meals[c.mealIndex].items[c.itemIndex];
    const beforeMacros: AutoAdjustMacros = {
      kcal: c.perGram.kcal * c.current,
      p: c.perGram.p * c.current,
      c: c.perGram.c * c.current,
      g: c.perGram.g * c.current,
    };
    item.qtyGrams = grams;
    changes.push({
      dayIndex,
      mealIndex: c.mealIndex,
      itemIndex: c.itemIndex,
      weekday: nextDay?.weekday,
      mealName: c.mealName,
      foodId: c.foodId,
      foodName: c.foodName,
      beforeGrams: c.current,
      afterGrams: grams,
      deltaGrams: grams - c.current,
      beforeMacros,
      afterMacros: {
        kcal: c.perGram.kcal * grams,
        p: c.perGram.p * grams,
        c: c.perGram.c * grams,
        g: c.perGram.g * grams,
      },
      manualLocked: false,
    });
  });
  changes.sort(
    (a, b) => a.mealIndex - b.mealIndex || a.itemIndex - b.itemIndex,
  );

  recomputeDayFromFoods(nextDay, foods);
  const after = dayTotals(nextDay, index);
  const afterDiff = macroDiff(after, target);
  const withinTolerance = isWithinTolerance(afterDiff);

  return {
    status: withinTolerance ? 'feasible' : 'infeasible',
    originalPlan: plan,
    // Fase 5.1: só uma solução viável vira plano aplicável.
    adjustedPlan: withinTolerance ? (nextPlan as TPlan) : undefined,
    feasibleAdjustedPlan: withinTolerance ? (nextPlan as TPlan) : undefined,
    bestAttemptPlan: withinTolerance ? undefined : (nextPlan as TPlan),
    target,
    before,
    after,
    beforeDiff,
    afterDiff,
    changes,
    changedItems: changes.length,
    withinTolerance,
    reason: withinTolerance ? undefined : AUTO_ADJUST_MESSAGES.infeasible,
  };
}

/* -------------------------------------------------------------------------- */
/* Otimização do plano completo (coordenação por dia)                         */
/* -------------------------------------------------------------------------- */

export interface OptimizeDietPlanInput<TPlan = any> {
  plan: TPlan;
  /** Target FINAL por índice de dia (já resolvido pelas Fases 2–3). */
  targetsByDay: Array<DayTarget | null | undefined>;
  foods: FoodRecord[];
  options?: AutoAdjustOptions;
}

export interface OptimizeDietPlanResult<TPlan = any> {
  status: AutoAdjustStatus;
  originalPlan: TPlan;
  /** Plano aplicável — só quando TODOS os dias fecharam dentro da tolerância. */
  adjustedPlan?: TPlan;
  feasibleAdjustedPlan?: TPlan;
  /** Melhor aproximação acumulada (nunca apresentada como válida). */
  bestAttemptPlan: TPlan;
  days: AutoAdjustResult<TPlan>[];
  changes: AutoAdjustChange[];
  changedItems: number;
  withinTolerance: boolean;
  reason?: string;
}

const STATUS_PRIORITY: AutoAdjustStatus[] = [
  'blocked_unresolved',
  'invalid_target',
  'infeasible',
  'no_adjustable_items',
  'feasible',
  'already_within_target',
];

export function optimizeDietPlan<TPlan = any>({
  plan,
  targetsByDay,
  foods,
  options,
}: OptimizeDietPlanInput<TPlan>): OptimizeDietPlanResult<TPlan> {
  let working = clone(plan) as any;
  const days: AutoAdjustResult<TPlan>[] = [];
  const changes: AutoAdjustChange[] = [];

  const total = (working?.days ?? []).length;
  for (let dayIndex = 0; dayIndex < total; dayIndex++) {
    const target = targetsByDay[dayIndex];
    // Fase 5.1: dia materializado sem meta NUNCA é ignorado em silêncio.
    if (!isValidTarget(target)) {
      days.push({
        status: 'invalid_target',
        originalPlan: plan,
        target: (target as DayTarget) ?? { kcal: 0, p: 0, c: 0, g: 0 },
        before: zero,
        beforeDiff: { kcal: 0, p: 0, c: 0, g: 0 },
        changes: [],
        changedItems: 0,
        withinTolerance: false,
        reason: AUTO_ADJUST_MESSAGES.invalid_target,
      });
      continue;
    }
    const res = optimizeDietDay<TPlan>({ plan: working, dayIndex, target, foods, options });
    days.push(res);
    const next = res.adjustedPlan ?? res.bestAttemptPlan;
    if (next) working = next as any;
    changes.push(...res.changes);
  }

  const statuses = days.map((d) => d.status);
  const status =
    STATUS_PRIORITY.find((s) => statuses.includes(s)) ?? 'already_within_target';
  const withinTolerance = days.length > 0 && days.every((d) => d.withinTolerance);

  return {
    status,
    originalPlan: plan,
    adjustedPlan: withinTolerance ? (working as TPlan) : undefined,
    feasibleAdjustedPlan: withinTolerance ? (working as TPlan) : undefined,
    bestAttemptPlan: working as TPlan,
    days,
    changes,
    changedItems: changes.length,
    withinTolerance,
    reason: days.find((d) => d.status === status)?.reason,
  };
}
