-- Add new columns to diet_renewal_analysis for richer insights
ALTER TABLE public.diet_renewal_analysis 
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
ADD COLUMN IF NOT EXISTS confidence_score FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS decision_type TEXT DEFAULT 'manter' CHECK (decision_type IN ('manter', 'ajustar', 'nova_dieta', 'solicitar_dados'));

-- Update existing records with default decision_type based on suggested_action
UPDATE public.diet_renewal_analysis 
SET decision_type = suggested_action 
WHERE decision_type IS NULL;

UPDATE public.diet_renewal_analysis 
SET decision_type = 'nova_dieta' 
WHERE suggested_action = 'gerar_nova';

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_diet_renewal_analysis_decision ON public.diet_renewal_analysis(decision_type);
CREATE INDEX IF NOT EXISTS idx_diet_renewal_analysis_priority ON public.diet_renewal_analysis(priority);
