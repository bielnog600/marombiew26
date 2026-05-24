-- Add columns for refined frequency analysis
ALTER TABLE public.workout_renewal_analysis 
ADD COLUMN IF NOT EXISTS frequency_adjustment_data JSONB,
ADD COLUMN IF NOT EXISTS alternatives_considered TEXT[];

COMMENT ON COLUMN public.workout_renewal_analysis.frequency_adjustment_data IS 'Detailed data about frequency adjustment decisions (reason, category, etc)';
COMMENT ON COLUMN public.workout_renewal_analysis.alternatives_considered IS 'List of alternatives considered by the IA before suggesting frequency reduction';