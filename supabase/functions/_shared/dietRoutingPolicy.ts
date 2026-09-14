/**
 * Deterministic routing policy for the diet agent.
 *
 * This module holds the ONLY implementation of the Luna → Terra decision
 * predicates. `diet-agent` imports it, and the tests import the very same
 * functions, so a change in the production policy breaks the tests.
 */

export const QUANTITY_OVERLAP_LIMIT = 0.3;
export const PRIMARY_SOURCE_REPEAT_LIMIT = 0.6;

export type DietCandidateSignals = {
  intent: string;
  historyCount: number;
  similarityScore: number;
  threshold: number;
  isPortionOnly: boolean;
  requireMenuVariation: boolean;
  quantityOnlyRatio: number;
  primarySourceRepeatRatio: number;
  nutritionOk: boolean;
  dailyAdjustmentsOk: boolean;
  /** Phase 3: per-weekday deterministic targets. Defaults to true (no cycle). */
  dayTargetsOk?: boolean;
  /** Phase 4: every foodId returned by the model exists in the catalog. */
  foodContractOk?: boolean;
  /** True when the candidate already came from a Terra technical fallback. */
  technicalFallbackUsed: boolean;
  /**
   * True when the admin pasted a reference ("dieta modelo"). The plan MUST mirror
   * those foods, so variation/repetition signals are expected and must never
   * block generation.
   */
  referenceDietProvided?: boolean;
};

/** Variation-only failures may never trigger a fallback on an UPDATE. */
export function isVariationRetryAllowed(intent: string, referenceDietProvided = false): boolean {
  return intent !== "update" && !referenceDietProvided;
}

export function needsDietVariationRetry(s: DietCandidateSignals): boolean {
  return (
    isVariationRetryAllowed(s.intent, s.referenceDietProvided) &&
    s.historyCount > 0 &&
    (
      s.similarityScore > s.threshold ||
      s.isPortionOnly ||
      (s.requireMenuVariation && s.quantityOnlyRatio > QUANTITY_OVERLAP_LIMIT) ||
      s.primarySourceRepeatRatio >= PRIMARY_SOURCE_REPEAT_LIMIT
    )
  );
}


export type DietCandidateValidity = {
  nutritionValid: boolean;
  dailyAdjustmentsValid: boolean;
  dayTargetsValid: boolean;
  criticalValid: boolean;
  reason: "nutrition_invalid" | "daily_adjustments_invalid" | "day_targets_invalid" | null;
};

export function evaluateDietCandidateValidity(
  input: { nutritionOk: boolean; dailyAdjustmentsOk: boolean; dayTargetsOk?: boolean },
): DietCandidateValidity {
  const nutritionValid = input.nutritionOk;
  const dailyAdjustmentsValid = input.dailyAdjustmentsOk;
  const dayTargetsValid = input.dayTargetsOk !== false;
  const criticalValid = nutritionValid && dailyAdjustmentsValid && dayTargetsValid;
  return {
    nutritionValid,
    dailyAdjustmentsValid,
    dayTargetsValid,
    criticalValid,
    reason: criticalValid
      ? null
      : (!nutritionValid
          ? "nutrition_invalid"
          : (!dailyAdjustmentsValid ? "daily_adjustments_invalid" : "day_targets_invalid")),
  };
}

/** Absolute budget: a technical fallback candidate is never retried again. */
export function shouldRetryDietCandidate(s: DietCandidateSignals): boolean {
  if (s.technicalFallbackUsed) return false;
  const { criticalValid } = evaluateDietCandidateValidity({
    nutritionOk: s.nutritionOk,
    dailyAdjustmentsOk: s.dailyAdjustmentsOk,
    dayTargetsOk: s.dayTargetsOk,
  });
  return !criticalValid || needsDietVariationRetry(s);
}

/**
 * Pure variation retry: the Terra candidate replaces Luna only when it is
 * critically valid AND actually improves variation.
 */
export function shouldAcceptDietVariationCandidate(input: {
  candidateCriticalValid: boolean;
  candidateScore: number;
  currentScore: number;
  escapedPortionOnly: boolean;
  reducedPrimarySourceRepeat: boolean;
}): boolean {
  return (
    input.candidateCriticalValid &&
    (
      input.candidateScore <= input.currentScore ||
      input.escapedPortionOnly ||
      input.reducedPrimarySourceRepeat
    )
  );
}
