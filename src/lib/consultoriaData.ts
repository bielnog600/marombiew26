import { supabase } from '@/integrations/supabase/client';
import type { ConsultoriaPlanSummary } from '@/lib/consultoriaMetrics';

export async function readConsultoriaPlanSummaries(studentIds: string[]): Promise<ConsultoriaPlanSummary[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase.rpc('consultoria_plan_summaries', { _student_ids: studentIds });
  if (error) throw error;
  return (data ?? []) as ConsultoriaPlanSummary[];
}

/** Soma no servidor: força completed/partial; TABATA, cardio e corrida concluídos. */
export async function readConsultoriaWorkoutCounts(studentIds: string[], since: Date): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (studentIds.length === 0) return counts;
  const { data, error } = await supabase.rpc('consultoria_workout_counts', {
    _student_ids: studentIds,
    _since: since.toISOString(),
  });
  if (error) throw error;
  for (const row of (data ?? []) as { student_id: string; workouts_30d: number }[]) {
    counts.set(row.student_id, row.workouts_30d);
  }
  return counts;
}
