
-- Adicionar suporte a sessões de treino em andamento
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_state jsonb;

-- Índice para buscar sessão em andamento do aluno rapidamente
CREATE INDEX IF NOT EXISTS workout_sessions_student_in_progress_idx
  ON public.workout_sessions (student_id, started_at DESC)
  WHERE status = 'in_progress';

-- Permitir UPDATE pelo próprio aluno (necessário para finalizar/abandonar e salvar estado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workout_sessions'
      AND policyname = 'Students update own workout_sessions'
  ) THEN
    CREATE POLICY "Students update own workout_sessions"
      ON public.workout_sessions
      FOR UPDATE
      USING (auth.uid() = student_id)
      WITH CHECK (auth.uid() = student_id);
  END IF;
END $$;
