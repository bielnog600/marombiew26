/**
 * Resolução automática de sessões de treino "paradas" (stale).
 *
 * Problema: muitos alunos executam o treino, registram séries, mas fecham o app
 * sem clicar em "Finalizar treino". A sessão fica eternamente `in_progress` e a
 * aderência semanal fica incorreta.
 *
 * Regras (todas centralizadas aqui):
 *  - stale = status 'in_progress' e sem atividade real há >= STALE_INACTIVITY_MINUTES
 *  - NUNCA finalizar por tempo total desde started_at
 *  - completed_at = última atividade real (não o momento da detecção)
 *  - classificação por completionScore (execução real x planejado)
 *
 * Fonte de verdade:
 *  - workout_sessions  -> iniciou / concluiu / parcial / abandonou / duração
 *  - exercise_set_logs -> carga, reps, RPE, progressão (nunca alterados aqui,
 *    exceto o flush idempotente das séries concluídas que ficaram só no
 *    session_state porque o aluno não finalizou manualmente)
 */

import { supabase } from '@/integrations/supabase/client';
import { countsTowardWorkoutCompletion } from './exerciseLoadType';
import { normalizeExName } from '@/components/training/TrainerLogSheetUtils';

export type WorkoutSessionStatus = 'in_progress' | 'completed' | 'partial' | 'abandoned';
export type CompletionSource = 'manual' | 'automatic';

/** Minutos sem atividade real para considerar a sessão parada. */
export const STALE_INACTIVITY_MINUTES = 90;

/** Limiares de classificação automática (0..1). */
export const COMPLETION_THRESHOLDS = {
  completed: 0.7,
  partial: 0.25,
} as const;

/** Peso de cada tipo de sessão na aderência ponderada. */
export const SESSION_ADHERENCE_WEIGHTS: Record<WorkoutSessionStatus, number> = {
  completed: 1,
  partial: 0.5,
  abandoned: 0,
  in_progress: 0,
};

/** Séries planejadas assumidas para exercícios nunca abertos pelo aluno. */
const DEFAULT_PLANNED_SETS_PER_EXERCISE = 3;

export interface CompletionInput {
  plannedExercises: number;
  plannedSets: number;
  executedExercises: number;
  executedSets: number;
}

export interface CompletionResult extends CompletionInput {
  exerciseCompletionRate: number;
  setCompletionRate: number;
  completionScore: number;
  status: Exclude<WorkoutSessionStatus, 'in_progress'>;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** completionScore = exerciseCompletionRate * 0.5 + setCompletionRate * 0.5 (0..1) */
export const computeCompletion = (input: CompletionInput): CompletionResult => {
  const exerciseCompletionRate =
    input.plannedExercises > 0 ? clamp01(input.executedExercises / input.plannedExercises) : 0;
  const setCompletionRate =
    input.plannedSets > 0 ? clamp01(input.executedSets / input.plannedSets) : 0;
  const completionScore = clamp01(exerciseCompletionRate * 0.5 + setCompletionRate * 0.5);
  return {
    ...input,
    exerciseCompletionRate,
    setCompletionRate,
    completionScore,
    status: classifyCompletion(completionScore),
  };
};

export const classifyCompletion = (
  score: number,
): Exclude<WorkoutSessionStatus, 'in_progress'> => {
  if (score >= COMPLETION_THRESHOLDS.completed) return 'completed';
  if (score >= COMPLETION_THRESHOLDS.partial) return 'partial';
  return 'abandoned';
};

interface SessionStateSet {
  reps?: string;
  weight?: string;
  rpe?: string;
  completed?: boolean;
}

export interface WorkoutSessionState {
  sets?: Record<string | number, SessionStateSet[]>;
  currentIndex?: number;
  /** Nomes dos exercícios na ordem do treino (índice = chave de `sets`). */
  exerciseNames?: string[];
  /** Séries planejadas por exercício, na mesma ordem de `exerciseNames`. */
  plannedSets?: number[];
  muscleGroups?: (string | null)[];
}

interface StaleSessionRow {
  id: string;
  student_id: string;
  status: string;
  started_at: string | null;
  created_at: string;
  last_active_at: string | null;
  completed_at: string | null;
  day_name: string | null;
  phase: string | null;
  total_exercises: number | null;
  session_state: any;
}

/** Último instante de atividade real conhecido da sessão. */
export const getEffectiveLastActivity = (row: {
  last_active_at?: string | null;
  started_at?: string | null;
  created_at?: string;
}): number => {
  const candidates = [row.last_active_at, row.started_at, row.created_at]
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((n) => Number.isFinite(n));
  return candidates.length ? Math.max(...candidates) : Date.now();
};

export const isSessionStale = (
  row: { last_active_at?: string | null; started_at?: string | null; created_at?: string },
  now: number = Date.now(),
): boolean => now - getEffectiveLastActivity(row) >= STALE_INACTIVITY_MINUTES * 60 * 1000;

/** Extrai execução real a partir do session_state persistido. */
export const summarizeSessionState = (
  state: WorkoutSessionState | null | undefined,
  totalExercises: number,
): CompletionInput => {
  const sets = state?.sets ?? {};
  const names = state?.exerciseNames ?? [];
  const keys = Object.keys(sets);

  const plannedExercisesRaw = totalExercises || names.length || keys.length;
  // Só preparo/recuperação (mobilidade, alongamento, aquecimento, ativação) sai
  // da conta. Peso corporal (barra fixa, flexão, prancha, abdominal) conta.
  const excluded = names.filter((n) => n && !countsTowardWorkoutCompletion(n)).length;
  const plannedExercises = Math.max(0, plannedExercisesRaw - excluded);

  let executedExercises = 0;
  let executedSets = 0;
  let visitedPlannedSets = 0;
  let visitedCount = 0;

  for (const key of keys) {
    const idx = Number(key);
    const name = names[idx];
    if (name && !countsTowardWorkoutCompletion(name)) continue;
    const arr = Array.isArray(sets[key]) ? sets[key] : [];
    const done = arr.filter((s) => s?.completed).length;
    visitedPlannedSets += arr.length;
    visitedCount += 1;
    if (done > 0) executedExercises += 1;
    executedSets += done;
  }

  const declaredPlanned = (state?.plannedSets ?? []).reduce((acc, n, i) => {
    const name = names[i];
    if (name && !countsTowardWorkoutCompletion(name)) return acc;
    return acc + (Number(n) || 0);
  }, 0);

  let plannedSets = declaredPlanned;
  if (plannedSets <= 0) {
    const avg = visitedCount > 0 ? visitedPlannedSets / visitedCount : DEFAULT_PLANNED_SETS_PER_EXERCISE;
    plannedSets = Math.round(avg * plannedExercises);
  }

  return {
    plannedExercises,
    plannedSets: Math.max(plannedSets, executedSets),
    executedExercises,
    executedSets,
  };
};

/**
 * Persiste no exercise_set_logs as séries concluídas que ficaram apenas no
 * session_state (aluno nunca clicou em Finalizar). Idempotente: só grava se a
 * sessão ainda não tiver nenhum log.
 */
const flushSessionStateLogs = async (
  row: StaleSessionRow,
  state: WorkoutSessionState | null,
  performedAtIso: string,
): Promise<{ totalSets: number; totalVolumeKg: number }> => {
  let totalSets = 0;
  let totalVolumeKg = 0;
  const names = state?.exerciseNames ?? [];
  const sets = state?.sets ?? {};
  if (!names.length) return { totalSets, totalVolumeKg };

  // 1ª barreira (evita tráfego desnecessário): sessão já tem logs?
  const { count } = await supabase
    .from('exercise_set_logs')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', row.id)
    .eq('student_id', row.student_id);
  const alreadyLogged = (count ?? 0) > 0;

  const rows: any[] = [];
  for (const key of Object.keys(sets)) {
    const idx = Number(key);
    const name = names[idx];
    if (!name) continue;
    const arr = Array.isArray(sets[key]) ? sets[key] : [];
    arr.forEach((s, i) => {
      if (!s?.completed) return;
      const reps = parseInt(String(s.reps ?? ''), 10) || 0;
      const weight = parseFloat(String(s.weight ?? '').replace(',', '.')) || 0;
      totalSets += 1;
      totalVolumeKg += reps * weight;
      rows.push({
        student_id: row.student_id,
        session_id: row.id,
        exercise_name: normalizeExName(name),
        muscle_group: state?.muscleGroups?.[idx] ?? null,
        set_number: i + 1,
        reps: reps || null,
        weight_kg: weight || null,
        rpe: null,
        phase: row.phase ?? null,
        day_name: row.day_name ?? null,
        performed_at: performedAtIso,
      });
    });
  }

  if (rows.length > 0 && !alreadyLogged) {
    // 2ª barreira (nível de dados): UNIQUE
    // (session_id, student_id, exercise_name, set_number) + upsert que ignora
    // duplicados. Retries, resolver repetido e finalização manual posterior
    // nunca criam a mesma série duas vezes.
    await supabase
      .from('exercise_set_logs')
      .upsert(rows, {
        onConflict: 'session_id,student_id,exercise_name,set_number',
        ignoreDuplicates: true,
      });
  }
  return { totalSets, totalVolumeKg };
};

export interface ResolvedSession {
  id: string;
  status: Exclude<WorkoutSessionStatus, 'in_progress'>;
  completionScore: number;
  completedAt: string;
}

/**
 * Resolve todas as sessões `in_progress` paradas de um aluno.
 * Idempotente: sessões já resolvidas não são tocadas (o filtro é feito na
 * própria query por status = 'in_progress').
 */
export const resolveStaleWorkoutSessions = async (
  studentId: string,
): Promise<ResolvedSession[]> => {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from('workout_sessions')
    .select(
      'id, student_id, status, started_at, created_at, last_active_at, completed_at, day_name, phase, total_exercises, session_state',
    )
    .eq('student_id', studentId)
    .eq('status', 'in_progress')
    .limit(20);

  if (error || !data || data.length === 0) return [];

  const now = Date.now();
  const resolved: ResolvedSession[] = [];

  for (const raw of data as unknown as StaleSessionRow[]) {
    if (!isSessionStale(raw, now)) continue;

    const state = (raw.session_state ?? null) as WorkoutSessionState | null;
    const completion = computeCompletion(summarizeSessionState(state, raw.total_exercises ?? 0));

    const lastActivityMs = getEffectiveLastActivity(raw);
    const completedAtIso = new Date(lastActivityMs).toISOString();
    const startedMs = raw.started_at ? new Date(raw.started_at).getTime() : lastActivityMs;
    const durationMinutes = Math.max(0, Math.round((lastActivityMs - startedMs) / 60000));

    const { totalSets, totalVolumeKg } = await flushSessionStateLogs(raw, state, completedAtIso);

    const { error: updErr } = await supabase
      .from('workout_sessions')
      .update({
        status: completion.status,
        completion_source: 'automatic' satisfies CompletionSource,
        completion_score: Number(completion.completionScore.toFixed(4)),
        completed_at: completedAtIso,
        last_active_at: completedAtIso,
        duration_minutes: durationMinutes,
        exercises_completed: completion.executedExercises,
        total_sets: totalSets || completion.executedSets || null,
        total_volume_kg: totalVolumeKg || null,
        session_state: null,
      })
      .eq('id', raw.id)
      .eq('status', 'in_progress'); // guarda de concorrência: mantém idempotência

    if (!updErr) {
      resolved.push({
        id: raw.id,
        status: completion.status,
        completionScore: completion.completionScore,
        completedAt: completedAtIso,
      });
    }
  }

  return resolved;
};

/** Marca atividade real na sessão (best-effort, não bloqueia a UI). */
export const touchWorkoutSession = (sessionId: string | null | undefined) => {
  if (!sessionId) return;
  supabase
    .from('workout_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'in_progress')
    .then(() => {});
};

/** Evita chamadas repetidas do resolver em navegações rápidas. */
const lastRunByStudent = new Map<string, number>();
const MIN_INTERVAL_MS = 5 * 60 * 1000;

export const resolveStaleWorkoutSessionsThrottled = async (
  studentId: string | null | undefined,
  force = false,
): Promise<ResolvedSession[]> => {
  if (!studentId) return [];
  const last = lastRunByStudent.get(studentId) ?? 0;
  if (!force && Date.now() - last < MIN_INTERVAL_MS) return [];
  lastRunByStudent.set(studentId, Date.now());
  return resolveStaleWorkoutSessions(studentId);
};
