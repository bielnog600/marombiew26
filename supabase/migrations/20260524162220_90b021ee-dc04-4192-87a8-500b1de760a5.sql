ALTER TABLE public.ai_plans 
ADD COLUMN IF NOT EXISTS has_new_checkin BOOLEAN DEFAULT false;

-- Update existing records if needed (optional)
UPDATE public.ai_plans SET has_new_checkin = false WHERE has_new_checkin IS NULL;