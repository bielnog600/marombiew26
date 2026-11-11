-- Níveis renomeados: mobilidade_reduzida→iniciante, padrao→intermediario, paralelo→avancado; novo: pro.
CREATE OR REPLACE FUNCTION public.normalize_camera_depth_level(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _v
    WHEN 'mobilidade_reduzida' THEN 'iniciante'
    WHEN 'padrao' THEN 'intermediario'
    WHEN 'paralelo' THEN 'avancado'
    ELSE _v
  END
$$;

ALTER TABLE public.students_profile DROP CONSTRAINT IF EXISTS students_profile_camera_depth_level_check;
ALTER TABLE public.camera_sessions DROP CONSTRAINT IF EXISTS camera_sessions_depth_level_check;

-- Backfill sem mexer no updated_at dos perfis.
ALTER TABLE public.students_profile DISABLE TRIGGER update_students_profile_updated_at;
UPDATE public.students_profile
  SET camera_depth_level = public.normalize_camera_depth_level(camera_depth_level)
  WHERE camera_depth_level IN ('mobilidade_reduzida', 'padrao', 'paralelo');
ALTER TABLE public.students_profile ENABLE TRIGGER update_students_profile_updated_at;

UPDATE public.camera_sessions
  SET depth_level = public.normalize_camera_depth_level(depth_level)
  WHERE depth_level IN ('mobilidade_reduzida', 'padrao', 'paralelo');

ALTER TABLE public.students_profile ALTER COLUMN camera_depth_level SET DEFAULT 'intermediario';

ALTER TABLE public.students_profile
  ADD CONSTRAINT students_profile_camera_depth_level_check
  CHECK (camera_depth_level IN ('iniciante', 'intermediario', 'avancado', 'pro'));
ALTER TABLE public.camera_sessions
  ADD CONSTRAINT camera_sessions_depth_level_check
  CHECK (depth_level IS NULL OR depth_level IN ('iniciante', 'intermediario', 'avancado', 'pro'));

-- Telas antigas ainda abertas podem enviar os nomes antigos: converte antes de gravar.
CREATE OR REPLACE FUNCTION public.guard_premium_camera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.camera_depth_level := public.normalize_camera_depth_level(NEW.camera_depth_level);
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.premium_camera THEN
    RAISE EXCEPTION 'premium_camera só pode ser alterado pelo admin';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.camera_depth_level IS DISTINCT FROM 'intermediario' THEN
    RAISE EXCEPTION 'camera_depth_level só pode ser alterado pelo admin';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.premium_camera IS DISTINCT FROM OLD.premium_camera THEN
    RAISE EXCEPTION 'premium_camera só pode ser alterado pelo admin';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.camera_depth_level IS DISTINCT FROM OLD.camera_depth_level THEN
    RAISE EXCEPTION 'camera_depth_level só pode ser alterado pelo admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_camera_session_depth_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.depth_level := public.normalize_camera_depth_level(NEW.depth_level);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_camera_session_depth_level ON public.camera_sessions;
CREATE TRIGGER normalize_camera_session_depth_level
  BEFORE INSERT OR UPDATE ON public.camera_sessions
  FOR EACH ROW EXECUTE FUNCTION public.normalize_camera_session_depth_level();