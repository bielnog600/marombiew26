/**
 * Canonical vocabularies v1.0 — Fase 2C.2B
 * Frozen. Mirror of public.metadata_vocabularies row (version = 'v1.0').
 * Do NOT edit without incrementing VOCABULARY_VERSION and creating a new DB row.
 */

export const VOCABULARY_VERSION = "v1.0" as const;

// ---------- Equipment (hierarchical) ----------
export const EQUIPMENT_ROOTS = [
  "machine",
  "smith_machine",
  "cable",
  "free_weight",
  "bodyweight",
  "cardio_machine",
  "resistance_band",
  "medicine_ball",
  "stability_ball",
  "other",
  "unknown",
] as const;

export const EQUIPMENT_PARENTS: Record<string, string[]> = {
  free_weight: ["barbell", "dumbbell", "kettlebell"],
};

export type EquipmentType =
  | (typeof EQUIPMENT_ROOTS)[number]
  | "barbell"
  | "dumbbell"
  | "kettlebell";

/**
 * Returns the parent equipment (if any) for a given specific type.
 * Used by metric layer to classify parent/child divergences as hierarchical_match.
 */
export function equipmentParentOf(child: string): string | null {
  for (const [parent, children] of Object.entries(EQUIPMENT_PARENTS)) {
    if (children.includes(child)) return parent;
  }
  return null;
}

export function isHierarchicalEquipmentMatch(pred: string, gt: string): boolean {
  if (pred === gt) return false; // exact_match, not hierarchical
  return equipmentParentOf(pred) === gt || equipmentParentOf(gt) === pred;
}

// ---------- Muscles ----------
export const CANONICAL_MUSCLES = [
  "quadriceps",
  "hamstrings",
  "gluteus_maximus",
  "gluteus_medius",
  "adductors",
  "gastrocnemius",
  "soleus",
  "pectoralis_major",
  "latissimus_dorsi",
  "trapezius",
  "rhomboids",
  "anterior_deltoid",
  "lateral_deltoid",
  "posterior_deltoid",
  "biceps_brachii",
  "brachialis",
  "triceps_brachii",
  "rectus_abdominis",
  "obliques",
  "transverse_abdominis",
  "erector_spinae",
] as const;

export type CanonicalMuscle = (typeof CANONICAL_MUSCLES)[number];

/** Anatomical regions / joints that must NEVER appear in muscle fields. */
export const FORBIDDEN_IN_MUSCLE_FIELDS = [
  "thoracic_spine",
  "lumbar_spine",
  "knee",
  "hip",
  "core",
] as const;

export const MUSCLE_ALIASES: Record<string, CanonicalMuscle> = {
  abs: "rectus_abdominis",
  abdominals: "rectus_abdominis",
  abdomen: "rectus_abdominis",
  gastrocnemios: "gastrocnemius",
  panturrilha: "gastrocnemius",
  lombar: "erector_spinae",
  lombares: "erector_spinae",
};

export function normalizeMuscle(raw: string): CanonicalMuscle | null {
  const key = raw.toLowerCase().trim();
  if ((CANONICAL_MUSCLES as readonly string[]).includes(key)) {
    return key as CanonicalMuscle;
  }
  return MUSCLE_ALIASES[key] ?? null;
}

export function isForbiddenMuscleValue(raw: string): boolean {
  return (FORBIDDEN_IN_MUSCLE_FIELDS as readonly string[]).includes(
    raw.toLowerCase().trim(),
  );
}

// ---------- Movement patterns ----------
export const MOVEMENT_PATTERNS = [
  "squat",
  "hip_hinge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "knee_extension",
  "knee_flexion",
  "hip_extension",
  "hip_abduction",
  "hip_adduction",
  "elbow_flexion",
  "elbow_extension",
  "shoulder_abduction",
  "shoulder_flexion",
  "plantar_flexion",
  "anti_extension",
  "anti_rotation",
  "trunk_flexion",
  "trunk_extension",
  "locomotion",
  "jump",
  "mobility",
  "other",
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

// ---------- not_applicable rules ----------
/**
 * Fields where `not_applicable` is an accepted state, and the contexts
 * that justify it. Reviewer selecting not_applicable outside these
 * contexts must attach a note.
 */
export const NOT_APPLICABLE_RULES = {
  safe_to_failure: ["cardio_continuous", "mobility", "some_isometrics"],
  axial_load: [], // always applicable — value may be `none` but never N/A
  primary_muscles: ["global_cardio_activities_explicit_only"],
} as const;

// ---------- Metric match types ----------
export type MatchType =
  | "exact_match"
  | "canonical_alias_match"
  | "hierarchical_match"
  | "partial_array_match"
  | "incorrect"
  | "correct_abstention"
  | "unnecessary_abstention"
  | "reviewer_unresolved"
  | "not_applicable"
  | "not_evaluated";

export type ReviewFieldState =
  | "resolved"
  | "not_applicable"
  | "insufficient_information"
  | "requires_video_review"
  | "requires_equipment_confirmation";

export type ReviewerKind =
  | "ai-agent-blinded-v1" // legacy — reclassified to draft_benchmark
  | "human_blinded_v1"
  | "human_safety_review_v1"
  | "adjudicator_v1";