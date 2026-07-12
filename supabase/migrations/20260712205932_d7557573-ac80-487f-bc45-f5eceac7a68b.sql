
-- 1) Add tracking columns for post-finalize changes
ALTER TABLE public.exercise_metadata_ground_truth
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS changed_fields text[],
  ADD COLUMN IF NOT EXISTS previous_review_version integer,
  ADD COLUMN IF NOT EXISTS diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vocabulary_version text,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- 2) Fix legacy active-unique index (it wasn't reviewer-aware, so it blocked
--    any human save once ai-agent had one row per exercise for the same run).
DROP INDEX IF EXISTS public.exercise_metadata_ground_truth_active_uidx;

-- 3) At most one "current" row per (exercise, reviewer, reviewer_kind, classifier_run_id).
CREATE UNIQUE INDEX IF NOT EXISTS emgt_current_per_reviewer_uidx
  ON public.exercise_metadata_ground_truth (exercise_id, reviewer_id, reviewer_kind, classifier_run_id)
  WHERE is_current = true;

-- 4) At most one active draft per reviewer+exercise+kind+run.
CREATE UNIQUE INDEX IF NOT EXISTS emgt_active_draft_uidx
  ON public.exercise_metadata_ground_truth (exercise_id, reviewer_id, reviewer_kind, classifier_run_id)
  WHERE status = 'human_review_draft';

-- Backfill: existing rows are their own "current" (only ai-agent draft_benchmark rows exist)
UPDATE public.exercise_metadata_ground_truth
   SET is_current = true
 WHERE is_current IS NOT TRUE;

-- 5) Transactional RPC. Runs as SECURITY DEFINER and does everything atomically.
-- Signature: action ∈ ('save_draft','finalize','amend_after_final').
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
  _change_reason text DEFAULT NULL,
  _changed_fields text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  status text,
  review_version integer,
  previous_review_version integer,
  is_current boolean,
  diff jsonb,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev record;
  v_new_version integer;
  v_final_status text;
  v_new_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_diff jsonb := '{}'::jsonb;
  v_key text;
  v_prev_val jsonb;
  v_new_val jsonb;
  v_is_amend boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF _action NOT IN ('save_draft','finalize','amend_after_final') THEN
    RAISE EXCEPTION 'invalid_action: %', _action;
  END IF;
  IF _reviewer_kind IS NULL OR length(_reviewer_kind) = 0 THEN
    RAISE EXCEPTION 'reviewer_kind_required';
  END IF;
  IF _vocabulary_version IS DISTINCT FROM _server_vocabulary_version THEN
    RAISE EXCEPTION 'vocabulary_version_mismatch: server=% client=%',
      _server_vocabulary_version, _vocabulary_version USING ERRCODE = '40001';
  END IF;

  -- Lock the currently-active row (if any) for this reviewer+exercise+kind+run
  SELECT * INTO v_prev
    FROM public.exercise_metadata_ground_truth
   WHERE exercise_id = _exercise_id
     AND reviewer_id = v_uid
     AND reviewer_kind = _reviewer_kind
     AND classifier_run_id = _classifier_run_id
     AND is_current = true
   FOR UPDATE;

  IF v_prev.id IS NULL THEN
    IF _expected_version <> 0 THEN
      RAISE EXCEPTION 'version_conflict: server=0 client=%', _expected_version USING ERRCODE = '40001';
    END IF;
    v_new_version := 1;
  ELSE
    IF v_prev.review_version <> _expected_version THEN
      RAISE EXCEPTION 'version_conflict: server=% client=%',
        v_prev.review_version, _expected_version USING ERRCODE = '40001';
    END IF;
    v_new_version := v_prev.review_version + 1;

    IF v_prev.status = 'human_first_review' THEN
      -- Any change after finalize is an amendment.
      v_is_amend := true;
      IF _action = 'save_draft' THEN
        RAISE EXCEPTION 'cannot_draft_after_finalize' USING ERRCODE = '22023';
      END IF;
      IF _change_reason IS NULL OR length(trim(_change_reason)) < 10 THEN
        RAISE EXCEPTION 'change_reason_required_after_finalize' USING ERRCODE = '22023';
      END IF;
      IF _changed_fields IS NULL OR array_length(_changed_fields,1) IS NULL THEN
        RAISE EXCEPTION 'changed_fields_required_after_finalize' USING ERRCODE = '22023';
      END IF;
    END IF;

    -- Compute diff of reviewed_metadata + field_review_status
    FOR v_key IN
      SELECT unnest(ARRAY(SELECT jsonb_object_keys(coalesce(v_prev.reviewed_metadata,'{}'::jsonb) || coalesce(_reviewed_metadata,'{}'::jsonb))))
    LOOP
      v_prev_val := coalesce(v_prev.reviewed_metadata,'{}'::jsonb) -> v_key;
      v_new_val  := coalesce(_reviewed_metadata,'{}'::jsonb) -> v_key;
      IF v_prev_val IS DISTINCT FROM v_new_val THEN
        v_diff := v_diff || jsonb_build_object(
          v_key,
          jsonb_build_object(
            'from_value', v_prev_val,
            'to_value',   v_new_val,
            'from_state', (coalesce(v_prev.field_review_status,'{}'::jsonb) -> v_key),
            'to_state',   (coalesce(_field_review_status,'{}'::jsonb) -> v_key)
          )
        );
      END IF;
    END LOOP;

    -- Mark previous as superseded and not current
    UPDATE public.exercise_metadata_ground_truth
       SET status = 'superseded', is_current = false, updated_at = v_now
     WHERE id = v_prev.id;
  END IF;

  v_final_status := CASE _action
    WHEN 'save_draft' THEN 'human_review_draft'
    ELSE 'human_first_review'
  END;

  INSERT INTO public.exercise_metadata_ground_truth (
    id, pilot_selection_id, classifier_run_id, exercise_id,
    reviewed_metadata, field_review_status, field_notes, evidence,
    reviewer_id, reviewer_kind, reviewed_at, review_version, status,
    previous_review_version, changed_fields, change_reason, diff,
    vocabulary_version, is_current, created_at, updated_at
  ) VALUES (
    v_new_id, _pilot_selection_id, _classifier_run_id, _exercise_id,
    coalesce(_reviewed_metadata,'{}'::jsonb),
    coalesce(_field_review_status,'{}'::jsonb),
    coalesce(_field_notes,'{}'::jsonb),
    coalesce(_evidence,'{}'::jsonb),
    v_uid, _reviewer_kind, v_now, v_new_version, v_final_status,
    v_prev.review_version, _changed_fields, _change_reason, v_diff,
    _server_vocabulary_version, true, v_now, v_now
  );

  RETURN QUERY
    SELECT v_new_id, v_final_status, v_new_version, v_prev.review_version,
           true, v_diff, v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.save_human_first_review(
  text, uuid, text, uuid, text, jsonb, jsonb, jsonb, jsonb, integer, text, text, text, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_human_first_review(
  text, uuid, text, uuid, text, jsonb, jsonb, jsonb, jsonb, integer, text, text, text, text[]
) TO service_role;
