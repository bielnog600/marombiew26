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

// ─────────── functional food group classification ───────────

const PROTEIN_GROUPS: Record<string, string[]> = {
  protein_red: ["carne vermelha", "bovino", "patinho", "alcatra", "picanha", "coxao", "maminha", "file mignon", "acem", "musculo bovino", "cordeiro", "suino", "porco", "lombo suino", "pernil", "bacon", "linguica", "carne moida"],
  protein_white: ["frango", "peito de frango", "sobrecoxa", "coxa de frango", "peru", "chester", "ave"],
  protein_fish: ["peixe", "tilapia", "salmao", "atum", "sardinha", "merluza", "pescada", "bacalhau", "camarao", "polvo", "lula", "frutos do mar"],
  protein_egg: ["ovo", "clara", "gema", "omelete"],
  protein_organ: ["figado", "moela", "coracao bovino", "coracao de frango", "rim", "lingua", "viscera"],
  protein_dairy: ["whey", "caseina", "iogurte", "queijo", "cottage", "ricota", "leite", "proteina isolada", "albumina"],
  protein_plant: ["tofu", "tempeh", "seitan", "proteina texturizada", "pts", "soja", "ervilha proteica"],
};

const CARB_GROUPS: Record<string, string[]> = {
  carb_grain: ["arroz", "aveia", "pao", "macarrao", "massa", "cuscuz", "tapioca", "quinoa", "granola", "milho", "cevada", "trigo", "panqueca", "wrap", "biscoito"],
  carb_tuber: ["batata", "batata doce", "mandioca", "aipim", "inhame", "cara", "mandioquinha"],
  carb_fruit: ["banana", "maca", "mamao", "manga", "abacaxi", "morango", "uva", "pera", "laranja", "kiwi", "melancia", "melao", "fruta"],
  carb_legume: ["feijao", "lentilha", "grao de bico"],
};

function classifyByGroup(
  name: string,
  groups: Record<string, string[]>,
): string | null {
  if (!name) return null;
  let best: { group: string; len: number } | null = null;
  for (const [group, terms] of Object.entries(groups)) {
    for (const t of terms) {
      if (name.includes(t) && (!best || t.length > best.len)) {
        best = { group, len: t.length };
      }
    }
  }
  return best?.group ?? null;
}

const classifyProtein = (name: string) => classifyByGroup(name, PROTEIN_GROUPS);
const classifyCarb = (name: string) => classifyByGroup(name, CARB_GROUPS);

// ─────────── nutritional completeness validation ───────────

const MAIN_MEAL_PATTERNS = ["almoco", "jantar"];

const isMainMeal = (m: any): boolean => {
  const n = normalizeName(m?.name) || normalizeName(m?.id);
  return MAIN_MEAL_PATTERNS.some((p) => n.includes(p));
};

const mealProteinGrams = (m: any): number => {
  let total = 0;
  for (const it of m?.items ?? []) {
    const p = Number(it?.macros?.p);
    if (Number.isFinite(p)) total += p;
  }
  return total;
};

const mealTotalKcal = (m: any): number => {
  let total = 0;
  for (const it of m?.items ?? []) {
    const k = Number(it?.macros?.kcal);
    if (Number.isFinite(k)) total += k;
  }
  return total;
};

export type DietNutritionIssue = {
  meal: string;
  reason:
    | "missing_primary_protein"
    | "protein_below_floor"
    | "low_protein_share";
  proteinG: number;
};

export type DietNutritionValidation = {
  ok: boolean;
  issues: DietNutritionIssue[];
  /** Daily totals (informational). */
  totalProteinG: number;
  totalKcal: number;
};

/**
 * Hard guardrail: every main meal (lunch/dinner) must include a primary
 * protein source AND deliver at least `mainMealProteinFloor` g of protein.
 * Snack/secondary meals are not required to hit the floor, but a meal that
 * has fewer than ~15% of its kcal from protein is flagged.
 */
export function validateDietNutrition(
  plan: DietPlanLike,
  opts: { mainMealProteinFloor?: number } = {},
): DietNutritionValidation {
  const floor = opts.mainMealProteinFloor ?? 30;
  const meals = mealsOfDietPlan(plan);
  const issues: DietNutritionIssue[] = [];
  let totalProteinG = 0;
  let totalKcal = 0;
  for (const m of meals) {
    const p = mealProteinGrams(m);
    const k = mealTotalKcal(m);
    totalProteinG += p;
    totalKcal += k;
    const label = m?.name || mealKey(m);
    if (isMainMeal(m)) {
      if (!primaryProteinGroup(m)) {
        issues.push({ meal: label, reason: "missing_primary_protein", proteinG: p });
      } else if (p < floor) {
        issues.push({ meal: label, reason: "protein_below_floor", proteinG: p });
      }
    } else if (k >= 200) {
      // For larger non-main meals, flag if protein share is very low.
      const share = k > 0 ? (p * 4) / k : 0;
      if (share < 0.12) {
        issues.push({ meal: label, reason: "low_protein_share", proteinG: p });
      }
    }
  }
  return { ok: issues.length === 0, issues, totalProteinG, totalKcal };
}

/** Pick the primary protein source of a meal (max protein grams; must classify). */
function primaryProteinGroup(m: any): string | null {
  let best: { group: string; p: number } | null = null;
  for (const item of m?.items ?? []) {
    const n = normalizeName(item?.name);
    const g = classifyProtein(n);
    if (!g) continue;
    const p = Number(item?.macros?.p);
    const pv = Number.isFinite(p) ? p : 0;
    if (!best || pv > best.p) best = { group: g, p: pv };
  }
  return best?.group ?? null;
}

/** Pick the primary carb source of a meal (max carb grams; must classify). */
function primaryCarbGroup(m: any): string | null {
  let best: { group: string; c: number } | null = null;
  for (const item of m?.items ?? []) {
    const n = normalizeName(item?.name);
    const g = classifyCarb(n);
    if (!g) continue;
    const c = Number(item?.macros?.c);
    const cv = Number.isFinite(c) ? c : 0;
    if (!best || cv > best.c) best = { group: g, c: cv };
  }
  return best?.group ?? null;
}

export type PrimarySourceBreakdown = {
  /** Ratio (0..1) of meals where the primary protein group repeats vs previous plan. */
  proteinRepeatRatio: number;
  /** Ratio (0..1) of meals where the primary carb group repeats vs previous plan. */
  carbRepeatRatio: number;
  /** Meal labels where protein group repeated. */
  proteinRepeats: string[];
  /** Meal labels where carb group repeated. */
  carbRepeats: string[];
};

function primarySourceRepeats(
  fresh: DietPlanLike,
  prev: DietPlanLike,
): PrimarySourceBreakdown {
  const ma = mealsOfDietPlan(fresh);
  const mb = mealsOfDietPlan(prev);
  if (ma.length === 0 || mb.length === 0) {
    return { proteinRepeatRatio: 0, carbRepeatRatio: 0, proteinRepeats: [], carbRepeats: [] };
  }
  const prevByKey = new Map<string, any[]>();
  for (const m of mb) {
    const k = mealKey(m);
    if (!prevByKey.has(k)) prevByKey.set(k, []);
    prevByKey.get(k)!.push(m);
  }
  let pTotal = 0, pRepeat = 0, cTotal = 0, cRepeat = 0;
  const proteinRepeats: string[] = [];
  const carbRepeats: string[] = [];
  for (const m of ma) {
    const k = mealKey(m);
    const candidates = prevByKey.get(k) ?? [];
    if (candidates.length === 0) continue;
    const freshP = primaryProteinGroup(m);
    const freshC = primaryCarbGroup(m);
    const prevPs = new Set(candidates.map(primaryProteinGroup).filter(Boolean) as string[]);
    const prevCs = new Set(candidates.map(primaryCarbGroup).filter(Boolean) as string[]);
    if (freshP) {
      pTotal++;
      if (prevPs.has(freshP)) { pRepeat++; proteinRepeats.push(m?.name || k); }
    }
    if (freshC) {
      cTotal++;
      if (prevCs.has(freshC)) { cRepeat++; carbRepeats.push(m?.name || k); }
    }
  }
  return {
    proteinRepeatRatio: pTotal === 0 ? 0 : pRepeat / pTotal,
    carbRepeatRatio: cTotal === 0 ? 0 : cRepeat / cTotal,
    proteinRepeats,
    carbRepeats,
  };
}

/** Per-item map name→qtyGrams (rounded to 5g). */
const itemPortions = (m: any): Map<string, number> => {
  const out = new Map<string, number>();
  for (const item of m?.items ?? []) {
    const n = normalizeName(item?.name);
    if (!n) continue;
    const q = Number(item?.qtyGrams);
    out.set(n, Number.isFinite(q) ? Math.round(q / 5) * 5 : -1);
  }
  return out;
};

type DietPairBreakdown = {
  /** raw foodset Jaccard, 0..1 (1 = same foods, ignoring portions) */
  score: number;
  /** how many meals had ≥80% foodset overlap with best candidate */
  sameFoodMeals: number;
  /** subset of sameFoodMeals where at least one portion changed */
  portionOnlyMeals: number;
  /** total meals in `a` */
  totalMeals: number;
};

function dietPairBreakdown(a: DietPlanLike, b: DietPlanLike): DietPairBreakdown {
  const ma = mealsOfDietPlan(a);
  const mb = mealsOfDietPlan(b);
  if (ma.length === 0 || mb.length === 0) {
    return { score: 0, sameFoodMeals: 0, portionOnlyMeals: 0, totalMeals: ma.length };
  }
  const bByKey = new Map<string, any[]>();
  for (const m of mb) {
    const k = mealKey(m);
    if (!bByKey.has(k)) bByKey.set(k, []);
    bByKey.get(k)!.push(m);
  }
  let sum = 0;
  let sameFoodMeals = 0;
  let portionOnlyMeals = 0;
  for (const m of ma) {
    const k = mealKey(m);
    const candidates = bByKey.get(k) ?? mb;
    let best = 0;
    let bestMeal: any = null;
    for (const c of candidates) {
      const j = jaccard(foodSet(m), foodSet(c));
      if (j > best) { best = j; bestMeal = c; }
    }
    sum += best;
    if (best >= 0.8 && bestMeal) {
      sameFoodMeals++;
      const pa = itemPortions(m);
      const pb = itemPortions(bestMeal);
      let portionChanged = false;
      for (const [name, qa] of pa) {
        const qb = pb.get(name);
        if (qb != null && qa !== qb) { portionChanged = true; break; }
      }
      if (portionChanged) portionOnlyMeals++;
    }
  }
  return {
    score: sum / ma.length,
    sameFoodMeals,
    portionOnlyMeals,
    totalMeals: ma.length,
  };
}

// ─────────────────────────── public API ───────────────────────────

export type SimilarityResult = {
  score: number;
  perPlan: Array<{ planIndex: number; raw: number; weighted: number }>;
  worstOverlap: string[]; // normalized names that repeat most
  /** Diet-only: ratio of meals (0..1) that kept the same foods and only changed portions. */
  quantityOnlyRatio?: number;
  /** Diet-only: 'menu_variation' | 'portion_only' | 'mixed' | 'new_menu' */
  changeKind?: "menu_variation" | "portion_only" | "mixed" | "new_menu";
  /** Diet-only: ratio (0..1) of meals where primary protein source repeats from previous plan. */
  primaryProteinRepeatRatio?: number;
  /** Diet-only: ratio (0..1) of meals where primary carb source repeats from previous plan. */
  primaryCarbRepeatRatio?: number;
  /** Diet-only: meal names where the primary protein source repeated. */
  proteinRepeatMeals?: string[];
  /** Diet-only: meal names where the primary carb source repeated. */
  carbRepeatMeals?: string[];
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
  const base = aggregateAgainstHistory(
    (h) => dietPairBreakdown(fresh, h).score,
    history,
    dietItems,
    fresh,
  );
  // Compute breakdown against the most recent plan only (used for UX label
  // and for the regeneration gate).
  let quantityOnlyRatio = 0;
  let changeKind: SimilarityResult["changeKind"] = "new_menu";
  let adjustedScore = base.score;
  if (history.length > 0) {
    const bd = dietPairBreakdown(fresh, history[0]);
    quantityOnlyRatio = bd.totalMeals === 0 ? 0 : bd.portionOnlyMeals / bd.totalMeals;
    const sameFoodRatio = bd.totalMeals === 0 ? 0 : bd.sameFoodMeals / bd.totalMeals;
    if (sameFoodRatio >= 0.6 && quantityOnlyRatio >= 0.5) changeKind = "portion_only";
    else if (sameFoodRatio >= 0.6) changeKind = "mixed"; // same foods, same portions = no change
    else if (sameFoodRatio >= 0.3) changeKind = "mixed";
    else changeKind = "menu_variation";
    // PENALTY: if it's basically the old menu with rescaled portions, push
    // similarity up so the threshold gate fires regardless of meal-name shuffle.
    if (changeKind === "portion_only") {
      adjustedScore = Math.max(adjustedScore, 0.9);
    } else if (sameFoodRatio >= 0.6) {
      adjustedScore = Math.max(adjustedScore, 0.8);
    }
    // PENALTY: primary protein/carb sources repeating across most meals
    // counts as low variation even if names/portions vary.
    const ps = primarySourceRepeats(fresh, history[0]);
    const maxPrimary = Math.max(ps.proteinRepeatRatio, ps.carbRepeatRatio);
    if (maxPrimary >= 0.8) adjustedScore = Math.max(adjustedScore, 0.85);
    else if (maxPrimary >= 0.6) adjustedScore = Math.max(adjustedScore, 0.7);
    return {
      ...base,
      score: adjustedScore,
      quantityOnlyRatio,
      changeKind,
      primaryProteinRepeatRatio: ps.proteinRepeatRatio,
      primaryCarbRepeatRatio: ps.carbRepeatRatio,
      proteinRepeatMeals: ps.proteinRepeats,
      carbRepeatMeals: ps.carbRepeats,
    };
  }
  return { ...base, score: adjustedScore, quantityOnlyRatio, changeKind };
}