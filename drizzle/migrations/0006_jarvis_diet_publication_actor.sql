-- Aditivo: variante da publicação atômica que recebe o ator explicitamente
-- (usada apenas pela ponte jarvis-bridge, com service role). A função
-- original publish_diet_plan_atomic permanece intacta.
CREATE OR REPLACE FUNCTION public.publish_diet_plan_atomic_actor(
  p_actor_id uuid,
  p_plan_id uuid,
  p_expected_revision integer,
  p_final_plan jsonb,
  p_final_markdown text,
  p_final_protocols jsonb,
  p_food_assertions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.ai_plans%ROWTYPE;
  v_a jsonb;
  v_f public.foods%ROWTYPE;
  v_new_rev integer;
  v_now timestamptz := now();
  v_uid uuid := p_actor_id;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_row FROM public.ai_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_row.tipo <> 'dieta' THEN RAISE EXCEPTION 'structured_plan_required'; END IF;
  IF v_row.is_draft IS NOT TRUE THEN RAISE EXCEPTION 'already_published'; END IF;
  IF COALESCE(v_row.content_revision, 1) IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'draft_changed_refresh_required';
  END IF;

  IF (p_final_plan #>> '{meta,foodContractVersion}') IS NULL
     OR (p_final_plan #>> '{meta,nutritionSnapshotVersion}') IS NULL THEN
    RAISE EXCEPTION 'publication_schema_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_final_plan->'days', '[]'::jsonb)) d,
         jsonb_array_elements(COALESCE(d.value->'meals', '[]'::jsonb)) m,
         jsonb_array_elements(COALESCE(m.value->'items', '[]'::jsonb)) it
    WHERE COALESCE(it.value->>'foodId', '') = ''
       OR COALESCE((it.value->>'qtyGrams')::numeric, 0) <= 0
       OR it.value->'nutritionSnapshot' IS NULL
       OR COALESCE(it.value->>'resolutionStatus', '') <> 'snapshot'
  ) THEN
    RAISE EXCEPTION 'publication_schema_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_final_plan->'days', '[]'::jsonb)) d,
         jsonb_array_elements(COALESCE(d.value->'meals', '[]'::jsonb)) m,
         jsonb_array_elements(COALESCE(m.value->'items', '[]'::jsonb)) it
    LEFT JOIN LATERAL (
      SELECT a.value AS a
      FROM jsonb_array_elements(COALESCE(p_food_assertions, '[]'::jsonb)) a
      WHERE a.value->>'id' = it.value->>'foodId'
      LIMIT 1
    ) asrt ON true
    WHERE asrt.a IS NULL
       OR round(COALESCE((it.value #>> '{nutritionSnapshot,portionSize}')::numeric, -1), 4)
          IS DISTINCT FROM round(COALESCE((asrt.a->>'portionSize')::numeric, -2), 4)
       OR round(COALESCE((it.value #>> '{nutritionSnapshot,kcal}')::numeric, -1), 4)
          IS DISTINCT FROM round(COALESCE((asrt.a->>'kcal')::numeric, -2), 4)
       OR round(COALESCE((it.value #>> '{nutritionSnapshot,p}')::numeric, -1), 4)
          IS DISTINCT FROM round(COALESCE((asrt.a->>'p')::numeric, -2), 4)
       OR round(COALESCE((it.value #>> '{nutritionSnapshot,c}')::numeric, -1), 4)
          IS DISTINCT FROM round(COALESCE((asrt.a->>'c')::numeric, -2), 4)
       OR round(COALESCE((it.value #>> '{nutritionSnapshot,g}')::numeric, -1), 4)
          IS DISTINCT FROM round(COALESCE((asrt.a->>'g')::numeric, -2), 4)
       OR COALESCE(it.value #>> '{nutritionSnapshot,brand}', '')
          IS DISTINCT FROM COALESCE(asrt.a->>'brand', '')
       OR COALESCE(it.value #>> '{nutritionSnapshot,source}', '')
          IS DISTINCT FROM COALESCE(asrt.a->>'source', '')
       OR COALESCE(it.value->>'name', '') IS DISTINCT FROM COALESCE(asrt.a->>'name', '')
  ) THEN
    RAISE EXCEPTION 'publication_schema_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(p_final_protocols #> '{weekly_energy_schedule,generated_adjustments}', '{}'::jsonb)) day,
         jsonb_array_elements(COALESCE(day.value->'instructions', '[]'::jsonb)) ins
    WHERE COALESCE(ins.value->>'food_id', '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p_food_assertions, '[]'::jsonb)) a
        WHERE a.value->>'id' = ins.value->>'food_id'
      )
  ) THEN
    RAISE EXCEPTION 'publication_schema_invalid';
  END IF;

  FOR v_a IN SELECT value FROM jsonb_array_elements(COALESCE(p_food_assertions, '[]'::jsonb)) LOOP
    SELECT * INTO v_f FROM public.foods WHERE id::text = v_a->>'id';
    IF NOT FOUND THEN RAISE EXCEPTION 'food_catalog_changed'; END IF;
    IF COALESCE(v_f.name, '') IS DISTINCT FROM COALESCE(v_a->>'name', '')
       OR round(COALESCE(v_f.portion_size, 100), 4) IS DISTINCT FROM round(COALESCE((v_a->>'portionSize')::numeric, 100), 4)
       OR round(COALESCE(v_f.calories, 0), 4) IS DISTINCT FROM round(COALESCE((v_a->>'kcal')::numeric, 0), 4)
       OR round(COALESCE(v_f.protein, 0), 4) IS DISTINCT FROM round(COALESCE((v_a->>'p')::numeric, 0), 4)
       OR round(COALESCE(v_f.carbs, 0), 4) IS DISTINCT FROM round(COALESCE((v_a->>'c')::numeric, 0), 4)
       OR round(COALESCE(v_f.fats, 0), 4) IS DISTINCT FROM round(COALESCE((v_a->>'g')::numeric, 0), 4)
       OR COALESCE(v_f.brand, '') IS DISTINCT FROM COALESCE(v_a->>'brand', '')
       OR COALESCE(v_f.source, '') IS DISTINCT FROM COALESCE(v_a->>'source', '')
    THEN
      RAISE EXCEPTION 'food_catalog_changed';
    END IF;
  END LOOP;

  v_new_rev := COALESCE(v_row.content_revision, 1) + 1;

  UPDATE public.ai_plans
     SET cycle_status = 'renovado'
   WHERE student_id = v_row.student_id
     AND tipo = 'dieta'
     AND is_draft = false
     AND id <> p_plan_id
     AND cycle_status = 'em_dia';

  UPDATE public.ai_plans
     SET conteudo_json = jsonb_set(
           jsonb_set(
             jsonb_set(p_final_plan, '{meta,publishedAt}', to_jsonb(to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), true),
             '{meta,publishedBy}', to_jsonb(v_uid::text), true),
           '{meta,publicationRevision}', to_jsonb(v_new_rev), true),
         conteudo = p_final_markdown,
         protocols = COALESCE(p_final_protocols, protocols),
         is_draft = false,
         published_at = v_now,
         published_by = v_uid,
         cycle_status = 'em_dia',
         migration_status = 'completed',
         migration_error = NULL,
         whatsapp_notified_at = NULL,
         whatsapp_notified_count = 0
   WHERE id = p_plan_id;

  SELECT * INTO v_row FROM public.ai_plans WHERE id = p_plan_id;
  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.publish_diet_plan_atomic_actor(uuid, uuid, integer, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_diet_plan_atomic_actor(uuid, uuid, integer, jsonb, text, jsonb, jsonb) TO service_role;