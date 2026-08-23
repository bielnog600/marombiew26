# Plan - Hardening AI Routing and Integrity (V2 Luna -> Terra)

This plan fixes critical bugs in the AI model routing, validation pipelines, and technical fallbacks for both diet and training agents.

## User Review Required

> [!IMPORTANT]
> The quantitative thresholds for similarity and redundancy are being strictly enforced. If both attempts (Luna and Terra) fail critical validation (Nutrition for diets, Redundancy/Catalog for training), the system will now return a `422 review_required` error instead of a potentially invalid plan.

## Proposed Changes

### 1. Shared Logic Optimization
- **Redundancy Motor**: Refactor `supabase/functions/_shared/workoutRedundancy.ts` to import `CLASSIFIER_VERSION` from `exerciseClassifier.ts` and use the same functional family patterns (Squat, Hinge, Push, Pull, etc.) to ensure consistency.
- **AI Router**: Ensure `fallbackReasons` is correctly populated and passed through all layers.

### 2. Diet Agent (`diet-agent`)
- **Pipeline Unification**: Create a central `evaluateDietCandidate` function to ensure Luna, Terra, and Technical fallbacks all pass through the same validation (Nutrition, Similarity, DailyAdjustments).
- **Update Mode Protection**: 
    - Wrap all variation-based retry triggers (similarity score, portion-only, quantity overlap) in a `variationRetryAllowed` check (false during updates).
    - Ensure the retry prompt for updates does NOT instruct the model to swap foods if the failure was purely nutritional.
- **Critical Fallback Integrity**: 
    - Remove early returns on technical fallbacks.
    - If Terra fails to fix a critical error (Nutrition or DailyAdjustments) found in Luna, return `422 review_required`.
- **Response Hardening**: Return a 200 status only if the final candidate is valid; otherwise, return a structured 422 error with `validationReasons`.

### 3. Training Agent (`trainer-agent`)
- **Pipeline Unification**: Create a central `evaluateWorkoutCandidate` function.
- **Catalog Integration**:
    - Evaluate `catalog_mismatch` (using `snapPlanToCatalog` on a clone) *during* the evaluation phase.
    - Trigger Terra fallback if Luna has catalog mismatches.
- **Similarity Integrity**:
    - Remove hardcoded `similarity: 0` for fallbacks.
    - Run real `computeWorkoutSimilarity` on Terra candidates.
- **Redundancy & Fallback**:
    - Ensure Terra candidates are validated for redundancy.
    - If both attempts are redundant or have catalog mismatches, return `422 review_required`.

## Technical Details

### Diet Agent Pipeline
```typescript
const result = evaluateDietCandidate({
  plan: candidate,
  historyJsons,
  schedule,
  intensity,
  threshold,
  variationRetryAllowed,
  requireMenuVariation
});
// result contains { plan, similarity, nutrition, normalizedAdj, adjValidation, needsRetry }
```

### Training Agent Redundancy & Catalog
- Re-use functional families: `knee_extension`, `hip_hinge`, `horizontal_push`, etc.
- A candidate is rejected if 3+ exercises of the same family exist in one day.
- A candidate is rejected if `unmatchedExercises.length > 0`.
