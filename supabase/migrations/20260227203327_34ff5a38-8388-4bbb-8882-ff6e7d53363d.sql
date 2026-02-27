
-- Add bilateral measurements and contracted biceps to anthropometrics
ALTER TABLE public.anthropometrics
  ADD COLUMN braco_direito numeric,
  ADD COLUMN braco_esquerdo numeric,
  ADD COLUMN coxa_direita numeric,
  ADD COLUMN coxa_esquerda numeric,
  ADD COLUMN panturrilha_direita numeric,
  ADD COLUMN panturrilha_esquerda numeric,
  ADD COLUMN biceps_contraido_direito numeric,
  ADD COLUMN biceps_contraido_esquerdo numeric;

-- Drop old single-sided columns
ALTER TABLE public.anthropometrics
  DROP COLUMN IF EXISTS braco,
  DROP COLUMN IF EXISTS coxa,
  DROP COLUMN IF EXISTS panturrilha;
