// Cardio em andamento — retrato do ponto exato para a pausa ao sair e a retomada.
// Mesmas regras do TABATA (15 s retoma sozinho, aviso após 2 h, abandona após 24 h),
// reaproveitadas de tabataResume; aqui só muda o formato do retrato (fase do cardio).
import type { CardioProtocol } from './cardioParser';
import type { PauseReason } from './tabataResume';

export {
  QUICK_RESUME_MS, STALE_WARMUP_TEXT, ABANDON_AFTER_MS, RESUME_COUNTDOWN_SECONDS,
  resumeStatus, restoredPhaseStart, restoredSecondsLeft, activeSeconds, stoppedAgoText,
  type PauseReason,
} from './tabataResume';

export const CARDIO_RESUME_STORAGE_KEY = 'marombiew:cardio_active_session';
/** Formato antigo (antes da pausa ao sair): convertido uma vez e apagado. */
export const LEGACY_CARDIO_STORAGE_KEY = 'mw_active_cardio_session';

export type CardioResumablePhase = 'prep' | 'block';

export interface CardioSnapshot {
  v: 1;
  sessionId: string;
  studentId: string;
  planId: string | null;
  title: string;
  /** Protocolo exato que estava rodando. */
  protocol: CardioProtocol;
  phase: CardioResumablePhase;
  blockIndex: number;
  remainingMs: number;
  phaseTotalSeconds: number;
  startedAt: number;
  totalPauseMs: number;
  doneBlocks: number[];
  pausedAt: number;
  reason: PauseReason;
  blockName: string;
  totalBlocks: number;
  savedAt: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isCardioSnapshot(x: unknown): x is CardioSnapshot {
  const s = x as Partial<CardioSnapshot> | null;
  return !!s && typeof s === 'object' && s.v === 1
    && typeof s.sessionId === 'string' && s.sessionId.length > 0
    && typeof s.studentId === 'string' && s.studentId.length > 0
    && !!s.protocol && Array.isArray(s.protocol.blocks) && s.protocol.blocks.length > 0
    && (s.phase === 'prep' || s.phase === 'block')
    && isNum(s.blockIndex) && s.blockIndex >= 0 && s.blockIndex < s.protocol.blocks.length
    && isNum(s.remainingMs) && s.remainingMs >= 0
    && isNum(s.phaseTotalSeconds) && s.phaseTotalSeconds >= 0
    && isNum(s.startedAt) && isNum(s.totalPauseMs) && isNum(s.pausedAt) && isNum(s.savedAt)
    && Array.isArray(s.doneBlocks);
}

export interface CardioSnapshotInput {
  sessionId: string; studentId: string; planId: string | null;
  protocol: CardioProtocol; phase: string; blockIndex: number;
  remainingMs: number; phaseTotalSeconds: number; startedAt: number; totalPauseMs: number;
  doneBlocks: Iterable<number>; pausedAt: number; reason: PauseReason;
}

export function buildCardioSnapshot(input: CardioSnapshotInput, now = Date.now()): CardioSnapshot | null {
  if (input.phase !== 'prep' && input.phase !== 'block') return null;
  const blocks = input.protocol?.blocks ?? [];
  if (!blocks.length) return null;
  const idx = Math.min(blocks.length - 1, Math.max(0, input.blockIndex));
  const total = Math.max(0, Math.round(input.phaseTotalSeconds));
  return {
    v: 1,
    sessionId: input.sessionId,
    studentId: input.studentId,
    planId: input.planId,
    title: (input.protocol.title || 'Cardio').slice(0, 200),
    protocol: input.protocol,
    phase: input.phase,
    blockIndex: idx,
    remainingMs: Math.min(total * 1000, Math.max(0, Math.round(input.remainingMs))),
    phaseTotalSeconds: total,
    startedAt: input.startedAt,
    totalPauseMs: Math.max(0, Math.round(input.totalPauseMs)),
    doneBlocks: [...new Set(input.doneBlocks)].sort((a, b) => a - b),
    pausedAt: input.pausedAt,
    reason: input.reason,
    blockName: input.phase === 'prep' ? 'Prepare-se' : (blocks[idx]?.name || '').trim(),
    totalBlocks: blocks.length,
    savedAt: now,
  };
}

/** "Fase 3 de 20 · Pico forte" (ou "Prepare-se"). */
export function cardioSnapshotLabel(s: Pick<CardioSnapshot, 'phase' | 'blockIndex' | 'totalBlocks' | 'blockName'>): string {
  if (s.phase === 'prep') return `Prepare-se · ${s.totalBlocks} fases`;
  return `Fase ${s.blockIndex + 1} de ${s.totalBlocks}${s.blockName ? ` · ${s.blockName}` : ''}`;
}

export function cardioSnapshotMatches(s: CardioSnapshot, planId: string | null, protocol: CardioProtocol | null | undefined): boolean {
  if (!protocol) return false;
  if (s.protocol.title !== protocol.title) return false;
  if (planId && s.planId) return planId === s.planId;
  return true;
}

export function newestCardioSnapshot(...list: (CardioSnapshot | null | undefined)[]): CardioSnapshot | null {
  return list.reduce<CardioSnapshot | null>((best, s) => (s && (!best || s.savedAt > best.savedAt) ? s : best), null);
}

// ───────────── Aparelho (localStorage, sempre com try/catch) ─────────────

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStorage = (): StorageLike | null => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};

const newId = () => {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
};

/** Converte a sessão gravada no formato antigo (antes desta tela) num retrato pausado. */
export function convertLegacyCardio(raw: unknown, studentId: string, now = Date.now()): CardioSnapshot | null {
  const l = raw as { protocol?: CardioProtocol; phase?: string; blockIndex?: number; secondsLeft?: number; anchorMs?: number } | null;
  if (!l || !l.protocol || !Array.isArray(l.protocol.blocks) || !l.protocol.blocks.length) return null;
  if (l.phase !== 'prep' && l.phase !== 'block') return null;
  const idx = isNum(l.blockIndex) ? l.blockIndex : 0;
  const total = l.phase === 'prep' ? 10 : Math.round(Number(l.protocol.blocks[idx]?.durationSec) || 0);
  const left = Math.max(0, Math.min(total, isNum(l.secondsLeft) ? l.secondsLeft : total));
  const at = isNum(l.anchorMs) ? l.anchorMs : now;
  return buildCardioSnapshot({
    sessionId: newId(), studentId, planId: null, protocol: l.protocol, phase: l.phase, blockIndex: idx,
    remainingMs: left * 1000, phaseTotalSeconds: total, startedAt: at, totalPauseMs: 0,
    doneBlocks: Array.from({ length: idx }, (_, i) => i), pausedAt: at, reason: 'manual',
  }, at);
}

export function readLocalCardioSnapshot(studentId?: string | null, storage: StorageLike | null = defaultStorage()): CardioSnapshot | null {
  try {
    const raw = storage?.getItem(CARDIO_RESUME_STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (isCardioSnapshot(s) && (!studentId || s.studentId === studentId)) return s;
      return null;
    }
    const legacy = storage?.getItem(LEGACY_CARDIO_STORAGE_KEY);
    if (legacy && studentId) {
      storage?.removeItem(LEGACY_CARDIO_STORAGE_KEY);
      const conv = convertLegacyCardio(JSON.parse(legacy), studentId);
      if (conv) storage?.setItem(CARDIO_RESUME_STORAGE_KEY, JSON.stringify(conv));
      return conv;
    }
    return null;
  } catch { return null; }
}

export function writeLocalCardioSnapshot(s: CardioSnapshot, storage: StorageLike | null = defaultStorage()): boolean {
  try { storage?.setItem(CARDIO_RESUME_STORAGE_KEY, JSON.stringify(s)); return !!storage; } catch { return false; }
}

export function clearLocalCardioSnapshot(sessionId?: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    if (sessionId) {
      const raw = storage?.getItem(CARDIO_RESUME_STORAGE_KEY);
      const cur = raw ? JSON.parse(raw) : null;
      if (cur && isCardioSnapshot(cur) && cur.sessionId !== sessionId) return;
    }
    storage?.removeItem(CARDIO_RESUME_STORAGE_KEY);
    storage?.removeItem(LEGACY_CARDIO_STORAGE_KEY);
  } catch { /* sem storage */ }
}
