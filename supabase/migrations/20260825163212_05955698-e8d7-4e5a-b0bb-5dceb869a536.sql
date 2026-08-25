DROP INDEX IF EXISTS public.uniq_exercise_set_logs_session_set;

CREATE UNIQUE INDEX uniq_exercise_set_logs_session_set
  ON public.exercise_set_logs (session_id, student_id, exercise_name, set_number);