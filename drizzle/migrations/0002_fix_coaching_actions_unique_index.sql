DROP INDEX IF EXISTS public.weekly_training_coaching_actions_unique_idx;
CREATE UNIQUE INDEX weekly_training_coaching_actions_unique_idx
  ON public.weekly_training_coaching_actions (admin_id, student_id, week_start, exercise_name);