CREATE UNIQUE INDEX IF NOT EXISTS class_credits_log_unique_event_student_use_credit
ON public.class_credits_log (calendar_event_id, student_id)
WHERE action_type = 'use_credit' AND calendar_event_id IS NOT NULL;