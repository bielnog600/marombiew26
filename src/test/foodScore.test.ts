import { describe, it, expect } from 'vitest';
import { computeFoodScore, scoreLabel, parseAdditives, classifyNutrient } from '@/lib/foodScore';

describe('nota do scanner de alimentos', () => {
  it('faixas de rótulo', () => {
    expect(scoreLabel(24)).toBe('Mau');
    expect(scoreLabel(25)).toBe('Medíocre');
    expect(scoreLabel(50)).toBe('Bom');
    expect(scoreLabel(75)).toBe('Excelente');
  });
  it('aditivo de risco alto limita a nota a 49', () => {
    const r = computeFoodScore({ nutriscore_score: -15, additives_tags: ['en:e250'], labels_tags: ['en:organic'] });
    expect(r.score).toBe(49);
  });
  it('produto perfeito sem aditivos e orgânico = 100', () => {
    expect(computeFoodScore({ nutriscore_score: -15, additives_tags: [], labels_tags: ['en:organic'] }).score).toBe(100);
  });
  it('pesos 60/30/10: nutrição perfeita, sem aditivos, sem selo = 90', () => {
    expect(computeFoodScore({ nutriscore_score: -15 }).score).toBe(90);
  });
  it('identifica E150d como moderado', () => {
    expect(parseAdditives(['en:e150d'])[0].level).toBe('moderado');
  });
  it('açúcar 20 g/100 g é alto', () => {
    expect(classifyNutrient('sugar', 20)).toBe('alto');
  });
});
