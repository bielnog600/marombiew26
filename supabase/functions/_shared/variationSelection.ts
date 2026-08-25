/**
 * Deterministic semantics + validation for the VARIATION column.
 *
 * A variation is a FUNCTIONAL SUBSTITUTE for the main exercise: the exercise
 * the student performs when the main one is unavailable. It is never a random
 * same-group exercise, never an extra exercise, never arbitrary variety.
 *
 * This module never touches the main exercises, the reference policy, routing
 * or the schema. It only validates / repairs `exercise.variation`.
 */

import { normalizeName } from "./planSimilarity.ts";
import { getExerciseFunctionalProfile } from "./exerciseClassifier.ts";
import { validateWorkoutRedundancy, isStrongFunctionalEquivalent } from "./workoutRedundancy.ts";
import { canonicalAnchorName, isConditionalOnly, phraseMentionsAnchor } from "./trainerReferencePolicy.ts";

export type CatalogEntryLike = { nome: string; grupo: string };

export type VariationTier = "A" | "B" | "C";

export type VariationReason =
  | "same_exercise"
  | "catalog_mismatch"
  | "muscle_mismatch"
  | "semantic_mismatch"
  | "creates_redundancy"
  | "safety_conflict"
  | "equipment_unavailable"
  | null;

export interface VariationVerdict {
  valid: boolean;
  tier: VariationTier | null;
  reason: VariationReason;
}

export interface VariationFix {
  day: string;
  exercise: string;
  previous: string | null;
  next: string | null;
  reason: VariationReason;
  tier: VariationTier | null;
}

export interface VariationOptions {
  /** Free text with restrictions / forbidden exercises stated by the professor. */
  restrictionsText?: string;
  /** Extra explicitly forbidden exercise names. */
  forbiddenNames?: string[];
  /**
   * Reliable list of equipment available to the student. Only pass it when the
   * data really exists — when omitted, equipment is used for ranking only.
   */
  availableEquipment?: string[];
}

const clean = (s: unknown): string => String(s ?? "").trim();
const isEmptyVariation = (s: string): boolean => !s || s === "-" || s === "—";

function catalogLookup(catalog: CatalogEntryLike[], name: string): CatalogEntryLike | undefined {
  const n = normalizeName(name);
  return catalog.find((c) => normalizeName(c.nome) === n);
}

/** Safety gate: a variation can never be an exercise the professor forbade. */
export function isForbiddenByRestrictions(name: string, opts: VariationOptions): boolean {
  const anchor = canonicalAnchorName(name);
  for (const f of opts.forbiddenNames ?? []) {
    if (normalizeName(f) === normalizeName(name)) return true;
  }
  const text = opts.restrictionsText ?? "";
  if (!text) return false;
  for (const chunk of text.split(/[\n;,]/)) {
    const piece = chunk.trim();
    if (!piece) continue;
    if (isConditionalOnly(piece)) continue;
    if (phraseMentionsAnchor(piece, anchor)) return true;
  }
  return false;
}

/** Replaces `exercise` with `candidate` inside a cloned day. */
function hypotheticalDay(day: any, exerciseName: string, candidate: string): any {
  const clone = JSON.parse(JSON.stringify(day ?? {}));
  clone.exercises = (clone.exercises ?? []).map((e: any) =>
    normalizeName(clean(e?.exercise)) === normalizeName(exerciseName)
      ? { ...e, exercise: candidate, variation: null }
      : { ...e, variation: null },
  );
  return clone;
}

const CLASS_INCOMPATIBLE = new Set(["mobility", "cardio"]);

function classCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  // Mobility / cardio never substitute strength work and vice versa.
  if (CLASS_INCOMPATIBLE.has(a) !== CLASS_INCOMPATIBLE.has(b)) return false;
  return true;
}

/**
 * Full deterministic verdict for a single (exercise, candidate) pair inside a day.
 */
export function evaluateVariationCandidate(input: {
  day: any;
  exerciseName: string;
  candidate: string;
  catalog: CatalogEntryLike[];
  options?: VariationOptions;
}): VariationVerdict {
  const { day, exerciseName, candidate, catalog } = input;
  const opts = input.options ?? {};

  if (isEmptyVariation(clean(candidate))) return { valid: false, tier: null, reason: null };

  // 5. Absolute rule — a variation is never the exercise itself.
  if (normalizeName(candidate) === normalizeName(exerciseName)) {
    return { valid: false, tier: null, reason: "same_exercise" };
  }

  // 4. Must exist in the real catalog (when a catalog is available).
  const candEntry = catalogLookup(catalog, candidate);
  if (catalog.length > 0 && !candEntry) {
    return { valid: false, tier: null, reason: "catalog_mismatch" };
  }

  // 10. Safety first.
  if (isForbiddenByRestrictions(candidate, opts)) {
    return { valid: false, tier: null, reason: "safety_conflict" };
  }

  const mainEntry = catalogLookup(catalog, exerciseName);
  if (mainEntry && candEntry && mainEntry.grupo !== candEntry.grupo) {
    return { valid: false, tier: null, reason: "muscle_mismatch" };
  }

  const mainProfile = getExerciseFunctionalProfile(exerciseName);
  const candProfile = getExerciseFunctionalProfile(candidate);

  // Equipment is a hard requirement ONLY when a reliable availability list exists.
  if (
    Array.isArray(opts.availableEquipment) &&
    opts.availableEquipment.length > 0 &&
    candProfile.equipment &&
    !opts.availableEquipment.map((e) => String(e).toLowerCase()).includes(candProfile.equipment)
  ) {
    return { valid: false, tier: null, reason: "equipment_unavailable" };
  }

  if (!classCompatible(mainProfile.exerciseClass, candProfile.exerciseClass)) {
    return { valid: false, tier: null, reason: "semantic_mismatch" };
  }

  const samePattern =
    !!mainProfile.pattern && !!candProfile.pattern && mainProfile.pattern === candProfile.pattern;
  const sameClass =
    !!mainProfile.exerciseClass &&
    !!candProfile.exerciseClass &&
    mainProfile.exerciseClass === candProfile.exerciseClass;
  const sameGroup = !!mainEntry && !!candEntry && mainEntry.grupo === candEntry.grupo;

  // Without any functional or muscular link the candidate is semantically distant.
  if (!samePattern && !sameGroup) {
    return { valid: false, tier: null, reason: "semantic_mismatch" };
  }

  // 6/7. Counterfactual validation: would swapping create redundancy?
  const hypo = hypotheticalDay(day, exerciseName, candidate);
  const validation = validateWorkoutRedundancy({ days: [hypo] });
  if (validation.exactDuplicate || validation.strongFunctionalDuplicate) {
    return { valid: false, tier: null, reason: "creates_redundancy" };
  }
  // Defensive: direct strong equivalence with another main exercise of the day.
  const others = (day?.exercises ?? [])
    .map((e: any) => clean(e?.exercise))
    .filter((n: string) => n && normalizeName(n) !== normalizeName(exerciseName));
  if (others.some((n: string) => isStrongFunctionalEquivalent(n, candidate))) {
    return { valid: false, tier: null, reason: "creates_redundancy" };
  }

  const tier: VariationTier = samePattern && sameClass && sameGroup
    ? "A"
    : samePattern && (sameGroup || !mainEntry || !candEntry)
    ? "B"
    : "C";

  return { valid: true, tier, reason: null };
}

const TIER_RANK: Record<VariationTier, number> = { A: 0, B: 1, C: 2 };

const UNILATERAL_TOKENS = ["unilateral", "alternando", "alternada", "afundo", "avanco", "bulgaro", "passada"];

function isUnilateral(name: string): boolean {
  const n = normalizeName(name);
  return UNILATERAL_TOKENS.some((t) => n.includes(t));
}

/**
 * Deterministic score used ONLY inside the same tier. Higher is better.
 * Order of relevance: pattern > class > group > equipment > bilaterality > unused.
 */
function intraTierScore(input: {
  exerciseName: string;
  candidate: string;
  catalog: CatalogEntryLike[];
  used: boolean;
}): number {
  const { exerciseName, candidate, catalog, used } = input;
  const main = getExerciseFunctionalProfile(exerciseName);
  const cand = getExerciseFunctionalProfile(candidate);
  const mainEntry = catalogLookup(catalog, exerciseName);
  const candEntry = catalogLookup(catalog, candidate);

  let score = 0;
  if (main.pattern && cand.pattern && main.pattern === cand.pattern) score += 32;
  if (main.exerciseClass && cand.exerciseClass && main.exerciseClass === cand.exerciseClass) score += 16;
  if (mainEntry && candEntry && mainEntry.grupo === candEntry.grupo) score += 8;
  if (main.equipment && cand.equipment && main.equipment === cand.equipment) score += 4;
  if (isUnilateral(exerciseName) === isUnilateral(candidate)) score += 2;
  if (!used) score += 1;
  return score;
}

/** Picks the best deterministic variation for an exercise, or null. */
export function selectVariation(input: {
  day: any;
  exerciseName: string;
  catalog: CatalogEntryLike[];
  usedVariations: Set<string>;
  options?: VariationOptions;
}): { name: string; tier: VariationTier } | null {
  const { day, exerciseName, catalog, usedVariations } = input;
  const mainNames = new Set(
    (day?.exercises ?? []).map((e: any) => normalizeName(clean(e?.exercise))).filter(Boolean),
  );

  let best: { name: string; tier: VariationTier; score: number } | null = null;
  for (const entry of catalog) {
    if (mainNames.has(normalizeName(entry.nome))) continue;
    const verdict = evaluateVariationCandidate({
      day,
      exerciseName,
      candidate: entry.nome,
      catalog,
      options: input.options,
    });
    if (!verdict.valid || !verdict.tier) continue;
    const used = usedVariations.has(normalizeName(entry.nome));
    const cand = {
      name: entry.nome,
      tier: verdict.tier,
      score: intraTierScore({ exerciseName, candidate: entry.nome, catalog, used }),
    };
    if (!best) { best = cand; continue; }
    // Tier is the primary biomechanical criterion; `used` is only a tie-breaker.
    if (TIER_RANK[cand.tier] !== TIER_RANK[best.tier]) {
      if (TIER_RANK[cand.tier] < TIER_RANK[best.tier]) best = cand;
      continue;
    }
    if (cand.score > best.score) best = cand;
  }
  return best ? { name: best.name, tier: best.tier } : null;
}

/**
 * 11. Deterministic sanitization after the AI: validates every
 * (exercise, variation) pair, repairs what can be repaired and otherwise
 * clears the variation. Never a reason to escalate to the fallback model.
 */
export function validateAndNormalizeVariations(
  plan: any,
  catalog: CatalogEntryLike[] = [],
  options: VariationOptions = {},
): VariationFix[] {
  const fixes: VariationFix[] = [];
  if (!plan?.days || !Array.isArray(plan.days)) return fixes;

  for (const day of plan.days) {
    const dayLabel = clean(day?.day) || clean(day?.label) || "Dia";
    const usedVariations = new Set<string>();
    for (const ex of day?.exercises ?? []) {
      const name = clean(ex?.exercise);
      if (!name) continue;
      const current = clean(ex?.variation);

      if (!isEmptyVariation(current)) {
        const verdict = evaluateVariationCandidate({
          day,
          exerciseName: name,
          candidate: current,
          catalog,
          options,
        });
        if (verdict.valid) {
          usedVariations.add(normalizeName(current));
          continue;
        }
        const replacement = selectVariation({
          day,
          exerciseName: name,
          catalog,
          usedVariations,
          options,
        });
        ex.variation = replacement ? replacement.name : null;
        if (replacement) usedVariations.add(normalizeName(replacement.name));
        fixes.push({
          day: dayLabel,
          exercise: name,
          previous: current,
          next: ex.variation,
          reason: verdict.reason,
          tier: replacement?.tier ?? null,
        });
        continue;
      }

      // No variation proposed: try to fill it deterministically, else keep null.
      const replacement = selectVariation({
        day,
        exerciseName: name,
        catalog,
        usedVariations,
        options,
      });
      if (replacement) {
        ex.variation = replacement.name;
        usedVariations.add(normalizeName(replacement.name));
        fixes.push({
          day: dayLabel,
          exercise: name,
          previous: null,
          next: replacement.name,
          reason: null,
          tier: replacement.tier,
        });
      } else {
        ex.variation = null;
      }
    }
  }
  return fixes;
}
