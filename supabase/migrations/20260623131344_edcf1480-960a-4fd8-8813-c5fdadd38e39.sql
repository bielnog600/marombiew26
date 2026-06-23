
ALTER TABLE public.diet_decision_applications
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_generation',
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

ALTER TABLE public.diet_decision_applications
  DROP CONSTRAINT IF EXISTS diet_decision_applications_status_check;

ALTER TABLE public.diet_decision_applications
  ADD CONSTRAINT diet_decision_applications_status_check
  CHECK (status IN ('pending_generation','completed','failed','dismissed'));

CREATE INDEX IF NOT EXISTS idx_ddapp_status
  ON public.diet_decision_applications(status, applied_at DESC);
