
-- Add new provenance columns
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS metadata_field_source jsonb,
  ADD COLUMN IF NOT EXISTS metadata_field_verified jsonb;

-- Recreate approve function with corrected confidence semantics
CREATE OR REPLACE FUNCTION public.approve_exercise_metadata_suggestion(
  _suggestion_id uuid,
  _fields text[] DEFAULT NULL,
  _overrides jsonb DEFAULT NULL,
  _override_confidences jsonb DEFAULT NULL
)
RETURNS public.exercises
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sug public.exercise_metadata_suggestions;
  v_ex  public.exercises;
  v_proposed jsonb;
  v_applied jsonb := '{}'::jsonb;
  v_reviewer_changes jsonb := '{}'::jsonb;
  v_all_allowed text[] := ARRAY[
    'movement_pattern','exercise_class','equipment_type','stability_level',
    'technical_complexity','axial_load','lumbar_load','balance_requirement',
    'fatigue_cost','safe_to_failure','primary_muscles','secondary_muscles',
    'contraindications'
  ];
  v_required text[] := ARRAY['movement_pattern','exercise_class','equipment_type','stability_level',
    'technical_complexity','axial_load','lumbar_load','balance_requirement',
    'fatigue_cost','safe_to_failure','primary_muscles'];
  v_approved_fields text[] := ARRAY[]::text[];
  v_remaining_fields text[] := ARRAY[]::text[];
  v_key text;
  v_value jsonb;
  v_orig jsonb;
  v_field_conf jsonb := '{}'::jsonb;
  v_field_source jsonb := '{}'::jsonb;
  v_field_verified jsonb := '{}'::jsonb;
  v_existing_field_conf jsonb;
  v_existing_field_source jsonb;
  v_existing_field_verified jsonb;
  v_conf_sum numeric := 0;
  v_conf_count integer := 0;
  v_conf_val numeric;
  v_approval_type text;
  v_missing_req text[] := ARRAY[]::text[];
  v_source_final text;
  v_had_manual boolean := false;
  v_had_rule boolean := false;
  v_is_manual boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sug FROM public.exercise_metadata_suggestions
   WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion_not_found';
  END IF;
  IF v_sug.status NOT IN ('pending','partially_approved') THEN
    RAISE EXCEPTION 'suggestion_not_actionable: %', v_sug.status;
  END IF;

  v_proposed := COALESCE(v_sug.proposed_metadata, '{}'::jsonb);

  FOREACH v_key IN ARRAY v_all_allowed LOOP
    IF _fields IS NOT NULL AND NOT (v_key = ANY(_fields)) THEN
      CONTINUE;
    END IF;
    v_is_manual := false;
    IF _overrides IS NOT NULL AND _overrides ? v_key THEN
      v_value := _overrides -> v_key;
      v_orig := v_proposed -> v_key;
      IF v_orig IS DISTINCT FROM v_value THEN
        v_reviewer_changes := v_reviewer_changes ||
          jsonb_build_object(v_key, jsonb_build_object('from', v_orig, 'to', v_value));
        v_had_manual := true;
        v_is_manual := true;
      END IF;
      v_applied := v_applied || jsonb_build_object(v_key, v_value);
      v_approved_fields := array_append(v_approved_fields, v_key);
    ELSIF v_proposed ? v_key THEN
      v_value := v_proposed -> v_key;
      v_applied := v_applied || jsonb_build_object(v_key, v_value);
      v_approved_fields := array_append(v_approved_fields, v_key);
    ELSE
      CONTINUE;
    END IF;

    -- Field source
    IF v_is_manual THEN
      v_field_source := v_field_source || jsonb_build_object(v_key, 'manual_review');
    ELSE
      v_field_source := v_field_source || jsonb_build_object(v_key, COALESCE(v_sug.source, 'rule'));
      v_had_rule := true;
    END IF;

    -- Field verified (any approval counts as human verification)
    v_field_verified := v_field_verified || jsonb_build_object(v_key, true);

    -- Field confidence
    -- Manual override: use explicit override_confidence if provided, else NULL
    IF v_is_manual THEN
      IF _override_confidences IS NOT NULL AND _override_confidences ? v_key THEN
        v_conf_val := (_override_confidences ->> v_key)::numeric;
        IF v_conf_val < 0 OR v_conf_val > 1 THEN
          RAISE EXCEPTION 'invalid_override_confidence: %', v_key;
        END IF;
        v_field_conf := v_field_conf || jsonb_build_object(v_key, v_conf_val);
        v_conf_sum := v_conf_sum + v_conf_val;
        v_conf_count := v_conf_count + 1;
      ELSE
        v_field_conf := v_field_conf || jsonb_build_object(v_key, NULL::numeric);
        -- do NOT count in average
      END IF;
    ELSE
      IF v_sug.field_confidence IS NOT NULL AND v_sug.field_confidence ? v_key AND (v_sug.field_confidence -> v_key) IS NOT NULL THEN
        v_conf_val := COALESCE((v_sug.field_confidence ->> v_key)::numeric, 0);
      ELSE
        v_conf_val := COALESCE(v_sug.confidence, 0);
      END IF;
      IF v_conf_val < 0 OR v_conf_val > 1 THEN
        RAISE EXCEPTION 'invalid_confidence: %', v_key;
      END IF;
      v_field_conf := v_field_conf || jsonb_build_object(v_key, v_conf_val);
      v_conf_sum := v_conf_sum + v_conf_val;
      v_conf_count := v_conf_count + 1;
    END IF;
  END LOOP;

  IF v_applied = '{}'::jsonb THEN
    RAISE EXCEPTION 'no_valid_fields_to_apply';
  END IF;

  -- Compute remaining from proposed_metadata
  FOR v_key IN SELECT jsonb_object_keys(v_proposed) LOOP
    IF (v_key = ANY(v_all_allowed)) AND NOT (v_key = ANY(v_approved_fields)) THEN
      v_remaining_fields := array_append(v_remaining_fields, v_key);
    END IF;
  END LOOP;

  IF v_sug.approved_fields IS NOT NULL THEN
    SELECT array_agg(DISTINCT f) INTO v_approved_fields
      FROM unnest(v_approved_fields || v_sug.approved_fields) AS f;
  END IF;

  SELECT * INTO v_ex FROM public.exercises WHERE id = v_sug.exercise_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exercise_not_found'; END IF;

  -- Merge with previously stored provenance BEFORE completeness check
  v_existing_field_conf     := COALESCE(v_ex.metadata_field_confidence, '{}'::jsonb) || v_field_conf;
  v_existing_field_source   := COALESCE(v_ex.metadata_field_source, '{}'::jsonb) || v_field_source;
  v_existing_field_verified := COALESCE(v_ex.metadata_field_verified, '{}'::jsonb) || v_field_verified;

  -- Missing required fields after this update
  FOREACH v_key IN ARRAY v_required LOOP
    IF (v_applied ? v_key) THEN CONTINUE; END IF;
    IF v_key = 'movement_pattern' AND v_ex.movement_pattern IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'exercise_class' AND v_ex.exercise_class IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'equipment_type' AND v_ex.equipment_type IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'stability_level' AND v_ex.stability_level IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'technical_complexity' AND v_ex.technical_complexity IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'axial_load' AND v_ex.axial_load IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'lumbar_load' AND v_ex.lumbar_load IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'balance_requirement' AND v_ex.balance_requirement IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'fatigue_cost' AND v_ex.fatigue_cost IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'safe_to_failure' AND v_ex.safe_to_failure IS NOT NULL THEN CONTINUE; END IF;
    IF v_key = 'primary_muscles' AND v_ex.primary_muscles IS NOT NULL THEN CONTINUE; END IF;
    v_missing_req := array_append(v_missing_req, v_key);
  END LOOP;

  v_approval_type := CASE WHEN array_length(v_missing_req,1) IS NULL THEN 'full' ELSE 'partial' END;
  v_source_final := CASE
    WHEN v_had_manual AND v_had_rule THEN 'mixed'
    WHEN v_had_manual THEN 'reviewed_rule'
    ELSE COALESCE(v_sug.source, 'rule')
  END;

  UPDATE public.exercises e SET
    movement_pattern      = COALESCE((v_applied->>'movement_pattern'), e.movement_pattern),
    exercise_class        = COALESCE((v_applied->>'exercise_class'), e.exercise_class),
    equipment_type        = COALESCE((v_applied->>'equipment_type'), e.equipment_type),
    stability_level       = COALESCE((v_applied->>'stability_level'), e.stability_level),
    technical_complexity  = COALESCE((v_applied->>'technical_complexity'), e.technical_complexity),
    axial_load            = COALESCE((v_applied->>'axial_load'), e.axial_load),
    lumbar_load           = COALESCE((v_applied->>'lumbar_load'), e.lumbar_load),
    balance_requirement   = COALESCE((v_applied->>'balance_requirement'), e.balance_requirement),
    fatigue_cost          = COALESCE((v_applied->>'fatigue_cost'), e.fatigue_cost),
    safe_to_failure       = COALESCE((v_applied->>'safe_to_failure')::boolean, e.safe_to_failure),
    primary_muscles       = COALESCE(
      CASE WHEN v_applied ? 'primary_muscles'
           THEN ARRAY(SELECT jsonb_array_elements_text(v_applied->'primary_muscles')) END,
      e.primary_muscles),
    secondary_muscles     = COALESCE(
      CASE WHEN v_applied ? 'secondary_muscles'
           THEN ARRAY(SELECT jsonb_array_elements_text(v_applied->'secondary_muscles')) END,
      e.secondary_muscles),
    contraindications     = COALESCE(
      CASE WHEN v_applied ? 'contraindications'
           THEN ARRAY(SELECT jsonb_array_elements_text(v_applied->'contraindications')) END,
      e.contraindications),
    metadata_status       = CASE WHEN v_approval_type = 'full' THEN 'approved' ELSE 'pending_review' END,
    metadata_source       = v_source_final,
    metadata_confidence   = CASE WHEN v_conf_count > 0 THEN v_conf_sum / v_conf_count ELSE NULL END,
    metadata_field_confidence = v_existing_field_conf,
    metadata_field_source     = v_existing_field_source,
    metadata_field_verified   = v_existing_field_verified,
    metadata_reviewed_by  = v_uid,
    metadata_reviewed_at  = now(),
    metadata_version      = COALESCE(e.metadata_version, 0) + 1
  WHERE e.id = v_sug.exercise_id
  RETURNING * INTO v_ex;

  UPDATE public.exercise_metadata_suggestions SET
    status = CASE WHEN v_approval_type = 'full' THEN 'approved' ELSE 'partially_approved' END,
    approval_type = v_approval_type,
    approved_fields = v_approved_fields,
    remaining_fields = v_remaining_fields,
    applied_metadata = COALESCE(applied_metadata, '{}'::jsonb) || v_applied,
    reviewer_changes = COALESCE(reviewer_changes, '{}'::jsonb) || v_reviewer_changes,
    reviewed_at = now(),
    reviewed_by = v_uid,
    partially_approved_at = CASE WHEN v_approval_type = 'partial' THEN now() ELSE partially_approved_at END
  WHERE id = _suggestion_id;

  IF v_approval_type = 'full' THEN
    UPDATE public.exercise_metadata_suggestions
       SET status = 'superseded', reviewed_at = now(), reviewed_by = v_uid
     WHERE exercise_id = v_sug.exercise_id
       AND id <> _suggestion_id
       AND status = 'pending';
  END IF;

  RETURN v_ex;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_exercise_metadata_suggestion(uuid, text[], jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_exercise_metadata_suggestion(uuid, text[], jsonb, jsonb) TO authenticated, service_role;

-- Drop the old 3-arg overload to avoid ambiguous signature
DROP FUNCTION IF EXISTS public.approve_exercise_metadata_suggestion(uuid, text[], jsonb);
