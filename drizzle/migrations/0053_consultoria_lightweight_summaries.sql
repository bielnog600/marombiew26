CREATE OR REPLACE FUNCTION public.consultoria_plan_summaries(_student_ids uuid[])
RETURNS TABLE (
  student_id uuid,
  tipo text,
  titulo text,
  created_at timestamp with time zone,
  published_at timestamp with time zone,
  treino_days integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (p.student_id, p.tipo)
    p.student_id,
    p.tipo,
    p.titulo,
    p.created_at,
    p.published_at,
    CASE
      WHEN p.tipo = 'treino' AND jsonb_typeof(p.conteudo_json -> 'days') = 'array'
      THEN jsonb_array_length(p.conteudo_json -> 'days')
      ELSE NULL
    END AS treino_days
  FROM public.ai_plans p
  WHERE p.student_id = ANY(_student_ids)
    AND p.is_draft = false
    AND p.tipo IN ('dieta', 'treino')
  ORDER BY p.student_id, p.tipo, p.created_at DESC, p.id DESC;
$$;

REVOKE ALL ON FUNCTION public.consultoria_plan_summaries(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultoria_plan_summaries(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultoria_plan_summaries(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.consultoria_workout_counts(_student_ids uuid[], _since timestamp with time zone)
RETURNS TABLE (student_id uuid, workouts_30d integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH completed_sessions AS (
    SELECT w.student_id
    FROM public.workout_sessions w
    WHERE w.student_id = ANY(_student_ids)
      AND w.completed_at >= _since
      AND w.status IN ('completed', 'partial')
    UNION ALL
    SELECT t.student_id
    FROM public.tabata_sessions t
    WHERE t.student_id = ANY(_student_ids)
      AND t.completed_at >= _since
      AND t.status = 'completed'
    UNION ALL
    SELECT c.student_id
    FROM public.cardio_sessions c
    WHERE c.student_id = ANY(_student_ids)
      AND c.completed_at >= _since
      AND c.status = 'completed'
    UNION ALL
    SELECT r.student_id
    FROM public.run_sessions r
    WHERE r.student_id = ANY(_student_ids)
      AND r.completed_at >= _since
      AND r.status = 'completed'
  )
  SELECT s.student_id, count(*)::integer AS workouts_30d
  FROM completed_sessions s
  GROUP BY s.student_id;
$$;

REVOKE ALL ON FUNCTION public.consultoria_workout_counts(uuid[], timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultoria_workout_counts(uuid[], timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultoria_workout_counts(uuid[], timestamp with time zone) TO service_role;