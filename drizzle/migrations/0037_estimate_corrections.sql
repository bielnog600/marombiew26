CREATE TABLE public.estimate_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  estimate_id text NOT NULL,
  food_id uuid NULL,
  food_key text NOT NULL,
  food_name text NOT NULL DEFAULT '',
  estimated_g numeric NOT NULL CHECK (estimated_g > 0 AND estimated_g <= 5000),
  adjusted_g numeric NULL CHECK (adjusted_g IS NULL OR adjusted_g > 0),
  factor numeric NULL,
  real_g numeric NOT NULL CHECK (real_g > 0 AND real_g <= 15000),
  fonte text NOT NULL CHECK (fonte IN ('aluno', 'admin', 'balanca')),
  meal_log_id uuid NULL REFERENCES public.meal_weigh_logs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, estimate_id),
  CHECK (real_g / estimated_g >= 0.3 AND real_g / estimated_g <= 3)
);
CREATE INDEX estimate_corrections_student_created_idx ON public.estimate_corrections (student_id, created_at DESC);
CREATE INDEX estimate_corrections_food_created_idx ON public.estimate_corrections (food_key, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_corrections TO authenticated;
GRANT ALL ON public.estimate_corrections TO service_role;
ALTER TABLE public.estimate_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own estimate corrections" ON public.estimate_corrections
  FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Students insert own estimate corrections" ON public.estimate_corrections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id AND fonte IN ('aluno', 'balanca'));
CREATE POLICY "Students update own estimate corrections" ON public.estimate_corrections
  FOR UPDATE TO authenticated
  USING (auth.uid() = student_id AND fonte <> 'admin')
  WITH CHECK (auth.uid() = student_id AND fonte IN ('aluno', 'balanca'));
CREATE POLICY "Students delete own estimate corrections" ON public.estimate_corrections
  FOR DELETE TO authenticated USING (auth.uid() = student_id AND fonte <> 'admin');
CREATE POLICY "Admin manages estimate corrections" ON public.estimate_corrections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_estimate_corrections_touch BEFORE UPDATE ON public.estimate_corrections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- O admin corrige as gramas de um item estimado já salvo: grava um registro novo (o mais recente vale no dia).
CREATE POLICY "Admins insert meal weigh logs" ON public.meal_weigh_logs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Amostras de calibração para o aluno logado: só razões real/estimado, sem identificar outros alunos.
CREATE OR REPLACE FUNCTION public.estimate_calibration_samples(_food_keys text[])
RETURNS TABLE(scope text, food_key text, ratio numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH keys AS (
    SELECT DISTINCT k FROM unnest(coalesce(_food_keys, '{}'::text[])) AS k LIMIT 40
  ),
  mine_food AS (
    SELECT c.food_key, c.real_g / c.estimated_g AS ratio,
           row_number() OVER (PARTITION BY c.food_key ORDER BY c.created_at DESC) AS rn
    FROM public.estimate_corrections c
    WHERE c.student_id = auth.uid() AND c.food_key IN (SELECT k FROM keys)
  ),
  mine AS (
    SELECT c.food_key, c.real_g / c.estimated_g AS ratio
    FROM public.estimate_corrections c
    WHERE c.student_id = auth.uid()
    ORDER BY c.created_at DESC
    LIMIT 20
  ),
  per_food AS (
    SELECT c.food_key, c.real_g / c.estimated_g AS ratio,
           row_number() OVER (PARTITION BY c.food_key ORDER BY c.created_at DESC) AS rn
    FROM public.estimate_corrections c
    WHERE auth.uid() IS NOT NULL AND c.food_key IN (SELECT k FROM keys)
  )
  SELECT 'aluno_alimento'::text, food_key, ratio FROM mine_food WHERE rn <= 20
  UNION ALL
  SELECT 'aluno'::text, food_key, ratio FROM mine
  UNION ALL
  SELECT 'alimento'::text, food_key, ratio FROM per_food WHERE rn <= 20
$$;
REVOKE ALL ON FUNCTION public.estimate_calibration_samples(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimate_calibration_samples(text[]) TO authenticated;