// Sessão do TABATA concluída (tabata_sessions): o aluno grava o RPE no fim e o coach lê na ficha.
import { supabase } from '@/integrations/supabase/client';

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

export async function saveTabataSession(input: TabataSessionInput): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Faça login de novo para salvar.');
  const { error } = await supabase.from('tabata_sessions').insert({
    id: crypto.randomUUID(), student_id: uid, ...tabataSessionRow(input),
  });
  if (error) throw error;
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
