# Architecture rules

- Keep WhatsApp message formatting pure and select persisted variation indices at the notification boundary, keyed by student and plan type; this separates message tests from browser storage and preserves nutrition formatting.
- Keep student exercise load presentation in a pure helper and a controlled empty input, separate from session persistence and progression calculations; historical and recommended loads remain display-only placeholders.
- Render student load history and recommendations through a presentation-only summary card consuming the existing formatted results; visual changes must not affect progression or session persistence.
- Scope visible-viewport height and document scroll locking to the student workout player, with header/footer in flex flow and one internal series scroller; other screens and admin layout remain unchanged.
- Keep admin diet weekday grouping in a read-only wrapper pairing persisted days with markdown meal sections by index; fall back to the unchanged shared renderer when pairing is unsafe, preserving editors and student views.- Store student edits to a published diet in student_diet_overrides (one row per plan, snapshots per day) with trigger-written history in student_diet_override_events; the published plan stays immutable and admin views/corrects edits through this overlay.
