ALTER TABLE public.students_profile
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

ALTER TABLE public.students_profile
  DROP CONSTRAINT IF EXISTS students_profile_access_status_check;
ALTER TABLE public.students_profile
  ADD CONSTRAINT students_profile_access_status_check CHECK (access_status IN ('active','suspended'));

ALTER TABLE public.students_profile
  DROP CONSTRAINT IF EXISTS students_profile_suspension_reason_check;
ALTER TABLE public.students_profile
  ADD CONSTRAINT students_profile_suspension_reason_check CHECK (suspension_reason IS NULL OR suspension_reason IN ('inactivity','manual'));

CREATE INDEX IF NOT EXISTS idx_students_profile_access_status_last_active
  ON public.students_profile (access_status, last_active_at);

-- Heartbeat do próprio aluno: nunca renova last_active_at de suspenso,
-- suspende por inatividade (>15 dias) como rede de proteção, e faz throttle de 12h.
CREATE OR REPLACE FUNCTION public.student_access_heartbeat()
RETURNS TABLE(access_status text, suspension_reason text, suspended_at timestamptz, last_active_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.students_profile%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO _row FROM public.students_profile WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF public.has_role(_uid, 'admin') THEN
    RETURN QUERY SELECT _row.access_status, _row.suspension_reason, _row.suspended_at, _row.last_active_at;
    RETURN;
  END IF;

  IF _row.access_status = 'suspended' THEN
    RETURN QUERY SELECT _row.access_status, _row.suspension_reason, _row.suspended_at, _row.last_active_at;
    RETURN;
  END IF;

  IF _row.last_active_at IS NOT NULL AND _row.last_active_at < now() - interval '15 days' THEN
    UPDATE public.students_profile
      SET access_status = 'suspended',
          suspension_reason = 'inactivity',
          suspended_at = now(),
          suspended_by = NULL
      WHERE user_id = _uid
      RETURNING * INTO _row;
    RETURN QUERY SELECT _row.access_status, _row.suspension_reason, _row.suspended_at, _row.last_active_at;
    RETURN;
  END IF;

  IF _row.last_active_at IS NULL OR _row.last_active_at < now() - interval '12 hours' THEN
    UPDATE public.students_profile
      SET last_active_at = now()
      WHERE user_id = _uid
      RETURNING * INTO _row;
  END IF;

  RETURN QUERY SELECT _row.access_status, _row.suspension_reason, _row.suspended_at, _row.last_active_at;
END;
$$;

REVOKE ALL ON FUNCTION public.student_access_heartbeat() FROM public;
GRANT EXECUTE ON FUNCTION public.student_access_heartbeat() TO authenticated;

-- Suspensão manual (somente admin)
CREATE OR REPLACE FUNCTION public.suspend_student_access(_user_id uuid)
RETURNS public.students_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.students_profile%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_role_required';
  END IF;
  IF public.has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'cannot_suspend_admin';
  END IF;

  UPDATE public.students_profile
    SET access_status = 'suspended',
        suspension_reason = 'manual',
        suspended_at = now(),
        suspended_by = auth.uid()
    WHERE user_id = _user_id
    RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_student_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.suspend_student_access(uuid) TO authenticated;

-- Reativação (somente admin) — reinicia a janela de inatividade
CREATE OR REPLACE FUNCTION public.reactivate_student_access(_user_id uuid)
RETURNS public.students_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.students_profile%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_role_required';
  END IF;

  UPDATE public.students_profile
    SET access_status = 'active',
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        last_active_at = now()
    WHERE user_id = _user_id
    RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_student_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reactivate_student_access(uuid) TO authenticated;

-- Rotina diária determinística e idempotente
CREATE OR REPLACE FUNCTION public.run_inactivity_suspension()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  WITH suspended AS (
    UPDATE public.students_profile sp
      SET access_status = 'suspended',
          suspension_reason = 'inactivity',
          suspended_at = now(),
          suspended_by = NULL
      WHERE sp.access_status = 'active'
        AND sp.last_active_at IS NOT NULL
        AND sp.last_active_at < now() - interval '15 days'
        AND NOT public.has_role(sp.user_id, 'admin')
      RETURNING 1
  )
  SELECT count(*) INTO _count FROM suspended;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_inactivity_suspension() FROM public;

SELECT cron.unschedule('inactivity-suspension-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inactivity-suspension-daily');

SELECT cron.schedule(
  'inactivity-suspension-daily',
  '0 4 * * *',
  $$SELECT public.run_inactivity_suspension();$$
);