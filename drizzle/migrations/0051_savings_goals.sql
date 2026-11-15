CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL DEFAULT 'Meta',
  meta_valor numeric(12,2) NOT NULL CHECK (meta_valor > 0),
  inicio date NOT NULL,
  fim date NOT NULL,
  max_valor integer NOT NULL CHECK (max_valor >= 1 AND max_valor <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT savings_goals_periodo CHECK (fim >= inicio)
);
CREATE INDEX savings_goals_owner_idx ON public.savings_goals (owner_id, inicio);

CREATE TABLE public.savings_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  valor integer NOT NULL CHECK (valor >= 1),
  depositado_em date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT savings_deposits_goal_valor_key UNIQUE (goal_id, valor)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_deposits TO authenticated;
GRANT ALL ON public.savings_deposits TO service_role;

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages own savings goals"
ON public.savings_goals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND owner_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin') AND owner_id = auth.uid());

CREATE POLICY "Admin manages deposits of own goals"
ON public.savings_deposits FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND EXISTS (SELECT 1 FROM public.savings_goals g WHERE g.id = goal_id AND g.owner_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND EXISTS (SELECT 1 FROM public.savings_goals g WHERE g.id = goal_id AND g.owner_id = auth.uid())
);

CREATE TRIGGER savings_goals_updated_at
BEFORE UPDATE ON public.savings_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();