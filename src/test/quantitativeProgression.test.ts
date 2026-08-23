import { describe, it, expect } from 'vitest';
import {
  buildQuantitativeProgressionRecommendation,
  inferIncrementFromHistory,
  formatQuantitativeRecommendation,
  type QuantitativeInput,
} from '@/lib/quantitativeProgression';
import type { ExerciseLog, ExercisePerformance, NextAction, PerformanceStatus } from '@/lib/weeklyProgression';
import { resolveWeekContexts } from '@/lib/weekContext';
import { buildExerciseGuidance } from '@/lib/nextSessionGuidance';

const set = (weight: number, reps: number, rir: number | null = null) => ({
  weightKg: weight,
  reps,
  rir,
  performedAt: '2026-08-20T10:00:00Z',
  setNumber: 1,
  estimated1RM: weight > 0 ? +(weight * (1 + reps / 30)).toFixed(1) : null,
});

const perf = (
  over: Partial<ExercisePerformance> & { nextAction: NextAction },
): ExercisePerformance => ({
  exerciseName: 'SUPINO RETO',
  bestSet: set(80, 12, 2),
  totalWorkingSets: 3,
  auxiliarySets: 0,
  preparationSets: 0,
  totalReps: 31,
  totalVolume: 2480,
  loaded: true,
  comparisonBasis: 'like_for_like',
  status: 'improved' as PerformanceStatus,
  repRange: { min: 8, max: 12 },
  reason: 'teste',
  ...over,
});

const log = (
  weight: number,
  reps: number,
  set_type: string = 'work',
): ExerciseLog => ({
  exercise_name: 'SUPINO RETO',
  weight_kg: weight,
  reps,
  performed_at: '2026-08-20T10:00:00Z',
  set_type,
});

const build = (input: QuantitativeInput) => buildQuantitativeProgressionRecommendation(input);

describe('quantitativeProgression', () => {
  it('1. 80 kg + incremento configurado 2.5 → 82.5 kg', () => {
    const r = build({
      performance: perf({ nextAction: 'increase_load' }),
      configuredIncrementKg: 2.5,
    });
    expect(r.action).toBe('increase_load');
    expect(r.recommendedLoadKg).toBe(82.5);
    expect(r.confidence).toBe('high');
    expect(r.incrementSource).toBe('configured');
  });

  it('2. incremento que gera +20% não é recomendado automaticamente', () => {
    const r = build({
      performance: perf({ nextAction: 'increase_load', bestSet: set(25, 12, 2) }),
      configuredIncrementKg: 5,
    });
    expect(r.action).toBe('manual_increment_required');
    expect(r.recommendedLoadKg).toBe(25);
    expect(r.relativeChangePct).toBeGreaterThan(0.1);
  });

  it('3. 80×9 na faixa 8–12 → alvo 10 reps mantendo 80 kg', () => {
    const r = build({
      performance: perf({ nextAction: 'increase_reps', bestSet: set(80, 9) }),
    });
    expect(r.recommendedLoadKg).toBe(80);
    expect(r.targetReps).toBe(10);
  });

  it('4. 80×11 → alvo 12 reps (teto respeitado)', () => {
    const r = build({ performance: perf({ nextAction: 'increase_reps', bestSet: set(80, 11) }) });
    expect(r.targetReps).toBe(12);
    const top = build({ performance: perf({ nextAction: 'increase_reps', bestSet: set(80, 12) }) });
    expect(top.targetReps).toBe(12);
  });

  it('5. topo da faixa + aumento válido → nova carga e alvo no piso da faixa', () => {
    const r = build({
      performance: perf({ nextAction: 'increase_load', bestSet: set(70, 12, 3) }),
      configuredIncrementKg: 2.5,
    });
    expect(r.recommendedLoadKg).toBe(72.5);
    expect(r.targetReps).toBe(8);
    expect(r.repRange).toEqual({ min: 8, max: 12 });
  });

  it('6. RIR baixo (maintain) nunca vira aumento', () => {
    const r = build({
      performance: perf({ nextAction: 'maintain', bestSet: set(80, 10, 0) }),
      configuredIncrementKg: 2.5,
    });
    expect(r.action).toBe('maintain');
    expect(r.recommendedLoadKg).toBe(80);
    expect(r.targetReps).toBe(11);
  });

  it('7. RIR ausente respeita a nextAction existente', () => {
    const r = build({
      performance: perf({ nextAction: 'maintain', bestSet: set(80, 12, null) }),
      configuredIncrementKg: 2.5,
    });
    expect(r.action).toBe('maintain');
    expect(r.recommendedLoadKg).toBe(80);
  });

  it('8. bodyweight 10 → 11 reps sem carga 0', () => {
    const r = build({
      performance: perf({
        nextAction: 'increase_reps',
        bestSet: set(0, 10),
        loaded: false,
        repRange: { min: 8, max: 15 },
      }),
    });
    expect(r.currentLoadKg).toBeNull();
    expect(r.recommendedLoadKg).toBeNull();
    expect(r.targetReps).toBe(11);
  });

  it('9. esquema complexo não gera precisão falsa', () => {
    const r = build({
      performance: perf({ nextAction: 'increase_load' }),
      configuredIncrementKg: 2.5,
      setSchemeMode: 'per_set',
      setSchemeTargets: ['12', '10', '8'],
    });
    expect(r.qualitative).toBe(true);
    expect(r.recommendedLoadKg).toBeNull();
    expect(r.confidence).toBe('low');
  });

  it('10. máquina sem incremento conhecido → orientação qualitativa', () => {
    const r = build({ performance: perf({ nextAction: 'increase_load' }) });
    expect(r.qualitative).toBe(true);
    expect(r.recommendedLoadKg).toBeNull();
    expect(formatQuantitativeRecommendation(r)).toContain('menor incremento disponível');
  });

  it('11. histórico consistente permite inferência com confiança média', () => {
    const hist = [log(70, 10), log(72.5, 10), log(75, 9), log(77.5, 8)];
    const inc = inferIncrementFromHistory(hist);
    expect(inc.incrementKg).toBe(2.5);
    expect(inc.confidence).toBe('medium');

    const r = build({ performance: perf({ nextAction: 'increase_load' }), historyLogs: hist });
    expect(r.recommendedLoadKg).toBe(82.5);
    expect(r.confidence).toBe('medium');
  });

  it('12. histórico inconsistente não infere incremento', () => {
    const inc = inferIncrementFromHistory([log(70, 10), log(73.3, 10), log(80, 8)]);
    expect(inc.incrementKg).toBeNull();
    expect(inc.source).toBe('unknown');
  });

  it('13. reduce_load respeita o incremento disponível', () => {
    const r = build({
      performance: perf({ nextAction: 'reduce_load', status: 'regressed', e1rmDeltaPct: -0.08, bestSet: set(80, 6) }),
      configuredIncrementKg: 2.5,
    });
    expect(r.recommendedLoadKg).toBe(77.5);
    expect(r.relativeChangePct).toBeLessThan(0);
  });

  it('14. maintain mantém a carga', () => {
    const r = build({ performance: perf({ nextAction: 'maintain', bestSet: set(80, 12, 2) }) });
    expect(r.recommendedLoadKg).toBe(80);
    expect(r.targetReps).toBe(12);
  });

  it('15. missing/review não gera kg', () => {
    const r = build({
      performance: perf({ nextAction: 'review', status: 'missing', bestSet: undefined }),
      configuredIncrementKg: 2.5,
    });
    expect(r.action).toBe('review');
    expect(r.recommendedLoadKg).toBeNull();
    expect(r.targetReps).toBeNull();
  });

  it('16. deload nunca gera aumento', () => {
    const r = build({
      performance: perf({ nextAction: 'increase_load' }),
      configuredIncrementKg: 2.5,
      activePhase: 'deload',
    });
    expect(r.action).toBe('maintain');
    expect(r.recommendedLoadKg).toBe(80);
  });

  it('17. warmup/drop não definem o incremento inferido', () => {
    const inc = inferIncrementFromHistory([
      log(20, 12, 'warmup'),
      log(40, 10, 'warmup'),
      log(61, 8, 'drop'),
      log(70, 10),
      log(72.5, 10),
      log(75, 9),
    ]);
    expect(inc.incrementKg).toBe(2.5);
  });

  it('18. a recomendação não muta os objetos de entrada (não escreve no plano)', () => {
    const p = perf({ nextAction: 'increase_load' });
    const snapshot = JSON.stringify(p);
    build({ performance: p, configuredIncrementKg: 2.5 });
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('19. arredondamento não gera cargas impossíveis', () => {
    const r = build({
      performance: perf({ nextAction: 'increase_load', bestSet: set(42.5, 12, 2) }),
      configuredIncrementKg: 1.25,
    });
    expect(r.recommendedLoadKg).toBe(43.75);
    expect(String(r.recommendedLoadKg).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('20. cycle_days (45 = ciclo inteiro) produz contextos semanais S1–S4 corretos', () => {
    const start = '2026-08-03'; // segunda-feira
    const s2 = resolveWeekContexts({
      planId: 'p1',
      phase: 'semana_2',
      phaseStartDate: start,
      cycleDays: 45,
      now: new Date('2026-08-12T10:00:00'),
    });
    expect(s2.current.startedAt.toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(s2.current.endedAt.toISOString().slice(0, 10)).toBe('2026-08-17');
    expect(s2.previous?.startedAt.toISOString().slice(0, 10)).toBe('2026-08-03');

    const s4 = resolveWeekContexts({
      planId: 'p1',
      phase: 'deload',
      phaseStartDate: start,
      cycleDays: 45,
      now: new Date('2026-08-26T10:00:00'),
    });
    expect(s4.current.startedAt.toISOString().slice(0, 10)).toBe('2026-08-24');
    expect(s4.current.endedAt.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(s4.previous).toBeNull();
  });

  it('21. guidance exibe números quando a confiança permite', () => {
    const p = perf({ nextAction: 'increase_reps', bestSet: set(80, 9) });
    const q = build({ performance: p });
    const g = buildExerciseGuidance([p], { quantitative: [q] });
    expect(g[0].text).toBe('Mantenha 80 kg e tente 10 reps.');
  });
});
