ALTER TABLE public.tabata_sessions ADD COLUMN IF NOT EXISTS rpe smallint CHECK (rpe IS NULL OR (rpe BETWEEN 1 AND 10));
ALTER TABLE public.tabata_sessions ADD COLUMN IF NOT EXISTS kcal_estimate integer;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabata_sessions TO authenticated;
GRANT ALL ON public.tabata_sessions TO service_role;

DROP POLICY IF EXISTS "Admins read tabata sessions" ON public.tabata_sessions;
CREATE POLICY "Admins read tabata sessions" ON public.tabata_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS tabata_sessions_student_completed_idx
  ON public.tabata_sessions (student_id, completed_at DESC);

INSERT INTO public.coach_voice_phrases (phrase_key, texto, categoria, tipo)
VALUES
  ('tabata_preparado', 'Tá preparado?', 'TABATA', 'sistema'),
  ('tabata_321_bora', '3, 2, 1… bora!', 'TABATA', 'sistema'),
  ('tabata_descanse', 'Descanse agora!', 'TABATA', 'sistema'),
  ('tabata_respira', 'Respira.', 'TABATA', 'sistema'),
  ('tabata_proximo_bloco', 'Vamos para o próximo bloco.', 'TABATA', 'sistema')
ON CONFLICT (phrase_key) DO NOTHING;