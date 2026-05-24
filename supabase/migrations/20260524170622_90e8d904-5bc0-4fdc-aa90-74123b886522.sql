-- 1. Adicionar campos estruturados na tabela ai_plans
ALTER TABLE public.ai_plans 
ADD COLUMN IF NOT EXISTS conteudo_json JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS migration_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'manual_fix_needed'
ADD COLUMN IF NOT EXISTS migration_error TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_migration_attempt TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Criar índice para performance em consultas estruturadas
CREATE INDEX IF NOT EXISTS idx_ai_plans_migration_status ON public.ai_plans(migration_status);

-- 3. Comentários para documentação do esquema
COMMENT ON COLUMN public.ai_plans.conteudo_json IS 'Estrutura JSON do plano (treino ou dieta) para processamento da IA e UI dinâmica';
COMMENT ON COLUMN public.ai_plans.migration_status IS 'Status da transição do formato MD para JSON estruturado';

-- 4. Garantir que as permissões RLS existentes se apliquem aos novos campos (automático no Postgres)
-- Não é necessário recriar as políticas pois elas são por linha, não por coluna.

-- Exemplo de estrutura JSON esperada para Treinos (Mapeamento):
/*
{
  "version": "1.0",
  "type": "workout",
  "metadata": {
    "goal": "Hypertrophy",
    "frequency": 5
  },
  "sessions": [
    {
      "id": "session_a",
      "name": "Treino A - Peito e Tríceps",
      "exercises": [
        {
          "exercise_id": "uuid",
          "name": "Supino Reto",
          "sets": 4,
          "reps": "8-12",
          "rest": "60s",
          "notes": "Foco na cadência"
        }
      ]
    }
  ]
}
*/
