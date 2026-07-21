ALTER TABLE public.daily_tracking REPLICA IDENTITY FULL;
ALTER TABLE public.workout_sessions REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_tracking;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workout_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;