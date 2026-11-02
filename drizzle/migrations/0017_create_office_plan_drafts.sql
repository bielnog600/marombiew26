CREATE TABLE public.office_plan_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('treino','dieta','cardio')),
  status text NOT NULL DEFAULT 'gerando' CHECK (status IN ('gerando','pronto','erro','publicado','descartado')),
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  instrucoes text,
  request_payload jsonb,
  result_payload jsonb,
  resumo_legivel text,
  error jsonb,
  ai_plan_id uuid,
  published_plan_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  discarded_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_plan_drafts TO authenticated;
GRANT ALL ON public.office_plan_drafts TO service_role;
ALTER TABLE public.office_plan_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage office drafts" ON public.office_plan_drafts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_office_plan_drafts_student ON public.office_plan_drafts (student_id, tipo, status);
CREATE TRIGGER trg_office_plan_drafts_updated_at BEFORE UPDATE ON public.office_plan_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();