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
  /** True when the candidate already came from a Terra technical fallback. */
  technicalFallbackUsed: boolean;
};

/** Variation-only failures may never trigger a fallback on an UPDATE. */
export function isVariationRetryAllowed(intent: string): boolean {
  return intent !== "update";
}

export function needsDietVariationRetry(s: DietCandidateSignals): boolean {
  return (
    isVariationRetryAllowed(s.intent) &&
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
  criticalValid: boolean;
  reason: "nutrition_invalid" | "daily_adjustments_invalid" | null;
};

export function evaluateDietCandidateValidity(
  input: { nutritionOk: boolean; dailyAdjustmentsOk: boolean },
): DietCandidateValidity {
  const nutritionValid = input.nutritionOk;
  const dailyAdjustmentsValid = input.dailyAdjustmentsOk;
  const criticalValid = nutritionValid && dailyAdjustmentsValid;
  return {
    nutritionValid,
    dailyAdjustmentsValid,
    criticalValid,
    reason: criticalValid
      ? null
      : (!nutritionValid ? "nutrition_invalid" : "daily_adjustments_invalid"),
  };
}

/** Absolute budget: a technical fallback candidate is never retried again. */
export function shouldRetryDietCandidate(s: DietCandidateSignals): boolean {
  if (s.technicalFallbackUsed) return false;
  const { criticalValid } = evaluateDietCandidateValidity({
    nutritionOk: s.nutritionOk,
    dailyAdjustmentsOk: s.dailyAdjustmentsOk,
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
