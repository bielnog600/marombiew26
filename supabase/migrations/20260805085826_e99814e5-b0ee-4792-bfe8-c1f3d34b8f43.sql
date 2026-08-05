ALTER TABLE public.diet_questionnaires
  ADD COLUMN IF NOT EXISTS dores_articulares text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dores_observacoes text;