
CREATE TABLE public.diet_decision_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkin_id uuid NOT NULL REFERENCES public.diet_checkins(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  scenario text NOT NULL,
  suggested_action text NOT NULL,
  applied_action text NOT NULL,
  rationale text,
  confidence numeric,
  applied_by uuid,
  target_plan_id uuid,
  result_plan_id uuid,
  notes text,
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diet_decision_applications TO authenticated;
GRANT ALL ON public.diet_decision_applications TO service_role;

ALTER TABLE public.diet_decision_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view diet decision applications"
ON public.diet_decision_applications FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated can insert diet decision applications"
ON public.diet_decision_applications FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update diet decision applications"
ON public.diet_decision_applications FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_ddapp_student ON public.diet_decision_applications(student_id, applied_at DESC);
CREATE INDEX idx_ddapp_checkin ON public.diet_decision_applications(checkin_id);
