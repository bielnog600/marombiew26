
-- Table to store AI-generated workout and diet plans
CREATE TABLE public.ai_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'treino', -- 'treino' or 'dieta'
  titulo TEXT NOT NULL DEFAULT '',
  conteudo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage ai_plans"
  ON public.ai_plans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own ai_plans"
  ON public.ai_plans FOR SELECT
  USING (auth.uid() = student_id);

CREATE INDEX idx_ai_plans_student ON public.ai_plans(student_id, created_at DESC);
