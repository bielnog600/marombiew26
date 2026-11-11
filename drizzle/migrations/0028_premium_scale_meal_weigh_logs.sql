ALTER TABLE public.students_profile
  ADD COLUMN IF NOT EXISTS premium_scale boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students_profile.premium_scale IS 'Premium: libera "Pesar refeição" (balança + IA). Só admin altera.';

CREATE OR REPLACE FUNCTION public.guard_premium_scale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.premium_scale THEN
    RAISE EXCEPTION 'premium_scale só pode ser alterado pelo admin';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.premium_scale IS DISTINCT FROM OLD.premium_scale THEN
    RAISE EXCEPTION 'premium_scale só pode ser alterado pelo admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_premium_scale ON public.students_profile;
CREATE TRIGGER guard_premium_scale
  BEFORE INSERT OR UPDATE ON public.students_profile
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_scale();

CREATE OR REPLACE FUNCTION public.has_premium_scale(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.students_profile
      WHERE user_id = _user_id AND premium_scale = true
    )
$$;

CREATE TABLE IF NOT EXISTS public.meal_weigh_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  diet_plan_id uuid,
  meal_index integer,
  meal_name text NOT NULL DEFAULT '',
  meal_time text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_kcal numeric NOT NULL DEFAULT 0,
  total_p numeric NOT NULL DEFAULT 0,
  total_c numeric NOT NULL DEFAULT 0,
  total_g numeric NOT NULL DEFAULT 0,
  planned jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meal_weigh_logs IS 'Refeições pesadas pelo aluno (Pesar refeição, Premium). items: [{alimento, food_id, gramas, kcal, p, c, g, foto_url, editado_pelo_aluno}]; planned: macros e alimentos previstos da refeição.';

CREATE INDEX IF NOT EXISTS meal_weigh_logs_student_date_idx
  ON public.meal_weigh_logs (student_id, log_date DESC, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.meal_weigh_logs TO authenticated;
GRANT ALL ON public.meal_weigh_logs TO service_role;

ALTER TABLE public.meal_weigh_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Premium students insert own meal weigh logs"
  ON public.meal_weigh_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id AND public.has_premium_scale(auth.uid()));

CREATE POLICY "Students read own meal weigh logs"
  ON public.meal_weigh_logs FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Admins read all meal weigh logs"
  ON public.meal_weigh_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete meal weigh logs"
  ON public.meal_weigh_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));