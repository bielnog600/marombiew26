
ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS draft_source TEXT,
  ADD COLUMN IF NOT EXISTS draft_reason TEXT,
  ADD COLUMN IF NOT EXISTS draft_analysis_id UUID;
