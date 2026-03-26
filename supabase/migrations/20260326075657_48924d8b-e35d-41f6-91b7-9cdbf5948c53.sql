
CREATE TABLE public.diet_questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  estilo_dieta text,
  num_refeicoes integer,
  alimentos_por_refeicao jsonb DEFAULT '{}',
  horario_treino text,
  dias_treino text,
  fase_atual text,
  usa_hormonios text,
  restricoes_alimentares text,
  preferencias_alimentares text,
  como_se_sente text,
  fraqueza boolean DEFAULT false,
  dor_cabeca boolean DEFAULT false,
  reduziu_peso boolean DEFAULT false,
  pele_fina boolean DEFAULT false,
  fome_excessiva boolean DEFAULT false,
  insonia boolean DEFAULT false,
  baixa_energia boolean DEFAULT false,
  irritabilidade boolean DEFAULT false,
  observacoes text
);

ALTER TABLE public.diet_questionnaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage diet_questionnaires"
  ON public.diet_questionnaires FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students read own diet_questionnaires"
  ON public.diet_questionnaires FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Public insert via token"
  ON public.diet_questionnaires FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public select via token"
  ON public.diet_questionnaires FOR SELECT
  USING (true);
