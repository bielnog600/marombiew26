CREATE OR REPLACE FUNCTION public.save_human_first_review(
  _action text,
  _exercise_id uuid,
  _pilot_selection_id text,
  _classifier_run_id uuid,
  _reviewer_kind text,
  _reviewed_metadata jsonb,
  _field_review_status jsonb,
  _field_notes jsonb,
  _evidence jsonb,
  _expected_version integer,
  _vocabulary_version text,
  _server_vocabulary_version text,
  _change_reason text DEFAULT NULL::text,
  _changed_fields text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  id uuid,
  status text,
  review_version integer,
  previous_review_version integer,
  is_current boolean,
  diff jsonb,
  changed_fields text[],
  reviewed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev public.exercise_metadata_ground_truth;
  v_new_version integer;
  v_final_status text;
  v_new_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_diff jsonb := '{}'::jsonb;
  v_computed_changed text[] := ARRAY[]::text[];
  v_key text;
  v_prev_val jsonb; v_new_val jsonb;
  v_prev_state jsonb; v_new_state jsonb;
  v_prev_note jsonb; v_new_note jsonb;
  v_prev_ev jsonb; v_new_ev jsonb;
  v_all_keys text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('save_draft', 'finalize', 'amend_after_final') THEN
    RAISE EXCEPTION 'invalid_action: %', _action;
  END IF;
  IF _reviewer_kind IS NULL OR length(_reviewer_kind) = 0 THEN
    RAISE EXCEPTION 'reviewer_kind_required';
  END IF;
  IF _vocabulary_version IS DISTINCT FROM _server_vocabulary_version THEN
    RAISE EXCEPTION 'vocabulary_version_mismatch: server=% client=%',
      _server_vocabulary_version, _vocabulary_version
      USING ERRCODE = '40001';
  END IF;

  -- Locate current row for this reviewer+exercise+run, fully qualified.
  SELECT gt.* INTO v_prev
    FROM public.exercise_metadata_ground_truth AS gt
   WHERE gt.exercise_id      = _exercise_id
     AND gt.reviewer_id      = v_uid
     AND gt.reviewer_kind    = _reviewer_kind
     AND gt.classifier_run_id = _classifier_run_id
     AND gt.is_current       = true
   FOR UPDATE;

  IF v_prev.id IS NULL THEN
    IF _expected_version <> 0 THEN
      RAISE EXCEPTION 'version_conflict: server=0 client=%', _expected_version
        USING ERRCODE = '40001';
    END IF;
    v_new_version := 1;
  ELSE
    IF v_prev.review_version <> _expected_version THEN
      RAISE EXCEPTION 'version_conflict: server=% client=%',
        v_prev.review_version, _expected_version
        USING ERRCODE = '40001';
    END IF;
    v_new_version := v_prev.review_version + 1;

    IF v_prev.status = 'human_first_review' THEN
      IF _action = 'save_draft' THEN
        RAISE EXCEPTION 'cannot_draft_after_finalize' USING ERRCODE = '22023';
      END IF;
      IF _change_reason IS NULL OR length(trim(_change_reason)) < 10 THEN
        RAISE EXCEPTION 'change_reason_required_after_finalize' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_all_keys := ARRAY(
      SELECT DISTINCT k FROM (
        SELECT jsonb_object_keys(coalesce(v_prev.reviewed_metadata, '{}'::jsonb)) AS k
        UNION SELECT jsonb_object_keys(coalesce(_reviewed_metadata, '{}'::jsonb))
        UNION SELECT jsonb_object_keys(coalesce(v_prev.field_review_status, '{}'::jsonb))
        UNION SELECT jsonb_object_keys(coalesce(_field_review_status, '{}'::jsonb))
        UNION SELECT jsonb_object_keys(coalesce(v_prev.field_notes, '{}'::jsonb))
        UNION SELECT jsonb_object_keys(coalesce(_field_notes, '{}'::jsonb))
        UNION SELECT jsonb_object_keys(coalesce(v_prev.evidence, '{}'::jsonb))
        UNION SELECT jsonb_object_keys(coalesce(_evidence, '{}'::jsonb))
      ) s WHERE k IS NOT NULL
    );

    FOREACH v_key IN ARRAY v_all_keys LOOP
      v_prev_val   := coalesce(v_prev.reviewed_metadata, '{}'::jsonb) -> v_key;
      v_new_val    := coalesce(_reviewed_metadata, '{}'::jsonb) -> v_key;
      v_prev_state := coalesce(v_prev.field_review_status, '{}'::jsonb) -> v_key;
      v_new_state  := coalesce(_field_review_status, '{}'::jsonb) -> v_key;
      v_prev_note  := coalesce(v_prev.field_notes, '{}'::jsonb) -> v_key;
      v_new_note   := coalesce(_field_notes, '{}'::jsonb) -> v_key;
      v_prev_ev    := coalesce(v_prev.evidence, '{}'::jsonb) -> v_key;
      v_new_ev     := coalesce(_evidence, '{}'::jsonb) -> v_key;
      IF v_prev_val IS DISTINCT FROM v_new_val
         OR v_prev_state IS DISTINCT FROM v_new_state
         OR v_prev_note IS DISTINCT FROM v_new_note
         OR v_prev_ev IS DISTINCT FROM v_new_ev THEN
        v_computed_changed := array_append(v_computed_changed, v_key);
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object(
          'from_value', v_prev_val, 'to_value', v_new_val,
          'from_state', v_prev_state, 'to_state', v_new_state,
          'from_note', v_prev_note, 'to_note', v_new_note,
          'from_evidence', v_prev_ev, 'to_evidence', v_new_ev
        ));
      END IF;
    END LOOP;

    IF v_prev.status = 'human_first_review'
       AND (v_computed_changed IS NULL OR array_length(v_computed_changed, 1) IS NULL) THEN
      RAISE EXCEPTION 'amendment_without_changes' USING ERRCODE = '22023';
    END IF;

    UPDATE public.exercise_metadata_ground_truth AS gt
       SET status     = 'superseded',
           is_current = false,
           updated_at = v_now
     WHERE gt.id = v_prev.id;
  END IF;

  v_final_status := CASE _action WHEN 'save_draft' THEN 'human_review_draft' ELSE 'human_first_review' END;

  INSERT INTO public.exercise_metadata_ground_truth (
    id, pilot_selection_id, classifier_run_id, exercise_id,
    reviewed_metadata, field_review_status, field_notes, evidence,
    reviewer_id, reviewer_kind, reviewed_at, review_version, status,
    previous_review_version, changed_fields, change_reason, diff,
    vocabulary_version, is_current, created_at, updated_at
  ) VALUES (
    v_new_id, _pilot_selection_id, _classifier_run_id, _exercise_id,
    coalesce(_reviewed_metadata, '{}'::jsonb),
    coalesce(_field_review_status, '{}'::jsonb),
    coalesce(_field_notes, '{}'::jsonb),
    coalesce(_evidence, '{}'::jsonb),
    v_uid, _reviewer_kind, v_now, v_new_version, v_final_status,
    v_prev.review_version, v_computed_changed, _change_reason, v_diff,
    _server_vocabulary_version, true, v_now, v_now
  );

  RETURN QUERY
  SELECT
    v_new_id                AS id,
    v_final_status          AS status,
    v_new_version           AS review_version,
    v_prev.review_version   AS previous_review_version,
    true                    AS is_current,
    v_diff                  AS diff,
    v_computed_changed      AS changed_fields,
    v_now                   AS reviewed_at;
END;
$function$;

-- Re-apply strict ACLs after CREATE OR REPLACE (defensive).
REVOKE ALL ON FUNCTION public.save_human_first_review(
  text, uuid, text, uuid, text, jsonb, jsonb, jsonb, jsonb, integer, text, text, text, text[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_human_first_review(
  text, uuid, text, uuid, text, jsonb, jsonb, jsonb, jsonb, integer, text, text, text, text[]
) FROM anon;
REVOKE ALL ON FUNCTION public.save_human_first_review(
  text, uuid, text, uuid, text, jsonb, jsonb, jsonb, jsonb, integer, text, text, text, text[]
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.save_human_first_review(
  text, uuid, text, uuid, text, jsonb, jsonb, jsonb, jsonb, integer, text, text, text, text[]
) TO authenticated;