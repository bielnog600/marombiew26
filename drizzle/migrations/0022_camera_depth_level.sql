ALTER TABLE public.students_profile
  ADD COLUMN IF NOT EXISTS camera_depth_level text NOT NULL DEFAULT 'padrao';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_profile_camera_depth_level_check') THEN
    ALTER TABLE public.students_profile
      ADD CONSTRAINT students_profile_camera_depth_level_check
      CHECK (camera_depth_level IN ('paralelo', 'padrao', 'mobilidade_reduzida'));
  END IF;
END $$;

ALTER TABLE public.camera_sessions
  ADD COLUMN IF NOT EXISTS depth_level text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'camera_sessions_depth_level_check') THEN
    ALTER TABLE public.camera_sessions
      ADD CONSTRAINT camera_sessions_depth_level_check
      CHECK (depth_level IS NULL OR depth_level IN ('paralelo', 'padrao', 'mobilidade_reduzida'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_premium_camera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.premium_camera THEN
    RAISE EXCEPTION 'premium_camera só pode ser alterado pelo admin';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.camera_depth_level IS DISTINCT FROM 'padrao' THEN
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