import { describe, it, expect } from 'vitest';
import type { ParsedTabata, TabataBlock } from '@/lib/tabataParser';
import { tabataPlayerSteps } from '@/lib/tabataProgression';
import {
  WORK_PHRASES, blockIntensities, elapsedSeconds, estimateKcal, headerStepIndex, intensityChipText,
  phaseTone, progressSegments, roundLabel, sessionCounts, totalSeconds, transitionChip, workPhrase,
} from '@/lib/tabataPlayerView';
import { tabataSessionRow } from '@/lib/tabataSessionApi';

const block = (name: string, n: number, work: number, rest: number, after: number, intensity?: TabataBlock['intensity']): TabataBlock => ({
  name, format: '', rounds: n, workSeconds: work, restSeconds: rest, restAfterBlock: after, intensity,
  exercises: Array.from({ length: n }, (_, i) => ({ name: `EX ${name} ${i % 4}`, workSeconds: work, restSeconds: rest })),
});

/** Aquecimento 6 × 25s/5s (+10s) e 3 blocos de 8 × 20s/10s com 60s entre blocos. */
const plan = (intensities: (TabataBlock['intensity'])[] = [undefined, undefined, undefined]): ParsedTabata => ({
  title: 'T', type: '', duration: '', objective: '', level: '', warmup: [], cooldown: [], rawMarkdown: '',
  warmupBlock: block('Bloco 0 — Aquecimento', 6, 25, 5, 10, 'leve'),
  blocks: intensities.map((it, i) => block(`Bloco ${i + 1}`, 8, 20, 10, 60, it)),
});

describe('cores e intensidade por fase', () => {
  it('plano antigo sem intensidade mostra Moderado → Forte → Máximo', () => {
    expect(blockIntensities(plan())).toEqual(['moderado', 'forte', 'maximo']);
  });
  it('intensidade gravada no bloco é respeitada', () => {
    expect(blockIntensities(plan(['forte', 'forte', 'maximo']))).toEqual(['forte', 'forte', 'maximo']);
  });
  it('aquecimento azul, descanso verde, transição na cor do próximo bloco', () => {
    const p = plan();
    const steps = tabataPlayerSteps(p);
    const lv = blockIntensities(p);
    expect(phaseTone('work', steps, 0, lv)).toBe('warmup');
    expect(phaseTone('rest', steps, 0, lv)).toBe('rest');
    expect(phaseTone('work', steps, 6, lv)).toBe('moderado');
    // último exercício do bloco 1 (índice 13) → transição para o bloco 2 (Forte)
    expect(phaseTone('block_rest', steps, 13, lv)).toBe('forte');
  });
  it('chips com símbolo e RPE', () => {
    expect(intensityChipText('moderado')).toBe('● Moderado · RPE 6–7');
    expect(intensityChipText('forte')).toBe('▲ Forte · RPE 8');
    expect(intensityChipText('maximo')).toBe('▲▲ Máximo · RPE 9–10');
    expect(transitionChip('moderado', 'forte')).toBe('▲ Sobe a intensidade · Forte');
  });
  it('nunca "vai com tudo" no aquecimento nem no moderado', () => {
    for (const lv of ['leve', 'moderado'] as const) {
      for (let i = 0; i < 20; i++) expect(workPhrase(lv, i)).not.toMatch(/VAI COM TUDO/);
    }
    expect(WORK_PHRASES.maximo).toContain('VAI COM TUDO!');
  });
});

describe('topo e tempo', () => {
  const p = plan();
  const steps = tabataPlayerSteps(p);
  it('topo mostra "BLOCO 1 · RODADA 3/8" e já a próxima rodada no descanso', () => {
    expect(roundLabel(steps[8])).toBe('BLOCO 1 · RODADA 3/8');
    expect(roundLabel(steps[1])).toBe('AQUECIMENTO · 2/6');
    expect(headerStepIndex('rest', 8, steps.length)).toBe(9);
    expect(headerStepIndex('work', 8, steps.length)).toBe(8);
  });
  it('total = Fique pronto + aquecimento + blocos (pausas entre blocos, nenhuma no fim)', () => {
    // 10 + (6×25 + 5×5 + 10) + 3×(8×20 + 7×10) + 2×60
    expect(totalSeconds(steps)).toBe(10 + 185 + 690 + 120);
  });
  it('tempo decorrido acompanha a fase atual', () => {
    expect(elapsedSeconds(steps, 'prep', 0, 4)).toBe(6);
    expect(elapsedSeconds(steps, 'work', 0, 20)).toBe(15);
    expect(elapsedSeconds(steps, 'work', 6, 20)).toBe(10 + 185);
    expect(elapsedSeconds(steps, 'done', 0, 0)).toBe(totalSeconds(steps));
  });
  it('barra tem um segmento por bloco, aquecimento mais curto', () => {
    const segs = progressSegments(steps, blockIntensities(p), elapsedSeconds(steps, 'work', 6, 20));
    expect(segs.map(s => s.tone)).toEqual(['warmup', 'moderado', 'forte', 'maximo']);
    expect(segs[0].seconds).toBeLessThan(segs[1].seconds);
    expect(segs[0].fill).toBe(1);
    expect(segs[2].fill).toBe(0);
  });
});

describe('resumo e sessão', () => {
  const p = plan();
  const steps = tabataPlayerSteps(p);
  it('rodadas contam só os blocos (24/24) e o bloco só fecha completo', () => {
    const all = steps.map((_, i) => i);
    expect(sessionCounts(steps, all)).toEqual({ rounds: 24, totalRounds: 24, blocks: 3, totalBlocks: 3 });
    expect(sessionCounts(steps, all.slice(0, 6 + 8 + 3))).toEqual({ rounds: 11, totalRounds: 24, blocks: 1, totalBlocks: 3 });
  });
  it('kcal sobem com a intensidade do bloco', () => {
    const lv = blockIntensities(p);
    const block1 = estimateKcal(steps, [6, 7, 8, 9, 10, 11, 12, 13], lv, 160);
    const block3 = estimateKcal(steps, [22, 23, 24, 25, 26, 27, 28, 29], lv, 160);
    expect(block3).toBeGreaterThan(block1);
  });
  it('RPE de 1 a 10 é obrigatório; encerrar antes grava "abandoned"', () => {
    const base = { planId: 'p', name: 'T', startedAt: new Date('2026-11-14T10:00:00Z'), durationSeconds: 600, pauseMs: 0, rounds: 10, totalRounds: 24, blocks: 1, totalBlocks: 3, kcal: 90 };
    expect(() => tabataSessionRow({ ...base, rpe: 0, endedEarly: false })).toThrow();
    expect(() => tabataSessionRow({ ...base, rpe: 11, endedEarly: false })).toThrow();
    const row = tabataSessionRow({ ...base, rpe: 8, endedEarly: true });
    expect(row.rpe).toBe(8);
    expect(row.status).toBe('abandoned');
    expect(tabataSessionRow({ ...base, rpe: 7, endedEarly: false }).status).toBe('completed');
  });
});
