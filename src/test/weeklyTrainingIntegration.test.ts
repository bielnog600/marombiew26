import { describe, it, expect } from 'vitest';
import { buildWeeklyTrainingReport, describeWeekDecision, type RawSetLog, type RawSession } from '@/lib/weeklyTraining';
import { resolveWeeklyWindows, previousComparablePhase } from '@/lib/weeklyWindows';
import { getPreviousWeekWindow } from '@/lib/weeklyAdherence';
import { buildExerciseGuidance } from '@/lib/nextSessionGuidance';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';
import type { TrainingPhase } from '@/lib/trainingPhase';
import type { ExercisePerformance } from '@/lib/weeklyProgression';

const NOW = new Date('2026-08-20T10:00:00Z');
const W = resolveWeeklyWindows(NOW);

const dayIn = (w: { start: Date }, offset: number, hour = 12) => {
  const d = new Date(w.start);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const EXS = ['SUPINO RETO', 'AGACHAMENTO', 'REMADA', 'LEG PRESS'];

const plannedDays = (n = 4): ParsedTrainingDay[] =>
  Array.from({ length: n }, (_, i) => ({
    day: `DIA ${i + 1}`,
    exercises: EXS.map((e) => ({ exercise: e, series: '3', reps: '8-12' })),
  })) as unknown as ParsedTrainingDay[];

const sets = (
  name: string,
  weight: number,
  reps: number,
  when: string,
  phase: string | null,
  rir: number | null = null,
): RawSetLog[] =>
  [1, 2, 3].map((n) => ({
    exercise_name: name,
    weight_kg: weight,
    reps,
    performed_at: when,
    set_number: n,
    set_type: 'work',
    rir,
    phase,
  }));

const sessions = (win: { start: Date }, count: number, planId = 'plan-1'): RawSession[] =>
  Array.from({ length: count }, (_, i) => ({
    status: 'completed',
    completed_at: dayIn(win, i),
    started_at: dayIn(win, i),
    created_at: dayIn(win, i),
    plan_id: planId,
  }));

interface Opts {
  phase?: TrainingPhase;
  currentWeights?: number[];
  prevWeights?: number[];
  currentSessions?: number;
  prevPlanId?: string;
  rir?: number | null;
  exercises?: string[];
}

const build = (o: Opts = {}) => {
  const phase = o.phase ?? 'semana_1';
  const prevPhase = previousComparablePhase(phase);
  const exercises = o.exercises ?? EXS;
  const cw = o.currentWeights ?? exercises.map(() => 100);
  const pw = o.prevWeights ?? exercises.map(() => 100);
  const logs: RawSetLog[] = [];
  exercises.forEach((e, i) => {
    logs.push(...sets(e, cw[i], 10, dayIn(W.current, 1), phase, o.rir ?? null));
    logs.push(...sets(e, pw[i], 10, dayIn(W.previous, 1), prevPhase, o.rir ?? null));
  });
  return buildWeeklyTrainingReport({
    plannedPhase: phase,
    plannedDays: plannedDays(),
    windows: W,
    logs,
    sessions: [
      ...sessions(W.current, o.currentSessions ?? 4),
      ...sessions(W.previous, 4, o.prevPlanId ?? 'plan-1'),
    ],
    planId: 'plan-1',
  });
};

describe('janela única de aderência e performance', () => {
  it('11. adherence e progression usam exatamente a mesma janela', () => {
    const r = build();
    const adherence = getPreviousWeekWindow(NOW);
    expect(r.adherence.windowStart).toBe(adherence.start.toISOString());
    expect(r.adherence.windowEnd).toBe(adherence.end.toISOString());
    expect(r.context.currentStart).toBe(r.adherence.windowStart);
    expect(r.context.currentEnd).toBe(r.adherence.windowEnd);
    // previous encosta exatamente no início da janela atual
    expect(r.context.previousEnd).toBe(r.context.currentStart);
  });

  it('semana anterior comparável segue a fase do ciclo', () => {
    expect(previousComparablePhase('semana_2')).toBe('semana_1');
    expect(previousComparablePhase('semana_3')).toBe('semana_2');
    expect(previousComparablePhase('deload')).toBe('semana_3');
    expect(build({ phase: 'semana_2' }).context.comparedPhase).toBe('semana_1');
  });

  it('12. não compara semanas de planos/ciclos diferentes', () => {
    const r = build({ prevPlanId: 'outro-plano', currentWeights: [120, 120, 120, 120] });
    expect(r.context.previousWeekComparable).toBe(false);
    expect(r.progression.improved.length).toBe(0);
    expect(r.performance.comparableExercises).toBe(0);
  });
});

describe('decisão combinada aderência + performance', () => {
  it('1. relatório entrega aderência e performance juntos', () => {
    const r = build();
    expect(r.adherence).toBeTruthy();
    expect(r.performance.comparableExercises).toBeGreaterThan(0);
    expect(r.resolution.performance).toBe(r.performance);
  });

  it('2. admin e aluno recebem a mesma decisão para os mesmos dados', () => {
    const a = build();
    const b = build();
    expect(b.resolution.decision).toBe(a.resolution.decision);
    expect(b.resolution.activePhase).toBe(a.resolution.activePhase);
    expect(b.resolution.reasons).toEqual(a.resolution.reasons);
  });

  it('4. alta aderência + performance estável → advance', () => {
    const r = build();
    expect(r.adherence.status).toBe('apto_avancar');
    expect(r.resolution.decision).toBe('advance');
    expect(r.resolution.activePhase).toBe('semana_2');
  });

  it('3. alta aderência + regressão confiável em S1 → hold', () => {
    const r = build({ currentWeights: [70, 70, 70, 70], prevWeights: [100, 100, 100, 100] });
    expect(r.performance.confidence).toBe('high');
    expect(r.performance.hasRelevantRegression).toBe(true);
    expect(r.resolution.decision).toBe('hold');
    expect(r.resolution.activePhase).toBe('semana_1');
  });

  it('5. baixa confiança de performance não bloqueia decisão por aderência', () => {
    const r = build({ exercises: ['SUPINO RETO'], currentWeights: [60], prevWeights: [100] });
    expect(r.performance.confidence).toBe('low');
    expect(r.resolution.reasons).toContain('performance_low_confidence');
    expect(r.resolution.decision).toBe('advance');
    expect(describeWeekDecision(r.resolution)).toContain('principalmente na aderência');
  });

  it('6. S3 com regressão e alta aderência → deload', () => {
    const r = build({ phase: 'semana_3', currentWeights: [70, 70, 70, 70], prevWeights: [100, 100, 100, 100] });
    expect(r.resolution.decision).toBe('advance_to_deload');
    expect(r.resolution.activePhase).toBe('deload');
    expect(describeWeekDecision(r.resolution)).toContain('deload');
  });

  it('8. sem dados combinados ainda não há decisão automática de fase', () => {
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_1',
      plannedDays: plannedDays(),
      windows: W,
      logs: [],
      sessions: [],
      planId: 'plan-1',
    });
    expect(r.resolution.activePhase).toBe('semana_1');
    expect(r.resolution.decision).toBe('awaiting_data');
  });

  it('14. dados legados sem set_type/rir/sessões continuam funcionando', () => {
    const logs: RawSetLog[] = [];
    EXS.forEach((e) => {
      logs.push(
        ...sets(e, 100, 10, dayIn(W.current, 1), null).map((l) => ({ ...l, set_type: null })),
        ...sets(e, 100, 10, dayIn(W.previous, 1), null).map((l) => ({ ...l, set_type: null })),
      );
    });
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_1',
      plannedDays: plannedDays(),
      windows: W,
      logs,
      sessions: [],
      planId: null,
    });
    expect(r.adherence).toBeTruthy();
    expect(r.resolution.decision).toBeTruthy();
  });
});

describe('orientação por exercício (nextAction)', () => {
  const perf = (
    exerciseName: string,
    nextAction: ExercisePerformance['nextAction'],
    status: ExercisePerformance['status'] = 'stable',
  ): ExercisePerformance => ({
    exerciseName,
    totalWorkingSets: 3,
    auxiliarySets: 0,
    preparationSets: 0,
    totalReps: 30,
    totalVolume: 2400,
    loaded: true,
    comparisonBasis: 'like_for_like',
    status,
    nextAction,
    reason: '',
    repRange: { min: 8, max: 12 },
    bestSet: { weightKg: 80, reps: 10, rir: 2, performedAt: NOW.toISOString(), setNumber: 1, estimated1RM: 106 },
  });

  it('10. cada nextAction vira orientação específica', () => {
    const g = buildExerciseGuidance([
      perf('SUPINO RETO', 'increase_reps'),
      perf('AGACHAMENTO', 'increase_load'),
      perf('REMADA', 'maintain'),
      perf('LEG PRESS', 'reduce_load', 'regressed'),
    ]);
    const by = Object.fromEntries(g.map((x) => [x.exerciseName, x]));
    expect(by['SUPINO RETO'].text).toContain('aumentar as repetições');
    expect(by['AGACHAMENTO'].text).toContain('aumento de carga');
    expect(by['REMADA'].text).toContain('Mantenha carga');
    expect(by['LEG PRESS'].text).toContain('reduza a carga');
  });

  it('9. missing/insufficient não geram recomendação agressiva', () => {
    const g = buildExerciseGuidance([
      perf('SUPINO RETO', 'increase_load', 'missing'),
      perf('REMADA', 'increase_load', 'insufficient_data'),
    ]);
    expect(g.every((x) => x.nextAction === 'review')).toBe(true);
    expect(g.every((x) => !/aumento de carga/.test(x.text))).toBe(true);
  });

  it('7. no deload nenhuma orientação incentiva sobrecarga', () => {
    const g = buildExerciseGuidance(
      [perf('AGACHAMENTO', 'increase_load'), perf('SUPINO RETO', 'increase_reps')],
      { activePhase: 'deload' },
    );
    expect(g.every((x) => x.nextAction === 'maintain')).toBe(true);
    expect(g.every((x) => !/aumento de carga|aumentar as repetições/.test(x.text))).toBe(true);
  });
});
