
CREATE OR REPLACE FUNCTION public.schedule_low_cost_first_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_lc boolean;
  interval_days integer;
BEGIN
  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;
  IF NEW.tipo NOT IN ('treino', 'dieta') THEN
    RETURN NEW;
  END IF;
  IF NEW.low_cost_next_review_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT low_cost INTO is_lc
  FROM public.students_profile
  WHERE user_id = NEW.student_id;

  IF COALESCE(is_lc, false) = false THEN
    RETURN NEW;
  END IF;

  interval_days := COALESCE(NEW.low_cost_review_interval_days, 30);
  NEW.low_cost_next_review_at := COALESCE(NEW.created_at, now()) + (interval_days || ' days')::interval;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_low_cost_first_review ON public.ai_plans;
CREATE TRIGGER trg_schedule_low_cost_first_review
BEFORE INSERT ON public.ai_plans
FOR EACH ROW
EXECUTE FUNCTION public.schedule_low_cost_first_review();
