ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS rir smallint,
  ADD COLUMN IF NOT EXISTS set_type text;

ALTER TABLE public.exercise_set_logs
  DROP CONSTRAINT IF EXISTS exercise_set_logs_rir_range;
ALTER TABLE public.exercise_set_logs
  ADD CONSTRAINT exercise_set_logs_rir_range CHECK (rir IS NULL OR (rir >= 0 AND rir <= 10));

ALTER TABLE public.exercise_set_logs
  DROP CONSTRAINT IF EXISTS exercise_set_logs_set_type_allowed;
ALTER TABLE public.exercise_set_logs
  ADD CONSTRAINT exercise_set_logs_set_type_allowed CHECK (
    set_type IS NULL OR set_type IN (
      'warmup','recognition','work','top','backoff','drop','rest_pause','myo_reps','technique'
    )
  );

COMMENT ON COLUMN public.exercise_set_logs.rir IS 'Reps in reserve informado pelo aluno na série (opcional, nunca obrigatório). NULL = desconhecido, nunca preencher artificialmente.';
COMMENT ON COLUMN public.exercise_set_logs.set_type IS 'Tipo estrutural da série vinda do plano/execução: recognition/work (hoje) e warmup/top/backoff/drop/rest_pause/myo_reps/technique (reservados). NULL = legado/desconhecido, tratado como work no fallback.';