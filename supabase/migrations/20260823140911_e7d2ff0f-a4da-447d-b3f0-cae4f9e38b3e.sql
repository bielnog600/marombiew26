ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS completion_source text,
  ADD COLUMN IF NOT EXISTS completion_score numeric;

CREATE INDEX IF NOT EXISTS idx_workout_sessions_student_status
  ON public.workout_sessions (student_id, status, last_active_at);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_student_completed_at
  ON public.workout_sessions (student_id, completed_at);