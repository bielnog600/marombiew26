-- Add columns to workout_sessions
ALTER TABLE public.workout_sessions 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'student',
ADD COLUMN IF NOT EXISTS executed_by TEXT DEFAULT 'student',
ADD COLUMN IF NOT EXISTS session_mode TEXT DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS paired_student_id UUID REFERENCES public.profiles(user_id);

-- Update exercise_set_logs to have the same columns if needed for filtering
-- (Actually, linking via session_id is enough, but source/executed_by might be useful directly)
ALTER TABLE public.exercise_set_logs
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'student';
