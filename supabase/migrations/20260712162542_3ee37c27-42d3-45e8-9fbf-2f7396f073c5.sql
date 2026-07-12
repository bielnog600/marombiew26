
ALTER TABLE public.exercise_metadata_ground_truth
  DROP CONSTRAINT IF EXISTS exercise_metadata_ground_truth_status_check;
ALTER TABLE public.exercise_metadata_ground_truth
  ADD CONSTRAINT exercise_metadata_ground_truth_status_check
  CHECK (status = ANY (ARRAY['draft','reviewed','draft_benchmark','human_review_draft','human_first_review','human_safety_review','adjudicated','finalized','superseded']));

CREATE UNIQUE INDEX IF NOT EXISTS emgt_reviewer_version_uniq
  ON public.exercise_metadata_ground_truth (exercise_id, reviewer_id, reviewer_kind, review_version);

CREATE INDEX IF NOT EXISTS emgt_pilot_kind_idx
  ON public.exercise_metadata_ground_truth (pilot_selection_id, reviewer_kind, status);
