import { describe, it, expect } from 'vitest';
import type { CardioBlock, CardioProtocol } from '@/lib/cardioParser';
import {
  cardioChips, cardioHeadline, cardioOptions, cardioSubtitle, cardioWeek, doneBadge, doneFooter, groupCardioSteps,
  intensityBars, matchOption, optionStatuses, paramBoxes, shortCardioTitle, stepsLegend, suggestedOption,
  type CardioDoneSession,
} from '@/lib/cardioChooser';
import { cardioFinishRow, cardioProgressRow } from '@/lib/cardioSessionApi';
import { buildCardioSnapshot } from '@/lib/cardioResume';

const warm: CardioBlock = { name: 'Aquecimento', type: 'aquecimento', durationSec: 300, intensityLabel: 'leve', resistanceLevel: 4, bikePosition: 'sentado' };
const cool: CardioBlock = { name: 'Desaceleração', type: 'desaceleracao', durationSec: 180, intensityLabel: 'leve', resistanceLevel: 3, bikePosition: 'sentado' };
const peak: CardioBlock = { name: 'Pico forte', type: 'pico', durationSec: 120, intensityLabel: 'forte', resistanceLevel: 10, bikePosition: 'em_pe' };
const rec: CardioBlock = { name: 'Recuperação', type: 'recuperacao', durationSec: 60, intensityLabel: 'leve', resistanceLevel: 4, bikePosition: 'sentado' };

const proto = (over: Partial<CardioProtocol>): CardioProtocol => ({
  title: 'Sessão', modality: 'bike', objective: '', level: 'intermediario', intensity: 'intensa', structure: 'hiit',
  totalDurationMin: 32, frequencyPerWeek: 3, blocks: [], ...over,
});
const bikeHiit = proto({
  title: 'HIIT bike em pé',
  blocks: [warm, ...Array.from({ length: 8 }, () => [peak, rec]).flat(), cool].slice(0, 18),
});
// 5 + 8×3 + 3 = 32 min
const treadmill = proto({
  title: 'Passadeira inclinação', modality: 'passadeira',
  blocks: [
    { name: 'Aquecimento', type: 'aquecimento', durationSec: 300, intensityLabel: 'leve', speedKmh: 5, inclinePct: 1 },
    { name: 'Pico', type: 'pico', durationSec: 120, intensityLabel: 'forte', speedKmh: 6, inclinePct: 8 },
    { name: 'Recuperação', type: 'recuperacao', durationSec: 60, intensityLabel: 'leve', speedKmh: 4, inclinePct: 1 },
    { name: 'Pico', type: 'pico', durationSec: 120, intensityLabel: 'forte', speedKmh: 6, inclinePct: 10 },
    { name: 'Recuperação', type: 'recuperacao', durationSec: 60, intensityLabel: 'leve', speedKmh: 4, inclinePct: 1 },
  ],
});
const stairs = proto({
  title: 'Escada', modality: 'escada',
  blocks: [
    { name: 'Pico', type: 'pico', durationSec: 60, intensityLabel: 'forte', resistanceLevel: 6 },
    { name: 'Recuperação', type: 'recuperacao', durationSec: 60, intensityLabel: 'leve', resistanceLevel: 3 },
    { name: 'Pico', type: 'pico', durationSec: 60, intensityLabel: 'forte', resistanceLevel: 7 },
    { name: 'Recuperação', type: 'recuperacao', durationSec: 60, intensityLabel: 'leve', resistanceLevel: 3 },
  ],
});

// Quarta-feira, 18 nov 2026, meio-dia (semana de 16 a 22).
const NOW = new Date(2026, 10, 18, 12);
const at = (day: number, h = 10) => new Date(2026, 10, day, h).toISOString();
const done = (over: Partial<CardioDoneSession>): CardioDoneSession => ({
  id: Math.random().toString(), completed_at: at(17), duration_seconds: 1920, rpe: 3, plan_id: 'plan-1', protocol_index: 0, protocol_name: null, ...over,
});

describe('opções do plano', () => {
  it('plano semanal = uma opção por sessão; plano de um protocolo só = uma opção', () => {
    expect(cardioOptions({ weekly: true, frequencyPerWeek: 3, protocols: [bikeHiit, treadmill, stairs] })).toHaveLength(3);
    expect(cardioOptions(bikeHiit)).toEqual([bikeHiit]);
  });
});

describe('card da sessão', () => {
  it('título curto, subtítulo e chips da bike em pé', () => {
    expect(shortCardioTitle(bikeHiit)).toBe('HIIT na Bike');
    expect(cardioSubtitle(bikeHiit)).toBe('Picos em pé');
    expect(cardioChips(bikeHiit)).toEqual(['32 min', '8 picos', 'Intenso']);
    expect(cardioHeadline(bikeHiit)).toBe('32 min · 8 picos em pé · Intenso');
  });

  it('passadeira com mais inclinação no pico = "Picos com inclinação"', () => {
    expect(cardioSubtitle(treadmill)).toBe('Picos com inclinação');
    const flat = proto({ modality: 'passadeira', blocks: treadmill.blocks.map(b => ({ ...b, inclinePct: 1 })) });
    expect(cardioSubtitle(flat)).toBe('Picos de velocidade');
  });

  it('boxes PICO / RECUP. a partir dos blocos, com faixa quando varia', () => {
    expect(paramBoxes(bikeHiit)).toEqual([
      { kind: 'pico', label: 'Pico', time: '2:00', detail: 'Em pé · Nível 10' },
      { kind: 'recup', label: 'Recup.', time: '1:00', detail: 'Sentado · Nível 4' },
    ]);
    expect(paramBoxes(treadmill)[0].detail).toBe('6 km/h · 8–10%');
    expect(paramBoxes(stairs)[0].detail).toBe('Velocidade 6–7');
  });

  it('mini barra: aquecimento baixa, pico alta, recuperação média, largura pelo tempo', () => {
    const bars = intensityBars(bikeHiit);
    expect(bars).toHaveLength(18);
    expect(bars[0]).toMatchObject({ level: 'low', tone: 'warmup', seconds: 300 });
    expect(bars[1]).toMatchObject({ level: 'high', tone: 'forte', seconds: 120 });
    expect(bars[2]).toMatchObject({ level: 'mid', tone: 'rest', seconds: 60 });
    expect(bars[17]).toMatchObject({ level: 'low', tone: 'warmup' });
  });
});

describe('etapas agrupadas', () => {
  it('Aquecimento, par Pico + Recuperação × 8, Desaceleração', () => {
    const g = groupCardioSteps(bikeHiit.blocks);
    expect(g.map(x => x.kind)).toEqual(['single', 'repeat', 'single']);
    expect(g[1]).toMatchObject({ kind: 'repeat', times: 8 });
    expect((g[1] as any).blocks.map((b: CardioBlock) => b.name)).toEqual(['Pico forte', 'Recuperação']);
    expect(stepsLegend(bikeHiit)).toBe('Aquecimento → 8 ciclos → Desaceleração');
  });
});

describe('semana e sugestão', () => {
  const options = [bikeHiit, treadmill, stairs];

  it('quadradinhos Seg→Dom: terça feita, hoje = quarta; "1 de 3"', () => {
    const w = cardioWeek([done({ completed_at: at(17) }), done({ completed_at: at(10) })], 3, NOW);
    expect(w.done).toEqual([false, true, false, false, false, false, false]);
    expect(w.today).toBe(2);
    expect(w.count).toBe(1);
  });

  it('feita na semana: rodapé "Feito terça · 32 min · esforço Moderado" e badge "✓ Ter"', () => {
    const s = done({ completed_at: at(17), duration_seconds: 1920, rpe: 3 });
    expect(doneFooter(s)).toBe('Feito terça · 32 min · esforço Moderado');
    expect(doneBadge(s)).toBe('✓ Ter');
    expect(doneFooter(null)).toBe('Ainda não fez esta semana');
  });

  it('Sugerido = não feita na semana e feita há mais tempo', () => {
    const sessions = [
      done({ protocol_index: 0, completed_at: at(17) }), // bike feita nesta semana
      done({ protocol_index: 1, completed_at: at(12) }), // passadeira na semana passada
      done({ protocol_index: 2, completed_at: at(5) }), // escada há mais tempo
    ];
    const st = optionStatuses(options, sessions, 'plan-1', NOW);
    expect(st[0].weekSession?.protocol_index).toBe(0);
    expect(st[1].weekSession).toBeNull();
    expect(suggestedOption(st)).toEqual({ index: 2, badge: true });
  });

  it('nunca feita ganha das já feitas', () => {
    const st = optionStatuses(options, [done({ protocol_index: 2, completed_at: at(5) }), done({ protocol_index: 0, completed_at: at(4) })], 'plan-1', NOW);
    expect(suggestedOption(st)).toEqual({ index: 1, badge: true });
  });

  it('todas feitas na semana: sem badge "Sugerido"', () => {
    const st = optionStatuses(options, [0, 1, 2].map(i => done({ protocol_index: i, completed_at: at(16 + i) })), 'plan-1', NOW);
    expect(suggestedOption(st).badge).toBe(false);
  });

  it('sessões antigas (sem posição gravada) casam pelo nome; outra posição de outro plano não conta', () => {
    expect(matchOption({ plan_id: 'plan-1', protocol_index: null, protocol_name: 'Escada' }, options, 'plan-1')).toBe(2);
    expect(matchOption({ plan_id: 'plan-velho', protocol_index: 1, protocol_name: 'Outra' }, options, 'plan-1')).toBe(-1);
  });
});

describe('gravar qual sessão foi feita', () => {
  it('Concluir cardio grava protocol_index; fora da faixa vira vazio', () => {
    const base = { planId: 'plan-1', name: 'x', startedAt: new Date(), durationSeconds: 60, pauseMs: 0, completedBlocks: 1, totalBlocks: 1, modality: 'bike' as const, kcal: 10 };
    expect(cardioFinishRow({ ...base, protocolIndex: 2 }).protocol_index).toBe(2);
    expect(cardioFinishRow({ ...base, protocolIndex: 99 }).protocol_index).toBeNull();
    expect(cardioFinishRow(base).protocol_index).toBeNull();
  });

  it('o retrato da retomada leva a posição da sessão até o banco', () => {
    const snap = buildCardioSnapshot({
      sessionId: 's1', studentId: 'a1', planId: 'plan-1', protocol: bikeHiit, phase: 'block', blockIndex: 1,
      remainingMs: 1000, phaseTotalSeconds: 120, startedAt: 0, totalPauseMs: 0, doneBlocks: [0], pausedAt: 10, reason: 'away',
      protocolIndex: 1,
    }, 20)!;
    expect(snap.protocolIndex).toBe(1);
    expect(cardioProgressRow(snap, 'paused').protocol_index).toBe(1);
  });
});
