
ALTER TABLE public.students_profile
  ADD COLUMN IF NOT EXISTS low_cost boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS low_cost_review_interval_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS low_cost_last_review_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS low_cost_next_review_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_students_profile_low_cost
  ON public.students_profile (low_cost) WHERE low_cost = true;

CREATE INDEX IF NOT EXISTS idx_ai_plans_low_cost_next_review
  ON public.ai_plans (low_cost_next_review_at)
  WHERE is_draft = false;
