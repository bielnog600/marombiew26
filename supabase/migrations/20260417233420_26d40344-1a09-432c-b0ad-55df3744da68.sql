-- Tabela para registrar cada série completada (carga, reps, RPE)
CREATE TABLE public.exercise_set_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  session_id UUID,
  exercise_name TEXT NOT NULL,
  muscle_group TEXT,
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight_kg NUMERIC(6,2),
  rpe NUMERIC(3,1),
  phase TEXT,
  day_name TEXT,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para consultas por aluno e por exercício ao longo do tempo
CREATE INDEX idx_exercise_set_logs_student_date ON public.exercise_set_logs (student_id, performed_at DESC);
CREATE INDEX idx_exercise_set_logs_student_exercise ON public.exercise_set_logs (student_id, exercise_name, performed_at DESC);
CREATE INDEX idx_exercise_set_logs_student_muscle ON public.exercise_set_logs (student_id, muscle_group, performed_at DESC);
CREATE INDEX idx_exercise_set_logs_session ON public.exercise_set_logs (session_id);

-- RLS
ALTER TABLE public.exercise_set_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own set logs"
  ON public.exercise_set_logs FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students insert own set logs"
  ON public.exercise_set_logs FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students delete own set logs"
  ON public.exercise_set_logs FOR DELETE
  USING (auth.uid() = student_id);

CREATE POLICY "Admin manage set logs"
  ON public.exercise_set_logs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Adicionar campo de RPE médio na sessão (opcional, ajuda agregação)
ALTER TABLE public.workout_sessions
  ADD COLUMN avg_rpe NUMERIC(3,1),
  ADD COLUMN total_volume_kg NUMERIC(10,2),
  ADD COLUMN total_sets INTEGER DEFAULT 0;