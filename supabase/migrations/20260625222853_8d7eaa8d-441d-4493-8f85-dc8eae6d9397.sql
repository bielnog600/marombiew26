-- Tabela para grupos de variações de exercícios
CREATE TABLE public.exercise_variation_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  exercise_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.exercise_variation_groups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.exercise_variation_groups TO authenticated;
GRANT ALL ON public.exercise_variation_groups TO service_role;

ALTER TABLE public.exercise_variation_groups ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ler (usado pela IA de geração de treino e admins)
CREATE POLICY "variation_groups_select_all"
ON public.exercise_variation_groups
FOR SELECT
USING (true);

-- Apenas admins podem modificar
CREATE POLICY "variation_groups_admin_insert"
ON public.exercise_variation_groups
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "variation_groups_admin_update"
ON public.exercise_variation_groups
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "variation_groups_admin_delete"
ON public.exercise_variation_groups
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER exercise_variation_groups_updated_at
BEFORE UPDATE ON public.exercise_variation_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_exercise_variation_groups_nome ON public.exercise_variation_groups(nome);

NOTIFY pgrst, 'reload schema';