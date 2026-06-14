
CREATE TABLE public.student_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  admin_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  last_contacted_at TIMESTAMP WITH TIME ZONE,
  snoozed_until TIMESTAMP WITH TIME ZONE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (student_id, admin_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_followups TO authenticated;
GRANT ALL ON public.student_followups TO service_role;

ALTER TABLE public.student_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage followups"
ON public.student_followups
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_student_followups_updated
BEFORE UPDATE ON public.student_followups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_student_followups_admin ON public.student_followups(admin_id);
CREATE INDEX idx_student_followups_snooze ON public.student_followups(snoozed_until);
