-- Periodização semanal: adiciona fase ao plano de treino
ALTER TABLE public.ai_plans 
  ADD COLUMN IF NOT EXISTS fase text NOT NULL DEFAULT 'semana_1',
  ADD COLUMN IF NOT EXISTS fase_inicio_data date;

-- Validação dos valores permitidos
ALTER TABLE public.ai_plans DROP CONSTRAINT IF EXISTS ai_plans_fase_check;
ALTER TABLE public.ai_plans 
  ADD CONSTRAINT ai_plans_fase_check 
  CHECK (fase IN ('semana_1', 'semana_2', 'semana_3', 'deload'));

CREATE INDEX IF NOT EXISTS idx_ai_plans_student_tipo_fase 
  ON public.ai_plans(student_id, tipo, fase);