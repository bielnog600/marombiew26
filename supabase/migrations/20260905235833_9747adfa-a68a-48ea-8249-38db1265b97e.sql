
-- Sync ativo <-> access_status

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
        ativo = false,
        suspension_reason = 'manual',
        suspended_at = now(),
        suspended_by = auth.uid()
    WHERE user_id = _user_id
    RETURNING * INTO _row;

  RETURN _row;
END;
$$;

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
        ativo = true,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        last_active_at = now()
    WHERE user_id = _user_id
    RETURNING * INTO _row;

  RETURN _row;
END;
$$;

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
          ativo = false,
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
          ativo = false,
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

-- Backfill conservador: apenas quem já está suspenso
UPDATE public.students_profile
  SET ativo = false
  WHERE access_status = 'suspended'
    AND ativo IS DISTINCT FROM false;
