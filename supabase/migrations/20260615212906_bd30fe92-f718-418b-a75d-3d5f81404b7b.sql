ALTER TABLE public.exercise_execution_videos
  ADD CONSTRAINT exercise_execution_videos_student_session_exercise_key
  UNIQUE (student_id, workout_session_id, exercise_name);