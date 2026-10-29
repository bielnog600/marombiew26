import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { readProgressionLogs } from '@/lib/progressionHistory';

export const CONSULTORIA_TRAINING_QUERY_KEY = ['consultoria-training-data'];

/** Shared raw inputs only: each consumer keeps its own plan/phase/session rules. */
export function readConsultoriaTrainingData(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: CONSULTORIA_TRAINING_QUERY_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: students, error } = await supabase.from('students_profile')
        .select('user_id').eq('ativo', true);
      if (error) throw error;
      const ids = (students ?? []).map(s => s.user_id);
      // Review still uses 180 days to retain older reference sessions; do not change calculations.
      const historyStart = new Date(Date.now() - 180 * 86400000).toISOString();
      if (ids.length === 0) return { ids, historyStart, profiles: [], plans: [], logs: [], sessions: [] };

      const [profilesRes, plans, logs, sessions] = await Promise.all([
        supabase.from('profiles').select('user_id, nome, telefone').in('user_id', ids),
        readAllPages((from, to) => supabase.from('ai_plans')
          .select('id, student_id, tipo, conteudo, created_at, fase, fase_inicio_data, cycle_days')
          .eq('is_draft', false).in('student_id', ids)
          .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
        readProgressionLogs(ids, historyStart,
          'id, student_id, exercise_name, reps, weight_kg, rpe, rir, set_type, set_number, performed_at, phase, session_id, sub_records, source'),
        readAllPages((from, to) => supabase.from('workout_sessions')
          .select('id, student_id, status, avg_rpe, phase, completed_at, started_at, created_at, plan_id')
          .in('student_id', ids).gte('created_at', historyStart)
          .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      return { ids, historyStart, profiles: profilesRes.data ?? [], plans, logs, sessions };
    },
  });
}

async function readAllPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

export function groupByStudent<T extends { student_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.student_id) ?? [];
    list.push(row);
    map.set(row.student_id, list);
  }
  return map;
}