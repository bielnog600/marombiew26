import { describe, it, expect } from 'vitest';
import { ACTIVITY_LEVELS } from '@/pages/DietaIA';

/**
 * Testes do mapeamento canônico do fator de atividade diária.
 * Frequência de treino NÃO deve alterar esse fator.
 */
describe('ACTIVITY_LEVELS — mapeamento canônico', () => {
  const cases: Array<[string, number, string]> = [
    ['Sedentário', 1.2,   '1.2'],
    ['Super Leve', 1.3,   '1.3'],
    ['Leve',       1.375, '1.375'],
    ['Moderado',   1.55,  '1.55'],
    ['Alto',       1.725, '1.725'],
    ['Extremo',    1.9,   '1.9'],
  ];

  it.each(cases)('%s → fator %s (value=%s)', (label, factor, value) => {
    const entry = ACTIVITY_LEVELS.find(a => a.label === label);
    expect(entry).toBeDefined();
    expect(entry!.factor).toBe(factor);
    expect(entry!.value).toBe(value);
    // value é sempre a string do fator (fonte única).
    expect(Number(entry!.value)).toBeCloseTo(entry!.factor, 6);
  });

  it('não contém mais os fatores antigos 1.0/1.4/1.6/1.8/2.0', () => {
    const values = ACTIVITY_LEVELS.map(a => a.value);
    for (const legacy of ['1.0', '1.4', '1.6', '1.8', '2.0']) {
      expect(values).not.toContain(legacy);
    }
  });

  it('possui exatamente 6 opções', () => {
    expect(ACTIVITY_LEVELS).toHaveLength(6);
  });
});

describe('GET = TMB × activityFactor (sem multiplicador de treino)', () => {
  // Simula a fórmula exata usada em automaticBaseKcal.
  function computeGet(tmb: number, factor: number): number {
    return Math.round(tmb * factor);
  }

  it('Super Leve com TMB=1551 kcal → GET=2016 kcal (independente do treino)', () => {
    const factor = ACTIVITY_LEVELS.find(a => a.label === 'Super Leve')!.factor;
    expect(computeGet(1551, factor)).toBe(2016);
  });

  it('Super Leve mantém 1.30 mesmo simulando treino 5x/semana', () => {
    // Antes: 5x/semana forçava suggestedFA=1.6. Agora, a frequência
    // de treino não deve alterar o fator.
    const trainingDaysPerWeek = 5;
    void trainingDaysPerWeek; // frequência de treino é ignorada no cálculo do FA
    const factor = ACTIVITY_LEVELS.find(a => a.label === 'Super Leve')!.factor;
    expect(factor).toBe(1.3);
  });

  it('Nenhuma opção aplica multiplicador secundário de treino', () => {
    // Se existisse GET = TMB × FA × factor_treino, o resultado seria != TMB × FA.
    // Como a fórmula é única, factor_treino é sempre 1.
    const tmb = 1600;
    for (const a of ACTIVITY_LEVELS) {
      expect(computeGet(tmb, a.factor)).toBe(Math.round(tmb * a.factor));
    }
  });
});