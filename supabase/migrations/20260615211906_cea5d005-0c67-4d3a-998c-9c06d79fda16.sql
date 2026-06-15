CREATE TABLE IF NOT EXISTS public.exercise_execution_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  workout_session_id uuid NULL,
  plan_id uuid NULL,
  exercise_id uuid NULL,
  exercise_name text NOT NULL,
  cf_uid text NOT NULL,
  playback_url text NOT NULL,
  thumbnail_url text NULL,
  duration_seconds integer NULL,
  status text NOT NULL DEFAULT 'pending_review',
  admin_note text NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exercise_execution_videos_unique_per_session
  ON public.exercise_execution_videos (student_id, workout_session_id, exercise_name)
  WHERE workout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS exercise_execution_videos_student_created
  ON public.exercise_execution_videos (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS exercise_execution_videos_status
  ON public.exercise_execution_videos (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_execution_videos TO authenticated;
GRANT ALL ON public.exercise_execution_videos TO service_role;

ALTER TABLE public.exercise_execution_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students and admins view videos"
  ON public.exercise_execution_videos FOR SELECT
  TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students insert own videos"
  ON public.exercise_execution_videos FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students and admins update videos"
  ON public.exercise_execution_videos FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students and admins delete videos"
  ON public.exercise_execution_videos FOR DELETE
  TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_exercise_execution_videos_updated_at
  BEFORE UPDATE ON public.exercise_execution_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();