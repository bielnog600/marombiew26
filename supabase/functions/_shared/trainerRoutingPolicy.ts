/**
 * Deterministic routing policy for the trainer agent.
 *
 * Single source of truth for the Luna → Terra decision predicates, imported by
 * `trainer-agent` and by the tests (never re-implemented in the tests).
 */

export type TrainerReferenceMode = "free" | "exact";

export type TrainerCandidateValidity = {
  redundancyOk: boolean;
  criticalCatalogMismatchCount: number;
  /** Optional; defaults derived from redundancyOk when omitted. */
  exactDuplicate?: boolean;
  strongFunctionalDuplicate?: boolean;
  referenceMode?: TrainerReferenceMode;
  referenceComplianceOk?: boolean;
};

export type TrainerCandidateSignals = TrainerCandidateValidity & {
  similarityScore: number;
  threshold: number;
  historyCount: number;
  /** True when the candidate already came from a Terra technical fallback. */
  technicalFallbackUsed: boolean;
};

export function isTrainerCandidateCriticalValid(input: TrainerCandidateValidity): boolean {
  if (input.exactDuplicate === true) return false;
  if (input.strongFunctionalDuplicate === true) return false;
  if (!input.redundancyOk) return false;
  if (input.criticalCatalogMismatchCount !== 0) return false;
  if (input.referenceMode === "exact" && input.referenceComplianceOk === false) return false;
  return true;
}

export function trainerCriticalReason(
  input: TrainerCandidateValidity,
): "internal_redundancy" | "strong_functional_duplicate" | "catalog_mismatch" | "reference_drift" | null {
  if (input.strongFunctionalDuplicate === true) return "strong_functional_duplicate";
  if (input.exactDuplicate === true || !input.redundancyOk) return "internal_redundancy";
  if (input.criticalCatalogMismatchCount > 0) return "catalog_mismatch";
  if (input.referenceMode === "exact" && input.referenceComplianceOk === false) return "reference_drift";
  return null;
}

/**
 * High similarity against history is only a fallback reason for FREE references.
 * With an exact professor prescription the similarity is intentional.
 */
export function isSimilarityRetryAllowed(mode: TrainerReferenceMode | undefined): boolean {
  return mode !== "exact";
}

/** Absolute budget: a technical fallback candidate is never retried again. */
export function shouldRetryTrainerCandidate(s: TrainerCandidateSignals): boolean {
  if (s.technicalFallbackUsed) return false;
  const criticalInvalid = !isTrainerCandidateCriticalValid(s);
  const similarityRetry =
    isSimilarityRetryAllowed(s.referenceMode) && s.similarityScore > s.threshold && s.historyCount > 0;
  return criticalInvalid || similarityRetry;
}

/** Variation retry: Terra replaces Luna only when valid and not worse. */
export function shouldAcceptTrainerVariationCandidate(input: {
  candidateCriticalValid: boolean;
  candidateScore: number;
  currentScore: number;
}): boolean {
  return input.candidateCriticalValid && input.candidateScore <= input.currentScore;
}

/**
 * HTTP status classification for upstream (OpenAI) failures.
 * Deterministic client errors must never spend a second model call.
 */
export const NON_RETRYABLE_UPSTREAM_STATUSES = [400, 401, 402, 403, 404, 429];

export function isRetryableUpstreamStatus(status: number): boolean {
  if (NON_RETRYABLE_UPSTREAM_STATUSES.includes(status)) return false;
  if (status === 408 || status === 409) return true;
  return status >= 500;
}
