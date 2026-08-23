# Plan - AI Routing and Integrity Hardening (Revised)

This plan fixes critical bugs in AI model routing, validation pipelines, and technical fallbacks, incorporating user feedback on redundancy rules and usage metadata.

## User Review Required

> [!IMPORTANT]
> - **Redundancy Rule Relaxed**: The "3+ exercises of the same family" blocker has been removed. Redundancy now focuses on **exact duplicates** and **functional equivalents**.
> - **Update Integrity**: `intent === "update"` will no longer fall back to Terra due to similarity/variation issues (High Similarity, Portion Only, etc.). Fallbacks for updates are now strictly for technical or nutritional failures.
> - **Strict Usage Metadata**: Missing AI usage data will be represented as `null` rather than `0`.

## Proposed Changes

### 1. Shared Logic & Taxonomy
- **Unified Movement Patterns**: Refactor `supabase/functions/_shared/workoutRedundancy.ts` to export and share movement pattern tokens with `exerciseClassifier.ts` to ensure a single source of truth for taxonomy.
- **Redundancy Motor Refactor**:
    - **Remove** the "3+ per family" rejection rule.
    - **Implement** `exact_duplicate` detection for ALL exercises (count >= 2 per day).
    - **Maintain** functional equivalence checks (e.g., matching both movement pattern AND equipment/class).
- **AI Router Metadata**: 
    - Update `createRoutingMetadata` to preserve `null` for missing token counts.
    - Add invariant: `modelAttempts` must never be empty or zero-length.

### 2. Diet Agent (`diet-agent`)
- **Pipeline Unification**: Use `evaluateDietCandidate` to validate all attempts (Luna, Terra, Technical).
- **Update Mode Protection**:
    - Protect all variation-based retry triggers (`similarity.score > threshold`, `isPortionOnly`, `qOnly > 0.3`, `primarySourceTooRepetitive`) behind `variationRetryAllowed && intent !== "update"`.
    - Ensure `fallbackReasons` for updates only include technical/nutritional codes.
- **Retry Prompt Hardening**: If `intent === "update"`, the retry prompt will strictly focus on fixing nutrition/adjustments, omitting "Substitua alimentos" or "Troque por outra família" instructions.
- **Critical Failure Handling**: If Terra persists with a critical failure (Nutrition/DailyAdjustments), return `422 review_required`.

### 3. Training Agent (`trainer-agent`)
- **Pipeline Unification**: Use `evaluateWorkoutCandidate` for all attempts.
- **Catalog-Driven Fallback**:
    - Trigger Terra fallback if `hasCatalogMismatch` is true in Luna's output.
- **Similarity & Redundancy Integrity**:
    - Remove hardcoded `similarity: 0` for fallbacks; compute real similarity.
    - If both attempts are redundant (exact duplicates) or mismatched against the catalog, return `422 review_required`.

## Technical Details

### AI Usage Invariant
```typescript
const usage = {
  prompt_tokens: attempt.usage?.prompt_tokens ?? null,
  completion_tokens: attempt.usage?.completion_tokens ?? null,
  total_tokens: attempt.usage?.total_tokens ?? null
};
```

### Redundancy Logic (Conservative)
1. **Rule A**: If `normalizeName(ex1) === normalizeName(ex2)` in the same day -> **REJECT**.
2. **Rule B**: If `family1 === family2` AND `equipment1 === equipment2` AND `class1 === class2` -> **REJECT** (Functional Duplicate).
3. **Rule C** (Removed): 3+ of same family -> **ALLOW**.
