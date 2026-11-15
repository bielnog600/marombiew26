CREATE TABLE public.food_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL UNIQUE,
  food_id uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX food_aliases_food_idx ON public.food_aliases(food_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_aliases TO authenticated;
GRANT ALL ON public.food_aliases TO service_role;

ALTER TABLE public.food_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read food aliases" ON public.food_aliases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage food aliases" ON public.food_aliases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));