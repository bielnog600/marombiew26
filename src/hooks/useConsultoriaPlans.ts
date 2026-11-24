import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { readConsultoriaPlanSummaries } from '@/lib/consultoriaData';
import type { ConsultoriaPlanSummary } from '@/lib/consultoriaMetrics';

export interface ConsultoriaCycleStudent {
  studentId: string;
  studentName: string;
  dieta: ConsultoriaPlanSummary | null;
  treino: ConsultoriaPlanSummary | null;
}

async function readConsultoriaCycleStudents(): Promise<ConsultoriaCycleStudent[]> {
  const { data: activeStudents, error: studentsError } = await supabase
    .from('students_profile')
    .select('user_id')
    .eq('ativo', true);
  if (studentsError) throw studentsError;

  const ids = (activeStudents ?? []).map(student => student.user_id);
  if (ids.length === 0) return [];

  const [profilesResult, plans] = await Promise.all([
    supabase.from('profiles').select('user_id, nome').in('user_id', ids),
    readConsultoriaPlanSummaries(ids),
  ]);
  if (profilesResult.error) throw profilesResult.error;

  const names = new Map((profilesResult.data ?? []).map(profile => [profile.user_id, profile.nome || 'Sem nome']));
  const byStudent = new Map<string, ConsultoriaCycleStudent>();
  for (const id of ids) {
    byStudent.set(id, { studentId: id, studentName: names.get(id) ?? 'Sem nome', dieta: null, treino: null });
  }
  for (const plan of plans) {
    const student = byStudent.get(plan.student_id);
    if (student) student[plan.tipo] = plan;
  }
  return Array.from(byStudent.values()).sort((a, b) => a.studentName.localeCompare(b.studentName));
}

export function useConsultoriaPlans(enabled: boolean) {
  const query = useQuery({
    queryKey: ['consultoria-plan-cycles'],
    queryFn: readConsultoriaCycleStudents,
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return {
    students: query.data ?? [],
    loading: enabled && !query.data && query.isPending,
    error: query.error,
    reload: query.refetch,
  };
}
