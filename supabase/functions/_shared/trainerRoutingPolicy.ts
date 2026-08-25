/**
 * Deterministic routing policy for the trainer agent.
 *
 * Single source of truth for the Luna → Terra decision predicates, imported by
 * `trainer-agent` and by the tests (never re-implemented in the tests).
 */

export type TrainerCandidateSignals = {
  redundancyOk: boolean;
  criticalCatalogMismatchCount: number;
  similarityScore: number;
  threshold: number;
  historyCount: number;
  /** True when the candidate already came from a Terra technical fallback. */
  technicalFallbackUsed: boolean;
};

export function isTrainerCandidateCriticalValid(
  input: { redundancyOk: boolean; criticalCatalogMismatchCount: number },
): boolean {
  return input.redundancyOk && input.criticalCatalogMismatchCount === 0;
}

export function trainerCriticalReason(
  input: { redundancyOk: boolean; criticalCatalogMismatchCount: number },
): "internal_redundancy" | "catalog_mismatch" | null {
  if (!input.redundancyOk) return "internal_redundancy";
  if (input.criticalCatalogMismatchCount > 0) return "catalog_mismatch";
  return null;
}

/** Absolute budget: a technical fallback candidate is never retried again. */
export function shouldRetryTrainerCandidate(s: TrainerCandidateSignals): boolean {
  if (s.technicalFallbackUsed) return false;
  const criticalInvalid = !isTrainerCandidateCriticalValid(s);
  return criticalInvalid || (s.similarityScore > s.threshold && s.historyCount > 0);
}

/** Variation retry: Terra replaces Luna only when valid and not worse. */
export function shouldAcceptTrainerVariationCandidate(input: {
  candidateCriticalValid: boolean;
  candidateScore: number;
  currentScore: number;
}): boolean {
  return input.candidateCriticalValid && input.candidateScore <= input.currentScore;
}
