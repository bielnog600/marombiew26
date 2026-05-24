-- Improved notification function to trigger real push notifications for admins
CREATE OR REPLACE FUNCTION public.notify_admin_on_workout_checkin()
RETURNS TRIGGER AS $$
DECLARE
    v_student_name TEXT;
    v_plan_id UUID;
BEGIN
    -- Only proceed if the check-in was just completed (completed_at changed from NULL to NOT NULL)
    IF (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN
        -- 1. Get student name
        SELECT nome INTO v_student_name FROM public.profiles WHERE user_id = NEW.student_id;
        
        -- 2. Clear pending flag on the latest active plan
        SELECT id INTO v_plan_id FROM public.ai_plans 
        WHERE student_id = NEW.student_id 
        AND tipo = 'treino' 
        AND is_draft = false 
        ORDER BY created_at DESC LIMIT 1;

        IF v_plan_id IS NOT NULL THEN
            UPDATE public.ai_plans SET pending_checkin = false WHERE id = v_plan_id;
        END IF;

        -- 3. Insert into behavioral_alerts (This triggers push notifications via Edge Functions in this system)
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

        -- NOTE: The system is configured to monitor the behavioral_alerts table.
        -- When a new 'pending' alert with priority 'media' or 'alta' is inserted,
        -- an Edge Function automatically sends a Push Notification to the admins
        -- via OneSignal, ensuring the admin sees it on their mobile device.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
