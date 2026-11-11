DROP POLICY IF EXISTS "Authenticated can view diet decision applications" ON public.diet_decision_applications;
DROP POLICY IF EXISTS "Authenticated can insert diet decision applications" ON public.diet_decision_applications;
DROP POLICY IF EXISTS "Authenticated can update diet decision applications" ON public.diet_decision_applications;

-- Só o admin lê e altera as decisões de dieta (nenhuma tela do aluno usa esta tabela).
CREATE POLICY "Admins manage diet decision applications" ON public.diet_decision_applications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.diet_decision_applications FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diet_decision_applications TO authenticated;
GRANT ALL ON public.diet_decision_applications TO service_role;