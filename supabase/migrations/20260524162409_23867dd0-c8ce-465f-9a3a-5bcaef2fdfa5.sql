CREATE OR REPLACE FUNCTION public.notify_admin_on_workout_checkin()
RETURNS TRIGGER AS $$
DECLARE
    v_student_name TEXT;
    v_plan_id UUID;
BEGIN
    -- Proceed if check-in is completed (on INSERT or if completed_at changed)
    IF (TG_OP = 'INSERT' AND NEW.completed_at IS NOT NULL) OR 
       (TG_OP = 'UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN
        
        -- 1. Get student name
        SELECT nome INTO v_student_name FROM public.profiles WHERE user_id = NEW.student_id;
        
        -- 2. Clear pending flag and set has_new_checkin on the latest active plan
        SELECT id INTO v_plan_id FROM public.ai_plans 
        WHERE student_id = NEW.student_id 
        AND tipo = 'treino' 
        AND is_draft = false 
        ORDER BY created_at DESC LIMIT 1;

        IF v_plan_id IS NOT NULL THEN
            UPDATE public.ai_plans 
            SET pending_checkin = false, 
                has_new_checkin = true 
            WHERE id = v_plan_id;
        END IF;

        -- 3. Insert into behavioral_alerts to trigger push notification
        INSERT INTO public.behavioral_alerts (
            student_id,
            alert_key,
            priority,
            title,
            description,
            status
        ) VALUES (
            NEW.student_id,
            'workout_checkin_completed',
            'media',
            'Check-in de Treino Respondido',
            COALESCE(v_student_name, 'Um aluno') || ' respondeu o check-in do último protocolo.',
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger to ensure it covers INSERT and UPDATE
DROP TRIGGER IF EXISTS on_workout_checkin_completed ON public.workout_checkins;
CREATE TRIGGER on_workout_checkin_completed
AFTER INSERT OR UPDATE ON public.workout_checkins
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_on_workout_checkin();