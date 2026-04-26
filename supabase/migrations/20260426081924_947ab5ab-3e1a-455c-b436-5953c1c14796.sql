
ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS whatsapp_notified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS whatsapp_notified_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.reset_ai_plan_whatsapp_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Reset notification flag whenever the plan content/title/phase changes,
  -- but NOT when the update is just marking the notification itself.
  IF (NEW.conteudo IS DISTINCT FROM OLD.conteudo)
     OR (NEW.titulo IS DISTINCT FROM OLD.titulo)
     OR (NEW.fase IS DISTINCT FROM OLD.fase) THEN
    -- Only reset if the caller didn't explicitly set whatsapp_notified_at in this update
    IF NEW.whatsapp_notified_at IS NOT DISTINCT FROM OLD.whatsapp_notified_at THEN
      NEW.whatsapp_notified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_ai_plan_whatsapp_notification ON public.ai_plans;
CREATE TRIGGER trg_reset_ai_plan_whatsapp_notification
BEFORE UPDATE ON public.ai_plans
FOR EACH ROW
EXECUTE FUNCTION public.reset_ai_plan_whatsapp_notification();
