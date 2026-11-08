# Student components
- Admin Treinos tab resolves the week badge and the inline periodization strip/details from one resolveCurrentTrainingPhase call (unsaved edits included), reusing periodization_snapshot.week only for that same week, so badge, strip and PlanAdherence never disagree.
