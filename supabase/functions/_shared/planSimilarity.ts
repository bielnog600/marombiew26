/**
 * Deterministic similarity gate between a freshly generated plan and the
 * student's recent history. Returns a 0..1 score (1.0 = identical).
 *
 * Strategy:
 * - Workout: per-day overlap of normalized exercise names (Jaccard),
 *   averaged across matched days, with extra weight when reps/rir also match.
 * - Diet: per-meal overlap of normalized food names (Jaccard), averaged
 *   across matched meal slots.
 * - Final score against history = max over weighted-by-age pairwise scores.
 */

import { HISTORY_DECAY } from "./variationProfiles.ts";

// ─────────────────────────── helpers ───────────────────────────

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeName = (s: unknown): string => {
  if (typeof s !== "string") return "";
  return stripAccents(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
};

// ─────────────────────────── workout ───────────────────────────

export type WorkoutPlanLike = {
  // deno-lint-ignore no-explicit-any
  days?: any[];
};

const exerciseSet = (day: any): Set<string> => {
  const out = new Set<string>();
  for (const e of day?.exercises ?? []) {
    const n = normalizeName(e?.exercise);
    if (n) out.add(n);
  }
  return out;
};

const repSignature = (day: any): Set<string> => {
  const out = new Set<string>();
  for (const e of day?.exercises ?? []) {
    const n = normalizeName(e?.exercise);
    if (!n) continue;
    out.add(`${n}|${normalizeName(e?.reps)}`);
  }
  return out;
};

function workoutPairScore(a: WorkoutPlanLike, b: WorkoutPlanLike): number {
  const da = (a?.days ?? []).filter(Boolean);
  const db = (b?.days ?? []).filter(Boolean);
  if (da.length === 0 || db.length === 0) return 0;

  // For each day in `a`, find best-matching day in `b` by exercise overlap.
  let sum = 0;
  let count = 0;
  for (const dayA of da) {
    const setA = exerciseSet(dayA);
    const repA = repSignature(dayA);
    let best = 0;
    for (const dayB of db) {
      const exJ = jaccard(setA, exerciseSet(dayB));
      const repJ = jaccard(repA, repSignature(dayB));
      // exercises weigh 0.75, full rep match weighs 0.25
      const score = exJ * 0.75 + repJ * 0.25;
      if (score > best) best = score;
    }
    sum += best;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

// ─────────────────────────── diet ───────────────────────────

export type DietPlanLike = {
  // deno-lint-ignore no-explicit-any
  days?: any[];
  // deno-lint-ignore no-explicit-any
  meals?: any[];
};

const mealsOfDietPlan = (plan: DietPlanLike): any[] => {
  // Structured schema is { days: [{ meals: [{ id, items: [...] }] }] }
  const out: any[] = [];
  if (Array.isArray(plan?.days)) {
    for (const d of plan.days) {
      for (const m of d?.meals ?? []) out.push(m);
    }
  }
  if (Array.isArray((plan as any)?.meals)) {
    for (const m of (plan as any).meals) out.push(m);
  }
  return out;
};

const mealKey = (m: any): string => {
  const n = normalizeName(m?.name) || normalizeName(m?.id) || "refeicao";
  return n;
};

const foodSet = (m: any): Set<string> => {
  const out = new Set<string>();
  for (const item of m?.items ?? []) {
    const n = normalizeName(item?.name);
    if (n) out.add(n);
  }
  return out;
};

function dietPairScore(a: DietPlanLike, b: DietPlanLike): number {
  const ma = mealsOfDietPlan(a);
  const mb = mealsOfDietPlan(b);
  if (ma.length === 0 || mb.length === 0) return 0;
  // Group b by meal name
  const bByKey = new Map<string, any[]>();
  for (const m of mb) {
    const k = mealKey(m);
    if (!bByKey.has(k)) bByKey.set(k, []);
    bByKey.get(k)!.push(m);
  }
  let sum = 0;
  let count = 0;
  for (const m of ma) {
    const k = mealKey(m);
    const candidates = bByKey.get(k) ?? mb;
    let best = 0;
    for (const c of candidates) {
      const j = jaccard(foodSet(m), foodSet(c));
      if (j > best) best = j;
    }
    sum += best;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

// ─────────────────────────── public API ───────────────────────────

export type SimilarityResult = {
  score: number;
  perPlan: Array<{ planIndex: number; raw: number; weighted: number }>;
  worstOverlap: string[]; // normalized names that repeat most
};

function aggregateAgainstHistory(
  pair: (h: any) => number,
  history: any[],
  pickItems: (p: any) => string[],
  fresh: any,
): SimilarityResult {
  if (!Array.isArray(history) || history.length === 0) {
    return { score: 0, perPlan: [], worstOverlap: [] };
  }
  const perPlan: SimilarityResult["perPlan"] = [];
  let max = 0;
  for (let i = 0; i < history.length && i < HISTORY_DECAY.length; i++) {
    const raw = pair(history[i]);
    const weighted = raw * HISTORY_DECAY[i];
    perPlan.push({ planIndex: i, raw, weighted });
    if (weighted > max) max = weighted;
  }
  // Worst overlap: items present in fresh AND in the most-recent plan
  const overlap: string[] = [];
  if (history[0]) {
    const freshItems = new Set(pickItems(fresh));
    const histItems = new Set(pickItems(history[0]));
    for (const x of freshItems) if (histItems.has(x)) overlap.push(x);
  }
  return { score: max, perPlan, worstOverlap: overlap.slice(0, 12) };
}

const workoutItems = (p: WorkoutPlanLike): string[] => {
  const out: string[] = [];
  for (const d of p?.days ?? []) {
    for (const e of d?.exercises ?? []) {
      const n = normalizeName(e?.exercise);
      if (n) out.push(n);
    }
  }
  return out;
};

const dietItems = (p: DietPlanLike): string[] => {
  const out: string[] = [];
  for (const m of mealsOfDietPlan(p)) {
    for (const it of m?.items ?? []) {
      const n = normalizeName(it?.name);
      if (n) out.push(n);
    }
  }
  return out;
};

export function computeWorkoutSimilarity(
  fresh: WorkoutPlanLike,
  history: WorkoutPlanLike[],
): SimilarityResult {
  return aggregateAgainstHistory(
    (h) => workoutPairScore(fresh, h),
    history,
    workoutItems,
    fresh,
  );
}

export function computeDietSimilarity(
  fresh: DietPlanLike,
  history: DietPlanLike[],
): SimilarityResult {
  return aggregateAgainstHistory(
    (h) => dietPairScore(fresh, h),
    history,
    dietItems,
    fresh,
  );
}