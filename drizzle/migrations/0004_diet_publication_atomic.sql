-- FASE 6 — publicação atômica + snapshot nutricional histórico + versionamento.
-- Migration ADITIVA: não altera, não apaga e não reserializa nenhuma dieta existente.

ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS published_by uuid NULL,
  ADD COLUMN IF NOT EXISTS content_revision integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_ai_plans_published_diet
  ON public.ai_plans (student_id, tipo, is_draft, published_at DESC);

-- Evita dois rascunhos para a mesma versão publicada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_plans_diet_draft_parent
  ON public.ai_plans (parent_plan_id)
  WHERE tipo = 'dieta' AND is_draft = true AND parent_plan_id IS NOT NULL;

/* -------------------------------------------------------------------------- */
/* content_revision — revisão concorrente da MESMA linha (≠ version)           */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.bump_ai_plan_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.conteudo IS DISTINCT FROM OLD.conteudo
      OR NEW.conteudo_json IS DISTINCT FROM OLD.conteudo_json
      OR NEW.protocols IS DISTINCT FROM OLD.protocols
      OR NEW.titulo IS DISTINCT FROM OLD.titulo
      OR NEW.fase IS DISTINCT FROM OLD.fase
      OR NEW.diet_strategy IS DISTINCT FROM OLD.diet_strategy
      OR NEW.strategy_source IS DISTINCT FROM OLD.strategy_source
      OR NEW.generation_intent IS DISTINCT FROM OLD.generation_intent
      OR NEW.viability_score IS DISTINCT FROM OLD.viability_score
      OR NEW.viability_breakdown IS DISTINCT FROM OLD.viability_breakdown) THEN
    NEW.content_revision := COALESCE(OLD.content_revision, 1) + 1;
  ELSE
    NEW.content_revision := COALESCE(OLD.content_revision, 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_ai_plan_content_revision ON public.ai_plans;
CREATE TRIGGER trg_bump_ai_plan_content_revision
  BEFORE UPDATE ON public.ai_plans
  FOR EACH ROW EXECUTE FUNCTION public.bump_ai_plan_content_revision();

/* -------------------------------------------------------------------------- */
/* Imutabilidade da dieta structured publicada                                 */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.guard_published_structured_diet_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.tipo = 'dieta'
     AND OLD.is_draft IS FALSE
     AND (OLD.conteudo_json #>> '{meta,foodContractVersion}') IS NOT NULL THEN
    IF (NEW.conteudo IS DISTINCT FROM OLD.conteudo
        OR NEW.conteudo_json IS DISTINCT FROM OLD.conteudo_json
        OR NEW.protocols IS DISTINCT FROM OLD.protocols
        OR NEW.titulo IS DISTINCT FROM OLD.titulo
        OR NEW.fase IS DISTINCT FROM OLD.fase
        OR NEW.diet_strategy IS DISTINCT FROM OLD.diet_strategy
        OR NEW.strategy_source IS DISTINCT FROM OLD.strategy_source
        OR NEW.generation_intent IS DISTINCT FROM OLD.generation_intent
        OR NEW.viability_score IS DISTINCT FROM OLD.viability_score
        OR NEW.viability_breakdown IS DISTINCT FROM OLD.viability_breakdown
        OR NEW.student_id IS DISTINCT FROM OLD.student_id
        OR NEW.parent_plan_id IS DISTINCT FROM OLD.parent_plan_id
        OR NEW.version IS DISTINCT FROM OLD.version
        OR NEW.is_draft IS DISTINCT FROM OLD.is_draft) THEN
      RAISE EXCEPTION 'published_diet_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_published_structured_diet ON public.ai_plans;
CREATE TRIGGER trg_guard_published_structured_diet
  BEFORE UPDATE ON public.ai_plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_structured_diet_immutability();

/* -------------------------------------------------------------------------- */
/* RPC transacional de publicação                                              */
/* -------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.publish_diet_plan_atomic(
  p_plan_id uuid,
  p_expected_revision integer,
  p_final_plan jsonb,
  p_final_markdown text,
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
  v_uid uuid := auth.uid();
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

  -- Integridade estrutural do JSON final (o cálculo continua sendo do nutritionCore).
  IF (p_final_plan #>> '{meta,foodContractVersion}') IS NULL
     OR (p_final_plan #>> '{meta,nutritionSnapshotVersion}') IS NULL THEN
    RAISE EXCEPTION 'publication_schema_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_final_plan->'days', '[]'::jsonb)) d,
         jsonb_array_elements(COALESCE(d->'meals', '[]'::jsonb)) m,
         jsonb_array_elements(COALESCE(m->'items', '[]'::jsonb)) it
    WHERE COALESCE(it->>'foodId', '') = ''
       OR COALESCE((it->>'qtyGrams')::numeric, 0) <= 0
       OR it->'nutritionSnapshot' IS NULL
       OR COALESCE(it->>'resolutionStatus', '') <> 'snapshot'
  ) THEN
    RAISE EXCEPTION 'publication_schema_invalid';
  END IF;

  -- Food assertions: a base não pode ter mudado entre o cálculo e o commit.
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

  -- Plano anterior só vira renovado AQUI, na mesma transação.
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

REVOKE ALL ON FUNCTION public.publish_diet_plan_atomic(uuid, integer, jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_diet_plan_atomic(uuid, integer, jsonb, text, jsonb) TO authenticated;