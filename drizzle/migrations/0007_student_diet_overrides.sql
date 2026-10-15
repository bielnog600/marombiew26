CREATE TABLE public.student_diet_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE,
  student_id uuid NOT NULL,
  substitutions jsonb NOT NULL DEFAULT '{}'::jsonb,
  edited_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  groups jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_by_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_diet_overrides_student ON public.student_diet_overrides(student_id);
GRANT SELECT, INSERT, UPDATE ON public.student_diet_overrides TO authenticated;
GRANT ALL ON public.student_diet_overrides TO service_role;
ALTER TABLE public.student_diet_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aluno vê o próprio override" ON public.student_diet_overrides FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Aluno cria o próprio override" ON public.student_diet_overrides FOR INSERT TO authenticated
  WITH CHECK ((student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.ai_plans p WHERE p.id = plan_id AND p.student_id = auth.uid()))
              OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Aluno atualiza o próprio override" ON public.student_diet_overrides FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.student_diet_override_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  student_id uuid NOT NULL,
  actor_id uuid,
  actor_role text NOT NULL,
  action text NOT NULL,
  groups jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sdoe_plan ON public.student_diet_override_events(plan_id, created_at DESC);
GRANT SELECT ON public.student_diet_override_events TO authenticated;
GRANT ALL ON public.student_diet_override_events TO service_role;
ALTER TABLE public.student_diet_override_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver histórico de override" ON public.student_diet_override_events FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.track_student_diet_override()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := CASE WHEN v_uid IS NOT NULL AND public.has_role(v_uid, 'admin') THEN 'treinador' ELSE 'aluno' END;
  v_action text;
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := v_uid;
  NEW.updated_by_role := v_role;
  IF NEW.groups = '{}'::jsonb AND NEW.substitutions = '{}'::jsonb THEN
    v_action := CASE WHEN v_role = 'treinador' THEN 'treinador_descartou' ELSE 'aluno_restaurou' END;
  ELSE
    v_action := CASE WHEN v_role = 'treinador' THEN 'treinador_editou' ELSE 'aluno_editou' END;
  END IF;
  INSERT INTO public.student_diet_override_events(plan_id, student_id, actor_id, actor_role, action, groups)
  VALUES (NEW.plan_id, NEW.student_id, v_uid, v_role, v_action, NEW.groups);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_track_student_diet_override BEFORE INSERT OR UPDATE ON public.student_diet_overrides
  FOR EACH ROW EXECUTE FUNCTION public.track_student_diet_override();

ALTER PUBLICATION supabase_realtime ADD TABLE public.student_diet_overrides;