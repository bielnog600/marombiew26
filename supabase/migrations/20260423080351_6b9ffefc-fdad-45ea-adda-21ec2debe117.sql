-- Tabela de notificações one-shot enviadas pelo admin para alunos
CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_admin_notif_student_active ON public.admin_notifications(student_id, active, viewed_at);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Admin gerencia tudo
CREATE POLICY "Admin manage admin_notifications"
  ON public.admin_notifications FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Aluno lê suas próprias
CREATE POLICY "Students read own admin_notifications"
  ON public.admin_notifications FOR SELECT
  USING (auth.uid() = student_id);

-- Aluno marca como visualizada (apenas o campo viewed_at via update)
CREATE POLICY "Students update own admin_notifications viewed"
  ON public.admin_notifications FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);