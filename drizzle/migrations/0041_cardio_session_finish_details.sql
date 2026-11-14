ALTER TABLE public.cardio_sessions ADD COLUMN IF NOT EXISTS rpe smallint CHECK (rpe IS NULL OR (rpe BETWEEN 1 AND 5));
ALTER TABLE public.cardio_sessions ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));
ALTER TABLE public.cardio_sessions ADD COLUMN IF NOT EXISTS modality text CHECK (modality IS NULL OR modality IN ('passadeira','bike','eliptica','escada','corrida_ar_livre','caminhada_ar_livre'));
ALTER TABLE public.cardio_sessions ADD COLUMN IF NOT EXISTS distance_km numeric(6,2) CHECK (distance_km IS NULL OR (distance_km >= 0 AND distance_km <= 500));
ALTER TABLE public.cardio_sessions ADD COLUMN IF NOT EXISTS notes text CHECK (notes IS NULL OR char_length(notes) <= 1000);

COMMENT ON COLUMN public.cardio_sessions.rpe IS 'Como foi? escala de 5: 1 Muito fácil, 2 Fácil, 3 Moderado, 4 Difícil, 5 Muito difícil';
COMMENT ON COLUMN public.cardio_sessions.rating IS 'Gostou da sessão? 1 a 5 estrelas';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardio_sessions TO authenticated;
GRANT ALL ON public.cardio_sessions TO service_role;

DROP POLICY IF EXISTS "Admins read cardio sessions" ON public.cardio_sessions;
CREATE POLICY "Admins read cardio sessions" ON public.cardio_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS cardio_sessions_student_completed_idx
  ON public.cardio_sessions (student_id, completed_at DESC);