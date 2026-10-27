CREATE TABLE public.food_scan_reviews (
  product_key text PRIMARY KEY,
  barcode text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','adicionado','ignorado')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  food_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_scan_reviews TO authenticated;
GRANT ALL ON public.food_scan_reviews TO service_role;
ALTER TABLE public.food_scan_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia revisões de scans" ON public.food_scan_reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));