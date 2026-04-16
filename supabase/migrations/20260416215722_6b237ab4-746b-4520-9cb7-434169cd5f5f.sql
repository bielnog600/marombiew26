-- Create workout_sessions table to record completed workout durations
CREATE TABLE public.workout_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  plan_id UUID,
  day_name TEXT,
  phase TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  exercises_completed INTEGER NOT NULL DEFAULT 0,
  total_exercises INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own workout_sessions"
ON public.workout_sessions
FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Students insert own workout_sessions"
ON public.workout_sessions
FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admin manage workout_sessions"
ON public.workout_sessions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_workout_sessions_student ON public.workout_sessions(student_id, completed_at DESC);