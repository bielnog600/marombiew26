
-- Enum for payment type
CREATE TYPE public.payment_type AS ENUM (
  'consultoria_online','pacote_aulas','aula_avulsa','avaliacao_fisica','plano_hibrido','outro'
);

-- Enum for payment status
CREATE TYPE public.payment_status AS ENUM (
  'pago','pendente','vencido','parcial','cancelado','reembolsado'
);

-- Enum for payment method
CREATE TYPE public.payment_method AS ENUM (
  'mbway','transferencia','dinheiro','cartao','stripe','outro'
);

-- Enum for package status
CREATE TYPE public.package_status AS ENUM (
  'ativo','expirado','cancelado','renovado','pausado'
);

-- Enum for credit action
CREATE TYPE public.credit_action_type AS ENUM (
  'add_credit','use_credit','refund_credit','manual_adjustment','expire_credit'
);

-- Enum for financial alert type
CREATE TYPE public.financial_alert_type AS ENUM (
  'pagamento_vencido','pagamento_pendente','1_aula_restante','2_aulas_restantes',
  'sem_pacote_ativo','pacote_vencido','mensalidade_vencer_3d','mensalidade_vencida'
);

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  type payment_type NOT NULL DEFAULT 'outro',
  description text DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  payment_method payment_method NOT NULL DEFAULT 'outro',
  status payment_status NOT NULL DEFAULT 'pendente',
  paid_at timestamp with time zone,
  due_date date,
  notes text DEFAULT '',
  receipt_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage payments" ON public.payments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own payments" ON public.payments FOR SELECT
  USING (auth.uid() = student_id);

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ CLASS PACKAGES ============
CREATE TABLE public.class_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  package_name text NOT NULL DEFAULT '',
  total_classes integer NOT NULL DEFAULT 0,
  used_classes integer NOT NULL DEFAULT 0,
  remaining_classes integer NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  status package_status NOT NULL DEFAULT 'ativo',
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.class_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage class_packages" ON public.class_packages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own class_packages" ON public.class_packages FOR SELECT
  USING (auth.uid() = student_id);

CREATE TRIGGER update_class_packages_updated_at BEFORE UPDATE ON public.class_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ CLASS CREDITS LOG ============
CREATE TABLE public.class_credits_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  package_id uuid REFERENCES public.class_packages(id) ON DELETE CASCADE NOT NULL,
  calendar_event_id uuid,
  action_type credit_action_type NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  reason text DEFAULT '',
  balance_before integer NOT NULL DEFAULT 0,
  balance_after integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.class_credits_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage class_credits_log" ON public.class_credits_log FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own class_credits_log" ON public.class_credits_log FOR SELECT
  USING (auth.uid() = student_id);

-- ============ FINANCIAL ALERTS ============
CREATE TABLE public.financial_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  alert_type financial_alert_type NOT NULL,
  title text NOT NULL DEFAULT '',
  message text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

ALTER TABLE public.financial_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage financial_alerts" ON public.financial_alerts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own financial_alerts" ON public.financial_alerts FOR SELECT
  USING (auth.uid() = student_id);
