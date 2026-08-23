CREATE TABLE public.weekly_progression_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan_id UUID REFERENCES public.ai_plans(id) ON DELETE CASCADE NOT NULL,
    week_start_date DATE NOT NULL,
    contacted_at TIMESTAMPTZ DEFAULT now(),
    trainer_id UUID REFERENCES auth.users(id),
    UNIQUE(student_id, plan_id, week_start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_progression_contacts TO authenticated;
GRANT ALL ON public.weekly_progression_contacts TO service_role;

ALTER TABLE public.weekly_progression_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all progression contacts"
ON public.weekly_progression_contacts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
