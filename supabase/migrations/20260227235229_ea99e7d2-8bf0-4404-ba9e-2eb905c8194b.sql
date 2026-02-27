ALTER TABLE public.anthropometrics 
ADD COLUMN antebraco_esquerdo numeric NULL,
ADD COLUMN ombro numeric NULL;

COMMENT ON COLUMN public.anthropometrics.antebraco IS 'Antebraço Direito (contraído)';
COMMENT ON COLUMN public.anthropometrics.antebraco_esquerdo IS 'Antebraço Esquerdo (contraído)';
COMMENT ON COLUMN public.anthropometrics.ombro IS 'Ombro';