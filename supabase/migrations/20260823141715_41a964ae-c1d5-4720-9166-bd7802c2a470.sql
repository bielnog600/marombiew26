CREATE UNIQUE INDEX IF NOT EXISTS uniq_exercise_set_logs_session_set
  ON public.exercise_set_logs (session_id, student_id, exercise_name, set_number)
  WHERE session_id IS NOT NULL;