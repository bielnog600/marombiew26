
-- Tabela de eventos do aluno (engajamento e atividade)
CREATE TABLE public.student_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_events_student_created ON public.student_events (student_id, created_at DESC);
CREATE INDEX idx_student_events_type_created ON public.student_events (event_type, created_at DESC);

ALTER TABLE public.student_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert own events"
  ON public.student_events FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students read own events"
  ON public.student_events FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Admin manage student_events"
  ON public.student_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de alertas comportamentais persistidos
CREATE TABLE public.behavioral_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  alert_key text NOT NULL,
  category text NOT NULL DEFAULT 'comportamental',
  priority text NOT NULL DEFAULT 'media',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT behavioral_alerts_unique_key UNIQUE (student_id, alert_key)
);

CREATE INDEX idx_behavioral_alerts_student ON public.behavioral_alerts (student_id, status);
CREATE INDEX idx_behavioral_alerts_priority ON public.behavioral_alerts (priority, created_at DESC);

ALTER TABLE public.behavioral_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage behavioral_alerts"
  ON public.behavioral_alerts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own behavioral_alerts"
  ON public.behavioral_alerts FOR SELECT
  USING (auth.uid() = student_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER trg_behavioral_alerts_updated_at
  BEFORE UPDATE ON public.behavioral_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
