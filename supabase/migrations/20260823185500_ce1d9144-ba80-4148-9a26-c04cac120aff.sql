GRANT SELECT, INSERT, UPDATE, DELETE ON public.diet_checkins TO authenticated;
GRANT ALL ON public.diet_checkins TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_checkins TO authenticated;
GRANT ALL ON public.workout_checkins TO service_role;
REVOKE ALL ON public.diet_checkins FROM anon;
REVOKE ALL ON public.workout_checkins FROM anon;