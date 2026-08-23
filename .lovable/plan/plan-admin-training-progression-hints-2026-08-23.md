# Plan: Admin Training Progression Hints

Integrate the quantitative training progression engine into the Admin Trainer session flow, providing coaches with the same AI-driven recommendations that students see.

## User Review Required

> [!IMPORTANT]
> - The progression hints are advisory only and do not automatically fill inputs.
> - Recommendations are based on a snapshot taken at the start of the session to ensure stability.
> - Deload weeks will show recovery-focused guidance instead of aggressive progression.

## Proposed Changes

### 1. Reusable Engine Integration
- **`useSessionProgression` Hook**: Re-use this hook in the admin flow to fetch and snapshot progression data in batch.
- **`ProgressionHintCard` Enhancement**: Add a `variant="compact"` prop to allow seamless embedding inside the admin `ExerciseLogCard` without breaking the layout.

### 2. Admin Context & Flow
- **`AdminTrainerSessionContext`**: 
    - Ensure `plan_id` and `phase` are correctly persisted when starting a session.
    - Persist `progressionRecommendations` (the snapshot) in the `session_state` to allow session resumption (Retomada).
- **`TrainerLogSheet`**: 
    - Initialize the `useSessionProgression` hook using the student ID, session ID, and the exercises list.
    - Pass down the recommendations from the snapshot to each exercise card.

### 3. UI Implementation
- **`ExerciseLogCard`**: 
    - Display the `ProgressionHintCard` (compact variant) between the prescription info and the set inputs.
    - Ensure it is only shown for exercises present in the snapshot (preventing "hallucinated" hints for manually added/swapped exercises that lack history).
- **`ProgressionHintCard`**: 
    - Adjust styles for the compact variant to fit within the constrained space of the admin sheet.

## Technical Details

- **Snapshot Logic**: The admin session will use the `workout_session.session_state` to store `progressionRecommendations`. If the coach closes and re-opens the sheet, the same recommendations will persist.
- **Phase Identity**: Uses the central `resolveCurrentTrainingPhase` logic via `AdminTrainerSessionContext` to ensure phase consistency.
- **Zero N+1**: Batch fetching is maintained by calling the hook once at the `TrainerLogSheet` level.
- **Bodyweight Handling**: Reuses the logic to prevent showing "0 kg" for bodyweight exercises.
