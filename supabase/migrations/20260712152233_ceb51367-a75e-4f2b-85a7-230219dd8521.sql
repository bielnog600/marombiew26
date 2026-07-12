
REVOKE EXECUTE ON FUNCTION public.approve_exercise_metadata_suggestion(uuid, text[], jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_exercise_metadata_suggestion(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_metadata_completeness(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_exercise_metadata_suggestion(uuid, text[], jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_exercise_metadata_suggestion(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_metadata_completeness(uuid) TO authenticated, service_role;
