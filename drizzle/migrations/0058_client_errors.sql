CREATE TABLE public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'error',
  route text,
  message text NOT NULL,
  stack text,
  user_agent text,
  app_version text,
  online boolean,
  standalone boolean,
  language text
);
CREATE INDEX client_errors_user_created_idx ON public.client_errors (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own client errors" ON public.client_errors FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND length(message) <= 2000 AND coalesce(length(stack),0) <= 8000);
CREATE POLICY "Admins read client errors" ON public.client_errors FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::app_role));