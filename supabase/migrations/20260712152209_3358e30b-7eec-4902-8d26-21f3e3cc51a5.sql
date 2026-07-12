
-- ============================================================
-- FASE 2B.1 — HARDENING
-- ============================================================

-- 1) Schema changes: exercise_metadata_suggestions
ALTER TABLE public.exercise_metadata_suggestions
  ADD COLUMN IF NOT EXISTS approved_fields text[],
  ADD COLUMN IF NOT EXISTS remaining_fields text[],
  ADD COLUMN IF NOT EXISTS applied_metadata jsonb,
  ADD COLUMN IF NOT EXISTS reviewer_changes jsonb,
  ADD COLUMN IF NOT EXISTS approval_type text,
  ADD COLUMN IF NOT EXISTS partially_approved_at timestamptz;

ALTER TABLE public.exercise_metadata_suggestions
  DROP CONSTRAINT IF EXISTS ems_status_check;
ALTER TABLE public.exercise_metadata_suggestions
  ADD CONSTRAINT ems_status_check
  CHECK (status = ANY (ARRAY['pending','partially_approved','approved','rejected','superseded']));

ALTER TABLE public.exercise_metadata_suggestions
  DROP CONSTRAINT IF EXISTS ems_approval_type_check;
ALTER TABLE public.exercise_metadata_suggestions
  ADD CONSTRAINT ems_approval_type_check
  CHECK (approval_type IS NULL OR approval_type = ANY (ARRAY['full','partial']));

-- 2) Per-field confidence on exercises + expand source allowed values
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS metadata_field_confidence jsonb;

ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_metadata_source_check;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_metadata_source_check
  CHECK (metadata_source IS NULL OR metadata_source = ANY (ARRAY['manual','rule','ai','imported','reviewed_rule','mixed']));

-- ============================================================
-- 3) Completeness function
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_metadata_completeness(_exercise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ex public.exercises;
  v_required text[] := ARRAY['movement_pattern','exercise_class','equipment_type','stability_level',
    'technical_complexity','axial_load','lumbar_load','balance_requirement',
    'fatigue_cost','safe_to_failure','primary_muscles'];
  v_safety text[] := ARRAY['axial_load','lumbar_load','stability_level','technical_complexity',
    'safe_to_failure','fatigue_cost','contraindications'];
  v_missing_required text[] := ARRAY[]::text[];
  v_missing_safety text[] := ARRAY[]::text[];
  v_approved text[] := ARRAY[]::text[];
  v_field text;
  v_val text;
  v_pct numeric;
  v_status text;
  v_can_use boolean;
  v_all_fields text[];
BEGIN
  SELECT * INTO v_ex FROM public.exercises WHERE id = _exercise_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exercise_not_found';
  END IF;

  v_all_fields := ARRAY['movement_pattern','exercise_class','equipment_type','stability_level',
    'technical_complexity','axial_load','lumbar_load','balance_requirement',
    'fatigue_cost','safe_to_failure','primary_muscles','secondary_muscles','contraindications'];

  FOREACH v_field IN ARRAY v_all_fields LOOP
    v_val := NULL;
    IF v_field = 'movement_pattern' THEN v_val := v_ex.movement_pattern;
    ELSIF v_field = 'exercise_class' THEN v_val := v_ex.exercise_class;
    ELSIF v_field = 'equipment_type' THEN v_val := v_ex.equipment_type;
    ELSIF v_field = 'stability_level' THEN v_val := v_ex.stability_level;
    ELSIF v_field = 'technical_complexity' THEN v_val := v_ex.technical_complexity;
    ELSIF v_field = 'axial_load' THEN v_val := v_ex.axial_load;
    ELSIF v_field = 'lumbar_load' THEN v_val := v_ex.lumbar_load;
    ELSIF v_field = 'balance_requirement' THEN v_val := v_ex.balance_requirement;
    ELSIF v_field = 'fatigue_cost' THEN v_val := v_ex.fatigue_cost;
    ELSIF v_field = 'safe_to_failure' THEN v_val := CASE WHEN v_ex.safe_to_failure IS NULL THEN NULL ELSE 'set' END;
    ELSIF v_field = 'primary_muscles' THEN v_val := CASE WHEN v_ex.primary_muscles IS NULL THEN NULL ELSE 'set' END;
    ELSIF v_field = 'secondary_muscles' THEN v_val := CASE WHEN v_ex.secondary_muscles IS NULL THEN NULL ELSE 'set' END;
    ELSIF v_field = 'contraindications' THEN v_val := CASE WHEN v_ex.contraindications IS NULL THEN NULL ELSE 'set' END;
    END IF;
    IF v_val IS NOT NULL THEN
      v_approved := array_append(v_approved, v_field);
    END IF;
  END LOOP;

  FOREACH v_field IN ARRAY v_required LOOP
    IF NOT (v_field = ANY(v_approved)) THEN
      v_missing_required := array_append(v_missing_required, v_field);
    END IF;
  END LOOP;

  FOREACH v_field IN ARRAY v_safety LOOP
    IF NOT (v_field = ANY(v_approved)) THEN
      v_missing_safety := array_append(v_missing_safety, v_field);
    END IF;
  END LOOP;

  v_pct := (array_length(v_approved,1)::numeric / array_length(v_all_fields,1)::numeric) * 100;

  IF array_length(v_approved,1) IS NULL OR array_length(v_approved,1) = 0 THEN
    v_status := 'unclassified';
  ELSIF array_length(v_missing_required,1) IS NULL THEN
    v_status := 'complete';
  ELSE
    v_status := 'partial';
  END IF;

  v_can_use := (v_status = 'complete');

  RETURN jsonb_build_object(
    'status', v_status,
    'missingRequiredFields', to_jsonb(v_missing_required),
    'missingSafetyFields', to_jsonb(v_missing_safety),
    'approvedFields', to_jsonb(v_approved),
    'completionPercentage', v_pct,
    'canBeUsedForMethodSelection', v_can_use
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_metadata_completeness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_metadata_completeness(uuid) TO authenticated;

-- ============================================================
-- 4) Recreate approve/reject with hardened search_path + partial approval
-- ============================================================

DROP FUNCTION IF EXISTS public.approve_exercise_metadata_suggestion(uuid, text[]);
DROP FUNCTION IF EXISTS public.reject_exercise_metadata_suggestion(uuid, text);

CREATE OR REPLACE FUNCTION public.approve_exercise_metadata_suggestion(
  _suggestion_id uuid,
  _fields text[] DEFAULT NULL,
  _overrides jsonb DEFAULT NULL
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
  v_existing_field_conf jsonb;
  v_avg_conf numeric := 0;
  v_conf_count integer := 0;
  v_approval_type text;
  v_missing_req text[] := ARRAY[]::text[];
  v_source_final text;
  v_had_manual boolean := false;
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

  -- Build applied_metadata by iterating allowed fields
  FOREACH v_key IN ARRAY v_all_allowed LOOP
    -- Skip if user provided _fields and this is not in it
    IF _fields IS NOT NULL AND NOT (v_key = ANY(_fields)) THEN
      CONTINUE;
    END IF;
    -- Determine value: override wins over proposed
    IF _overrides IS NOT NULL AND _overrides ? v_key THEN
      v_value := _overrides -> v_key;
      v_orig := v_proposed -> v_key;
      IF v_orig IS DISTINCT FROM v_value THEN
        v_reviewer_changes := v_reviewer_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_orig, 'to', v_value));
        v_had_manual := true;
      END IF;
      v_applied := v_applied || jsonb_build_object(v_key, v_value);
      v_approved_fields := array_append(v_approved_fields, v_key);
    ELSIF v_proposed ? v_key THEN
      v_value := v_proposed -> v_key;
      v_applied := v_applied || jsonb_build_object(v_key, v_value);
      v_approved_fields := array_append(v_approved_fields, v_key);
    END IF;
  END LOOP;

  IF v_applied = '{}'::jsonb THEN
    RAISE EXCEPTION 'no_valid_fields_to_apply';
  END IF;

  -- Compute per-field confidence from field_confidence, mark manual overrides as 1.0
  FOREACH v_key IN ARRAY v_approved_fields LOOP
    IF v_reviewer_changes ? v_key THEN
      v_field_conf := v_field_conf || jsonb_build_object(v_key, 1.0);
      v_avg_conf := v_avg_conf + 1.0;
    ELSIF v_sug.field_confidence IS NOT NULL AND v_sug.field_confidence ? v_key THEN
      v_field_conf := v_field_conf || jsonb_build_object(v_key, v_sug.field_confidence -> v_key);
      v_avg_conf := v_avg_conf + COALESCE((v_sug.field_confidence ->> v_key)::numeric, 0);
    ELSE
      v_field_conf := v_field_conf || jsonb_build_object(v_key, COALESCE(v_sug.confidence, 0));
      v_avg_conf := v_avg_conf + COALESCE(v_sug.confidence, 0);
    END IF;
    v_conf_count := v_conf_count + 1;
  END LOOP;
  v_avg_conf := CASE WHEN v_conf_count > 0 THEN v_avg_conf / v_conf_count ELSE 0 END;
  IF v_avg_conf < 0 OR v_avg_conf > 1 THEN
    RAISE EXCEPTION 'invalid_confidence';
  END IF;

  -- Compute remaining_fields from proposed_metadata not applied
  FOR v_key IN SELECT jsonb_object_keys(v_proposed) LOOP
    IF (v_key = ANY(v_all_allowed)) AND NOT (v_key = ANY(v_approved_fields)) THEN
      v_remaining_fields := array_append(v_remaining_fields, v_key);
    END IF;
  END LOOP;

  -- Merge with previously approved fields from this suggestion (if partial before)
  IF v_sug.approved_fields IS NOT NULL THEN
    SELECT array_agg(DISTINCT f) INTO v_approved_fields
      FROM unnest(v_approved_fields || v_sug.approved_fields) AS f;
  END IF;

  -- Determine required completeness AFTER applying this batch to the exercise
  -- Compute considering existing exercise columns
  SELECT * INTO v_ex FROM public.exercises WHERE id = v_sug.exercise_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exercise_not_found';
  END IF;

  FOREACH v_key IN ARRAY v_required LOOP
    IF (v_applied ? v_key) THEN CONTINUE; END IF;
    -- Check existing exercise column
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
  v_source_final := CASE WHEN v_had_manual THEN 'reviewed_rule' ELSE COALESCE(v_sug.source, 'rule') END;

  -- Merge field confidence into exercise (preserve existing)
  v_existing_field_conf := COALESCE(v_ex.metadata_field_confidence, '{}'::jsonb);
  v_existing_field_conf := v_existing_field_conf || v_field_conf;

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
    metadata_confidence   = v_avg_conf,
    metadata_field_confidence = v_existing_field_conf,
    metadata_reviewed_by  = v_uid,
    metadata_reviewed_at  = now(),
    metadata_version      = COALESCE(e.metadata_version, 0) + 1
  WHERE e.id = v_sug.exercise_id
  RETURNING * INTO v_ex;

  -- Update suggestion — DO NOT mutate proposed_metadata
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

  -- Supersede other pending suggestions only on full approval
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

CREATE OR REPLACE FUNCTION public.reject_exercise_metadata_suggestion(
  _suggestion_id uuid,
  _reason text
)
RETURNS public.exercise_metadata_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sug public.exercise_metadata_suggestions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.exercise_metadata_suggestions
     SET status = 'rejected',
         reviewed_at = now(),
         reviewed_by = v_uid,
         rejection_reason = _reason
   WHERE id = _suggestion_id
     AND status IN ('pending','partially_approved')
  RETURNING * INTO v_sug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion_not_found_or_not_actionable';
  END IF;
  RETURN v_sug;
END;
$$;

-- ============================================================
-- 5) Permissions on RPCs (hardening item #1)
-- ============================================================
REVOKE ALL ON FUNCTION public.approve_exercise_metadata_suggestion(uuid, text[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_exercise_metadata_suggestion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_exercise_metadata_suggestion(uuid, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_exercise_metadata_suggestion(uuid, text) TO authenticated;
