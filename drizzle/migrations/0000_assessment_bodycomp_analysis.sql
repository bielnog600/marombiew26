-- 1) Nova dobra supraspinale (distinta de suprailíaca)
ALTER TABLE public.skinfolds ADD COLUMN IF NOT EXISTS supraspinale numeric;

-- 2) Aferições detalhadas por dobra (1, 2, 3 + valor utilizado)
CREATE TABLE IF NOT EXISTS public.skinfold_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  site text NOT NULL,
  measurement_1 numeric,
  measurement_2 numeric,
  measurement_3 numeric,
  used_value numeric,
  variation_percent numeric,
  quality_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, site)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skinfold_measurements TO authenticated;
GRANT ALL ON public.skinfold_measurements TO service_role;

ALTER TABLE public.skinfold_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage skinfold_measurements"
ON public.skinfold_measurements FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Read skinfold_measurements via assessment"
ON public.skinfold_measurements FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.assessments a
  WHERE a.id = skinfold_measurements.assessment_id
    AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

-- 3) Análise metodológica da composição corporal
CREATE TABLE IF NOT EXISTS public.assessment_bodycomp_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL UNIQUE REFERENCES public.assessments(id) ON DELETE CASCADE,
  recommended_protocol text,
  selected_protocol text,
  previous_protocol text,
  protocol_changed boolean NOT NULL DEFAULT false,
  selected_manually boolean NOT NULL DEFAULT false,
  compatibility text,
  population_context text,
  training_profile text,
  humerus_breadth_cm numeric,
  femur_breadth_cm numeric,
  protocol_comparison jsonb,
  measurement_quality jsonb,
  skinfold_sums jsonb,
  somatotype jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_bodycomp_analysis TO authenticated;
GRANT ALL ON public.assessment_bodycomp_analysis TO service_role;

ALTER TABLE public.assessment_bodycomp_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage bodycomp analysis"
ON public.assessment_bodycomp_analysis FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Read bodycomp analysis via assessment"
ON public.assessment_bodycomp_analysis FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.assessments a
  WHERE a.id = assessment_bodycomp_analysis.assessment_id
    AND (a.student_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));