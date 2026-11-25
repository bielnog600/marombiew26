CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c jsonb := NEW.raw_user_meta_data->'cadastro';
  v_alt numeric; v_peso numeric; v_nasc date; v_dias smallint;
BEGIN
  INSERT INTO public.profiles (user_id, nome, email, telefone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email,
          NULLIF(left(regexp_replace(COALESCE(c->>'telefone',''), '[^0-9+ ]', '', 'g'), 25), ''));

  -- Never trust a role from client metadata: every signup is a student.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'aluno'::app_role);

  IF c IS NOT NULL AND jsonb_typeof(c) = 'object' THEN
    BEGIN v_alt := (c->>'altura')::numeric; IF v_alt NOT BETWEEN 120 AND 230 THEN v_alt := NULL; END IF; EXCEPTION WHEN others THEN v_alt := NULL; END;
    BEGIN v_peso := round((c->>'peso')::numeric, 1); IF v_peso NOT BETWEEN 30 AND 250 THEN v_peso := NULL; END IF; EXCEPTION WHEN others THEN v_peso := NULL; END;
    BEGIN v_nasc := (c->>'data_nascimento')::date; IF v_nasc > (current_date - interval '12 years') OR v_nasc < (current_date - interval '91 years') THEN v_nasc := NULL; END IF; EXCEPTION WHEN others THEN v_nasc := NULL; END;
    BEGIN v_dias := (c->>'dias_treino_semana')::smallint; IF v_dias NOT BETWEEN 2 AND 6 THEN v_dias := NULL; END IF; EXCEPTION WHEN others THEN v_dias := NULL; END;

    INSERT INTO public.students_profile (user_id, sexo, data_nascimento, altura, peso_inicial, tempo_treino, dias_treino_semana, local_treino, objetivo, lesoes)
    VALUES (NEW.id,
      CASE WHEN c->>'sexo' IN ('feminino','masculino') THEN c->>'sexo' END,
      v_nasc, v_alt, v_peso,
      NULLIF(left(c->>'tempo_treino', 60), ''), v_dias,
      NULLIF(left(c->>'local_treino', 60), ''),
      NULLIF(left(c->>'objetivo', 120), ''),
      NULLIF(left(trim(c->>'lesoes'), 1000), ''))
    ON CONFLICT (user_id) DO NOTHING;

    IF v_peso IS NOT NULL THEN
      INSERT INTO public.weight_logs (student_id, peso, observacao) VALUES (NEW.id, v_peso, 'Peso inicial (cadastro)');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;