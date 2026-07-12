
-- =========================================================
-- PHASE 2A — Additive metadata schema + training methods
-- =========================================================
-- No changes to existing columns/data. All new columns nullable.

-- 1) EXERCISES: additive metadata columns
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS movement_pattern text,
  ADD COLUMN IF NOT EXISTS exercise_class text,
  ADD COLUMN IF NOT EXISTS equipment_type text,
  ADD COLUMN IF NOT EXISTS stability_level text,
  ADD COLUMN IF NOT EXISTS technical_complexity text,
  ADD COLUMN IF NOT EXISTS axial_load text,
  ADD COLUMN IF NOT EXISTS lumbar_load text,
  ADD COLUMN IF NOT EXISTS balance_requirement text,
  ADD COLUMN IF NOT EXISTS fatigue_cost text,
  ADD COLUMN IF NOT EXISTS safe_to_failure boolean,
  ADD COLUMN IF NOT EXISTS primary_muscles text[],
  ADD COLUMN IF NOT EXISTS secondary_muscles text[],
  ADD COLUMN IF NOT EXISTS contraindications text[],
  ADD COLUMN IF NOT EXISTS metadata_status text,
  ADD COLUMN IF NOT EXISTS metadata_confidence numeric,
  ADD COLUMN IF NOT EXISTS metadata_source text,
  ADD COLUMN IF NOT EXISTS metadata_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS metadata_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata_version integer;

-- Value CHECK constraints (nullable-friendly)
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_exercise_class_check
    CHECK (exercise_class IS NULL OR exercise_class IN
      ('compound','isolation','power','plyometric','mobility','cardio','core','rehabilitation','other')),
  ADD CONSTRAINT exercises_stability_level_check
    CHECK (stability_level IS NULL OR stability_level IN ('high','moderate','low')),
  ADD CONSTRAINT exercises_technical_complexity_check
    CHECK (technical_complexity IS NULL OR technical_complexity IN ('low','moderate','high','very_high')),
  ADD CONSTRAINT exercises_axial_load_check
    CHECK (axial_load IS NULL OR axial_load IN ('none','low','moderate','high')),
  ADD CONSTRAINT exercises_lumbar_load_check
    CHECK (lumbar_load IS NULL OR lumbar_load IN ('none','low','moderate','high')),
  ADD CONSTRAINT exercises_balance_requirement_check
    CHECK (balance_requirement IS NULL OR balance_requirement IN ('none','low','moderate','high')),
  ADD CONSTRAINT exercises_fatigue_cost_check
    CHECK (fatigue_cost IS NULL OR fatigue_cost IN ('low','moderate','high','very_high')),
  ADD CONSTRAINT exercises_metadata_status_check
    CHECK (metadata_status IS NULL OR metadata_status IN
      ('unclassified','suggested','pending_review','approved','rejected')),
  ADD CONSTRAINT exercises_metadata_source_check
    CHECK (metadata_source IS NULL OR metadata_source IN ('manual','rule','ai','imported')),
  ADD CONSTRAINT exercises_metadata_confidence_range
    CHECK (metadata_confidence IS NULL OR (metadata_confidence >= 0 AND metadata_confidence <= 1));

CREATE INDEX IF NOT EXISTS exercises_metadata_status_idx ON public.exercises(metadata_status);
CREATE INDEX IF NOT EXISTS exercises_movement_pattern_idx ON public.exercises(movement_pattern);
CREATE INDEX IF NOT EXISTS exercises_exercise_class_idx ON public.exercises(exercise_class);
CREATE INDEX IF NOT EXISTS exercises_equipment_type_idx ON public.exercises(equipment_type);

-- 2) TRAINING_METHODS
CREATE TABLE IF NOT EXISTS public.training_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  min_level text,
  fatigue_score integer,
  technical_risk_score integer,
  requires_professional_supervision boolean NOT NULL DEFAULT false,
  requires_special_equipment boolean NOT NULL DEFAULT false,
  default_parameters jsonb,
  safety_notes text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_methods_category_check CHECK (category IS NULL OR category IN
    ('base','progression','intensity','density','strength','hypertrophy','power','rehabilitation','specialized')),
  CONSTRAINT training_methods_min_level_check CHECK (min_level IS NULL OR min_level IN
    ('beginner','intermediate','advanced','professional_only')),
  CONSTRAINT training_methods_fatigue_range CHECK (fatigue_score IS NULL OR (fatigue_score BETWEEN 1 AND 5)),
  CONSTRAINT training_methods_risk_range CHECK (technical_risk_score IS NULL OR (technical_risk_score BETWEEN 1 AND 5))
);

GRANT SELECT ON public.training_methods TO authenticated;
GRANT ALL ON public.training_methods TO service_role;

ALTER TABLE public.training_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_methods readable by authenticated"
  ON public.training_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "training_methods admin insert"
  ON public.training_methods FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "training_methods admin update"
  ON public.training_methods FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "training_methods admin delete"
  ON public.training_methods FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER training_methods_set_updated_at
  BEFORE UPDATE ON public.training_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS training_methods_slug_idx ON public.training_methods(slug);
CREATE INDEX IF NOT EXISTS training_methods_active_idx ON public.training_methods(active);
CREATE INDEX IF NOT EXISTS training_methods_category_idx ON public.training_methods(category);
CREATE INDEX IF NOT EXISTS training_methods_min_level_idx ON public.training_methods(min_level);

-- 3) SEED
INSERT INTO public.training_methods
(slug, name, category, min_level, fatigue_score, technical_risk_score,
 requires_professional_supervision, requires_special_equipment, active, description) VALUES
-- base / progression
('traditional_sets','Séries tradicionais','base','beginner',2,1,false,false,true,'Séries retas com reps e cargas fixas.'),
('double_progression','Dupla progressão','progression','beginner',2,1,false,false,true,'Progride reps até o topo da faixa, depois carga.'),
('ramping_sets','Séries em rampa','progression','intermediate',3,2,false,false,true,'Aumenta carga gradualmente até série alvo.'),
('top_set_backoff','Top set + back-off','progression','intermediate',3,2,false,false,true,'Uma série pesada seguida de séries com menor carga.'),
('paused_reps','Reps com pausa','base','intermediate',3,2,false,false,true,'Pausa intencional na fase excêntrica/concêntrica.'),
('tempo_reps','Tempo controlado','base','beginner',2,1,false,false,true,'Cadência prescrita ex 3-1-1-0.'),
-- superset / organization
('antagonist_superset','Supersérie antagonista','density','intermediate',3,2,false,false,true,'Dois exercícios de grupos antagonistas sem descanso.'),
('non_competing_superset','Supersérie não-competitiva','density','intermediate',3,2,false,false,true,'Dois exercícios que não competem por recursos energéticos.'),
('pre_exhaustion','Pré-exaustão','intensity','intermediate',4,2,false,false,true,'Isolador antes do composto.'),
('post_exhaustion','Pós-exaustão','intensity','intermediate',4,2,false,false,true,'Isolador logo após o composto.'),
-- intensification
('rest_pause','Rest-pause','intensity','intermediate',4,3,false,false,true,'Mini-pausas dentro da mesma série até falha técnica.'),
('myo_reps','Myo-reps','intensity','advanced',4,3,false,false,true,'Série ativadora + mini-séries curtas.'),
('drop_set','Drop set','intensity','intermediate',4,2,false,false,true,'Reduzir carga imediatamente ao atingir falha.'),
('mechanical_drop_set','Drop set mecânico','intensity','advanced',4,3,false,false,true,'Muda de variação para versão mais fácil na falha.'),
('one_and_half_reps','Reps 1½','intensity','intermediate',3,2,false,false,true,'Repetição completa + meia repetição.'),
('lengthened_partials','Parciais em alongamento','intensity','intermediate',3,2,false,false,true,'Parciais na porção alongada do movimento.'),
('isometric_hold','Isometria','base','beginner',2,1,false,false,true,'Sustentação em posição alvo.'),
('amrap_with_rir_cap','AMRAP com RIR cap','density','intermediate',3,2,false,false,true,'Máximo de reps com reserva mínima definida.'),
('density_sets','Densidade (EMOM/etc.)','density','intermediate',3,2,false,false,true,'Volume dentro de janela de tempo fixa.'),
-- strength / power
('cluster_set','Cluster set','strength','advanced',4,3,false,false,true,'Fracionar a série em mini-clusters com pausas curtas.'),
('complex_training','Complex training','power','advanced',5,4,true,false,true,'Composto pesado seguido de pliométrico.'),
('contrast_training','Contrast training','power','advanced',5,4,true,false,true,'Alterna cargas altas com cargas explosivas.'),
('velocity_based_training','VBT','strength','advanced',3,3,false,true,true,'Prescrição por velocidade — exige encoder.'),
-- specialized
('eccentric_overload','Sobrecarga excêntrica','specialized','professional_only',5,5,true,false,false,'Cargas supra-máximas na excêntrica.'),
('blood_flow_restriction','BFR','rehabilitation','professional_only',3,4,true,true,false,'Oclusão parcial; requer supervisão profissional.');

-- 4) EXERCISE_METADATA_SUGGESTIONS
CREATE TABLE IF NOT EXISTS public.exercise_metadata_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  proposed_metadata jsonb NOT NULL,
  confidence numeric,
  source text,
  status text NOT NULL DEFAULT 'pending',
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  CONSTRAINT ems_status_check CHECK (status IN ('pending','approved','rejected','superseded')),
  CONSTRAINT ems_source_check CHECK (source IS NULL OR source IN ('manual','rule','ai','imported')),
  CONSTRAINT ems_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_metadata_suggestions TO authenticated;
GRANT ALL ON public.exercise_metadata_suggestions TO service_role;

ALTER TABLE public.exercise_metadata_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ems admin select"
  ON public.exercise_metadata_suggestions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ems admin insert"
  ON public.exercise_metadata_suggestions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ems admin update"
  ON public.exercise_metadata_suggestions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ems admin delete"
  ON public.exercise_metadata_suggestions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ems_exercise_id_idx ON public.exercise_metadata_suggestions(exercise_id);
CREATE INDEX IF NOT EXISTS ems_status_idx ON public.exercise_metadata_suggestions(status);
CREATE INDEX IF NOT EXISTS ems_confidence_idx ON public.exercise_metadata_suggestions(confidence);
