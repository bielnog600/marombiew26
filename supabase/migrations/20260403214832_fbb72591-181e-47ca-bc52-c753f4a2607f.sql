
CREATE TABLE public.diet_readjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.ai_plans(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  peso_atual NUMERIC,
  perdeu_peso BOOLEAN DEFAULT false,
  ganhou_massa BOOLEAN DEFAULT false,
  energia_ok BOOLEAN DEFAULT true,
  fome_excessiva BOOLEAN DEFAULT false,
  insonia BOOLEAN DEFAULT false,
  intestino_ok BOOLEAN DEFAULT true,
  humor_ok BOOLEAN DEFAULT true,
  rendimento_treino TEXT,
  satisfacao TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.diet_readjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage diet_readjustments"
  ON public.diet_readjustments FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students read own diet_readjustments"
  ON public.diet_readjustments FOR SELECT
  USING (auth.uid() = student_id);
