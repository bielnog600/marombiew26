-- Falas de motivação (personalizadas e com o nome do aluno) na Correção ao vivo.
CREATE TABLE public.coach_voice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 300 AND position('{nome}' in texto) > 0),
  momento text NOT NULL CHECK (momento IN ('rep_completa', 'penultima_ultima', 'inicio_serie', 'fim_serie', 'rep_incompleta')),
  frequencia text NOT NULL DEFAULT 'as_vezes' CHECK (frequencia IN ('sempre', 'as_vezes', 'raramente')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_voice_templates TO authenticated;
GRANT ALL ON public.coach_voice_templates TO service_role;
ALTER TABLE public.coach_voice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coach voice templates" ON public.coach_voice_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER coach_voice_templates_touch BEFORE UPDATE ON public.coach_voice_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.coach_voice_phrases
  ADD COLUMN tipo text NOT NULL DEFAULT 'sistema' CHECK (tipo IN ('sistema', 'personalizada', 'nome')),
  ADD COLUMN momento text CHECK (momento IS NULL OR momento IN ('rep_completa', 'penultima_ultima', 'inicio_serie', 'fim_serie', 'rep_incompleta')),
  ADD COLUMN frequencia text NOT NULL DEFAULT 'sempre' CHECK (frequencia IN ('sempre', 'as_vezes', 'raramente')),
  ADD COLUMN ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN student_id uuid,
  ADD COLUMN template_id uuid REFERENCES public.coach_voice_templates(id) ON DELETE CASCADE;
ALTER TABLE public.coach_voice_phrases
  ADD CONSTRAINT coach_voice_phrases_tipo_shape CHECK (
    (tipo = 'sistema' AND student_id IS NULL AND template_id IS NULL)
    OR (tipo = 'personalizada' AND momento IS NOT NULL AND student_id IS NULL AND template_id IS NULL)
    OR (tipo = 'nome' AND student_id IS NOT NULL AND template_id IS NOT NULL)
  );
CREATE UNIQUE INDEX coach_voice_phrases_template_student_uidx
  ON public.coach_voice_phrases (template_id, student_id) WHERE tipo = 'nome';
CREATE INDEX coach_voice_phrases_student_idx ON public.coach_voice_phrases (student_id) WHERE student_id IS NOT NULL;
GRANT DELETE ON public.coach_voice_phrases TO authenticated;

-- As falas do sistema nunca são apagadas nem viram outro tipo.
CREATE OR REPLACE FUNCTION public.guard_coach_voice_system_phrase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo = 'sistema' THEN
      RAISE EXCEPTION 'As falas do sistema não podem ser apagadas' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    RAISE EXCEPTION 'O tipo da fala não pode mudar' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER coach_voice_phrases_guard_system
  BEFORE UPDATE OR DELETE ON public.coach_voice_phrases
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_voice_system_phrase();

ALTER TABLE public.coach_voice_config
  ADD COLUMN motivation_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.students_profile
  ADD COLUMN voice_name text CHECK (voice_name IS NULL OR length(btrim(voice_name)) BETWEEN 1 AND 60),
  ADD COLUMN voice_motivation_enabled boolean NOT NULL DEFAULT true;

-- Telas antigas: continuam recebendo só as falas do sistema.
CREATE OR REPLACE FUNCTION public.coach_voice_approved()
RETURNS TABLE(phrase_key text, file_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phrase_key, t.file_path
  FROM public.coach_voice_phrases p
  JOIN public.coach_voice_takes t ON t.id = p.approved_take_id
  WHERE p.tipo = 'sistema'
$$;

-- Áudios para a câmera: sistema + personalizadas ativas + as com o nome do próprio aluno.
-- O admin pode pedir as de um aluno (teste); qualquer outro recebe só as dele.
CREATE OR REPLACE FUNCTION public.coach_voice_clips(_student_id uuid DEFAULT NULL)
RETURNS TABLE(phrase_key text, file_path text, tipo text, momento text, frequencia text, texto text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT CASE
      WHEN _student_id IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN _student_id
      ELSE auth.uid()
    END AS uid
  )
  SELECT p.phrase_key, t.file_path, p.tipo, p.momento, p.frequencia, p.texto
  FROM public.coach_voice_phrases p
  JOIN public.coach_voice_takes t ON t.id = p.approved_take_id
  LEFT JOIN public.coach_voice_templates tp ON tp.id = p.template_id
  CROSS JOIN target
  WHERE auth.uid() IS NOT NULL
    AND (
      p.tipo = 'sistema'
      OR (p.tipo = 'personalizada' AND p.ativo)
      OR (p.tipo = 'nome' AND p.ativo AND tp.ativo AND p.student_id = target.uid)
    )
$$;
REVOKE ALL ON FUNCTION public.coach_voice_clips(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_voice_clips(uuid) TO authenticated;

-- Falas de motivação ligadas: chave geral do admin e a do aluno (sem perfil = ligada).
CREATE OR REPLACE FUNCTION public.coach_voice_motivation_enabled(_student_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT CASE
      WHEN _student_id IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN _student_id
      ELSE auth.uid()
    END AS uid
  )
  SELECT auth.uid() IS NOT NULL
    AND COALESCE((SELECT c.motivation_enabled FROM public.coach_voice_config c WHERE c.id), true)
    AND COALESCE((SELECT sp.voice_motivation_enabled FROM public.students_profile sp, target WHERE sp.user_id = target.uid), true)
$$;
REVOKE ALL ON FUNCTION public.coach_voice_motivation_enabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_voice_motivation_enabled(uuid) TO authenticated;

-- Arquivos das falas com nome (pasta nome_<modelo>_<aluno>) só para o próprio aluno e o admin.
DROP POLICY IF EXISTS "Signed-in users read coach voice audio" ON storage.objects;
CREATE POLICY "Signed-in users read coach voice audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'coach-voice'
    AND (
      split_part(name, '/', 1) NOT LIKE 'nome\_%'
      OR split_part(name, '/', 1) LIKE '%\_' || replace(auth.uid()::text, '-', '')
      OR public.has_role(auth.uid(), 'admin')
    )
  );