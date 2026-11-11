ALTER TABLE public.camera_sessions ADD COLUMN IF NOT EXISTS exercise_rule text;

UPDATE public.camera_sessions SET exercise_rule = 'squat' WHERE exercise_rule IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'camera_sessions_exercise_rule_check') THEN
    ALTER TABLE public.camera_sessions
      ADD CONSTRAINT camera_sessions_exercise_rule_check
      CHECK (exercise_rule IS NULL OR exercise_rule IN ('squat', 'stiff', 'bulgaro'));
  END IF;
END $$;

COMMENT ON COLUMN public.camera_sessions.exercise_rule IS 'Regra da Correção ao vivo usada (squat, stiff, bulgaro); null = sessão gravada por uma tela antiga (agachamento).';