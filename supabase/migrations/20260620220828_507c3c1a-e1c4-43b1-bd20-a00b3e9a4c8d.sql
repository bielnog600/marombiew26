ALTER TABLE public.workout_sessions ALTER COLUMN completed_at DROP NOT NULL;
NOTIFY pgrst, 'reload schema';