-- Add adjustments config to exercises (array of field names)
ALTER TABLE public.exercises
ADD COLUMN IF NOT EXISTS ajustes text[] DEFAULT '{}'::text[];

-- Table to store per-student per-exercise adjustment values
CREATE TABLE IF NOT EXISTS public.student_exercise_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  valores jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, exercise_id)
);

ALTER TABLE public.student_exercise_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own adjustments select"
ON public.student_exercise_adjustments FOR SELECT
USING (auth.uid() = student_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students insert own adjustments"
ON public.student_exercise_adjustments FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own adjustments"
ON public.student_exercise_adjustments FOR UPDATE
USING (auth.uid() = student_id);

CREATE POLICY "Admin manage adjustments"
ON public.student_exercise_adjustments FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_student_exercise_adjustments_updated_at
BEFORE UPDATE ON public.student_exercise_adjustments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();