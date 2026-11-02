CREATE OR REPLACE FUNCTION public.publish_diet_plan_atomic_office(p_actor uuid, p_plan_id uuid, p_expected_revision integer, p_final_plan jsonb, p_final_markdown text, p_final_protocols jsonb, p_food_assertions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_actor IS NULL OR NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'service_role')::text, true);
  RETURN public.publish_diet_plan_atomic(p_plan_id, p_expected_revision, p_final_plan, p_final_markdown, p_final_protocols, p_food_assertions);
END $$;
REVOKE ALL ON FUNCTION public.publish_diet_plan_atomic_office(uuid, uuid, integer, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_diet_plan_atomic_office(uuid, uuid, integer, jsonb, text, jsonb, jsonb) TO service_role;