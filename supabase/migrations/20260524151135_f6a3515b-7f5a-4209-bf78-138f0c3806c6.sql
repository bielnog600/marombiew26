-- Add new columns to workout_renewal_analysis for richer insights
ALTER TABLE public.workout_renewal_analysis 
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
ADD COLUMN IF NOT EXISTS confidence_score FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS decision_type TEXT DEFAULT 'manter' CHECK (decision_type IN ('manter', 'ajustar', 'trocar_exercicios', 'deload', 'renovar_bloco', 'solicitar_dados')),
ADD COLUMN IF NOT EXISTS summary_reason TEXT,
ADD COLUMN IF NOT EXISTS volume_analysis JSONB DEFAULT '{}'::jsonb;

-- Update existing records with default decision_type based on suggested_action if available
-- Note: workout_renewal_analysis might use different column names for suggested action, checking previous context
-- Based on the user's description, it uses 'suggested_action'.
UPDATE public.workout_renewal_analysis 
SET decision_type = 'manter' 
WHERE decision_type IS NULL;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_workout_renewal_analysis_decision ON public.workout_renewal_analysis(decision_type);
CREATE INDEX IF NOT EXISTS idx_workout_renewal_analysis_priority ON public.workout_renewal_analysis(priority);
