
ALTER TABLE public.exercise_metadata_ground_truth
  DROP CONSTRAINT IF EXISTS exercise_metadata_ground_truth_status_check;
ALTER TABLE public.exercise_metadata_ground_truth
  ADD CONSTRAINT exercise_metadata_ground_truth_status_check
  CHECK (status = ANY (ARRAY['draft','reviewed','draft_benchmark','human_first_review','human_safety_review','adjudicated','finalized','superseded']));

UPDATE public.exercise_metadata_ground_truth
   SET status = 'draft_benchmark'
 WHERE reviewer_kind = 'ai-agent-blinded-v1'
   AND status = 'reviewed';

CREATE TABLE IF NOT EXISTS public.exercise_metadata_adjudications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  pilot_selection_id text NOT NULL,
  classifier_run_id uuid,
  final_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_final_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources_considered jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  changed_from_first_human_review jsonb DEFAULT '{}'::jsonb,
  changed_from_safety_review jsonb DEFAULT '{}'::jsonb,
  adjudicator_id uuid REFERENCES auth.users(id),
  adjudicated_at timestamptz NOT NULL DEFAULT now(),
  vocabulary_version text NOT NULL DEFAULT 'v1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exercise_id, pilot_selection_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_metadata_adjudications TO authenticated;
GRANT ALL ON public.exercise_metadata_adjudications TO service_role;
ALTER TABLE public.exercise_metadata_adjudications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage adjudications"
  ON public.exercise_metadata_adjudications FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_adjudications_updated_at
  BEFORE UPDATE ON public.exercise_metadata_adjudications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.metadata_vocabularies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  equipment_hierarchy jsonb NOT NULL,
  muscles_canonical jsonb NOT NULL,
  movement_patterns jsonb NOT NULL,
  not_applicable_rules jsonb NOT NULL,
  aliases jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.metadata_vocabularies TO authenticated;
GRANT ALL ON public.metadata_vocabularies TO service_role;
ALTER TABLE public.metadata_vocabularies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read vocabularies"
  ON public.metadata_vocabularies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage vocabularies"
  ON public.metadata_vocabularies FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.metadata_vocabularies (version, equipment_hierarchy, muscles_canonical, movement_patterns, not_applicable_rules, aliases, notes)
VALUES (
  'v1.0',
  '{"roots":["machine","smith_machine","cable","free_weight","bodyweight","cardio_machine","resistance_band","medicine_ball","stability_ball","other","unknown"],"parents":{"free_weight":["barbell","dumbbell","kettlebell"]},"hierarchical_match_rules":["prediction=child, gt=parent -> hierarchical_match","prediction=parent, gt=child -> hierarchical_match (loss of specificity)"]}'::jsonb,
  '{"canonical":["quadriceps","hamstrings","gluteus_maximus","gluteus_medius","adductors","gastrocnemius","soleus","pectoralis_major","latissimus_dorsi","trapezius","rhomboids","anterior_deltoid","lateral_deltoid","posterior_deltoid","biceps_brachii","brachialis","triceps_brachii","rectus_abdominis","obliques","transverse_abdominis","erector_spinae"],"forbidden_in_muscle_fields":["thoracic_spine","lumbar_spine","knee","hip","core"],"notes":"Regioes anatomicas nunca em primary_muscles/secondary_muscles."}'::jsonb,
  '["squat","hip_hinge","horizontal_push","vertical_push","horizontal_pull","vertical_pull","knee_extension","knee_flexion","hip_extension","hip_abduction","hip_adduction","elbow_flexion","elbow_extension","shoulder_abduction","shoulder_flexion","plantar_flexion","anti_extension","anti_rotation","trunk_flexion","trunk_extension","locomotion","jump","mobility","other"]'::jsonb,
  '{"safe_to_failure":["cardio_continuous","mobility","some_isometrics"],"axial_load":[],"primary_muscles":["global_cardio_activities_explicit_only"]}'::jsonb,
  '{"abs":"rectus_abdominis","abdominals":"rectus_abdominis","gastrocnemios":"gastrocnemius","panturrilha":"gastrocnemius","lombar":"erector_spinae"}'::jsonb,
  'Vocabulario canonico congelado para Fase 2C.2B. Nao alterar sem incrementar version.'
);
