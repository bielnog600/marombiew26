import { supabase } from '@/integrations/supabase/client';

/** Batch reads must page: default Data API limits truncate multi-student histories. */
export async function readProgressionLogs(studentIds: string[], since: string) {
  const rows = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase.from('exercise_set_logs').select('*')
      .in('student_id', studentIds).gte('performed_at', since)
      .order('performed_at', { ascending: false }).order('id', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}