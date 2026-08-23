CREATE TABLE public.student_load_increments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  exercise_key text NOT NULL,
  exercise_name text NOT NULL,
  exercise_id uuid NULL REFERENCES public.exercises(id) ON DELETE SET NULL,
  increment_kg numeric(6,3) NOT NULL CHECK (increment_kg > 0 AND increment_kg <= 50),
  note text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, exercise_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_load_increments TO authenticated;
GRANT ALL ON public.student_load_increments TO service_role;

ALTER TABLE public.student_load_increments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own load increments"
ON public.student_load_increments FOR SELECT
TO authenticated
USING (auth.uid() = student_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage load increments"
ON public.student_load_increments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_student_load_increments_updated_at
BEFORE UPDATE ON public.student_load_increments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_student_load_increments_student ON public.student_load_increments (student_id);