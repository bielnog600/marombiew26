import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import {
  buildAdherenceReport,
  getPreviousWeekWindow,
  type AdherenceReport,
  type AdherenceLog,
  type AdherenceSession,
} from '@/lib/weeklyAdherence';
import { resolveStaleWorkoutSessionsThrottled } from '@/lib/workoutSessionResolution';

interface PlanLike {
  id: string;
  student_id: string;
  conteudo?: string | null;
}

export const useWeeklyAdherence = (plan: PlanLike | null | undefined) => {
  const [report, setReport] = useState<AdherenceReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!plan?.student_id) {
      setReport(null);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        // Resolve sessões paradas antes de medir a aderência da semana.
        await resolveStaleWorkoutSessionsThrottled(plan.student_id);

        const { start, end } = getPreviousWeekWindow();

        const plannedDays: ParsedTrainingDay[] = parseTrainingSections(plan.conteudo || '')
          .flatMap(s => s.days || []);

        const [{ data }, { data: sessionRows }] = await Promise.all([
          supabase
            .from('exercise_set_logs')
            .select('exercise_name, reps, weight_kg, performed_at')
            .eq('student_id', plan.student_id)
            .gte('performed_at', start.toISOString())
            .lt('performed_at', end.toISOString()),
          supabase
            .from('workout_sessions')
            .select('status, completed_at, started_at')
            .eq('student_id', plan.student_id)
            .in('status', ['completed', 'partial', 'abandoned'])
            .gte('completed_at', start.toISOString())
            .lt('completed_at', end.toISOString()),
        ]);

        const logs: AdherenceLog[] = (data ?? []).map((d: any) => ({
          exercise_name: d.exercise_name,
          reps: d.reps,
          weight_kg: d.weight_kg,
          performed_at: d.performed_at,
        }));
        const sessions: AdherenceSession[] = (sessionRows ?? []) as AdherenceSession[];

        const r = buildAdherenceReport(plannedDays, logs, start, end, sessions);
        if (!cancelled) setReport(r);
      } catch {
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [plan?.id, plan?.student_id, plan?.conteudo]);

  return { report, loading };
};
