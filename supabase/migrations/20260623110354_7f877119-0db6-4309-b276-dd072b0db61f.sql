
ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS diet_strategy text,
  ADD COLUMN IF NOT EXISTS strategy_source text CHECK (strategy_source IN ('ai','manual')),
  ADD COLUMN IF NOT EXISTS supplementation jsonb,
  ADD COLUMN IF NOT EXISTS viability_score numeric,
  ADD COLUMN IF NOT EXISTS viability_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS generation_intent text CHECK (generation_intent IN ('new','regenerate','update'));

COMMENT ON COLUMN public.ai_plans.diet_strategy IS 'balanced | low_carb | high_carb | carb_cycling | intermittent_fasting | refeed_enabled';
COMMENT ON COLUMN public.ai_plans.generation_intent IS 'new = nova dieta, regenerate = variacao real de cardapio, update = ajuste preservando base';
COMMENT ON COLUMN public.ai_plans.supplementation IS 'Array de {name, useful, category, dose, timing, reason}';
COMMENT ON COLUMN public.ai_plans.viability_breakdown IS 'Composicao do score 0..100: adherence, practicality, cost, complexity, familiarity';
