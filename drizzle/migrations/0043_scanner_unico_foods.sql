ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS fiber numeric;
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS reference_table text;
ALTER TABLE public.food_scan_reviews ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.foods.reference_table IS 'Tabela de referência citada pela IA quando source = ia_referencia (ex.: TACO, INSA/PortFIR).';
COMMENT ON COLUMN public.food_scan_reviews.auto IS 'true = adicionado automaticamente pelo sistema (scanner), sem revisão do admin.';