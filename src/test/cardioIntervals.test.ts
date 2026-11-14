import { describe, expect, it } from 'vitest';
import {
  intervalSpecs, intervalSummary, normalizeCardioIntervals, repeatIntervalPair,
} from '@/lib/cardioIntervals';
import { buildEquipment, CARDIO_ROUNDS } from '@/lib/officeWizard/cardioWizard';
import type { CardioBlock, CardioProtocol, CardioWeeklyPlan } from '@/lib/cardioParser';

// HIIT pedido pelo Fabiew: esteira 2:00 a 6 km/h + 1:00 a 4 km/h × 8
const EQ = { tSpeedHard: '6', tSpeedEasy: '4', tWorkSec: '120', tRestSec: '60', rounds: '8' };
const equipment = buildEquipment(EQ);

const block = (b: Partial<CardioBlock>): CardioBlock => ({ name: 'x', type: 'principal', durationSec: 60, intensityLabel: 'moderada', ...b });
const aiHiit = (): CardioProtocol => ({
  title: 'HIIT esteira', modality: 'passadeira', objective: '', level: 'intermediario', intensity: 'alta',
  structure: 'hiit', totalDurationMin: 30, frequencyPerWeek: 3,
  blocks: [
    block({ name: 'Aquecimento', type: 'aquecimento', durationSec: 300, intensityLabel: 'leve', speedKmh: 5 }),
    // A IA reinterpretou: 1:30 a 7,5 km/h × 5
    ...Array.from({ length: 5 }, () => [
      block({ name: 'Tiro', type: 'pico', durationSec: 90, intensityLabel: 'forte', speedKmh: 7.5 }),
      block({ name: 'Trote', type: 'recuperacao', durationSec: 90, intensityLabel: 'leve', speedKmh: 5 }),
    ]).flat(),
    block({ name: 'Desaceleração', type: 'desaceleracao', durationSec: 180, intensityLabel: 'leve', speedKmh: 4.5 }),
  ],
});
const continuo = (modality: CardioProtocol['modality'] = 'passadeira'): CardioProtocol => ({
  ...aiHiit(), title: 'Contínuo', modality, structure: 'continuo',
  blocks: [block({ name: 'Zona 2', durationSec: 1800, speedKmh: 6 })],
});

describe('HIIT com picos definidos pelo coach', () => {
  it('mostra o resumo do passo: 8 × (2:00 a 6 km/h + 1:00 a 4 km/h) = 24 min', () => {
    const [spec] = intervalSpecs(equipment);
    expect(intervalSummary(spec)).toBe('8 × (2:00 a 6 km/h + 1:00 a 4 km/h) = 24 min');
  });

  it('reescreve os ciclos exatos entre o aquecimento e a desaceleração', () => {
    const { payload, changed } = normalizeCardioIntervals(aiHiit(), { style: 'hiit', equipment, modalities: ['passadeira'] });
    expect(changed).toEqual([0]);
    const b = payload.blocks;
    expect(b).toHaveLength(1 + 16 + 1);
    expect(b[0].type).toBe('aquecimento');
    expect(b[17].type).toBe('desaceleracao');
    for (let i = 0; i < 8; i++) {
      expect(b[1 + i * 2]).toMatchObject({ type: 'pico', durationSec: 120, speedKmh: 6 });
      expect(b[2 + i * 2]).toMatchObject({ type: 'recuperacao', durationSec: 60, speedKmh: 4 });
    }
  });

  it('é idempotente (rodar de novo não muda nada)', () => {
    const once = normalizeCardioIntervals(aiHiit(), { style: 'hiit', equipment }).payload;
    const twice = normalizeCardioIntervals(once, { style: 'hiit', equipment });
    expect(twice.changed).toEqual([]);
    expect(twice.payload).toEqual(once);
  });

  it('no plano semanal só mexe nas sessões intervaladas de esteira', () => {
    const weekly: CardioWeeklyPlan = { weekly: true, frequencyPerWeek: 3, protocols: [continuo(), aiHiit(), { ...aiHiit(), modality: 'bike' }] };
    const { payload, changed } = normalizeCardioIntervals(weekly, { style: 'auto', equipment });
    expect(changed).toEqual([1]);
    expect(payload.protocols[0]).toEqual(weekly.protocols[0]);
    expect(payload.protocols[2]).toEqual(weekly.protocols[2]);
  });

  it('estilo HIIT sem sessão intervalada: converte a primeira de esteira', () => {
    const weekly: CardioWeeklyPlan = { weekly: true, frequencyPerWeek: 2, protocols: [continuo('bike'), continuo()] };
    const { payload, changed } = normalizeCardioIntervals(weekly, { style: 'hiit', equipment });
    expect(changed).toEqual([1]);
    expect(payload.protocols[1].structure).toBe('hiit');
    expect(payload.protocols[1].blocks.filter(b => b.type === 'pico')).toHaveLength(8);
  });

  it('o Nº de ciclos permite ~20 min de intervalado', () => {
    expect(CARDIO_ROUNDS).toContain('20');
    expect(CARDIO_ROUNDS).toContain('10');
    const [spec] = intervalSpecs(buildEquipment({ tWorkSec: '30', tRestSec: '30', rounds: '20' }));
    expect(intervalSummary(spec)).toContain('= 20 min');
  });

  it('editor: "Repetir par forte/recuperação × N" mantém aquecimento e desaceleração', () => {
    const out = repeatIntervalPair(aiHiit(), 3)!;
    expect(out.blocks.map(b => b.type)).toEqual(['aquecimento', 'pico', 'recuperacao', 'pico', 'recuperacao', 'pico', 'recuperacao', 'desaceleracao']);
    expect(out.blocks[1]).toMatchObject({ durationSec: 90, speedKmh: 7.5, notes: 'Ciclo 1 de 3' });
  });
});
