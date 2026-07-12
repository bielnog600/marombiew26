// Deterministic method↔exercise compatibility engine.
// Consumed by edge functions; frontend calls the endpoint rather than
// re-implementing this logic.

export const METHOD_RULES_VERSION = "1.0.0";

export type CompatStatus = "allowed" | "blocked" | "review_required";

export interface CompatResult {
  slug: string;
  status: CompatStatus;
  score: number;
  reasons: string[];
  warnings: string[];
  requiredConditions: string[];
  parameterLimits: Record<string, unknown>;
  rulesVersion: string;
}

export interface ExerciseInput {
  id?: string;
  nome?: string | null;
  grupo_muscular?: string | null;
  exercise_class?: string | null;
  equipment_type?: string | null;
  stability_level?: string | null;
  technical_complexity?: string | null;
  axial_load?: string | null;
  lumbar_load?: string | null;
  balance_requirement?: string | null;
  fatigue_cost?: string | null;
  safe_to_failure?: boolean | null;
  movement_pattern?: string | null;
  contraindications?: string[] | null;
  metadata_status?: string | null;
  metadata_version?: number | null;
}

export interface MethodInput {
  slug: string;
  category?: string | null;
  min_level?: string | null;
  active?: boolean;
  requires_professional_supervision?: boolean;
  requires_special_equipment?: boolean;
  fatigue_score?: number | null;
  technical_risk_score?: number | null;
}

export interface EvalContext {
  studentLevel?: "beginner" | "intermediate" | "advanced" | "professional_only" | null;
  goal?: string | null;
  availableEquipment?: string[] | null;
  professionalOverride?: boolean;
}

const LEVEL_ORDER: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  professional_only: 4,
};

const FATIGUING_INTENSITY = new Set([
  "rest_pause",
  "myo_reps",
  "drop_set",
  "mechanical_drop_set",
  "amrap_with_rir_cap",
]);

const POWER_METHODS = new Set([
  "complex_training",
  "contrast_training",
  "velocity_based_training",
]);

function req(field: unknown, name: string, reviewReasons: string[]) {
  if (field === null || field === undefined || field === "") {
    reviewReasons.push(`missing_${name}`);
    return false;
  }
  return true;
}

export function evaluateMethodCompatibility(
  exercise: ExerciseInput,
  method: MethodInput,
  context: EvalContext = {},
): CompatResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const requiredConditions: string[] = [];
  const reviewReasons: string[] = [];
  let score = 0.5;

  const result = (
    status: CompatStatus,
    finalScore: number,
    parameterLimits: Record<string, unknown> = {},
  ): CompatResult => ({
    slug: method.slug,
    status,
    score: Math.max(0, Math.min(1, finalScore)),
    reasons: [...reasons, ...reviewReasons],
    warnings,
    requiredConditions,
    parameterLimits,
    rulesVersion: METHOD_RULES_VERSION,
  });

  // ---- HARD BLOCKS ----
  if (method.active === false) {
    reasons.push("method_inactive");
    return result("blocked", 0);
  }

  if (method.min_level === "professional_only" && !context.professionalOverride) {
    reasons.push("professional_only_no_override");
    return result("blocked", 0);
  }

  if (
    method.requires_professional_supervision &&
    !context.professionalOverride
  ) {
    reasons.push("requires_professional_supervision");
    return result("blocked", 0);
  }

  if (method.requires_special_equipment) {
    const hasEquip =
      Array.isArray(context.availableEquipment) &&
      context.availableEquipment.length > 0;
    if (!hasEquip) {
      reasons.push("special_equipment_unconfirmed");
      return result("blocked", 0);
    }
    requiredConditions.push("confirm_equipment");
  }

  if (context.studentLevel && method.min_level) {
    const need = LEVEL_ORDER[method.min_level] ?? 1;
    const have = LEVEL_ORDER[context.studentLevel] ?? 1;
    if (have < need) {
      reasons.push("student_level_below_min");
      return result("blocked", 0);
    }
  }

  // ---- METADATA GATE ----
  const status = exercise.metadata_status ?? "unclassified";
  if (status === "unclassified" || status === "suggested" || status === "pending_review") {
    reviewReasons.push("exercise_not_approved");
  }
  if (status === "rejected") {
    reasons.push("exercise_metadata_rejected");
    return result("blocked", 0);
  }

  // Required fields per method family
  const cls = exercise.exercise_class;
  const stab = exercise.stability_level;
  const compl = exercise.technical_complexity;
  const balance = exercise.balance_requirement;
  const axial = exercise.axial_load;
  const lumbar = exercise.lumbar_load;
  const fatigue = exercise.fatigue_cost;

  const criticalMissing =
    !req(cls, "exercise_class", reviewReasons) ||
    !req(stab, "stability_level", reviewReasons) ||
    !req(compl, "technical_complexity", reviewReasons);

  // Contraindication awareness (context-sensitive)
  if (Array.isArray(exercise.contraindications) && exercise.contraindications.length > 0) {
    warnings.push("exercise_has_contraindications");
  }

  // ---- CATEGORY-SPECIFIC RULES ----
  const NON_LIFT_CLASSES = new Set(["mobility", "cardio", "rehabilitation"]);

  // TRADITIONAL / DOUBLE PROGRESSION
  if (["traditional_sets", "double_progression"].includes(method.slug)) {
    if (NON_LIFT_CLASSES.has(String(cls))) {
      reasons.push("class_not_conventional_reps");
      return result("blocked", 0);
    }
    score = 0.85;
  }

  // TOP SET + BACK-OFF
  if (method.slug === "top_set_backoff") {
    if (cls === "plyometric" || NON_LIFT_CLASSES.has(String(cls))) {
      reasons.push("class_incompatible_top_set");
      return result("blocked", 0);
    }
    if (cls !== "compound") reviewReasons.push("prefers_compound");
    if (balance === "high") reasons.push("balance_high") && reviewReasons.push("balance_high_review");
    if (context.studentLevel === "beginner" && (compl === "high" || compl === "very_high")) {
      reasons.push("beginner_high_complexity");
      return result("blocked", 0);
    }
    score = 0.75;
  }

  // REST-PAUSE / MYO-REPS / DROP SET
  if (["rest_pause", "myo_reps", "drop_set"].includes(method.slug)) {
    if (cls === "power" || cls === "plyometric" || NON_LIFT_CLASSES.has(String(cls))) {
      reasons.push("class_incompatible_failure_method");
      return result("blocked", 0);
    }
    if (axial === "high") { reasons.push("axial_load_high"); return result("blocked", 0); }
    if (lumbar === "high") { reasons.push("lumbar_load_high"); return result("blocked", 0); }
    if (balance === "high" || balance === "moderate") {
      reasons.push("balance_requirement_incompatible");
      return result("blocked", 0);
    }
    if (stab === "low") { reasons.push("stability_low"); return result("blocked", 0); }
    if (compl === "high" || compl === "very_high") {
      reasons.push("technical_complexity_high");
      return result("blocked", 0);
    }
    if (exercise.safe_to_failure !== true) {
      reasons.push("safe_to_failure_not_confirmed");
      return result("blocked", 0);
    }
    if (fatigue === "very_high") {
      reasons.push("fatigue_cost_very_high");
      return result("blocked", 0);
    }
    const equip = String(exercise.equipment_type ?? "");
    if (["machine", "cable"].includes(equip)) score = 0.9; else score = 0.7;
  }

  // MECHANICAL DROP SET
  if (method.slug === "mechanical_drop_set") {
    // reuse rest_pause rules first (already handled above? No — separate slug)
    if (exercise.safe_to_failure !== true) {
      reasons.push("safe_to_failure_not_confirmed");
      return result("blocked", 0);
    }
    reviewReasons.push("mechanical_variation_required");
  }

  // CLUSTER SET
  if (method.slug === "cluster_set") {
    if (NON_LIFT_CLASSES.has(String(cls))) {
      reasons.push("class_incompatible_cluster");
      return result("blocked", 0);
    }
    if (cls === "isolation") reviewReasons.push("prefers_compound_for_cluster");
    if (cls === "compound") score = 0.9;
  }

  // PAUSED / TEMPO
  if (["paused_reps", "tempo_reps"].includes(method.slug)) {
    if (NON_LIFT_CLASSES.has(String(cls))) {
      reasons.push("class_not_conventional_reps");
      return result("blocked", 0);
    }
    score = 0.8;
  }

  // LENGTHENED PARTIALS
  if (method.slug === "lengthened_partials") {
    if (status !== "approved") reviewReasons.push("stretched_position_unknown");
    if (stab === "low") { reasons.push("stability_low"); return result("blocked", 0); }
    score = 0.7;
  }

  // POWER methods: complex / contrast / VBT
  if (POWER_METHODS.has(method.slug)) {
    if (context.studentLevel && context.studentLevel !== "advanced" && context.studentLevel !== "professional_only") {
      reasons.push("power_requires_advanced");
      return result("blocked", 0);
    }
    if (method.slug === "velocity_based_training") {
      // equipment already validated above
      requiredConditions.push("velocity_measurement_device");
    }
    if (cls !== "compound" && cls !== "power") reviewReasons.push("power_prefers_compound_or_power");
  }

  // Fatiguing intensity generic guardrails when class missing
  if (FATIGUING_INTENSITY.has(method.slug) && criticalMissing) {
    // fall-through to review path below
  }

  // Final decision
  if (reasons.length > 0) return result("blocked", 0);
  if (reviewReasons.length > 0 || criticalMissing) return result("review_required", 0.4);
  return result("allowed", score);
}

export function evaluateAllMethods(
  exercise: ExerciseInput,
  methods: MethodInput[],
  context: EvalContext = {},
): { allowed: CompatResult[]; blocked: CompatResult[]; reviewRequired: CompatResult[] } {
  const allowed: CompatResult[] = [];
  const blocked: CompatResult[] = [];
  const reviewRequired: CompatResult[] = [];
  for (const m of methods) {
    const r = evaluateMethodCompatibility(exercise, m, context);
    if (r.status === "allowed") allowed.push(r);
    else if (r.status === "blocked") blocked.push(r);
    else reviewRequired.push(r);
  }
  return { allowed, blocked, reviewRequired };
}