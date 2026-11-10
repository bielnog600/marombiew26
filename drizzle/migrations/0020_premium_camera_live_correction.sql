ALTER TABLE public.students_profile
  ADD COLUMN IF NOT EXISTS premium_camera boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students_profile.premium_camera IS 'Premium: libera a Correção ao vivo com câmera. Só admin altera.';

-- Defesa extra: só admin (ou serviço sem usuário) muda premium_camera.
CREATE OR REPLACE FUNCTION public.guard_premium_camera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.premium_camera THEN
    RAISE EXCEPTION 'premium_camera só pode ser alterado pelo admin';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.premium_camera IS DISTINCT FROM OLD.premium_camera THEN
    RAISE EXCEPTION 'premium_camera só pode ser alterado pelo admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_premium_camera ON public.students_profile;
CREATE TRIGGER guard_premium_camera
  BEFORE INSERT OR UPDATE ON public.students_profile
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_camera();

CREATE OR REPLACE FUNCTION public.has_premium_camera(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.students_profile
      WHERE user_id = _user_id AND premium_camera = true
    )
$$;

CREATE TABLE IF NOT EXISTS public.camera_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  exercise_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  total_reps integer NOT NULL DEFAULT 0,
  complete_reps integer NOT NULL DEFAULT 0,
  incomplete_reps integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '{}'::jsonb,
  camera_side text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS camera_sessions_student_created_idx
  ON public.camera_sessions (student_id, created_at DESC);

GRANT SELECT, INSERT ON public.camera_sessions TO authenticated;
GRANT ALL ON public.camera_sessions TO service_role;

ALTER TABLE public.camera_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Premium users insert own camera sessions"
  ON public.camera_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id AND public.has_premium_camera(auth.uid()));

CREATE POLICY "Users read own camera sessions"
  ON public.camera_sessions FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Admins read all camera sessions"
  ON public.camera_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete camera sessions"
  ON public.camera_sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT DELETE ON public.camera_sessions TO authenticated;