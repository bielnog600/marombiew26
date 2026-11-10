ALTER TABLE public.camera_sessions
  ADD COLUMN IF NOT EXISTS tempo_medio_descida numeric(5,2),
  ADD COLUMN IF NOT EXISTS reps_descida_rapida integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.camera_sessions.tempo_medio_descida IS 'Tempo médio da descida (excêntrica) em segundos; null quando não medido.';
COMMENT ON COLUMN public.camera_sessions.reps_descida_rapida IS 'Reps com descida mais rápida que o limite do app.';