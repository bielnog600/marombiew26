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
import {
  familyRole,
  familyTier,
  isUnilateralName,
  stabilityProfile,
  variationFamilyOf,
} from "./variationFamilies.ts";
import {
  equipmentStylePreferenceScore,
  isExerciseAllowedByProfile,
  type ExerciseProfile,
} from "./exerciseEquipmentProfile.ts";


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
  | "profile_conflict"
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
  /**
   * Preferência de estilo de equipamento (basic / articulated_plus_basic /
   * mixed). Hard gate apenas para `basic`; nos demais casos é só ranking.
   */
  exerciseProfile?: ExerciseProfile;
}

const clean = (s: unknown): string => String(s ?? "").trim();
const isEmptyVariation = (s: string): boolean => !s || s === "-" || s === "—";

// Catalog lookups happen thousands of times per plan; index each catalog once.
const CATALOG_INDEX = new WeakMap<object, Map<string, CatalogEntryLike>>();

function catalogIndex(catalog: CatalogEntryLike[]): Map<string, CatalogEntryLike> {
  const existing = CATALOG_INDEX.get(catalog as unknown as object);
  if (existing) return existing;
  const index = new Map<string, CatalogEntryLike>();
  for (const c of catalog) {
    const key = normalizeName(c.nome);
    if (key && !index.has(key)) index.set(key, c);
  }
  CATALOG_INDEX.set(catalog as unknown as object, index);
  return index;
}

function catalogLookup(catalog: CatalogEntryLike[], name: string): CatalogEntryLike | undefined {
  return catalogIndex(catalog).get(normalizeName(name));
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

/** Replaces `exercise` with `candidate` inside a lightweight copy of the day. */
function hypotheticalDay(day: any, exerciseName: string, candidate: string): any {
  const target = normalizeName(exerciseName);
  const exercises = (day?.exercises ?? []).map((e: any) =>
    normalizeName(clean(e?.exercise)) === target
      ? { ...e, exercise: candidate, variation: null }
      : { ...e, variation: null },
  );
  return { ...(day ?? {}), exercises };
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

  // Perfil de equipamento: hard gate somente no perfil BASIC.
  if (opts.exerciseProfile && !isExerciseAllowedByProfile(candidate, opts.exerciseProfile)) {
    return { valid: false, tier: null, reason: "profile_conflict" };
  }

  if (!classCompatible(mainProfile.exerciseClass, candProfile.exerciseClass)) {
    return { valid: false, tier: null, reason: "semantic_mismatch" };
  }

  // --- Núcleo funcional: mesma família / papel / ação articular.
  const mainFamily = variationFamilyOf(exerciseName);
  const candFamily = variationFamilyOf(candidate);
  const mainRole = familyRole(mainFamily);
  const candRole = familyRole(candFamily);
  if (mainRole && candRole && mainRole !== candRole) {
    // Isolador não substitui composto (e vice-versa); core/mobilidade/cardio
    // nunca substituem trabalho de força.
    return { valid: false, tier: null, reason: "semantic_mismatch" };
  }

  const samePattern =
    !!mainProfile.pattern && !!candProfile.pattern && mainProfile.pattern === candProfile.pattern;
  const sameClass =
    !!mainProfile.exerciseClass &&
    !!candProfile.exerciseClass &&
    mainProfile.exerciseClass === candProfile.exerciseClass;
  const sameGroup = !!mainEntry && !!candEntry && mainEntry.grupo === candEntry.grupo;

  const famTier = familyTier(exerciseName, candidate);
  if (famTier === "C") {
    // Mesmo músculo com padrão/ação diferente nunca é substituto direto.
    return { valid: false, tier: null, reason: "semantic_mismatch" };
  }

  // Sem família conhecida dos dois lados, exigimos vínculo funcional real.
  if (!famTier && (!samePattern || !sameClass)) {
    return { valid: false, tier: null, reason: "semantic_mismatch" };
  }

  // Estabilidade: máquina estável → peso livre exige que não haja restrição.
  const restrictions = (opts.restrictionsText ?? "").toLowerCase();
  const stabilityRestricted = /estabilidad|equilibri|labirint|tontur/.test(restrictions);
  if (
    stabilityRestricted &&
    stabilityProfile(exerciseName) === "stable" &&
    stabilityProfile(candidate) === "free"
  ) {
    return { valid: false, tier: null, reason: "safety_conflict" };
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

  let tier: VariationTier = famTier ?? (samePattern && sameClass && sameGroup ? "A" : "B");
  // Lateralidade não é equivalência automática: rebaixa para contextual.
  if (tier === "A" && isUnilateralName(exerciseName) !== isUnilateralName(candidate)) tier = "B";

  return { valid: true, tier, reason: null };
}


const TIER_RANK: Record<VariationTier, number> = { A: 0, B: 1, C: 2 };

const UNILATERAL_TOKENS = ["unilateral", "alternando", "alternada", "afundo", "avanco", "bulgaro", "passada"];

function isUnilateral(name: string): boolean {
  const n = normalizeName(name);
  return UNILATERAL_TOKENS.some((t) => n.includes(t));
}

function nameOverlap(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(/\s+/).filter((t) => t.length > 2));
  const tb = new Set(normalizeName(b).split(/\s+/).filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
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
  profile?: ExerciseProfile;
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
  // Nominal family overlap (e.g. "LEG PRESS 45 ART" -> "LEG PRESS") as a weak,
  // deterministic tie-breaker between otherwise equivalent candidates.
  // Preferência de estilo de equipamento: desempate DENTRO do mesmo tier.
  if (input.profile) {
    score += equipmentStylePreferenceScore({
      mainName: exerciseName,
      candidate,
      profile: input.profile,
    });
  }
  score += nameOverlap(exerciseName, candidate) * 3;
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
      score: intraTierScore({
        exerciseName,
        candidate: entry.nome,
        catalog,
        used,
        profile: input.options?.exerciseProfile,
      }),
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
