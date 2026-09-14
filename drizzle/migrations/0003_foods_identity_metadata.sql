ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS source_food_id text;

CREATE INDEX IF NOT EXISTS idx_foods_barcode ON public.foods (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foods_source_ref ON public.foods (source, source_food_id) WHERE source IS NOT NULL AND source_food_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foods_lower_name ON public.foods (lower(name));