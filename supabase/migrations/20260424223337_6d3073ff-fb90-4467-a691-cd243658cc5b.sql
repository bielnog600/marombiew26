-- Extensions for cron + http
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ai_plans: cycle and renewal columns
ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS cycle_days INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS cycle_status TEXT NOT NULL DEFAULT 'em_dia',
  ADD COLUMN IF NOT EXISTS renewal_mode TEXT NOT NULL DEFAULT 'semi_auto',
  ADD COLUMN IF NOT EXISTS parent_plan_id UUID,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_analysis_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_plans_student_tipo ON public.ai_plans(student_id, tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_plans_cycle_status ON public.ai_plans(cycle_status) WHERE tipo = 'dieta';

-- Versions table (immutable snapshots)
CREATE TABLE IF NOT EXISTS public.diet_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL,
  student_id UUID NOT NULL,
  version INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  fase TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dpv_student ON public.diet_plan_versions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dpv_plan ON public.diet_plan_versions(plan_id);

ALTER TABLE public.diet_plan_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage diet_plan_versions" ON public.diet_plan_versions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own diet_plan_versions" ON public.diet_plan_versions
  FOR SELECT USING (auth.uid() = student_id);

-- Renewal analyses
CREATE TABLE IF NOT EXISTS public.diet_renewal_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL,
  student_id UUID NOT NULL,
  days_remaining INTEGER NOT NULL,
  adherence_score NUMERIC,
  meal_log_frequency NUMERIC,
  weight_trend TEXT,
  data_quality TEXT NOT NULL DEFAULT 'sufficient',
  suggested_action TEXT NOT NULL,
  rationale TEXT NOT NULL,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_plan_id UUID,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dra_student ON public.diet_renewal_analysis(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dra_plan ON public.diet_renewal_analysis(plan_id, created_at DESC);

ALTER TABLE public.diet_renewal_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage diet_renewal_analysis" ON public.diet_renewal_analysis
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own diet_renewal_analysis" ON public.diet_renewal_analysis
  FOR SELECT USING (auth.uid() = student_id);

-- Global app settings (key/value)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage app_settings" ON public.app_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read app_settings" ON public.app_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.app_settings(key, value)
VALUES ('diet_renewal_default_mode', '"semi_auto"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings(key, value)
VALUES ('diet_cycle_days', '45'::jsonb)
ON CONFLICT (key) DO NOTHING;