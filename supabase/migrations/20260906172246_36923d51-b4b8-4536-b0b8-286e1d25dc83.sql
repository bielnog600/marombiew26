-- 1) Currency on class_packages
ALTER TABLE public.class_packages ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';
ALTER TABLE public.class_packages DROP CONSTRAINT IF EXISTS class_packages_currency_chk;
ALTER TABLE public.class_packages ADD CONSTRAINT class_packages_currency_chk CHECK (currency IN ('EUR','BRL'));

ALTER TABLE public.payments ALTER COLUMN currency SET DEFAULT 'EUR';
UPDATE public.payments SET currency = 'EUR' WHERE currency IS NULL OR currency NOT IN ('EUR','BRL');
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_currency_chk;
ALTER TABLE public.payments ADD CONSTRAINT payments_currency_chk CHECK (currency IN ('EUR','BRL'));

-- 2) occurred_at on class_credits_log
ALTER TABLE public.class_credits_log ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
UPDATE public.class_credits_log SET occurred_at = created_at WHERE occurred_at IS NULL;
ALTER TABLE public.class_credits_log ALTER COLUMN occurred_at SET DEFAULT now();
ALTER TABLE public.class_credits_log ALTER COLUMN occurred_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_credits_log_occurred_at ON public.class_credits_log(occurred_at);

-- 3) Recurring billing plans
CREATE TABLE IF NOT EXISTS public.student_billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  service_type text NOT NULL DEFAULT 'consultoria_online',
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  billing_frequency text NOT NULL DEFAULT 'monthly',
  due_day integer NOT NULL DEFAULT 1,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sbp_service_type_chk CHECK (service_type IN ('consultoria_online','plano_hibrido','outro_recorrente')),
  CONSTRAINT sbp_currency_chk CHECK (currency IN ('EUR','BRL')),
  CONSTRAINT sbp_frequency_chk CHECK (billing_frequency IN ('monthly')),
  CONSTRAINT sbp_status_chk CHECK (status IN ('active','paused','ended')),
  CONSTRAINT sbp_due_day_chk CHECK (due_day BETWEEN 1 AND 28)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_billing_plans TO authenticated;
GRANT ALL ON public.student_billing_plans TO service_role;
ALTER TABLE public.student_billing_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage student_billing_plans" ON public.student_billing_plans;
CREATE POLICY "Admin manage student_billing_plans" ON public.student_billing_plans
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Students read own student_billing_plans" ON public.student_billing_plans;
CREATE POLICY "Students read own student_billing_plans" ON public.student_billing_plans
  FOR SELECT USING (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_sbp_student ON public.student_billing_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_sbp_status ON public.student_billing_plans(status);

DROP TRIGGER IF EXISTS trg_sbp_updated_at ON public.student_billing_plans;
CREATE TRIGGER trg_sbp_updated_at BEFORE UPDATE ON public.student_billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4) Link payments to recurring plans + reference month
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS billing_plan_id uuid REFERENCES public.student_billing_plans(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reference_month text;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_reference_month_chk;
ALTER TABLE public.payments ADD CONSTRAINT payments_reference_month_chk CHECK (reference_month IS NULL OR reference_month ~ '^[0-9]{4}-[0-9]{2}$');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_plan_reference_month
  ON public.payments(billing_plan_id, reference_month)
  WHERE billing_plan_id IS NOT NULL AND reference_month IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_reference_month ON public.payments(reference_month);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);

-- 5) Deterministic monthly charge generation + overdue flip
CREATE OR REPLACE FUNCTION public.generate_recurring_charges(_reference_month text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _created integer := 0;
  _month_start date;
  _month_end date;
  _plan record;
  _due date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar cobranças';
  END IF;
  IF _reference_month !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Mês de referência inválido';
  END IF;

  _month_start := to_date(_reference_month || '-01', 'YYYY-MM-DD');
  _month_end := (_month_start + interval '1 month - 1 day')::date;

  FOR _plan IN
    SELECT * FROM public.student_billing_plans
    WHERE status = 'active'
      AND billing_frequency = 'monthly'
      AND start_date <= _month_end
      AND (end_date IS NULL OR end_date >= _month_start)
  LOOP
    _due := LEAST(_month_start + (_plan.due_day - 1), _month_end);

    INSERT INTO public.payments (
      student_id, admin_id, type, description, amount, currency,
      payment_method, status, due_date, billing_plan_id, reference_month, notes
    )
    VALUES (
      _plan.student_id,
      _plan.admin_id,
      CASE _plan.service_type
        WHEN 'consultoria_online' THEN 'consultoria_online'::payment_type
        WHEN 'plano_hibrido' THEN 'plano_hibrido'::payment_type
        ELSE 'outro'::payment_type
      END,
      COALESCE(NULLIF(_plan.description, ''), 'Mensalidade recorrente'),
      _plan.amount,
      _plan.currency,
      'outro'::payment_method,
      'pendente'::payment_status,
      _due,
      _plan.id,
      _reference_month,
      ''
    )
    ON CONFLICT (billing_plan_id, reference_month) DO NOTHING;

    IF FOUND THEN
      _created := _created + 1;
    END IF;
  END LOOP;

  UPDATE public.payments
  SET status = 'vencido'::payment_status
  WHERE status = 'pendente'::payment_status
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE;

  RETURN _created;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_recurring_charges(text) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_recurring_charges(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_charges(text) TO service_role;