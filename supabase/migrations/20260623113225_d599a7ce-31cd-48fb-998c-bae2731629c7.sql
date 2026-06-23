ALTER TABLE public.diet_checkins
  ADD COLUMN IF NOT EXISTS peso_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS cintura_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS performance TEXT CHECK (performance IN ('piorou','igual','melhorou')),
  ADD COLUMN IF NOT EXISTS adesao TEXT CHECK (adesao IN ('baixa','media','alta')),
  ADD COLUMN IF NOT EXISTS retencao TEXT CHECK (retencao IN ('nenhuma','leve','alta')),
  ADD COLUMN IF NOT EXISTS decision_scenario TEXT,
  ADD COLUMN IF NOT EXISTS decision_action TEXT,
  ADD COLUMN IF NOT EXISTS decision_rationale TEXT,
  ADD COLUMN IF NOT EXISTS decision_confidence NUMERIC;