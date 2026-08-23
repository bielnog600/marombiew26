import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { resolveWeeklyWindows } from '@/lib/weeklyWindows';
import {
  buildWeeklyTrainingReport,
  type WeeklyTrainingReport,
  type RawSetLog,
  type RawSession,
} from '@/lib/weeklyTraining';
import { resolveStaleWorkoutSessionsThrottled } from '@/lib/workoutSessionResolution';
import type { TrainingPhase } from '@/lib/trainingPhase';

interface PlanLike {
  id: string;
  student_id: string;
  conteudo?: string | null;
  fase?: TrainingPhase | null;
}

/**
 * Fonte central da avaliação semanal (aderência + performance + decisão).
 *
 * O hook APENAS busca dados (2 queries: exercise_set_logs e workout_sessions,
 * cobrindo as duas janelas de uma vez) e delega toda a lógica para
 * buildWeeklyTrainingReport. Aluno e admin consomem exatamente o mesmo
 * resultado, evitando decisões divergentes e queries duplicadas.
 */
export const useWeeklyTraining = (
  plan: PlanLike | null | undefined,
  plannedPhase: TrainingPhase = 'semana_1',
) => {
  const [data, setData] = useState<WeeklyTrainingReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!plan?.student_id) {
      setData(null);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        await resolveStaleWorkoutSessionsThrottled(plan.student_id);

        const windows = resolveWeeklyWindows();
        const from = windows.previous.start.toISOString();
        const to = windows.current.end.toISOString();

        const plannedDays: ParsedTrainingDay[] = parseTrainingSections(plan.conteudo || '')
          .flatMap((s) => s.days || []);

        const [{ data: logRows }, { data: sessionRows }] = await Promise.all([
          supabase
            .from('exercise_set_logs')
            .select('exercise_name, reps, weight_kg, performed_at, set_number, rir, rpe, set_type, phase')
            .eq('student_id', plan.student_id)
            .gte('performed_at', from)
            .lt('performed_at', to),
          supabase
            .from('workout_sessions')
            .select('status, completed_at, started_at, created_at, plan_id')
            .eq('student_id', plan.student_id)
            .in('status', ['completed', 'partial', 'abandoned'])
            .gte('completed_at', from)
            .lt('completed_at', to),
        ]);

        const report = buildWeeklyTrainingReport({
          plannedPhase,
          plannedDays,
          windows,
          logs: (logRows ?? []) as RawSetLog[],
          sessions: (sessionRows ?? []) as RawSession[],
          planId: plan.id,
        });

        if (!cancelled) setData(report);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [plan?.id, plan?.student_id, plan?.conteudo, plannedPhase]);

  return {
    report: data?.adherence ?? null,
    progressionReport: data?.progression ?? null,
    performance: data?.performance ?? null,
    resolution: data?.resolution ?? null,
    context: data?.context ?? null,
    loading,
  };
};
