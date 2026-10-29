import { supabase } from '@/integrations/supabase/client';
import { readCountedPages } from '@/lib/countedPagination';

/** Batch reads must page: default Data API limits truncate multi-student histories. */
export async function readProgressionLogs(studentIds: string[], since: string, columns = '*') {
  return readCountedPages<any>(
    () => supabase.from('exercise_set_logs').select(columns, { count: 'exact', head: true })
      .in('student_id', studentIds).gte('performed_at', since),
    (from, to) => supabase.from('exercise_set_logs').select(columns)
      .in('student_id', studentIds).gte('performed_at', since)
      .order('performed_at', { ascending: false }).order('id', { ascending: true }).range(from, to),
  );
}