# Plan: Telemetry V1 Hardening & Final Audit

Fix critical idempotency and logical issues in the training telemetry system (V1), ensure proper Duo mode student B recovery, and implement the telemetry summary dashboard.

## 1. Duo Idempotency & Partial Failure Recovery
- Refactor student B session creation in `AdminTrainerSessionContext.tsx` to a "Find or Create" pattern.
- Ensure that logs reassociation and snapshot canonicalization (with student B's definitive `sessionId`) always run, even if the session already exists from a previous attempt.
- Add robust error handling to block clearing the active session and showing success messages if critical Duo steps fail.

## 2. Telemetry Engine Logical Hardening (`progressionTelemetry.ts`)
- **Partial Increase Correction**: Require a real load increase (beyond float tolerance) to classify as `partial`. Same-load vs. recommendation remains `different`.
- **Missing Data Handling**:
    - `weightKg = null` → `not_evaluable` (reason: `missing_load_for_alignment`).
    - `currentLoadKg = null` → `not_evaluable` (reason: `missing_current_load`).
- **Aggregated Outcome Policy**:
    - All eval matched → `matched`.
    - Some matched + some not_evaluable → `matched` (low confidence).
    - Any different → `different`.
    - Partial without different → `partial`.
- **Telemetry Status**: Implement `buildProgressionSessionTelemetry` returning structured statuses like `invalid_snapshot_version`, `snapshot_session_mismatch`, or `available`.

## 3. Summary & Analytics Engine
- Implement `buildProgressionTelemetrySummary` in `progressionTelemetry.ts` calculating KPIs:
    - `alignmentRate`: `matched / (matched + partial + different)`
    - `fullOrPartialAlignmentRate`: `(matched + partial) / (matched + partial + different)`
    - `executionCoverage`: `recsWithExecution / recsShown`
    - `targetAchievementRate`: `achieved / (achieved + partially_achieved + not_achieved)`
- Exclude Deload, invalid snapshots, and `no_execution` from KPI denominators.

## 4. Admin UI & Hook Integration
- Create `useProgressionTelemetry` hook for batch fetching (30-day window, zero N+1).
- Add "Progression Analytics" card to `StudentTrainingTab.tsx` with high-level KPIs.
- Implement a detailed "View Details" sheet for auditing specific session outcomes.

## 5. Persistence Hardening (`TreinoExecucao.tsx`)
- Ensure `plan_id` is persisted in all session creation/resume flows.
- Freeze the training phase upon session resumption to prevent mid-session phase shifts.
- Preserve existing snapshots during completion to prevent data loss on transient failures.

## Technical Details
- Gram-based tolerance (`LOAD_FLOAT_TOLERANCE_KG = 0.05`).
- Batch queries for performance: `workout_sessions` (filtered by student/completed/date) + `exercise_set_logs` (filtered by student/session/date).
- Extensive test suite covering 52+ real-world scenarios across engine, Duo, and UI layers.
