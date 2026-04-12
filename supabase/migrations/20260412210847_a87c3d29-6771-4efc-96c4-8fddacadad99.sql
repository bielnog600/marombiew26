
CREATE TABLE public.daily_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  water_glasses INTEGER NOT NULL DEFAULT 0,
  meals_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  workout_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);

ALTER TABLE public.daily_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own daily_tracking"
ON public.daily_tracking FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Students insert own daily_tracking"
ON public.daily_tracking FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own daily_tracking"
ON public.daily_tracking FOR UPDATE
USING (auth.uid() = student_id);

CREATE POLICY "Admin manage daily_tracking"
ON public.daily_tracking FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
