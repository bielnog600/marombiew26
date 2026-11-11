-- Idioma do aparelho do aluno (atualizado pelo próprio app ao abrir).
ALTER TABLE public.students_profile ADD COLUMN IF NOT EXISTS app_language text;
ALTER TABLE public.students_profile
  ADD CONSTRAINT students_profile_app_language_check
  CHECK (app_language IS NULL OR app_language IN ('pt', 'en'));

-- Cache de traduções no servidor: uma por conteúdo e idioma.
CREATE TABLE public.plan_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid,
  language text NOT NULL CHECK (language IN ('en')),
  content_hash text NOT NULL,
  translated jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash, language)
);
CREATE INDEX plan_translations_plan_idx ON public.plan_translations (plan_id, language);
GRANT ALL ON public.plan_translations TO service_role;
ALTER TABLE public.plan_translations ENABLE ROW LEVEL SECURITY;
-- Sem políticas de propósito: só a função translate-plan (service role) lê e grava.

CREATE OR REPLACE FUNCTION public.set_my_app_language(_language text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _language IS NULL OR _language NOT IN ('pt', 'en') THEN
    RAISE EXCEPTION 'invalid language';
  END IF;
  UPDATE public.students_profile
     SET app_language = _language
   WHERE user_id = auth.uid()
     AND app_language IS DISTINCT FROM _language;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_app_language(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_app_language(text) TO authenticated;

-- Ao publicar/editar dieta ou treino de aluno com app em inglês, pede a
-- tradução em segundo plano (pg_net é assíncrono: nunca bloqueia a publicação).
CREATE OR REPLACE FUNCTION public.queue_plan_translation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang text;
BEGIN
  IF NEW.is_draft IS DISTINCT FROM false OR NEW.tipo NOT IN ('dieta', 'treino') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.conteudo IS NOT DISTINCT FROM NEW.conteudo
     AND OLD.is_draft IS NOT DISTINCT FROM NEW.is_draft THEN
    RETURN NEW;
  END IF;
  SELECT sp.app_language INTO v_lang
    FROM public.students_profile sp
   WHERE sp.user_id = NEW.student_id
   LIMIT 1;
  IF v_lang IS DISTINCT FROM 'en' THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://plqdoweunmpnlzvtisnn.supabase.co/functions/v1/translate-plan',
      body := jsonb_build_object('planId', NEW.id, 'targetLanguage', 'en', 'source', 'publish'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWRvd2V1bm1wbmx6dnRpc25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTE4ODcsImV4cCI6MjA4Nzc4Nzg4N30.Rsjtf9P0IDuAbN9OF2h75MTOTdoCIi7m6INMC8OBtwI',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWRvd2V1bm1wbmx6dnRpc25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTE4ODcsImV4cCI6MjA4Nzc4Nzg4N30.Rsjtf9P0IDuAbN9OF2h75MTOTdoCIi7m6INMC8OBtwI'
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'queue_plan_translation: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_plan_translation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_queue_plan_translation
AFTER INSERT OR UPDATE OF conteudo, is_draft ON public.ai_plans
FOR EACH ROW EXECUTE FUNCTION public.queue_plan_translation();