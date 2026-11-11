ALTER TABLE public.camera_sessions DROP CONSTRAINT IF EXISTS camera_sessions_exercise_rule_check;
ALTER TABLE public.camera_sessions
  ADD CONSTRAINT camera_sessions_exercise_rule_check
  CHECK (exercise_rule IS NULL OR exercise_rule IN ('squat', 'stiff', 'bulgaro', 'lateral_raise', 'hip_thrust', 'curl', 'triceps_french', 'shoulder_press', 'bench_press', 'leg_press', 'plank'));
COMMENT ON COLUMN public.camera_sessions.exercise_rule IS 'Regra da Correção ao vivo usada (squat, stiff, bulgaro, lateral_raise, hip_thrust, curl, triceps_french, shoulder_press, bench_press, leg_press, plank); null = sessão gravada por uma tela antiga (agachamento). Na prancha (plank), total_reps = segundos na posição, complete_reps = segundos em boa posição.';