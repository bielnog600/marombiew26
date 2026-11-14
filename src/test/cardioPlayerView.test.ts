import { describe, expect, it } from 'vitest';
import {
  blockTag, blockTone, estimateCardioKcal, nextPhaseText, cardioSegments, EFFORT_LABELS, FINISH_MODALITIES,
} from '@/lib/cardioPlayerView';
import type { CardioBlock, CardioProtocol } from '@/lib/cardioParser';

const b = (x: Partial<CardioBlock>): CardioBlock => ({ name: 'x', type: 'principal', durationSec: 60, intensityLabel: 'moderada', ...x });

describe('Player do cardio', () => {
  it('tag e cor por intensidade: Baixa verde, Moderada amarelo, Alta laranja, Máxima vermelho', () => {
    expect([blockTag(b({ intensityLabel: 'leve' })), blockTone(b({ intensityLabel: 'leve' }))]).toEqual(['Baixa', 'rest']);
    expect([blockTag(b({ intensityLabel: 'moderada' })), blockTone(b({ intensityLabel: 'moderada' }))]).toEqual(['Moderada', 'moderado']);
    expect([blockTag(b({ intensityLabel: 'forte' })), blockTone(b({ intensityLabel: 'forte' }))]).toEqual(['Alta', 'forte']);
    expect([blockTag(b({ intensityLabel: 'maxima' })), blockTone(b({ intensityLabel: 'maxima' }))]).toEqual(['Máxima', 'maximo']);
  });

  it('"A seguir" mostra a próxima fase: Recuperação · 4 km/h · 1:00', () => {
    expect(nextPhaseText(b({ name: 'Recuperação', speedKmh: 4, durationSec: 60 }), 'passadeira')).toBe('Recuperação · 4 km/h · 1:00');
  });

  it('barra segmentada tem uma parte por fase', () => {
    const blocks = [b({ durationSec: 60 }), b({ type: 'pico', intensityLabel: 'forte', durationSec: 120 })];
    const seg = cardioSegments(blocks, 90);
    expect(seg).toHaveLength(2);
    expect(seg[0].fill).toBe(1);
    expect(seg[1].fill).toBeCloseTo(0.25);
    expect(seg[1].hard).toBe(true);
  });

  it('calorias estimadas sobem com o peso e mudam com a modalidade', () => {
    const protocol = { modality: 'passadeira', blocks: [b({ speedKmh: 6, durationSec: 1800 })] } as CardioProtocol;
    const k70 = estimateCardioKcal({ modality: 'passadeira', protocol, durationSec: 1800, weightKg: 70 });
    const k90 = estimateCardioKcal({ modality: 'passadeira', protocol, durationSec: 1800, weightKg: 90 });
    const bike = estimateCardioKcal({ modality: 'bike', protocol, durationSec: 1800, weightKg: 70 });
    expect(k70).toBeGreaterThan(100);
    expect(k90).toBeGreaterThan(k70);
    expect(bike).not.toBe(k70);
  });

  it('tela final: 5 níveis do "Como foi?" e as 6 modalidades', () => {
    expect(EFFORT_LABELS).toEqual(['Muito fácil', 'Fácil', 'Moderado', 'Difícil', 'Muito difícil']);
    expect(FINISH_MODALITIES.map(m => m.label)).toEqual(['Esteira', 'Bike', 'Elíptica', 'Escada', 'Corrida ao ar livre', 'Caminhada ao ar livre']);
  });
});
