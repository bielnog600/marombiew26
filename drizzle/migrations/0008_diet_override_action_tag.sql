CREATE OR REPLACE FUNCTION public.track_student_diet_override()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := CASE WHEN v_uid IS NOT NULL AND public.has_role(v_uid, 'admin') THEN 'treinador' ELSE 'aluno' END;
  v_action text;
  v_tag text := NEW.edited_meta->>'__action';
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := v_uid;
  NEW.updated_by_role := v_role;
  IF NEW.edited_meta ? '__action' THEN
    NEW.edited_meta := NEW.edited_meta - '__action';
  END IF;
  IF v_role = 'aluno' AND v_tag IN ('aluno_ajustou_porcoes','aluno_desfez_ajuste','aluno_restaurou') THEN
    v_action := v_tag;
  ELSIF NEW.groups = '{}'::jsonb AND NEW.substitutions = '{}'::jsonb THEN
    v_action := CASE WHEN v_role = 'treinador' THEN 'treinador_descartou' ELSE 'aluno_restaurou' END;
  ELSE
    v_action := CASE WHEN v_role = 'treinador' THEN 'treinador_editou' ELSE 'aluno_editou' END;
  END IF;
  INSERT INTO public.student_diet_override_events(plan_id, student_id, actor_id, actor_role, action, groups)
  VALUES (NEW.plan_id, NEW.student_id, v_uid, v_role, v_action, NEW.groups);
  RETURN NEW;
END;
$function$;