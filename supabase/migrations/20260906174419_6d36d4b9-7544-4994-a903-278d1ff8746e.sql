CREATE OR REPLACE FUNCTION public.generate_recurring_charges(_reference_month text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    -- Regra determinística, idêntica ao helper planDueDateForMonth no frontend:
    -- 1) dia due_day do mês, limitado ao último dia do mês;
    -- 2) nunca antes de start_date quando o plano começa dentro do mês;
    -- 3) nunca depois de end_date quando o plano termina dentro do mês.
    _due := LEAST(_month_start + (LEAST(GREATEST(_plan.due_day, 1), 31) - 1), _month_end);

    IF _plan.start_date >= _month_start AND _plan.start_date <= _month_end AND _due < _plan.start_date THEN
      _due := _plan.start_date;
    END IF;

    IF _plan.end_date IS NOT NULL
       AND _plan.end_date >= _month_start AND _plan.end_date <= _month_end
       AND _due > _plan.end_date THEN
      _due := _plan.end_date;
    END IF;

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
$function$;

CREATE INDEX IF NOT EXISTS idx_calendar_event_students_student ON public.calendar_event_students (student_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_status ON public.calendar_events (start_datetime, status);