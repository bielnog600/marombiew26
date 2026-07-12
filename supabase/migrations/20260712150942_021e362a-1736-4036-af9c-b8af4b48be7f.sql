
-- Additive fields for staging table
ALTER TABLE public.exercise_metadata_suggestions
  ADD COLUMN IF NOT EXISTS classifier_version text,
  ADD COLUMN IF NOT EXISTS rules_version text,
  ADD COLUMN IF NOT EXISTS field_confidence jsonb,
  ADD COLUMN IF NOT EXISTS classifier_run_id uuid,
  ADD COLUMN IF NOT EXISTS matched_rules text[];

-- Prevent duplicate pending suggestions for the same exercise/source/classifier version
CREATE UNIQUE INDEX IF NOT EXISTS ems_pending_unique
  ON public.exercise_metadata_suggestions(exercise_id, source, classifier_version)
  WHERE status = 'pending';

-- ============================================================
-- Transactional approval: admin-only, whitelist columns
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_exercise_metadata_suggestion(
  _suggestion_id uuid,
  _fields text[] DEFAULT NULL  -- NULL = approve all fields present in proposed_metadata
)
RETURNS public.exercises
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sug public.exercise_metadata_suggestions;
  v_ex  public.exercises;
  v_meta jsonb;
  v_final jsonb := '{}'::jsonb;
  v_allowed text[] := ARRAY[
    'movement_pattern','exercise_class','equipment_type','stability_level',
    'technical_complexity','axial_load','lumbar_load','balance_requirement',
    'fatigue_cost','safe_to_failure','primary_muscles','secondary_muscles',
    'contraindications'
  ];
  v_key text;
  v_confidence numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Lock the suggestion row for the transaction
  SELECT * INTO v_sug
  FROM public.exercise_metadata_suggestions
  WHERE id = _suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion_not_found';
  END IF;
  IF v_sug.status <> 'pending' THEN
    RAISE EXCEPTION 'suggestion_not_pending: %', v_sug.status;
  END IF;

  v_meta := COALESCE(v_sug.proposed_metadata, '{}'::jsonb);

  -- Filter allowed keys and (optionally) requested keys
  FOR v_key IN SELECT jsonb_object_keys(v_meta) LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN
      CONTINUE;
    END IF;
    IF _fields IS NOT NULL AND NOT (v_key = ANY(_fields)) THEN
      CONTINUE;
    END IF;
    v_final := v_final || jsonb_build_object(v_key, v_meta -> v_key);
  END LOOP;

  IF v_final = '{}'::jsonb THEN
    RAISE EXCEPTION 'no_valid_fields_to_apply';
  END IF;

  v_confidence := COALESCE(v_sug.confidence, 0);
  IF v_confidence < 0 OR v_confidence > 1 THEN
    RAISE EXCEPTION 'invalid_confidence';
  END IF;

  -- Apply whitelisted fields, only for those present in v_final
  UPDATE public.exercises e SET
    movement_pattern      = COALESCE((v_final->>'movement_pattern'), e.movement_pattern),
    exercise_class        = COALESCE((v_final->>'exercise_class'), e.exercise_class),
    equipment_type        = COALESCE((v_final->>'equipment_type'), e.equipment_type),
    stability_level       = COALESCE((v_final->>'stability_level'), e.stability_level),
    technical_complexity  = COALESCE((v_final->>'technical_complexity'), e.technical_complexity),
    axial_load            = COALESCE((v_final->>'axial_load'), e.axial_load),
    lumbar_load           = COALESCE((v_final->>'lumbar_load'), e.lumbar_load),
    balance_requirement   = COALESCE((v_final->>'balance_requirement'), e.balance_requirement),
    fatigue_cost          = COALESCE((v_final->>'fatigue_cost'), e.fatigue_cost),
    safe_to_failure       = COALESCE((v_final->>'safe_to_failure')::boolean, e.safe_to_failure),
    primary_muscles       = COALESCE(
      CASE WHEN v_final ? 'primary_muscles'
           THEN ARRAY(SELECT jsonb_array_elements_text(v_final->'primary_muscles'))
      END, e.primary_muscles),
    secondary_muscles     = COALESCE(
      CASE WHEN v_final ? 'secondary_muscles'
           THEN ARRAY(SELECT jsonb_array_elements_text(v_final->'secondary_muscles'))
      END, e.secondary_muscles),
    contraindications     = COALESCE(
      CASE WHEN v_final ? 'contraindications'
           THEN ARRAY(SELECT jsonb_array_elements_text(v_final->'contraindications'))
      END, e.contraindications),
    metadata_status       = 'approved',
    metadata_source       = COALESCE(v_sug.source, 'rule'),
    metadata_confidence   = v_confidence,
    metadata_reviewed_by  = v_uid,
    metadata_reviewed_at  = now(),
    metadata_version      = COALESCE(e.metadata_version, 0) + 1
  WHERE e.id = v_sug.exercise_id
  RETURNING * INTO v_ex;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'exercise_not_found';
  END IF;

  -- Mark this suggestion approved
  UPDATE public.exercise_metadata_suggestions
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = v_uid
   WHERE id = _suggestion_id;

  -- Supersede any other pending suggestions for the same exercise
  UPDATE public.exercise_metadata_suggestions
     SET status = 'superseded',
         reviewed_at = now(),
         reviewed_by = v_uid
   WHERE exercise_id = v_sug.exercise_id
     AND id <> _suggestion_id
     AND status = 'pending';

  RETURN v_ex;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_exercise_metadata_suggestion(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_exercise_metadata_suggestion(
  _suggestion_id uuid,
  _reason text
)
RETURNS public.exercise_metadata_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sug public.exercise_metadata_suggestions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
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
     AND status = 'pending'
  RETURNING * INTO v_sug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion_not_found_or_not_pending';
  END IF;

  RETURN v_sug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_exercise_metadata_suggestion(uuid, text) TO authenticated;
