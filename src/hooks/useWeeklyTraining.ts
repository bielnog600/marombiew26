import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { resolveWeekContexts, fetchRangeFor } from '@/lib/weekContext';
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
  fase_inicio_data?: string | null;
  cycle_days?: number | null;
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

        // Identidade da semana: fase do plano (fase_inicio_data + cycle_days).
        let phaseStart = plan.fase_inicio_data ?? null;
        let cycleDays = plan.cycle_days ?? null;
        if (phaseStart == null || cycleDays == null) {
          const { data: planRow } = await supabase
            .from('ai_plans')
            .select('fase_inicio_data, cycle_days')
            .eq('id', plan.id)
            .maybeSingle();
          phaseStart = phaseStart ?? planRow?.fase_inicio_data ?? null;
          cycleDays = cycleDays ?? planRow?.cycle_days ?? null;
        }

        const contexts = resolveWeekContexts({
          planId: plan.id,
          phase: plannedPhase,
          phaseStartDate: phaseStart,
          cycleDays,
        });
        const range = fetchRangeFor(contexts);
        const from = range.from.toISOString();
        const to = range.to.toISOString();

        const plannedDays: ParsedTrainingDay[] = parseTrainingSections(plan.conteudo || '')
          .flatMap((s) => s.days || []);

        const [{ data: logRows }, { data: sessionRows }] = await Promise.all([
          supabase
            .from('exercise_set_logs')
            .select('exercise_name, reps, weight_kg, performed_at, set_number, rir, rpe, set_type, phase, session_id')
            .eq('student_id', plan.student_id)
            .gte('performed_at', from)
            .lt('performed_at', to),
          supabase
            .from('workout_sessions')
            .select('id, status, completed_at, started_at, created_at, plan_id, phase')
            .eq('student_id', plan.student_id)
            .in('status', ['completed', 'partial', 'abandoned'])
            .gte('completed_at', from)
            .lt('completed_at', to),
        ]);

        const report = buildWeeklyTrainingReport({
          plannedPhase,
          plannedDays,
          contexts,
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
