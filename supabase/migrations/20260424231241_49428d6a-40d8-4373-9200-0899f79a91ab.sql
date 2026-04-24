
-- 1) Workout plan versions table (rich audit history)
CREATE TABLE IF NOT EXISTS public.workout_plan_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL,
  student_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  previous_version_id UUID NULL REFERENCES public.workout_plan_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'archived', -- draft | approved | published | archived
  generated_by TEXT NOT NULL DEFAULT 'manual', -- manual | auto | ia
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  fase TEXT NULL,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason_summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_wpv_plan ON public.workout_plan_versions(plan_id);
CREATE INDEX IF NOT EXISTS idx_wpv_student ON public.workout_plan_versions(student_id);

ALTER TABLE public.workout_plan_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage workout_plan_versions"
  ON public.workout_plan_versions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own workout_plan_versions"
  ON public.workout_plan_versions FOR SELECT
  USING (auth.uid() = student_id);

-- 2) Workout renewal analysis table
CREATE TABLE IF NOT EXISTS public.workout_renewal_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL,
  student_id UUID NOT NULL,
  days_remaining INTEGER NOT NULL,
  adherence_score NUMERIC NULL,           -- 0..1
  session_frequency NUMERIC NULL,         -- sessions per week
  completion_rate NUMERIC NULL,           -- exercises completed vs planned
  load_progression TEXT NULL,             -- subindo | estavel | descendo | sem_dados
  reps_progression TEXT NULL,             -- subindo | estavel | descendo | sem_dados
  volume_trend TEXT NULL,                 -- subindo | estavel | descendo | sem_dados
  avg_rpe NUMERIC NULL,
  fatigue_signal TEXT NULL,               -- baixa | media | alta
  monotony_risk TEXT NULL,                -- baixo | medio | alto
  data_quality TEXT NOT NULL DEFAULT 'sufficient', -- sufficient | partial | insufficient
  suggested_action TEXT NOT NULL,         -- manter | ajustar | gerar_novo | solicitar_dados
  rationale TEXT NOT NULL,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_plan_id UUID NULL,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wra_plan ON public.workout_renewal_analysis(plan_id);
CREATE INDEX IF NOT EXISTS idx_wra_student ON public.workout_renewal_analysis(student_id);

ALTER TABLE public.workout_renewal_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage workout_renewal_analysis"
  ON public.workout_renewal_analysis FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own workout_renewal_analysis"
  ON public.workout_renewal_analysis FOR SELECT
  USING (auth.uid() = student_id);
