DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'exercise_set_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exercise_set_logs;
  END IF;
END
$$;

ALTER TABLE public.daily_tracking
  ADD COLUMN IF NOT EXISTS water_ml integer DEFAULT NULL;