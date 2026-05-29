-- Adicionar colunas opcionais para estrutura da sessão
ALTER TABLE public.ai_plans 
ADD COLUMN IF NOT EXISTS mobility_count INTEGER,
ADD COLUMN IF NOT EXISTS main_exercises_count INTEGER;

-- Comentários para documentação
COMMENT ON COLUMN public.ai_plans.mobility_count IS 'Quantidade desejada de exercícios de mobilidade na sessão (NULL para automático)';
COMMENT ON COLUMN public.ai_plans.main_exercises_count IS 'Quantidade desejada de exercícios principais na sessão (NULL para automático)';
