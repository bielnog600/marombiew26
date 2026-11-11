CREATE TABLE public.coach_voice_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  voice_id text,
  voice_name text,
  model_id text,
  stability numeric NOT NULL DEFAULT 0.40 CHECK (stability >= 0 AND stability <= 1),
  similarity_boost numeric NOT NULL DEFAULT 1.0 CHECK (similarity_boost >= 0 AND similarity_boost <= 1),
  language_code text NOT NULL DEFAULT 'pt',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.coach_voice_config TO authenticated;
GRANT ALL ON public.coach_voice_config TO service_role;
ALTER TABLE public.coach_voice_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coach voice config" ON public.coach_voice_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.coach_voice_phrases (
  phrase_key text PRIMARY KEY CHECK (phrase_key ~ '^[a-z0-9_]{1,80}$'),
  texto text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 300),
  categoria text NOT NULL,
  approved_take_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.coach_voice_phrases TO authenticated;
GRANT ALL ON public.coach_voice_phrases TO service_role;
ALTER TABLE public.coach_voice_phrases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage coach voice phrases" ON public.coach_voice_phrases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.coach_voice_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_key text NOT NULL REFERENCES public.coach_voice_phrases(phrase_key) ON DELETE CASCADE,
  file_path text NOT NULL,
  texto text NOT NULL,
  voice_id text NOT NULL,
  model_id text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_voice_takes_phrase_idx ON public.coach_voice_takes (phrase_key, created_at DESC);
GRANT SELECT ON public.coach_voice_takes TO authenticated;
GRANT ALL ON public.coach_voice_takes TO service_role;
ALTER TABLE public.coach_voice_takes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read coach voice takes" ON public.coach_voice_takes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.coach_voice_phrases
  ADD CONSTRAINT coach_voice_phrases_approved_take_fk
  FOREIGN KEY (approved_take_id) REFERENCES public.coach_voice_takes(id) ON DELETE SET NULL;

CREATE TRIGGER coach_voice_phrases_touch BEFORE UPDATE ON public.coach_voice_phrases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER coach_voice_config_touch BEFORE UPDATE ON public.coach_voice_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Aprova uma versão: só uma aprovada por fala, de forma atômica.
CREATE OR REPLACE FUNCTION public.approve_coach_voice_take(_take_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT phrase_key INTO _key FROM public.coach_voice_takes WHERE id = _take_id;
  IF _key IS NULL THEN
    RAISE EXCEPTION 'take_not_found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.coach_voice_takes SET approved = (id = _take_id) WHERE phrase_key = _key;
  UPDATE public.coach_voice_phrases SET approved_take_id = _take_id WHERE phrase_key = _key;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_coach_voice_take(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_coach_voice_take(uuid) TO authenticated;

-- Áudios aprovados para a tela da câmera (qualquer usuário logado).
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
$$;
REVOKE ALL ON FUNCTION public.coach_voice_approved() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_voice_approved() TO authenticated;