import { describe, it, expect } from 'vitest';
import {
  inferIncrementFromTransitions,
  resolveLoadIncrement,
  validateIncrementInput,
  normalizeExerciseKey,
} from '@/lib/loadIncrement';
import { buildQuantitativeProgressionRecommendation } from '@/lib/quantitativeProgression';
import type { ExercisePerformance } from '@/lib/weeklyProgression';
import type { ComparableLog } from '@/lib/loadIncrement';

let clock = 0;
const log = (weight: number, set_type: string = 'work', reps = 10): ComparableLog => {
  clock += 1;
  return {
    exercise_name: 'SUPINO RETO',
    weight_kg: weight,
    reps,
    set_number: 1,
    session_id: `s${clock}`,
    performed_at: new Date(Date.UTC(2026, 5, 1, 10, clock)).toISOString(),
    set_type,
  };
};

const series = (weights: number[], type = 'work') => weights.map((w) => log(w, type));

const perf = (over: Partial<ExercisePerformance> = {}): ExercisePerformance => ({
  exerciseName: 'SUPINO RETO',
  bestSet: {
    weightKg: 80,
    reps: 12,
    rir: 2,
    performedAt: '2026-06-01T10:00:00Z',
    setNumber: 1,
    estimated1RM: 112,
  },
  totalWorkingSets: 3,
  auxiliarySets: 0,
  preparationSets: 0,
  totalReps: 30,
  totalVolume: 2400,
  loaded: true,
  comparisonBasis: 'like_for_like',
  status: 'improved',
  repRange: { min: 8, max: 12 },
  nextAction: 'increase_load',
  reason: 'teste',
  ...over,
});

describe('loadIncrement — inferência por transições reais', () => {
  it('1. 70→72,5→75→77,5 infere 2,5 kg', () => {
    const r = inferIncrementFromTransitions(series([70, 72.5, 75, 77.5]));
    expect(r.incrementKg).toBe(2.5);
    expect(r.source).toBe('inferred_history');
    expect(r.confidence).toBe('medium');
  });

  it('2. 70→75→80→85 infere 5 kg (não 0,5 por divisibilidade)', () => {
    const r = inferIncrementFromTransitions(series([70, 75, 80, 85]));
    expect(r.incrementKg).toBe(5);
  });

  it('3. deltas 2,5 / 2,5 / 5 reconhecem passo-base 2,5', () => {
    const r = inferIncrementFromTransitions(series([70, 72.5, 75, 80]));
    expect(r.incrementKg).toBe(2.5);
    expect(r.evidence.transitionsKg).toEqual([2.5, 2.5, 5]);
  });

  it('4. deltas inconsistentes (2 / 3 / 7 / 1,5) → unknown', () => {
    const r = inferIncrementFromTransitions(series([70, 72, 75, 82, 83.5]));
    expect(r.incrementKg).toBeNull();
    expect(r.source).toBe('unknown');
  });

  it('5. deltas zero (manutenção) são ignorados', () => {
    const r = inferIncrementFromTransitions(series([80, 80, 80, 82.5, 82.5, 85, 87.5]));
    expect(r.incrementKg).toBe(2.5);
    expect(r.evidence.transitionsKg).toEqual([2.5, 2.5, 2.5]);
  });

  it('6. aquecimento não participa da inferência', () => {
    const logs = [
      ...series([20, 40], 'warmup'),
      ...series([70, 72.5, 75, 77.5]),
    ];
    const r = inferIncrementFromTransitions(logs);
    expect(r.incrementKg).toBe(2.5);
  });

  it('7. drop set não participa da inferência', () => {
    const logs = [
      ...series([70, 72.5, 75, 77.5]),
      ...series([41, 39], 'drop'),
      ...series([50], 'rest_pause'),
    ];
    const r = inferIncrementFromTransitions(logs);
    expect(r.incrementKg).toBe(2.5);
  });

  it('20. inferência exige evidência mínima (3 transições reais)', () => {
    const r = inferIncrementFromTransitions(series([70, 75, 80]));
    expect(r.incrementKg).toBeNull();
    expect(r.evidence.transitionsKg).toEqual([5, 5]);
    expect(r.evidence.reason).toContain('Evidência insuficiente');
  });
});

describe('loadIncrement — hierarquia', () => {
  it('8. configurado 2,5 vence histórico de 5 kg', () => {
    const r = resolveLoadIncrement({
      configuredIncrementKg: 2.5,
      historicalWorkingSets: series([70, 75, 80, 85]),
    });
    expect(r.incrementKg).toBe(2.5);
    expect(r.source).toBe('configured');
    expect(r.confidence).toBe('high');
  });

  it('9. sem configuração cai para o histórico', () => {
    const r = resolveLoadIncrement({
      configuredIncrementKg: null,
      historicalWorkingSets: series([70, 72.5, 75, 77.5]),
    });
    expect(r.source).toBe('inferred_history');
    expect(r.incrementKg).toBe(2.5);
  });

  it('10. sem configuração e sem histórico confiável → unknown/low', () => {
    const r = resolveLoadIncrement({ historicalWorkingSets: series([70, 73.3]) });
    expect(r.incrementKg).toBeNull();
    expect(r.source).toBe('unknown');
    expect(r.confidence).toBe('low');
  });

  it('11. configuração decimal 1,25 é aceita', () => {
    expect(validateIncrementInput('1,25')).toEqual({ valid: true, value: 1.25 });
    const r = resolveLoadIncrement({ configuredIncrementKg: 1.25 });
    expect(r.incrementKg).toBe(1.25);
  });

  it('13. valores inválidos são rejeitados', () => {
    expect(validateIncrementInput('0').valid).toBe(false);
    expect(validateIncrementInput('-2').valid).toBe(false);
    expect(validateIncrementInput('abc').valid).toBe(false);
    expect(validateIncrementInput('999').valid).toBe(false);
    expect(validateIncrementInput('0,1').valid).toBe(false);
    expect(validateIncrementInput('')).toEqual({ valid: true, value: null });
  });

  it('14/15. a chave é por aluno + exercício normalizado', () => {
    expect(normalizeExerciseKey('  supino   reto (barra) ')).toBe('SUPINO RETO BARRA');
    expect(normalizeExerciseKey('Supino Réto')).toBe('SUPINO RETO');
    // dois alunos = duas linhas independentes na configuração
    const alunoA = { 'SUPINO RETO': 2.5 };
    const alunoB = { 'SUPINO RETO': 5 };
    expect(resolveLoadIncrement({ configuredIncrementKg: alunoA['SUPINO RETO'] }).incrementKg).toBe(2.5);
    expect(resolveLoadIncrement({ configuredIncrementKg: alunoB['SUPINO RETO'] }).incrementKg).toBe(5);
  });
});

describe('loadIncrement — integração com quantitativeProgression', () => {
  it('16. o motor quantitativo usa o incremento configurado', () => {
    const resolved = resolveLoadIncrement({ configuredIncrementKg: 2.5 });
    const r = buildQuantitativeProgressionRecommendation({
      performance: perf(),
      configuredIncrementKg: resolved.incrementKg,
    });
    expect(r.recommendedLoadKg).toBe(82.5);
    expect(r.incrementSource).toBe('configured');
    expect(r.incrementConfidence).toBe('high');
  });

  it('12. incremento configurado grande demais não vira aumento automático', () => {
    const r = buildQuantitativeProgressionRecommendation({
      performance: perf({
        bestSet: { weightKg: 10, reps: 12, rir: 2, performedAt: '2026-06-01T10:00:00Z', setNumber: 1, estimated1RM: 14 },
      }),
      configuredIncrementKg: 5,
    });
    expect(r.action).toBe('manual_increment_required');
    expect(r.basis).toBe('available_increment_too_large');
    expect(r.recommendedLoadKg).toBe(10);
    // fonte continua confiável, mas o salto não é seguro
    expect(r.incrementConfidence).toBe('high');
    expect(r.confidence).toBe('low');
  });

  it('17. nada no plano/performance é mutado', () => {
    const p = perf();
    const snapshot = JSON.stringify(p);
    buildQuantitativeProgressionRecommendation({ performance: p, configuredIncrementKg: 2.5 });
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('18. aritmética em gramas evita 82,4999999', () => {
    const r = inferIncrementFromTransitions(series([42.5, 43.75, 45, 46.25]));
    expect(r.incrementKg).toBe(1.25);
    const rec = buildQuantitativeProgressionRecommendation({
      performance: perf({
        bestSet: { weightKg: 82.5, reps: 12, rir: 2, performedAt: '2026-06-01T10:00:00Z', setNumber: 1, estimated1RM: 115 },
      }),
      configuredIncrementKg: 2.5,
    });
    expect(rec.recommendedLoadKg).toBe(85);
    expect(String(rec.recommendedLoadKg)).not.toContain('99999');
  });

  it('19. a convenção de peso dos logs não é reinterpretada (halteres 20→22 = 2 kg)', () => {
    const r = inferIncrementFromTransitions(series([20, 22, 24, 26]));
    expect(r.incrementKg).toBe(2);
    expect(r.evidence.loadSeriesKg).toEqual([20, 22, 24, 26]);
  });
});
