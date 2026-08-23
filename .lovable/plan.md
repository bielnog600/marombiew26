# Plan - AI Routing and Integrity Hardening (Final Version)

This plan finalizes the AI routing and validation architecture, ensuring strict adherence to technical guardrails, proper taxonomy sharing, and protection of the `update` intent.

## User Review Required

> [!IMPORTANT]
> - **Unified Taxonomy**: `exerciseClassifier.ts` is now the single source of truth for movement patterns. `workoutRedundancy.ts` consumes this taxonomy.
> - **Strict 2-Call Limit**: Maximum of 2 model calls (Luna + optional Terra). No third calls.
> - **Critical Validity**: Terra attempts are rejected with a `422 review_required` if they fail critical checks (Nutrition/Adjustments for Diet; Catalog/Redundancy for Workout).
> - **Structured Prompt Isolation**: Core prompts are strictly separated from structured output instructions to prevent leaked formatting (Markdown/WhatsApp) in JSON responses.

## Proposed Changes

### 1. Taxonomy & Redundancy
- **Centralized Taxonomy**: Refactor `exerciseClassifier.ts` to export its `MOVEMENT_PATTERNS` and token logic. `workoutRedundancy.ts` will import these to classify exercises, ensuring functional consistency.
- **Conservative Redundancy**:
    - **Exact Duplicate**: `count >= 2` of the same normalized name in a day triggers a rejection.
    - **Functional Duplicate**: Redundancy is flagged only when there is strong evidence (matching movement pattern AND equipment/class).

### 2. Validation Pipelines & Criticality
- **Unified Evaluation**: Luna, Terra, and Technical fallbacks all pass through `evaluateDietCandidate` or `evaluateWorkoutCandidate` with **no early returns**.
- **Critical Acceptance (Diet)**: Terra is accepted ONLY if `nutrition.ok === true` and `dailyAdjustments` are valid (if schedule exists). Otherwise, return `422 review_required`.
- **Critical Acceptance (Workout)**: Terra must pass schema, catalog (main exercises), and redundancy (no exact duplicates). Critical mismatches trigger `422 review_required`.

### 3. Intent Protection (`intent === "update"`)
- **Variation Protection**: Re-verify that `similarity.score > threshold`, `isPortionOnly`, and other variation-only failures are strictly protected by `variationRetryAllowed && intent !== "update"`.
- **Prompt Sanitization**: Ensure the retry prompt for updates excludes instructions to swap foods or families.

### 4. Prompt Engineering & Formatting
- **Prompt Separation**: Split system prompts into `*_CORE_PROMPT` (knowledge), `*_STRUCTURED_PROMPT` (JSON format), and `*_LEGACY_PROMPT` (chat context).
- **JSON Integrity**: Strictly exclude Markdown tables, WhatsApp formatting, and "one question at a time" instructions from the `STRUCTURED` prompt.

### 5. Metadata & Usage
- **Usage Invariants**: Missing usage data stays `null` (no transformation to 0).
- **Routing Observability**: `createRoutingMetadata` will always reflect the exact model path taken.

## Technical Details

### Movement Pattern Sharing
```typescript
// Shared module for movement pattern detection
export const MOVEMENT_PATTERNS = [...];
export function getPattern(name: string) { ... }
```

### Critical Acceptance Logic
```typescript
const isCriticallyValid = agent === 'diet' 
  ? (nut.ok && (hasSchedule ? adj.ok : true))
  : (red.ok && !hasCriticalCatalogMismatch);

if (!isCriticallyValid) return respond422(reasons);
```
