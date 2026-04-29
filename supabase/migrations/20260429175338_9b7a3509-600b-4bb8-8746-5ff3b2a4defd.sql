
-- Tabela para guardar player_ids do OneSignal por usuário
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  player_id text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  user_agent text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id) WHERE active = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push_subscriptions"
ON public.push_subscriptions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all push_subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de log de envios (auditoria)
CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid,
  sender_user_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  onesignal_id text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage push_notification_log"
ON public.push_notification_log FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de controle do cron (idempotência diária)
CREATE TABLE IF NOT EXISTS public.push_reminder_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_key text NOT NULL,
  run_date date NOT NULL DEFAULT CURRENT_DATE,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reminder_key, run_date, user_id)
);

ALTER TABLE public.push_reminder_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read push_reminder_runs"
ON public.push_reminder_runs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
