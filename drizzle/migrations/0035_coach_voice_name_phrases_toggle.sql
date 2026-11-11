-- Falas com nome do aluno: chave geral (desligada por padrão). Nada é apagado.
ALTER TABLE public.coach_voice_config
  ADD COLUMN name_phrases_enabled boolean NOT NULL DEFAULT false;

-- Áudios para a câmera: as com nome só voltam quando o admin religa a chave.
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
  ),
  names AS (
    SELECT COALESCE((SELECT c.name_phrases_enabled FROM public.coach_voice_config c WHERE c.id), false) AS enabled
  )
  SELECT p.phrase_key, t.file_path, p.tipo, p.momento, p.frequencia, p.texto
  FROM public.coach_voice_phrases p
  JOIN public.coach_voice_takes t ON t.id = p.approved_take_id
  LEFT JOIN public.coach_voice_templates tp ON tp.id = p.template_id
  CROSS JOIN target
  CROSS JOIN names
  WHERE auth.uid() IS NOT NULL
    AND (
      p.tipo = 'sistema'
      OR (p.tipo = 'personalizada' AND p.ativo)
      OR (p.tipo = 'nome' AND names.enabled AND p.ativo AND tp.ativo AND p.student_id = target.uid)
    )
$$;
REVOKE ALL ON FUNCTION public.coach_voice_clips(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_voice_clips(uuid) TO authenticated;

-- A câmera também confere a chave (defesa extra além do filtro acima).
CREATE OR REPLACE FUNCTION public.coach_voice_name_phrases_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE((SELECT c.name_phrases_enabled FROM public.coach_voice_config c WHERE c.id), false)
$$;
REVOKE ALL ON FUNCTION public.coach_voice_name_phrases_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_voice_name_phrases_enabled() TO authenticated;