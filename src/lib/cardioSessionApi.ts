// Sessões de cardio (cardio_sessions): em andamento (retrato para retomar), fim e "Finalizar Cardio".
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  activeSeconds, clearLocalCardioSnapshot, isCardioSnapshot, newestCardioSnapshot, readLocalCardioSnapshot,
  resumeStatus, type CardioSnapshot,
} from './cardioResume';
import type { CardioFinishModality } from './cardioPlayerView';

const ACTIVE = ['in_progress', 'paused'] as const;
export type CardioActiveStatus = typeof ACTIVE[number];
const FINISH_MODALITY_VALUES = ['passadeira', 'bike', 'eliptica', 'escada', 'corrida_ar_livre', 'caminhada_ar_livre'];

/** Posição da sessão no plano (0–49) ou vazio. */
export const protocolIndexValue = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 49 ? v : null;

export function cardioProgressRow(s: CardioSnapshot, status: CardioActiveStatus) {
  return {
    id: s.sessionId,
    student_id: s.studentId,
    plan_id: s.planId,
    protocol_name: s.title.slice(0, 200),
    started_at: new Date(s.startedAt).toISOString(),
    completed_at: null,
    status,
    duration_seconds: activeSeconds(s.startedAt, s.totalPauseMs, s.pausedAt),
    total_pause_ms: s.totalPauseMs,
    completed_blocks: s.doneBlocks.length,
    total_blocks: s.totalBlocks,
    protocol_index: protocolIndexValue(s.protocolIndex),
    session_state: { resume: s } as unknown as Json,
  };
}

export async function saveCardioProgress(s: CardioSnapshot, status: CardioActiveStatus): Promise<boolean> {
  try {
    const { error } = await supabase.from('cardio_sessions').upsert(cardioProgressRow(s, status), { onConflict: 'id' });
    return !error;
  } catch { return false; }
}

export async function abandonCardioSession(sessionId: string): Promise<void> {
  try {
    await supabase.from('cardio_sessions').update({ status: 'abandoned' }).eq('id', sessionId).in('status', [...ACTIVE]);
  } catch { /* offline */ }
}

export async function discardActiveCardio(s: Pick<CardioSnapshot, 'sessionId'>): Promise<void> {
  clearLocalCardioSnapshot(s.sessionId);
  await abandonCardioSession(s.sessionId);
}

export async function loadRemoteActiveCardio(studentId: string): Promise<CardioSnapshot[] | null> {
  try {
    const { data, error } = await supabase.from('cardio_sessions')
      .select('id, session_state, status, updated_at')
      .eq('student_id', studentId).in('status', [...ACTIVE])
      .order('updated_at', { ascending: false }).limit(5);
    if (error) return null;
    return (data ?? []).map((r: any) => r?.session_state?.resume)
      .filter((s: unknown): s is CardioSnapshot => isCardioSnapshot(s) && s.studentId === studentId);
  } catch { return null; }
}

async function loadStatus(sessionId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('cardio_sessions').select('status').eq('id', sessionId).maybeSingle();
    if (error || !data) return null;
    return (data as { status: string }).status;
  } catch { return null; }
}

/** Cardio em andamento: o retrato mais novo entre aparelho e banco (24 h parado = abandonado). */
export async function findActiveCardio(studentId: string, now = Date.now()): Promise<CardioSnapshot | null> {
  let local = readLocalCardioSnapshot(studentId);
  const remote = await loadRemoteActiveCardio(studentId);
  if (local && remote && !remote.some(s => s.sessionId === local!.sessionId)) {
    const st = await loadStatus(local.sessionId);
    if (st === 'completed' || st === 'abandoned') { clearLocalCardioSnapshot(local.sessionId); local = null; }
  }
  const alive: CardioSnapshot[] = [];
  for (const s of [local, ...(remote ?? [])]) {
    if (!s) continue;
    if (resumeStatus(s, now).kind === 'expired') { clearLocalCardioSnapshot(s.sessionId); void abandonCardioSession(s.sessionId); }
    else alive.push(s);
  }
  return newestCardioSnapshot(...alive);
}

/** Fecha outras sessões ativas (Recomeçar / começar outro cardio). */
export async function closeOtherActiveCardio(studentId: string, keep: string): Promise<void> {
  const local = readLocalCardioSnapshot(studentId);
  if (local && local.sessionId !== keep) { clearLocalCardioSnapshot(local.sessionId); await abandonCardioSession(local.sessionId); }
  for (const s of (await loadRemoteActiveCardio(studentId)) ?? []) {
    if (s.sessionId !== keep) await abandonCardioSession(s.sessionId);
  }
}

// ───────────── Fim da sessão ─────────────

export interface CardioFinishInput {
  planId: string | null;
  name: string;
  startedAt: Date;
  durationSeconds: number;
  pauseMs: number;
  completedBlocks: number;
  totalBlocks: number;
  modality: CardioFinishModality | null;
  kcal: number | null;
  rpe?: number | null;
  rating?: number | null;
  distanceKm?: number | null;
  avgHeartRate?: number | null;
  notes?: string | null;
  endedEarly?: boolean;
  durationEdited?: boolean;
  /** Qual sessão do plano foi feita (tela Cardio). */
  protocolIndex?: number | null;
}

const intIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
};
const decIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
};

/** Linha concluída (sem o student_id). Valores fora da faixa viram vazio. */
export function cardioFinishRow(input: CardioFinishInput, now = new Date()) {
  const notes = (input.notes ?? '').trim().slice(0, 1000);
  return {
    plan_id: input.planId,
    protocol_name: (input.name || 'Cardio').slice(0, 200),
    started_at: input.startedAt.toISOString(),
    completed_at: now.toISOString(),
    status: 'completed',
    duration_seconds: Math.max(0, Math.min(24 * 3600, Math.round(input.durationSeconds))),
    total_pause_ms: Math.max(0, Math.round(input.pauseMs)),
    completed_blocks: Math.max(0, Math.round(input.completedBlocks)),
    total_blocks: Math.max(0, Math.round(input.totalBlocks)),
    estimated_calories: intIn(input.kcal, 0, 5000),
    average_heart_rate: intIn(input.avgHeartRate, 30, 250),
    rpe: intIn(input.rpe, 1, 5),
    rating: intIn(input.rating, 1, 5),
    modality: input.modality && FINISH_MODALITY_VALUES.includes(input.modality) ? input.modality : null,
    distance_km: decIn(input.distanceKm, 0, 500),
    notes: notes || null,
    protocol_index: protocolIndexValue(input.protocolIndex),
    session_state: { ended_early: !!input.endedEarly, duration_edited: !!input.durationEdited } as unknown as Json,
  };
}

/** Grava o fim na mesma linha que acompanhou a sessão (ou numa nova). */
export async function saveCardioFinish(input: CardioFinishInput, sessionId?: string | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Faça login de novo para salvar.');
  const row = { id: sessionId || crypto.randomUUID(), student_id: uid, ...cardioFinishRow(input) };
  const { error } = await supabase.from('cardio_sessions').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export interface CardioSessionSummary {
  id: string;
  protocol_name: string | null;
  completed_at: string | null;
  duration_seconds: number;
  completed_blocks: number;
  total_blocks: number;
  estimated_calories: number | null;
  average_heart_rate: number | null;
  rpe: number | null;
  rating: number | null;
  modality: string | null;
  distance_km: number | null;
  notes: string | null;
}

export async function loadStudentCardioSessions(studentId: string, limit = 10): Promise<CardioSessionSummary[]> {
  const { data, error } = await supabase.from('cardio_sessions')
    .select('id, protocol_name, completed_at, duration_seconds, completed_blocks, total_blocks, estimated_calories, average_heart_rate, rpe, rating, modality, distance_km, notes')
    .eq('student_id', studentId).eq('status', 'completed').not('completed_at', 'is', null)
    .order('completed_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as CardioSessionSummary[];
}

/** Peso mais recente do aluno (registro de peso; senão a última avaliação). */
export async function loadStudentWeightKg(studentId: string): Promise<number | null> {
  try {
    const { data: w } = await supabase.from('weight_logs').select('peso')
      .eq('student_id', studentId).order('data', { ascending: false }).order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    const pw = Number((w as any)?.peso);
    if (Number.isFinite(pw) && pw > 20) return pw;
    const { data: a } = await supabase.from('assessments').select('id')
      .eq('student_id', studentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!(a as any)?.id) return null;
    const { data: an } = await supabase.from('anthropometrics').select('peso').eq('assessment_id', (a as any).id).maybeSingle();
    const pa = Number((an as any)?.peso);
    return Number.isFinite(pa) && pa > 20 ? pa : null;
  } catch { return null; }
}

/** Cardios concluídos recentes (tela Cardio: semana, "Feito terça" e a sugestão). */
export async function loadCardioDoneSessions(studentId: string, limit = 60): Promise<import('./cardioChooser').CardioDoneSession[]> {
  const { data, error } = await supabase.from('cardio_sessions')
    .select('id, completed_at, duration_seconds, rpe, plan_id, protocol_index, protocol_name')
    .eq('student_id', studentId).eq('status', 'completed').not('completed_at', 'is', null)
    .order('completed_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as import('./cardioChooser').CardioDoneSession[];
}
