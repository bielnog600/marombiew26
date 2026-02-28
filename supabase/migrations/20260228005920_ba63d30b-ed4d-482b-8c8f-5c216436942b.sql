
-- Add missing columns to posture_scans for overrides and attention points
ALTER TABLE public.posture_scans
  ADD COLUMN IF NOT EXISTS overrides_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attention_points_json jsonb DEFAULT '[]'::jsonb;
