
-- Idempotent additive migration for workout_sessions
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone;

-- Backfill updated_at where it might equal default for old rows: align with created_at
UPDATE public.workout_sessions
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

-- Ensure update trigger exists (reuses existing public.update_updated_at function)
DROP TRIGGER IF EXISTS set_workout_sessions_updated_at ON public.workout_sessions;
CREATE TRIGGER set_workout_sessions_updated_at
BEFORE UPDATE ON public.workout_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
