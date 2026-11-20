SET LOCAL search_path = public, extensions;

-- Rewrite every public policy that calls auth.uid()/has_role()/has_premium_camera() per row
-- into the initPlan form, evaluated once per statement. ALTER POLICY keeps command, roles
-- and permissiveness; only the expressions are wrapped, so access rules stay identical.
DO $mig$
DECLARE
  r record;
  u text;
  c text;
  stmt text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
      AND (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.uid\(\)'
  LOOP
    u := r.qual;
    c := r.with_check;
    IF u IS NOT NULL THEN
      u := replace(u, 'auth.uid()', '(SELECT auth.uid())');
      u := regexp_replace(u, '(public\.)?has_role\(\(SELECT auth\.uid\(\)\), ''([a-z_]+)''::(public\.)?app_role\)',
                          '(SELECT public.has_role((SELECT auth.uid()), ''\2''::public.app_role))', 'g');
      u := regexp_replace(u, '(public\.)?has_premium_camera\(\(SELECT auth\.uid\(\)\)\)',
                          '(SELECT public.has_premium_camera((SELECT auth.uid())))', 'g');
      u := regexp_replace(u, '(public\.)?has_premium_scale\(\(SELECT auth\.uid\(\)\)\)',
                          '(SELECT public.has_premium_scale((SELECT auth.uid())))', 'g');
    END IF;
    IF c IS NOT NULL THEN
      c := replace(c, 'auth.uid()', '(SELECT auth.uid())');
      c := regexp_replace(c, '(public\.)?has_role\(\(SELECT auth\.uid\(\)\), ''([a-z_]+)''::(public\.)?app_role\)',
                          '(SELECT public.has_role((SELECT auth.uid()), ''\2''::public.app_role))', 'g');
      c := regexp_replace(c, '(public\.)?has_premium_camera\(\(SELECT auth\.uid\(\)\)\)',
                          '(SELECT public.has_premium_camera((SELECT auth.uid())))', 'g');
      c := regexp_replace(c, '(public\.)?has_premium_scale\(\(SELECT auth\.uid\(\)\)\)',
                          '(SELECT public.has_premium_scale((SELECT auth.uid())))', 'g');
    END IF;
    stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF u IS NOT NULL THEN stmt := stmt || ' USING (' || u || ')'; END IF;
    IF c IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || c || ')'; END IF;
    EXECUTE stmt;
  END LOOP;

  -- Guard: no public policy may still call has_role/auth.uid() per row.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(has_role|has_premium_camera|has_premium_scale)\(auth\.uid\(\)'
  ) THEN
    RAISE EXCEPTION 'initPlan rewrite incomplete';
  END IF;
END
$mig$;

-- Helpers continue STABLE SECURITY DEFINER with a fixed search_path (idempotent).
ALTER FUNCTION public.has_role(uuid, public.app_role) STABLE SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.has_premium_scale(uuid) STABLE SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.has_premium_camera(uuid) STABLE SECURITY DEFINER SET search_path = public;

-- One-call read of set logs for many students (replaces counted OFFSET paging).
-- SECURITY INVOKER: the caller's RLS applies (admin sees all, a student only their own rows).
CREATE OR REPLACE FUNCTION public.set_logs_since(_student_ids uuid[], _since timestamptz, _compact boolean DEFAULT true)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    json_agg(
      CASE WHEN _compact THEN json_build_object(
        'id', l.id, 'student_id', l.student_id, 'exercise_name', l.exercise_name, 'reps', l.reps,
        'weight_kg', l.weight_kg, 'rpe', l.rpe, 'rir', l.rir, 'set_type', l.set_type,
        'set_number', l.set_number, 'performed_at', l.performed_at, 'phase', l.phase,
        'session_id', l.session_id, 'sub_records', l.sub_records, 'source', l.source)
      ELSE row_to_json(l) END
      ORDER BY l.performed_at DESC, l.id ASC),
    '[]'::json)
  FROM public.exercise_set_logs l
  WHERE l.student_id = ANY(_student_ids) AND l.performed_at >= _since
$$;
REVOKE ALL ON FUNCTION public.set_logs_since(uuid[], timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_logs_since(uuid[], timestamptz, boolean) TO authenticated, service_role;