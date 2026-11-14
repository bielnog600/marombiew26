// Sessão do TABATA concluída (tabata_sessions): o aluno grava o RPE no fim e o coach lê na ficha.
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  activeSeconds, clearLocalTabataSnapshot, isTabataSnapshot, newestSnapshot, readLocalTabataSnapshot, resumeStatus,
  type TabataSnapshot,
} from './tabataResume';

export interface TabataSessionInput {
  planId: string | null;
  name: string;
  startedAt: Date;
  durationSeconds: number;
  pauseMs: number;
  rounds: number;
  totalRounds: number;
  blocks: number;
  totalBlocks: number;
  kcal: number;
  rpe: number;
  endedEarly: boolean;
}

export const isValidRpe = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;

export type TabataFinishInput = Omit<TabataSessionInput, 'rpe'>;

/** Linha da sessão terminada, ainda sem o RPE (fica gravada mesmo se o aluno não escolher). */
export function tabataFinishedRow(input: TabataFinishInput, now = new Date()) {
  return {
    plan_id: input.planId,
    tabata_name: input.name.slice(0, 200),
    started_at: input.startedAt.toISOString(),
    completed_at: now.toISOString(),
    status: input.endedEarly ? 'abandoned' : 'completed',
    duration_seconds: Math.max(0, Math.round(input.durationSeconds)),
    total_pause_ms: Math.max(0, Math.round(input.pauseMs)),
    completed_rounds: input.rounds,
    total_rounds: input.totalRounds,
    completed_blocks: input.blocks,
    total_blocks: input.totalBlocks,
    current_phase: 'done',
    kcal_estimate: Math.max(0, Math.round(input.kcal)),
    session_state: { kcal: input.kcal, ended_early: input.endedEarly },
  };
}

/** Linha gravada (sem o student_id, que vem da sessão logada). */
export function tabataSessionRow(input: TabataSessionInput, now = new Date()) {
  if (!isValidRpe(input.rpe)) throw new Error('RPE inválido');
  return {
    plan_id: input.planId,
    tabata_name: input.name.slice(0, 200),
    started_at: input.startedAt.toISOString(),
    completed_at: now.toISOString(),
    status: input.endedEarly ? 'abandoned' : 'completed',
    duration_seconds: Math.max(0, Math.round(input.durationSeconds)),
    total_pause_ms: Math.max(0, Math.round(input.pauseMs)),
    completed_rounds: input.rounds,
    total_rounds: input.totalRounds,
    completed_blocks: input.blocks,
    total_blocks: input.totalBlocks,
    current_phase: 'done',
    rpe: input.rpe,
    kcal_estimate: Math.max(0, Math.round(input.kcal)),
    session_state: { rpe: input.rpe, kcal: input.kcal, ended_early: input.endedEarly },
  };
}

/**
 * Grava o fim com o RPE. Com `sessionId` atualiza a mesma linha que acompanhou o treino
 * (em andamento → concluída); sem ele cria uma linha nova, como antes.
 */
export async function saveTabataSession(input: TabataSessionInput, sessionId?: string | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Faça login de novo para salvar.');
  const row = { id: sessionId || crypto.randomUUID(), student_id: uid, ...tabataSessionRow(input) };
  const { error } = sessionId
    ? await supabase.from('tabata_sessions').upsert(row, { onConflict: 'id' })
    : await supabase.from('tabata_sessions').insert(row);
  if (error) throw error;
}

// ───────────── TABATA em andamento (pausa ao sair / retomada) ─────────────

const ACTIVE_STATUSES = ['in_progress', 'paused'] as const;
export type TabataActiveStatus = typeof ACTIVE_STATUSES[number];

/** Linha "em andamento"/"pausada" com o retrato completo em session_state.resume. */
export function tabataProgressRow(s: TabataSnapshot, status: TabataActiveStatus) {
  return {
    id: s.sessionId,
    student_id: s.studentId,
    plan_id: s.planId,
    tabata_name: s.title.slice(0, 200),
    started_at: new Date(s.startedAt).toISOString(),
    completed_at: null,
    status,
    duration_seconds: activeSeconds(s.startedAt, s.totalPauseMs, s.pausedAt),
    total_pause_ms: s.totalPauseMs,
    completed_rounds: s.doneSteps.length,
    current_phase: s.phase,
    session_state: { resume: s } as unknown as Json,
  };
}

/** Grava o ponto atual no banco (outro aparelho consegue retomar). Falha em silêncio (offline). */
export async function saveTabataProgress(s: TabataSnapshot, status: TabataActiveStatus): Promise<boolean> {
  try {
    const { error } = await supabase.from('tabata_sessions').upsert(tabataProgressRow(s, status), { onConflict: 'id' });
    return !error;
  } catch { return false; }
}

/** Fecha como abandonada (Recomeçar, Descartar ou mais de 24 h parada). Só mexe se ainda estiver ativa. */
export async function abandonTabataSession(sessionId: string): Promise<void> {
  try {
    await supabase.from('tabata_sessions')
      .update({ status: 'abandoned' })
      .eq('id', sessionId)
      .in('status', [...ACTIVE_STATUSES]);
  } catch { /* offline: o retrato local já foi apagado */ }
}

/** Grava o fim (sem RPE ainda), para a sessão sair de "em andamento" mesmo sem salvar o RPE. */
export async function finishTabataSession(sessionId: string, studentId: string, input: TabataFinishInput): Promise<void> {
  try {
    await supabase.from('tabata_sessions').upsert(
      { id: sessionId, student_id: studentId, ...tabataFinishedRow(input) }, { onConflict: 'id' });
  } catch { /* offline */ }
}

export interface RemoteActiveTabata {
  /** null quando a consulta falhou (offline): não dá para saber o que está ativo no banco. */
  snapshots: TabataSnapshot[] | null;
}

/** Sessões ativas do aluno no banco, com retrato válido (mais recente primeiro). */
export async function loadRemoteActiveTabata(studentId: string): Promise<RemoteActiveTabata> {
  try {
    const { data, error } = await supabase
      .from('tabata_sessions')
      .select('id, session_state, status, updated_at')
      .eq('student_id', studentId)
      .in('status', [...ACTIVE_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(5);
    if (error) return { snapshots: null };
    const snapshots = (data ?? [])
      .map((r: any) => r?.session_state?.resume)
      .filter((s: unknown): s is TabataSnapshot => isTabataSnapshot(s) && s.studentId === studentId);
    return { snapshots };
  } catch { return { snapshots: null }; }
}

/** Status de uma sessão no banco (null = não encontrada ou sem conexão). */
export async function loadTabataSessionStatus(sessionId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('tabata_sessions').select('status').eq('id', sessionId).maybeSingle();
    if (error || !data) return null;
    return (data as { status: string }).status;
  } catch { return null; }
}

/**
 * TABATA em andamento do aluno: o retrato mais novo entre aparelho e banco.
 * Parado há mais de 24 h vira abandonado e não aparece; concluído em outro aparelho some daqui.
 */
export async function findActiveTabata(studentId: string, now = Date.now()): Promise<TabataSnapshot | null> {
  let local = readLocalTabataSnapshot(studentId);
  const remote = await loadRemoteActiveTabata(studentId);
  if (local && remote.snapshots && !remote.snapshots.some(s => s.sessionId === local!.sessionId)) {
    const status = await loadTabataSessionStatus(local.sessionId);
    if (status === 'completed' || status === 'abandoned') {
      clearLocalTabataSnapshot(local.sessionId);
      local = null;
    }
  }
  const candidates = [local, ...(remote.snapshots ?? [])];
  let best = newestSnapshot(...candidates);
  while (best && resumeStatus(best, now).kind === 'expired') {
    const expired = best;
    clearLocalTabataSnapshot(expired.sessionId);
    void abandonTabataSession(expired.sessionId);
    best = newestSnapshot(...candidates.filter(s => s && s.sessionId !== expired.sessionId));
    candidates.splice(0, candidates.length, ...candidates.filter(s => s && s.sessionId !== expired.sessionId));
  }
  return best;
}

/** Fecha a sessão ativa (aparelho + banco). */
export async function discardActiveTabata(s: Pick<TabataSnapshot, 'sessionId'>): Promise<void> {
  clearLocalTabataSnapshot(s.sessionId);
  await abandonTabataSession(s.sessionId);
}

export interface TabataSessionSummary {
  id: string;
  tabata_name: string | null;
  completed_at: string | null;
  duration_seconds: number;
  completed_rounds: number;
  total_rounds: number;
  rpe: number | null;
  kcal_estimate: number | null;
  status: string;
}

export async function loadStudentTabataSessions(studentId: string, limit = 5): Promise<TabataSessionSummary[]> {
  const { data, error } = await supabase
    .from('tabata_sessions')
    .select('id, tabata_name, completed_at, duration_seconds, completed_rounds, total_rounds, rpe, kcal_estimate, status')
    .eq('student_id', studentId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TabataSessionSummary[];
}
