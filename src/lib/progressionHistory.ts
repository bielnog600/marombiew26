import { supabase } from '@/integrations/supabase/client';
import { readCountedPages } from '@/lib/countedPagination';

/** Columns returned by `set_logs_since(_compact => true)`; any other list reads full rows. */
export const PROGRESSION_LOG_COLUMNS =
  'id, student_id, exercise_name, reps, weight_kg, rpe, rir, set_type, set_number, performed_at, phase, session_id, sub_records, source';

const normalizeColumns = (columns: string) => columns.split(',').map(c => c.trim()).filter(Boolean).join(',');

/** Function not deployed yet (or unknown to the API cache): only then use the legacy paged read. */
const isMissingFunction = (error: { code?: string; message?: string } | null | undefined) =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || /set_logs_since/i.test(error.message ?? ''));

/**
 * One server call for the whole window (RLS still applies: admin sees all, a student only theirs),
 * ordered performed_at DESC, id ASC exactly like the legacy pages. Avoids counted OFFSET paging,
 * which re-sorted the full window on every page.
 */
export async function readProgressionLogs(studentIds: string[], since: string, columns = '*') {
  if (studentIds.length === 0) return [];
  const compact = normalizeColumns(columns) === normalizeColumns(PROGRESSION_LOG_COLUMNS);
  let rpcError: { code?: string; message?: string } | null = null;
  try {
    const { data, error } = await supabase.rpc('set_logs_since', {
      _student_ids: studentIds, _since: since, _compact: compact,
    });
    if (!error && Array.isArray(data)) return data as any[];
    rpcError = (error as any) ?? { code: 'PGRST202', message: 'set_logs_since returned no array' };
  } catch (err) {
    // Client without rpc (older bundles/tests): treat as missing function.
    rpcError = { code: 'PGRST202', message: String(err) };
  }
  if (!isMissingFunction(rpcError)) throw rpcError;
  return readCountedPages<any>(
    () => supabase.from('exercise_set_logs').select(columns, { count: 'exact', head: true })
      .in('student_id', studentIds).gte('performed_at', since),
    (from, to) => supabase.from('exercise_set_logs').select(columns)
      .in('student_id', studentIds).gte('performed_at', since)
      .order('performed_at', { ascending: false }).order('id', { ascending: true }).range(from, to),
  );
}
