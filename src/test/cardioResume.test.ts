import { describe, expect, it } from 'vitest';
import {
  buildCardioSnapshot, cardioSnapshotLabel, resumeStatus, readLocalCardioSnapshot, writeLocalCardioSnapshot,
  CARDIO_RESUME_STORAGE_KEY,
} from '@/lib/cardioResume';
import type { CardioProtocol } from '@/lib/cardioParser';

const protocol = {
  title: 'HIIT', modality: 'passadeira', structure: 'hiit',
  blocks: [
    { name: 'Aquecimento', type: 'aquecimento', durationSec: 300, intensityLabel: 'leve' },
    { name: 'Pico forte', type: 'pico', durationSec: 120, intensityLabel: 'forte' },
  ],
} as unknown as CardioProtocol;

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('Cardio em andamento', () => {
  const now = 1_000_000;
  const snap = buildCardioSnapshot({
    sessionId: 's1', studentId: 'a1', planId: 'p1', protocol, phase: 'block', blockIndex: 1, remainingMs: 45_000,
    phaseTotalSeconds: 120, startedAt: now - 400_000, totalPauseMs: 0, doneBlocks: new Set([0]), pausedAt: now, reason: 'away',
  }, now)!;

  it('guarda a fase e mostra "Fase 2 de 2 · Pico forte"', () => {
    expect(snap.blockIndex).toBe(1);
    expect(cardioSnapshotLabel(snap)).toBe('Fase 2 de 2 · Pico forte');
  });

  it('até 15 s fora retoma sozinho; depois pergunta; mais de 24 h encerra', () => {
    expect(resumeStatus(snap, now + 10_000, { awayMs: 10_000 }).kind).toBe('quick');
    expect(resumeStatus(snap, now + 60_000, { awayMs: 60_000 }).kind).not.toBe('quick');
    expect(resumeStatus(snap, now + 25 * 3600_000).kind).toBe('expired');
  });

  it('salva e lê no aparelho', () => {
    const st = memory();
    writeLocalCardioSnapshot(snap, st);
    expect(st.getItem(CARDIO_RESUME_STORAGE_KEY)).toBeTruthy();
    expect(readLocalCardioSnapshot('a1', st)?.sessionId).toBe('s1');
  });
});
