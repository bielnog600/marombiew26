ALTER TABLE public.camera_sessions DROP CONSTRAINT IF EXISTS camera_sessions_exercise_rule_check;
ALTER TABLE public.camera_sessions
  ADD CONSTRAINT camera_sessions_exercise_rule_check
  CHECK (exercise_rule IS NULL OR exercise_rule IN ('squat', 'stiff', 'bulgaro', 'lateral_raise', 'hip_thrust', 'curl', 'triceps_french', 'shoulder_press'));
COMMENT ON COLUMN public.camera_sessions.exercise_rule IS 'Regra da Correção ao vivo usada (squat, stiff, bulgaro, lateral_raise, hip_thrust, curl, triceps_french, shoulder_press); null = sessão gravada por uma tela antiga (agachamento).';