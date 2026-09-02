ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS periodization_model text,
  ADD COLUMN IF NOT EXISTS periodization_reason text,
  ADD COLUMN IF NOT EXISTS macrocycle_weeks integer,
  ADD COLUMN IF NOT EXISTS block_type text,
  ADD COLUMN IF NOT EXISTS block_number integer,
  ADD COLUMN IF NOT EXISTS block_total integer,
  ADD COLUMN IF NOT EXISTS block_start_date date,
  ADD COLUMN IF NOT EXISTS block_end_date date,
  ADD COLUMN IF NOT EXISTS next_block_type text,
  ADD COLUMN IF NOT EXISTS periodization_snapshot jsonb;

COMMENT ON COLUMN public.ai_plans.periodization_model IS 'linear | ondulatoria | blocos | concorrente | linear_reversa | trifasica | legacy (NULL = legacy)';
COMMENT ON COLUMN public.ai_plans.periodization_snapshot IS 'Snapshot resolvido pelo periodization resolver no momento da geracao (modelo + bloco + estrategia da semana).';