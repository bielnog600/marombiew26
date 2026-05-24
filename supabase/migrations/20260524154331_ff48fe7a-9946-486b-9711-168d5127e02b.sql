-- Add metadata and control fields to workout_checkins
ALTER TABLE public.workout_checkins 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'manual';

-- Add metadata and control fields to diet_checkins
ALTER TABLE public.diet_checkins 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'manual';

-- Add flag to ai_plans to track pending checkin for banner display
-- This avoids querying the checkins table on every app load
ALTER TABLE public.ai_plans 
ADD COLUMN IF NOT EXISTS pending_checkin BOOLEAN DEFAULT false;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_plans_pending_checkin ON public.ai_plans(student_id, pending_checkin) WHERE pending_checkin = true;
