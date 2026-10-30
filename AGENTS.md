# Architecture rules

- Bridge completed admin workout reads with the last live snapshot and bounded log retries; the bridge is read-only so student completion and progression remain unchanged.
- Persist precise water totals alongside legacy glass counts through the existing offline-capable daily tracking upsert; nullable totals preserve legacy reads and water goals.
- Keep admin water-feed totals and keyed upserts in the read-only liveActivityWater helper; retain tracking snapshots for realtime events with partial old rows so corrections do not reorder activity.

- Assemble admin activity exercises in the read-only adminActivityExercises helper, matching slots before normalized original/variation names and retaining executed names for history; planned slots stay ordered and unmatched logs stay extra.

- Share Consultoria training raw inputs through one paginated query cache, keeping summary and progression-review calculations separate because their plan selection, phases and session windows differ.
- Use counted pagination for progression history and Consultoria plans/sessions, fetching ordered batches of at most six pages and falling back to sequential reads when counting fails to preserve results without serial latency.

- Keep load learning and per-set recommendations in pure deterministic helpers: all automatic consumers use the quantitative engine, derive summary kg/action from the same maximum-working-load set of the latest execution, and share reference expiry with Consultoria; retain individual prescription targets and final-working-set RIR without changing persistence or timers.

- Isolate official Anthropic prescription calls in `_shared/anthropic.ts`, adapting tools, structured JSON, usage and SSE to existing contracts; keep the OpenAI router and unrelated features unchanged so migrating prescriptions does not migrate assessment or catalog features.
- Disable thinking explicitly at the scanner and prescription Anthropic boundaries so existing output budgets remain available for text/tools; log empty-response metadata without reasoning content and preserve valid tool-only responses.

- Isolate 3D scan loading, geometry and private persistence behind the AI assessment modal's lazy boundary; keep consent/import provenance server-stamped and scan perimeters distinct from visual estimates to avoid changing other assessment flows.
- Keep workout groups and method parameters optional in structured plans; share set-part controls and group transitions between student/admin execution, storing parts in each existing set log while primary columns remain progression inputs.
- Keep quick Cluster/Rest-pause actions and internal deadline controls inside the shared method-series boundary; corrections only update existing sub-records and never trigger completion or restart timers.
- Represent pyramid direction in the exercise method slug and rep targets in the existing per-set scheme; reuse ordinary set logging instead of intra-set sub-records to preserve progression and rest behavior.

- Keep WhatsApp message formatting pure and select persisted variation indices at the notification boundary, keyed by student and plan type; this separates message tests from browser storage and preserves nutrition formatting.
- Keep student exercise load presentation in a pure helper and a controlled empty input, separate from session persistence and progression calculations; historical and recommended loads remain display-only placeholders.
- Render student load history and recommendations through a presentation-only summary card consuming the existing formatted results; visual changes must not affect progression or session persistence.
- Scope visible-viewport height and document scroll locking to the student workout player, with header/footer in flex flow and one internal series scroller; other screens and admin layout remain unchanged.
- Keep admin diet weekday grouping in a read-only wrapper pairing persisted days with markdown meal sections by index; fall back to the unchanged shared renderer when pairing is unsafe, preserving editors and student views.- Store student edits to a published diet in student_diet_overrides (one row per plan, snapshots per day) with trigger-written history in student_diet_override_events; the published plan stays immutable and admin views/corrects edits through this overlay.
- Key student exercise-variation preferences by exercise plus variation name (local and backend); legacy or mismatched preferences fall back to the original so the player header always shows the active exercise.
- Derive workout session names from the same effective variation identity as the player and flush toggles immediately with unchanged slots/sets; recovery logs and admin history must follow the executed name.
- Share inline inter-set rest presentation and deadline-based control across student and admin players; persist by session/student and keep group transitions and internal method pauses separate to preserve execution history and progression.
- Render exercise media in training cards through the shared ExerciseMediaFrame, which resolves `video_embed` with `safeVideoSrc`; never bind the stored embed HTML straight to a src, because a value that is not a known video URL would load the app's own pages inside the player.
- Read empty workout days safely and ignore absent exercise slots when building execution blocks without renumbering session indices; incomplete groups render as standalone exercises so saved logs remain attached to their original slots.
- Edit workout groups inside the admin TrainerLogSheet via groupExercisesByIndex (index-based, returns an orderMap to remap set state so logged sets are never lost) and the shared ExerciseStructureEditor used by both single-exercise and group editing; metodo_params stays a partial schema because each method persists only its own keys.
- Trainer-agent validation failures use one targeted correction (first candidate + violations, only changed days merged by id/label) and re-run every gate; prompt caching marks only byte-stable prefixes (instructions + catalog + output rules) before student data, so cost drops without changing prompts or validations.
- Keep the admin dashboard live-activity detail read-only in LiveActivityDetailDialog, reading live workouts from workout_sessions.session_state and finished ones from exercise_set_logs; resolve meals in adminActivityMeals and exercise history/PR in adminExerciseProgress without plan/day filtering, excluding preparation and comparing method primary parts; use a definite modal height and min-h-0 scroller to preserve painting and student persistence.
- Place the activity dialog's close control inside that dialog, offset below the safe area with a 44px touch target, and hide the Dialog's built-in close there only; the shared Dialog stays untouched so other modals keep their current control.
