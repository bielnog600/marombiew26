CREATE TABLE public.food_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL,
  barcode text,
  product_name text,
  brand text,
  image_url text,
  score integer,
  score_label text,
  nutriments jsonb NOT NULL DEFAULT '{}'::jsonb,
  additives jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_evaluation text,
  source text NOT NULL DEFAULT 'openfoodfacts',
  consumed_grams numeric,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX food_scans_aluno_created_idx ON public.food_scans (aluno_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_scans TO authenticated;
GRANT ALL ON public.food_scans TO service_role;
ALTER TABLE public.food_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aluno gerencia os próprios scans" ON public.food_scans FOR ALL TO authenticated
  USING (aluno_id = auth.uid()) WITH CHECK (aluno_id = auth.uid());
CREATE POLICY "Admin vê todos os scans" ON public.food_scans FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.products_cache (
  barcode text PRIMARY KEY,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.products_cache TO service_role;
ALTER TABLE public.products_cache ENABLE ROW LEVEL SECURITY;