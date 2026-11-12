CREATE TABLE public.food_unit_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  tamanho text NOT NULL CHECK (tamanho IN ('pequeno', 'medio', 'grande')),
  gramas numeric NOT NULL CHECK (gramas > 0 AND gramas <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (food_id, tamanho)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_unit_weights TO authenticated;
GRANT ALL ON public.food_unit_weights TO service_role;
ALTER TABLE public.food_unit_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read unit weights" ON public.food_unit_weights
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages unit weights" ON public.food_unit_weights
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_food_unit_weights_touch BEFORE UPDATE ON public.food_unit_weights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.food_scans ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}';

-- Scanner de alimentos: qualquer aluno pode registrar no dia uma refeição só com itens escaneados.
CREATE POLICY "Students insert own scanned-food meal logs" ON public.meal_weigh_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND jsonb_typeof(items) = 'array'
    AND jsonb_array_length(items) > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) e WHERE coalesce(e->>'origem', '') <> 'escaneado'
    )
  );

CREATE POLICY "Students upload own food scan photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'food-scan-photos' AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "Owners and admin read food scan photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'food-scan-photos' AND (split_part(name, '/', 1) = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));