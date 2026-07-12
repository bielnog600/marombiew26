
CREATE TABLE public.exercise_metadata_ground_truth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_selection_id text NOT NULL,
  classifier_run_id uuid,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  reviewed_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_review_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id uuid,
  reviewer_kind text NOT NULL DEFAULT 'human',
  reviewed_at timestamptz,
  review_version integer NOT NULL DEFAULT 1,
  comparison_revealed_at timestamptz,
  adjudication_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  adjudicated_at timestamptz,
  adjudicator_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','adjudicated','finalized','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX exercise_metadata_ground_truth_active_uidx
  ON public.exercise_metadata_ground_truth (exercise_id, classifier_run_id)
  WHERE status <> 'superseded';

CREATE INDEX exercise_metadata_ground_truth_run_idx
  ON public.exercise_metadata_ground_truth (classifier_run_id);

GRANT SELECT, INSERT, UPDATE ON public.exercise_metadata_ground_truth TO authenticated;
GRANT ALL ON public.exercise_metadata_ground_truth TO service_role;

ALTER TABLE public.exercise_metadata_ground_truth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all ground truth"
  ON public.exercise_metadata_ground_truth FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert ground truth"
  ON public.exercise_metadata_ground_truth FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update ground truth"
  ON public.exercise_metadata_ground_truth FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER exercise_metadata_ground_truth_updated_at
  BEFORE UPDATE ON public.exercise_metadata_ground_truth
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
