# Architecture rules

- Isolate 3D scan loading, geometry and private persistence behind the AI assessment modal's lazy boundary; keep consent/import provenance server-stamped and scan perimeters distinct from visual estimates to avoid changing other assessment flows.
- Keep workout groups and method parameters optional in structured plans; share set-part controls and group transitions between student/admin execution, storing parts in each existing set log while primary columns remain progression inputs.

- Keep WhatsApp message formatting pure and select persisted variation indices at the notification boundary, keyed by student and plan type; this separates message tests from browser storage and preserves nutrition formatting.
- Keep student exercise load presentation in a pure helper and a controlled empty input, separate from session persistence and progression calculations; historical and recommended loads remain display-only placeholders.
- Render student load history and recommendations through a presentation-only summary card consuming the existing formatted results; visual changes must not affect progression or session persistence.
- Scope visible-viewport height and document scroll locking to the student workout player, with header/footer in flex flow and one internal series scroller; other screens and admin layout remain unchanged.
- Keep admin diet weekday grouping in a read-only wrapper pairing persisted days with markdown meal sections by index; fall back to the unchanged shared renderer when pairing is unsafe, preserving editors and student views.- Store student edits to a published diet in student_diet_overrides (one row per plan, snapshots per day) with trigger-written history in student_diet_override_events; the published plan stays immutable and admin views/corrects edits through this overlay.
- Key student exercise-variation preferences by exercise plus variation name (local and backend); legacy or mismatched preferences fall back to the original so the player header always shows the active exercise.
- Share inline inter-set rest presentation and deadline-based control across student and admin players; persist by session/student and keep group transitions and internal method pauses separate to preserve execution history and progression.
