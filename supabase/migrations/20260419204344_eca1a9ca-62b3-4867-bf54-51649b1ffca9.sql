CREATE TABLE public.weight_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  peso NUMERIC NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_weight_logs_student_data ON public.weight_logs(student_id, data DESC);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own weight_logs"
ON public.weight_logs FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Students insert own weight_logs"
ON public.weight_logs FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own weight_logs"
ON public.weight_logs FOR UPDATE
USING (auth.uid() = student_id);

CREATE POLICY "Students delete own weight_logs"
ON public.weight_logs FOR DELETE
USING (auth.uid() = student_id);

CREATE POLICY "Admin manage weight_logs"
ON public.weight_logs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));