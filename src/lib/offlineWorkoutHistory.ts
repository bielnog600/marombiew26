import { getCached } from '@/lib/offlineCache';
import type { PreviousExerciseSet } from '@/lib/studentExerciseLoadPresentation';
import type { SessionLog, SessionMetaRow } from '@/lib/sessionProgression';

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();

export async function getCachedPreviousExerciseSets(
  userId: string,
  exerciseName: string,
  currentSessionId: string,
): Promise<PreviousExerciseSet[] | null> {
  const logs = await getCached<SessionLog[]>(`progression:logs:${userId}`);
  if (!logs) return null;
  const rows = logs.filter(row =>
    row.session_id !== currentSessionId && normalize(row.exercise_name ?? '') === normalize(exerciseName));
  if (rows.length === 0) return [];
  const latest = rows.reduce((a, b) => new Date(a.performed_at).getTime() > new Date(b.performed_at).getTime() ? a : b);
  return rows
    .filter(row => row.session_id === latest.session_id)
    .sort((a, b) => Number(a.set_number) - Number(b.set_number))
    .map(row => ({
      set_number: Number(row.set_number),
      reps: row.reps == null ? null : Number(row.reps),
      weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
      set_type: row.set_type,
      performed_at: row.performed_at,
    }));
}

export async function getCachedProgressionInputs(userId: string): Promise<{
  increments: Record<string, number>;
  sessions: any[];
  logs: SessionLog[];
  sessionMeta: Record<string, SessionMetaRow>;
} | null> {
  const [increments, sessions, logs] = await Promise.all([
    getCached<Record<string, number>>(`progression:increments:${userId}`),
    getCached<any[]>(`progression:sessions:${userId}`),
    getCached<SessionLog[]>(`progression:logs:${userId}`),
  ]);
  if (!increments || !sessions || !logs) return null;
  const sessionMeta: Record<string, SessionMetaRow> = {};
  sessions.forEach(row => {
    sessionMeta[row.id] = { sessionId: row.id, planId: row.plan_id ?? null, phase: row.phase ?? null, avgRpe: row.avg_rpe ?? null };
  });
  return { increments, sessions, logs, sessionMeta };
}
