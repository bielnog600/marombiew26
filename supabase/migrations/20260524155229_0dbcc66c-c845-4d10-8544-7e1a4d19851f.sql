-- Function to notify admin on workout checkin completion
CREATE OR REPLACE FUNCTION public.notify_admin_on_workout_checkin()
RETURNS TRIGGER AS $$
DECLARE
    v_student_name TEXT;
    v_admin_id UUID;
    v_plan_id UUID;
BEGIN
    -- Only proceed if the check-in was just completed (completed_at changed from NULL to NOT NULL)
    IF (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN
        -- Get student name
        SELECT nome INTO v_student_name FROM public.profiles WHERE user_id = NEW.student_id;
        
        -- Get the trainer/admin associated with this student (from students_profile)
        -- In this system, we usually notify the creator of the last plan or the assigned trainer
        -- For simplicity in a single-trainer system, we can target the SERVICE_ROLE or specific admin
        -- But better to find the trainer_id if it exists.
        -- Assuming students_profile has a trainer_id or similar, or just find the admin profile.
        
        -- Find the last active plan for this student to clear the pending flag
        SELECT id INTO v_plan_id FROM public.ai_plans 
        WHERE student_id = NEW.student_id 
        AND tipo = 'treino' 
        AND is_draft = false 
        ORDER BY created_at DESC LIMIT 1;

        IF v_plan_id IS NOT NULL THEN
            UPDATE public.ai_plans SET pending_checkin = false WHERE id = v_plan_id;
        END IF;

        -- Create the push notification record
        -- The send-push-notification edge function usually listens to a table or we call it
        -- Here we use the common pattern of a 'notifications' table if it exists
        -- Or we can use the existing behavioral_alerts table which the admin monitors
        
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
            v_student_name || ' respondeu o check-in do último protocolo.',
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_workout_checkin_completed ON public.workout_checkins;
CREATE TRIGGER on_workout_checkin_completed
    AFTER UPDATE ON public.workout_checkins
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_admin_on_workout_checkin();
