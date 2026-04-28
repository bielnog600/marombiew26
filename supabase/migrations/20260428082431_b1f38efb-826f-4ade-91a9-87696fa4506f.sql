ALTER TABLE public.skinfolds 
  ADD COLUMN IF NOT EXISTS biceps numeric,
  ADD COLUMN IF NOT EXISTS panturrilha_medial numeric;