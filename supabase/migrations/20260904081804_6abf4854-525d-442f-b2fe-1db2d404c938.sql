CREATE OR REPLACE FUNCTION public.workout_prescription_edits_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.professor_id := OLD.professor_id;
  NEW.student_id := OLD.student_id;
  NEW.plan_id := OLD.plan_id;
  NEW.plan_version := OLD.plan_version;
  NEW.cycle_key := OLD.cycle_key;
  NEW.source := OLD.source;
  NEW.action_origin := OLD.action_origin;
  NEW.before_json := OLD.before_json;
  NEW.after_json := OLD.after_json;
  NEW.changes := OLD.changes;
  NEW.context_snapshot := OLD.context_snapshot;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.workout_prescription_edits_immutable() FROM PUBLIC, anon, authenticated;