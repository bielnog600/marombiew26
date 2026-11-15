DROP POLICY IF EXISTS "Premium students insert own meal weigh logs" ON public.meal_weigh_logs;
DROP POLICY IF EXISTS "Students insert own scanned-food meal logs" ON public.meal_weigh_logs;
CREATE POLICY "Students insert own meal weigh logs" ON public.meal_weigh_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND jsonb_typeof(items) = 'array'
  );
COMMENT ON POLICY "Students insert own meal weigh logs" ON public.meal_weigh_logs IS
  'Diário do aluno: insere só o próprio registro (items array, pode ser vazio). O que custa (IA) é barrado nas funções/telas por premium_scale. Edições gravam um registro novo; não há UPDATE/DELETE de aluno.';