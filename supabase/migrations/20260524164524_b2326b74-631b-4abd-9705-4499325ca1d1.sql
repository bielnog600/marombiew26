ALTER TABLE public.workout_renewal_analysis 
ADD COLUMN sessions_started INTEGER DEFAULT 0,
ADD COLUMN sessions_finished INTEGER DEFAULT 0,
ADD COLUMN registration_quality TEXT,
ADD COLUMN total_logs_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.workout_renewal_analysis.sessions_started IS 'Total de sessões iniciadas pelo aluno no período de análise.';
COMMENT ON COLUMN public.workout_renewal_analysis.sessions_finished IS 'Total de sessões marcadas como concluídas pelo aluno.';
COMMENT ON COLUMN public.workout_renewal_analysis.registration_quality IS 'Classificação da qualidade do registro (ex: boa, incompleta, insuficiente).';
COMMENT ON COLUMN public.workout_renewal_analysis.total_logs_count IS 'Total de séries/cargas registradas no período.';