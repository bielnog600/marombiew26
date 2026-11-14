import { describe, it, expect } from 'vitest';
import {
  ABANDON_AFTER_MS, QUICK_RESUME_MS, STALE_WARMUP_MS, activeSeconds, buildTabataSnapshot, clearLocalTabataSnapshot,
  isTabataSnapshot, newestSnapshot, readLocalTabataSnapshot, restoredPhaseStart, restoredSecondsLeft, resumeStatus,
  snapshotLabel, snapshotMatchesPlan, writeLocalTabataSnapshot, type TabataSnapshot,
} from '@/lib/tabataResume';
import { tabataProgressRow } from '@/lib/tabataSessionApi';

const T0 = 1_700_000_000_000;
const step = (blockNumber: number, exerciseIndex: number, n: number, isWarmup = false) => ({
  blockIndex: blockNumber - 1, blockNumber, isWarmup, exerciseIndex,
  block: { exercises: Array.from({ length: n }, () => ({ name: 'BURPEES', workSeconds: 20, restSeconds: 10 })) } as any,
  exercise: { name: '**BURPEES**', workSeconds: 20, restSeconds: 10 },
});
const snap = (over: Partial<Parameters<typeof buildTabataSnapshot>[0]> = {}) => buildTabataSnapshot({
  sessionId: 's1', studentId: 'aluno-1', planId: 'p1', title: 'TABATA QUINTA', markdown: '# TABATA QUINTA',
  phase: 'work', stepIndex: 5, step: step(2, 2, 8), remainingMs: 12_400, phaseTotalSeconds: 20,
  startedAt: T0, totalPauseMs: 30_000, doneSteps: [0, 1, 2, 3, 4], pausedAt: T0 + 300_000, reason: 'away', ...over,
}, T0 + 300_000)!;

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('TABATA em andamento — regras de retomada', () => {
  it('voltar em até 15 s retoma sozinho; depois disso mostra o card', () => {
    const s = snap();
    expect(resumeStatus(s, s.pausedAt + 5_000, { awayMs: 5_000 }).kind).toBe('quick');
    expect(resumeStatus(s, s.pausedAt + QUICK_RESUME_MS, { awayMs: QUICK_RESUME_MS }).kind).toBe('quick');
    expect(resumeStatus(s, s.pausedAt + 15_001, { awayMs: 15_001 }).kind).toBe('card');
    // Abrir o app de novo (sem o Player aberto) sempre mostra o card.
    expect(resumeStatus(s, s.pausedAt + 5_000).kind).toBe('card');
    // Pausado pelo botão não retoma sozinho.
    expect(resumeStatus({ ...s, reason: 'manual' }, s.pausedAt + 5_000, { awayMs: 5_000 }).kind).toBe('card');
  });

  it('mais de 2 h parado avisa para aquecer; mais de 24 h encerra', () => {
    const s = snap();
    expect(resumeStatus(s, s.pausedAt + STALE_WARMUP_MS).stale).toBe(false);
    expect(resumeStatus(s, s.pausedAt + STALE_WARMUP_MS + 1)).toMatchObject({ kind: 'card', stale: true });
    expect(resumeStatus(s, s.pausedAt + ABANDON_AFTER_MS).kind).toBe('card');
    expect(resumeStatus(s, s.pausedAt + ABANDON_AFTER_MS + 1).kind).toBe('expired');
  });

  it('card mostra "Bloco X · Round Y" e o aquecimento pela posição', () => {
    expect(snapshotLabel(snap())).toBe('Bloco 2 · Round 3/8');
    expect(snapshotLabel(snap({ step: step(0, 1, 8, true) }))).toBe('Aquecimento · 2/8');
  });

  it('retoma os ms que faltavam no round (o tempo parado não conta)', () => {
    const s = snap();
    expect(s.exerciseName).toBe('BURPEES');
    expect(restoredPhaseStart(s)).toBe(s.pausedAt - 7_600);
    expect(restoredSecondsLeft(s)).toBe(13);
    expect(restoredSecondsLeft({ phaseTotalSeconds: 20, remainingMs: 20_000 })).toBe(20);
    expect(activeSeconds(T0, 30_000, T0 + 300_000)).toBe(270);
  });

  it('antes de iniciar ou depois de terminar não há o que retomar', () => {
    expect(snap({ phase: 'idle' } as any)).toBeNull();
    expect(snap({ phase: 'done' } as any)).toBeNull();
    expect(isTabataSnapshot(snap())).toBe(true);
    expect(isTabataSnapshot({ ...snap(), phase: 'done' })).toBe(false);
  });

  it('usa o retrato mais novo entre aparelho e banco e compara o plano pelo id', () => {
    const a = snap();
    const b = { ...snap(), sessionId: 's2', savedAt: a.savedAt + 1 };
    expect(newestSnapshot(a, null, b)?.sessionId).toBe('s2');
    expect(snapshotMatchesPlan(a, 'p1', 'outro')).toBe(true);
    expect(snapshotMatchesPlan(a, 'p2', '# TABATA QUINTA')).toBe(false);
    expect(snapshotMatchesPlan({ ...a, planId: null }, null, '# TABATA QUINTA')).toBe(true);
  });

  it('localStorage: grava, lê só do mesmo aluno, apaga só a sessão indicada e nunca quebra', () => {
    const st = new MemStorage();
    const s = snap();
    expect(writeLocalTabataSnapshot(s, st)).toBe(true);
    expect(readLocalTabataSnapshot('aluno-1', st)?.sessionId).toBe('s1');
    expect(readLocalTabataSnapshot('outro', st)).toBeNull();
    clearLocalTabataSnapshot('s9', st);
    expect(readLocalTabataSnapshot('aluno-1', st)).not.toBeNull();
    clearLocalTabataSnapshot('s1', st);
    expect(readLocalTabataSnapshot('aluno-1', st)).toBeNull();
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(writeLocalTabataSnapshot(s, broken)).toBe(false);
    expect(readLocalTabataSnapshot('aluno-1', broken)).toBeNull();
    expect(() => clearLocalTabataSnapshot(undefined, broken)).not.toThrow();
  });

  it('linha no banco: pausada, sem conclusão, tempo ativo sem pausas e o retrato completo', () => {
    const row = tabataProgressRow(snap(), 'paused');
    expect(row).toMatchObject({
      id: 's1', student_id: 'aluno-1', plan_id: 'p1', status: 'paused', completed_at: null,
      current_phase: 'work', duration_seconds: 270, total_pause_ms: 30_000, completed_rounds: 5,
    });
    expect((row.session_state as any).resume.stepIndex).toBe(5);
  });
});
