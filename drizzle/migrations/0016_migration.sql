CREATE TABLE IF NOT EXISTS public.client_sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  table_name text NOT NULL,
  op text NOT NULL,
  payload jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.client_sync_failures TO authenticated;
GRANT ALL ON public.client_sync_failures TO service_role;
ALTER TABLE public.client_sync_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aluno registra as próprias falhas" ON public.client_sync_failures
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "Admin lê falhas" ON public.client_sync_failures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS client_sync_failures_student_idx ON public.client_sync_failures (student_id, created_at DESC);