# Plan - AI Routing and Integrity Final Hardening

This plan addresses final integrity issues, ensuring strict technical guardrails, proper taxonomy sharing, protected update flows, and improved observability/metadata for both diet and training agents.

## User Review Required

> [!IMPORTANT]
> - **Unified Taxonomy**: `exerciseClassifier.ts` is the single source of truth for movement patterns. `workoutRedundancy.ts` consumes it.
> - **Invariant Safety**: `createRoutingMetadata` will now enforce that at least one model attempt exists.
> - **Error Observability**: All non-200 responses (422/502/etc.) will include full routing and usage metadata for debugging.
> - **Redundancy Calibration**: "Exact Duplicate" (2x same name) is a hard rejection. "Functional Duplicate" (same pattern + equip) is only a rejection if equivalence is strong after normalization.

## Proposed Changes

### 1. Shared Logic & Invariants
- **AI Router Hardening**: 
    - Update `createRoutingMetadata` to throw an invariant error if `attempts` is empty.
    - Ensure `usage` fields return `null` instead of `0` when data is missing.
- **Taxonomy Integration**: Refactor `exerciseClassifier.ts` to export its core movement pattern logic. Update `workoutRedundancy.ts` to import and use this shared classification.

### 2. Validation & Acceptance (Terra Gate)
- **Pipeline Unification**: Ensure all candidates (Luna, Terra, Technical) flow through `evaluateDietCandidate` and `evaluateWorkoutCandidate` without early returns.
- **Critical Validity (Diet)**: Terra is rejected with a `422 review_required` if it fails `nutrition.ok` or `dailyAdjustments` (when applicable).
- **Critical Validity (Workout)**: Terra is rejected with a `422 review_required` if it fails schema, has critical catalog mismatches, or contains exact duplicates.
- **Redundancy Refinement**: Exact duplicates (2x nominal count) are rejected. Functional duplicates are evaluated conservatively.

### 3. Intent & Prompt Protection
- **Update Intent Safety**: 
    - Confirm `intent === "update"` strictly bypasses all variation-based retries (High Similarity, Portion Only).
    - Sanitize update retry prompts: remove instructions to swap foods/families.
- **Structured Prompt Isolation**: 
    - Split prompts into `*_CORE`, `*_STRUCTURED`, and `*_LEGACY`.
    - JSON responses will strictly exclude Markdown, WhatsApp, or chat-flow instructions.

### 4. Response Metadata
- **Full Traceability**: All error responses will now include `aiRouting`, `aiUsage`, and `validationReasons`.
- **JSON Cleanup**: Remove `raw` content from `invalid_json` error responses for cleaner client-side handling.

## Verification Tasks (PASS/FAIL required)
1. `deno check supabase/functions/_shared/aiModelRouter.ts`
2. `deno check supabase/functions/_shared/workoutRedundancy.ts`
3. `deno check supabase/functions/diet-agent/index.ts`
4. `deno check supabase/functions/trainer-agent/index.ts`
5. `deno test` (new test suite covering all routing scenarios)
6. `npm run build`
