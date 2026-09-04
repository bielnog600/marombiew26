CREATE TABLE public.workout_prescription_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  plan_version integer NULL,
  cycle_key text NULL,
  source text NOT NULL,
  action_origin text NOT NULL DEFAULT 'manual',
  before_json jsonb NOT NULL,
  after_json jsonb NOT NULL,
  changes jsonb NOT NULL,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  exclude_from_profile boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_prescription_edits_source_check
    CHECK (source IN ('manual_plan_editor', 'manual_training_mode', 'manual_renewal_review')),
  CONSTRAINT workout_prescription_edits_origin_check
    CHECK (action_origin IN ('manual', 'ai_assisted', 'mixed'))
);

CREATE INDEX idx_wpe_professor ON public.workout_prescription_edits (professor_id, created_at DESC);
CREATE INDEX idx_wpe_student ON public.workout_prescription_edits (student_id, created_at DESC);
CREATE INDEX idx_wpe_plan ON public.workout_prescription_edits (plan_id, created_at DESC);
CREATE INDEX idx_wpe_created_at ON public.workout_prescription_edits (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.workout_prescription_edits TO authenticated;
GRANT ALL ON public.workout_prescription_edits TO service_role;

ALTER TABLE public.workout_prescription_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read prescription edits"
ON public.workout_prescription_edits FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can record their own prescription edits"
ON public.workout_prescription_edits FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND professor_id = auth.uid());

CREATE POLICY "Admins can only flag exclusion"
ON public.workout_prescription_edits FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.workout_prescription_edits_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.professor_id := OLD.professor_id;
  NEW.student_id := OLD.student_id;
  NEW.plan_id := OLD.plan_id;
  NEW.plan_version := OLD.plan_version;
  NEW.cycle_key := OLD.cycle_key;
  NEW.source := OLD.source;
  NEW.action_origin := OLD.action_origin;
  NEW.before_json := OLD.before_json;
  NEW.after_json := OLD.after_json;
  NEW.changes := OLD.changes;
  NEW.context_snapshot := OLD.context_snapshot;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wpe_immutable
BEFORE UPDATE ON public.workout_prescription_edits
FOR EACH ROW EXECUTE FUNCTION public.workout_prescription_edits_immutable();