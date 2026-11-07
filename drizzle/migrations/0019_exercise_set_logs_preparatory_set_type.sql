ALTER TABLE public.exercise_set_logs DROP CONSTRAINT IF EXISTS exercise_set_logs_set_type_allowed;
ALTER TABLE public.exercise_set_logs ADD CONSTRAINT exercise_set_logs_set_type_allowed CHECK (
  set_type IS NULL OR set_type = ANY (ARRAY['warmup','preparatory','recognition','work','top','backoff','drop','rest_pause','myo_reps','technique']::text[])
);
COMMENT ON COLUMN public.exercise_set_logs.set_type IS 'Tipo da série: warmup (aquecimento), preparatory (preparatória), recognition (reconhecimento), work (trabalho) e técnicas. NULL = legado, tratado como trabalho.';