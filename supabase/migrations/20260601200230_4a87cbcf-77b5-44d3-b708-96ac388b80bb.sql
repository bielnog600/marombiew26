ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid,
  ADD COLUMN IF NOT EXISTS started_at_real timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at_real timestamptz;

CREATE INDEX IF NOT EXISTS idx_workout_sessions_calendar_event
  ON public.workout_sessions (calendar_event_id);