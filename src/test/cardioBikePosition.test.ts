import { describe, expect, it } from 'vitest';
import { applyBikePositions, intervalSpecs, intervalSummary, normalizeCardioIntervals, repeatIntervalPair } from '@/lib/cardioIntervals';
import { bikePositionCue, nextPhaseText } from '@/lib/cardioPlayerView';
import { buildEquipment } from '@/lib/officeWizard/cardioWizard';
import type { CardioBlock, CardioProtocol, CardioWeeklyPlan } from '@/lib/cardioParser';

const block = (b: Partial<CardioBlock>): CardioBlock => ({ name: 'x', type: 'principal', durationSec: 60, intensityLabel: 'moderada', ...b });
const bikeHiit = (): CardioProtocol => ({
  title: 'HIIT bike', modality: 'bike', objective: '', level: 'intermediario', intensity: 'intensa',
  structure: 'hiit', totalDurationMin: 20, frequencyPerWeek: 2,
  blocks: [
    block({ name: 'Aquecimento', type: 'aquecimento', durationSec: 300, intensityLabel: 'leve', resistanceLevel: 4 }),
    block({ name: 'Pico', type: 'pico', durationSec: 30, intensityLabel: 'forte', resistanceLevel: 12 }),
    block({ name: 'Recuperação', type: 'recuperacao', durationSec: 60, intensityLabel: 'leve', resistanceLevel: 4 }),
    block({ name: 'Desaceleração', type: 'desaceleracao', durationSec: 180, intensityLabel: 'leve' }),
  ],
});
const positions = (p: CardioProtocol) => p.blocks.map(b => b.bikePosition);

describe('Posição na bike', () => {
  it('Posição = em pé: picos em pé, recuperação/aquecimento/desaceleração sentado', () => {
    const { payload, changed } = normalizeCardioIntervals(bikeHiit(), { style: 'hiit', equipment: buildEquipment({ bPosition: 'em_pe' }) });
    expect(changed).toEqual([0]);
    expect(positions(payload)).toEqual(['sentado', 'em_pe', 'sentado', 'sentado']);
  });

  it('Posição = alternado: mesma regra (picos em pé, resto sentado)', () => {
    const { payload } = normalizeCardioIntervals(bikeHiit(), { style: 'auto', equipment: buildEquipment({ bPosition: 'alternado' }) });
    expect(positions(payload)).toEqual(['sentado', 'em_pe', 'sentado', 'sentado']);
  });

  it('com ciclos exatos: os picos em pé e as recuperações sentado, também no resumo', () => {
    const equipment = buildEquipment({ bPosition: 'em_pe', bHardSec: '30', bEasySec: '60', bHardLevel: '12', bEasyLevel: '4', rounds: '3' });
    const [spec] = intervalSpecs(equipment);
    expect(intervalSummary(spec)).toBe('3 × (0:30 em pé nível 12 + 1:00 sentado nível 4) = 4 min 30s');
    const { payload } = normalizeCardioIntervals(bikeHiit(), { style: 'hiit', equipment });
    expect(positions(payload)).toEqual(['sentado', 'em_pe', 'sentado', 'em_pe', 'sentado', 'em_pe', 'sentado', 'sentado']);
    // idempotente
    expect(normalizeCardioIntervals(payload, { style: 'hiit', equipment }).changed).toEqual([]);
  });

  it('não mexe na esteira nem em sessões contínuas de bike', () => {
    const tread: CardioProtocol = { ...bikeHiit(), modality: 'passadeira' };
    const cont: CardioProtocol = { ...bikeHiit(), structure: 'continuo', blocks: [block({ name: 'Zona 2', durationSec: 1800 })] };
    const weekly: CardioWeeklyPlan = { weekly: true, frequencyPerWeek: 3, protocols: [tread, cont, bikeHiit()] };
    const { payload, changed } = normalizeCardioIntervals(weekly, { style: 'auto', equipment: buildEquipment({ bPosition: 'em_pe' }) });
    expect(changed).toEqual([2]);
    expect(payload.protocols[0]).toEqual(tread);
    expect(payload.protocols[1]).toEqual(cont);
  });

  it('Auto (IA): nada muda', () => {
    const p = bikeHiit();
    expect(applyBikePositions(p, null)).toBe(p);
    expect(normalizeCardioIntervals(p, { style: 'hiit', equipment: buildEquipment({ bPosition: 'auto' }) }).changed).toEqual([]);
  });

  it('"Repetir par × N" copia a posição de cada etapa do par', () => {
    const p = bikeHiit();
    p.blocks[1].bikePosition = 'em_pe';
    p.blocks[2].bikePosition = 'sentado';
    const out = repeatIntervalPair(p, 3, 1)!;
    expect(positions(out)).toEqual([undefined, 'em_pe', 'sentado', 'em_pe', 'sentado', 'em_pe', 'sentado', undefined]);
  });

  it('player: "EM PÉ" em destaque no pico e posição no "A seguir"; outras modalidades sem posição', () => {
    const pico = block({ name: 'Pico forte', type: 'pico', intensityLabel: 'forte', bikePosition: 'em_pe', resistanceLevel: 12, durationSec: 30 });
    expect(bikePositionCue(pico, 'bike')).toEqual({ text: 'EM PÉ', emphasis: true });
    expect(bikePositionCue({ ...pico, bikePosition: 'sentado' }, 'bike')).toEqual({ text: 'SENTADO', emphasis: false });
    expect(bikePositionCue(block({}), 'bike')).toBeNull();
    expect(bikePositionCue(pico, 'passadeira')).toBeNull();
    expect(nextPhaseText(pico, 'bike')).toBe('Pico forte · Em pé · nível 12 · 0:30');
  });
});
