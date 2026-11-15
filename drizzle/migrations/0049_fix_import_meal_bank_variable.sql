CREATE OR REPLACE FUNCTION public.import_meal_bank(
  _foods jsonb,
  _aliases jsonb,
  _meals jsonb,
  _deactivate_codes text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f jsonb;
  m jsonb;
  it jsonb;
  ids jsonb := '{}'::jsonb;
  new_id uuid;
  v_meal_id uuid;
  was_insert boolean;
  food_ref text;
  n_new int := 0;
  n_upd int := 0;
  n_foods int := 0;
  n_off int := 0;
  pos int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Somente o admin pode importar o banco de refeições' USING ERRCODE = '42501';
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(_foods, '[]'::jsonb)) LOOP
    INSERT INTO public.foods (name, calories, protein, carbs, fats, portion, portion_size, source)
    VALUES (
      btrim(f->>'name'),
      coalesce((f->>'kcal')::numeric, 0),
      coalesce((f->>'p')::numeric, 0),
      coalesce((f->>'c')::numeric, 0),
      coalesce((f->>'g')::numeric, 0),
      'gramas', 100, 'banco_refeicoes'
    ) RETURNING id INTO new_id;
    ids := ids || jsonb_build_object(f->>'temp_id', new_id::text);
    n_foods := n_foods + 1;
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(_aliases, '[]'::jsonb)) LOOP
    INSERT INTO public.food_aliases (alias, food_id)
    VALUES (f->>'alias', (f->>'food_id')::uuid)
    ON CONFLICT (alias) DO UPDATE SET food_id = EXCLUDED.food_id;
  END LOOP;

  FOR m IN SELECT * FROM jsonb_array_elements(coalesce(_meals, '[]'::jsonb)) LOOP
    INSERT INTO public.meal_bank (code, slot, name, origin, tags, prep)
    VALUES (
      upper(btrim(m->>'code')),
      m->>'slot',
      btrim(m->>'name'),
      m->>'origin',
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(m->'tags', '[]'::jsonb))), '{}'::text[]),
      nullif(btrim(coalesce(m->>'prep', '')), '')
    )
    ON CONFLICT (code) DO UPDATE SET
      slot = EXCLUDED.slot,
      name = EXCLUDED.name,
      origin = EXCLUDED.origin,
      tags = EXCLUDED.tags,
      prep = EXCLUDED.prep
    RETURNING id, (xmax = 0) INTO v_meal_id, was_insert;

    IF was_insert THEN n_new := n_new + 1; ELSE n_upd := n_upd + 1; END IF;

    DELETE FROM public.meal_bank_items WHERE meal_bank_items.meal_id = v_meal_id;
    pos := 0;
    FOR it IN SELECT * FROM jsonb_array_elements(coalesce(m->'items', '[]'::jsonb)) LOOP
      food_ref := it->>'food_id';
      IF ids ? food_ref THEN food_ref := ids->>food_ref; END IF;
      INSERT INTO public.meal_bank_items (meal_id, food_id, grams, ordem)
      VALUES (v_meal_id, food_ref::uuid, (it->>'grams')::numeric, pos);
      pos := pos + 1;
    END LOOP;
  END LOOP;

  IF _deactivate_codes IS NOT NULL AND array_length(_deactivate_codes, 1) > 0 THEN
    UPDATE public.meal_bank SET active = false
    WHERE code = ANY(_deactivate_codes) AND active;
    GET DIAGNOSTICS n_off = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('novas', n_new, 'atualizadas', n_upd, 'alimentos_criados', n_foods, 'desativadas', n_off);
END;
$$;

REVOKE ALL ON FUNCTION public.import_meal_bank(jsonb, jsonb, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_meal_bank(jsonb, jsonb, jsonb, text[]) TO authenticated, service_role;