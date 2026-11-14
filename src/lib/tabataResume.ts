// TABATA em andamento — regras puras da pausa ao sair e da retomada (sem React, sem banco).
// O Player grava um "retrato" do ponto exato (fase, passo, ms restantes, pausas) e decide,
// ao voltar, entre retomar sozinho (saída rápida), mostrar o card Continuar ou encerrar.
import type { PlayerPhase } from './tabataPlayerView';
import type { TabataPlayerStep } from './tabataProgression';

/** Voltou em até 15 s (ex.: trocar a música): retoma sozinho com 3, 2, 1. */
export const QUICK_RESUME_MS = 15_000;
/** Parado há mais de 2 h: o card avisa para aquecer de novo antes de continuar. */
export const STALE_WARMUP_MS = 2 * 60 * 60 * 1000;
/** Parado há mais de 24 h: a sessão vira abandonada e o card some. */
export const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;
/** Contagem antes de seguir (bipes 3, 2, 1). */
export const RESUME_COUNTDOWN_SECONDS = 3;
export const STALE_WARMUP_TEXT = 'Faz uns 2 min de aquecimento antes de continuar';

export const TABATA_RESUME_STORAGE_KEY = 'marombiew:tabata_active_session';

export type ResumablePhase = Exclude<PlayerPhase, 'idle' | 'done'>;
const RESUMABLE: readonly ResumablePhase[] = ['prep', 'work', 'rest', 'block_rest'];

/** away = saiu do app (pode voltar sozinho); manual = o aluno tocou em Pausar. */
export type PauseReason = 'away' | 'manual';

export interface TabataSnapshot {
  v: 1;
  sessionId: string;
  studentId: string;
  planId: string | null;
  title: string;
  /** Plano exato que estava rodando (retoma igual mesmo se o plano mudar depois). */
  markdown: string;
  phase: ResumablePhase;
  stepIndex: number;
  /** Milissegundos que faltavam na fase. */
  remainingMs: number;
  phaseTotalSeconds: number;
  /** Início da sessão (ms). */
  startedAt: number;
  /** Pausas acumuladas até `pausedAt` (não contam no tempo total). */
  totalPauseMs: number;
  doneSteps: number[];
  /** Quando parou (ms). */
  pausedAt: number;
  reason: PauseReason;
  // Para o card: onde parou.
  blockNumber: number;
  isWarmup: boolean;
  round: number;
  rounds: number;
  exerciseName: string;
  savedAt: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isTabataSnapshot(x: unknown): x is TabataSnapshot {
  const s = x as Partial<TabataSnapshot> | null;
  return !!s && typeof s === 'object' && s.v === 1
    && typeof s.sessionId === 'string' && s.sessionId.length > 0
    && typeof s.studentId === 'string' && s.studentId.length > 0
    && typeof s.markdown === 'string' && s.markdown.length > 0
    && RESUMABLE.includes(s.phase as ResumablePhase)
    && isNum(s.stepIndex) && s.stepIndex >= 0
    && isNum(s.remainingMs) && s.remainingMs >= 0
    && isNum(s.phaseTotalSeconds) && s.phaseTotalSeconds >= 0
    && isNum(s.startedAt) && isNum(s.totalPauseMs) && isNum(s.pausedAt) && isNum(s.savedAt)
    && Array.isArray(s.doneSteps);
}

export interface SnapshotInput {
  sessionId: string;
  studentId: string;
  planId: string | null;
  title: string;
  markdown: string;
  phase: PlayerPhase;
  stepIndex: number;
  step: TabataPlayerStep | undefined;
  remainingMs: number;
  phaseTotalSeconds: number;
  startedAt: number;
  totalPauseMs: number;
  doneSteps: Iterable<number>;
  pausedAt: number;
  reason: PauseReason;
}

/** Monta o retrato; null quando não há nada para retomar (antes de iniciar / já terminou). */
export function buildTabataSnapshot(input: SnapshotInput, now = Date.now()): TabataSnapshot | null {
  if (!RESUMABLE.includes(input.phase as ResumablePhase)) return null;
  const step = input.step;
  const total = Math.max(0, Math.round(input.phaseTotalSeconds));
  return {
    v: 1,
    sessionId: input.sessionId,
    studentId: input.studentId,
    planId: input.planId,
    title: (input.title || 'TABATA').slice(0, 200),
    markdown: input.markdown,
    phase: input.phase as ResumablePhase,
    stepIndex: Math.max(0, input.stepIndex),
    remainingMs: Math.min(total * 1000, Math.max(0, Math.round(input.remainingMs))),
    phaseTotalSeconds: total,
    startedAt: input.startedAt,
    totalPauseMs: Math.max(0, Math.round(input.totalPauseMs)),
    doneSteps: [...new Set(input.doneSteps)].sort((a, b) => a - b),
    pausedAt: input.pausedAt,
    reason: input.reason,
    blockNumber: step?.blockNumber ?? 0,
    isWarmup: step?.isWarmup ?? false,
    round: step ? step.exerciseIndex + 1 : 1,
    rounds: step ? step.block.exercises.length : 1,
    exerciseName: (step?.exercise.name || '').replace(/\*+/g, '').trim(),
    savedAt: now,
  };
}

/** "Bloco 2 · Round 3/8" ou "Aquecimento · 3/8". */
export function snapshotLabel(s: Pick<TabataSnapshot, 'isWarmup' | 'blockNumber' | 'round' | 'rounds'>): string {
  return s.isWarmup ? `Aquecimento · ${s.round}/${s.rounds}` : `Bloco ${s.blockNumber} · Round ${s.round}/${s.rounds}`;
}

/** "TABATA em andamento — <dia>, Bloco X · Round Y". */
export const snapshotTitle = (s: TabataSnapshot) => `${s.title || 'TABATA'}, ${snapshotLabel(s)}`;

export type ResumeKind = 'quick' | 'card' | 'expired';

export interface ResumeStatus {
  kind: ResumeKind;
  /** Parado há mais de 2 h: mostrar o aviso de aquecimento. */
  stale: boolean;
  stoppedMs: number;
}

/**
 * O que fazer ao voltar. `awayMs` = quanto tempo ficou fora do app desta vez
 * (só a saída rápida com o Player ainda aberto retoma sozinha; abrir o app de novo mostra o card).
 */
export function resumeStatus(
  s: Pick<TabataSnapshot, 'pausedAt' | 'reason'>, now: number, opts: { awayMs?: number } = {},
): ResumeStatus {
  const stoppedMs = Math.max(0, now - s.pausedAt);
  if (stoppedMs > ABANDON_AFTER_MS) return { kind: 'expired', stale: true, stoppedMs };
  const stale = stoppedMs > STALE_WARMUP_MS;
  const quick = s.reason === 'away' && opts.awayMs != null && opts.awayMs <= QUICK_RESUME_MS && !stale;
  return { kind: quick ? 'quick' : 'card', stale, stoppedMs };
}

/** Início da fase reconstruído para o relógio do Player continuar com os ms que faltavam. */
export const restoredPhaseStart = (s: Pick<TabataSnapshot, 'pausedAt' | 'phaseTotalSeconds' | 'remainingMs'>) =>
  s.pausedAt - (s.phaseTotalSeconds * 1000 - s.remainingMs);

/** Segundos mostrados no cronômetro (mesma conta do Player: total − segundos inteiros passados). */
export const restoredSecondsLeft = (s: Pick<TabataSnapshot, 'phaseTotalSeconds' | 'remainingMs'>) =>
  Math.max(0, s.phaseTotalSeconds - Math.floor((s.phaseTotalSeconds * 1000 - s.remainingMs) / 1000));

/** Tempo treinado: do início até agora, sem as pausas (nem o tempo fora do app). */
export function activeSeconds(startedAt: number, totalPauseMs: number, now: number): number {
  return Math.max(0, Math.round((now - startedAt - Math.max(0, totalPauseMs)) / 1000));
}

/** "há 3 min", "há 2 h". */
export function stoppedAgoText(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h`;
}

/** O mesmo plano que está aberto no Player? (id do plano; sem id, compara o texto). */
export function snapshotMatchesPlan(s: TabataSnapshot, planId: string | null, markdown: string | undefined): boolean {
  if (planId && s.planId) return planId === s.planId;
  return !!markdown && markdown === s.markdown;
}

/** Retrato mais recente entre o do aparelho e o do banco. */
export function newestSnapshot(...list: (TabataSnapshot | null | undefined)[]): TabataSnapshot | null {
  return list.reduce<TabataSnapshot | null>(
    (best, s) => (s && (!best || s.savedAt > best.savedAt) ? s : best), null);
}

// ───────────── Aparelho (localStorage, sempre com try/catch) ─────────────

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStorage = (): StorageLike | null => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};

export function readLocalTabataSnapshot(studentId?: string | null, storage: StorageLike | null = defaultStorage()): TabataSnapshot | null {
  try {
    const raw = storage?.getItem(TABATA_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!isTabataSnapshot(s)) return null;
    if (studentId && s.studentId !== studentId) return null;
    return s;
  } catch { return null; }
}

export function writeLocalTabataSnapshot(s: TabataSnapshot, storage: StorageLike | null = defaultStorage()): boolean {
  try { storage?.setItem(TABATA_RESUME_STORAGE_KEY, JSON.stringify(s)); return !!storage; } catch { return false; }
}

/** Apaga o retrato do aparelho (só o da sessão indicada, quando informada). */
export function clearLocalTabataSnapshot(sessionId?: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    if (sessionId) {
      const cur = readLocalTabataSnapshot(null, storage);
      if (cur && cur.sessionId !== sessionId) return;
    }
    storage?.removeItem(TABATA_RESUME_STORAGE_KEY);
  } catch { /* sem storage */ }
}
