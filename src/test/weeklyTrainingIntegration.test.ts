import { describe, it, expect } from 'vitest';
import { buildWeeklyTrainingReport, describeWeekDecision, type RawSetLog, type RawSession } from '@/lib/weeklyTraining';
import { resolveWeekContexts, performanceComparablePhase } from '@/lib/weekContext';
import { buildExerciseGuidance } from '@/lib/nextSessionGuidance';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';
import type { TrainingPhase } from '@/lib/trainingPhase';
import type { ExercisePerformance } from '@/lib/weeklyProgression';

const NOW = new Date('2026-08-20T10:00:00Z');
/** Ciclo do plano começou na segunda 2026-08-10 → S2 = [17/08, 24/08). */
const CYCLE_START = '2026-08-10';

const ctxFor = (phase: TrainingPhase, planId: string | null = 'plan-1', start = CYCLE_START) =>
  resolveWeekContexts({ planId, phase, phaseStartDate: start, cycleDays: 7, now: NOW });

const EXS = ['SUPINO RETO', 'AGACHAMENTO', 'REMADA', 'LEG PRESS'];

const dayIn = (w: { startedAt: Date }, offset: number, hour = 12) => {
  const d = new Date(w.startedAt);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

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
  sessionId: string | null = null,
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
    session_id: sessionId,
  }));

const session = (
  id: string,
  when: string,
  phase: TrainingPhase | null,
  planId: string | null = 'plan-1',
  status = 'completed',
): RawSession => ({
  id,
  status,
  completed_at: when,
  started_at: when,
  created_at: when,
  plan_id: planId,
  phase,
});

interface Opts {
  phase?: TrainingPhase;
  currentWeights?: number[];
  prevWeights?: number[];
  currentSessions?: number;
  prevPlanId?: string;
  rir?: number | null;
  exercises?: string[];
}

/** Cenário estruturado padrão: sessões com plan_id/phase e logs com session_id. */
const build = (o: Opts = {}) => {
  const phase = o.phase ?? 'semana_2';
  const contexts = ctxFor(phase);
  const prevPhase = contexts.previous?.phase ?? null;
  const exercises = o.exercises ?? EXS;
  const cw = o.currentWeights ?? exercises.map(() => 100);
  const pw = o.prevWeights ?? exercises.map(() => 100);

  const nCur = o.currentSessions ?? 4;
  const curSessions = Array.from({ length: nCur }, (_, i) =>
    session(`cur-${i}`, dayIn(contexts.current, i), phase));
  const prevSessions = contexts.previous
    ? Array.from({ length: 4 }, (_, i) =>
        session(`prev-${i}`, dayIn(contexts.previous!, i), prevPhase, o.prevPlanId ?? 'plan-1'))
    : [];

  const logs: RawSetLog[] = [];
  exercises.forEach((e, i) => {
    logs.push(...sets(e, cw[i], 10, dayIn(contexts.current, 1), phase, o.rir ?? null, 'cur-1'));
    if (contexts.previous) {
      logs.push(...sets(e, pw[i], 10, dayIn(contexts.previous, 1), prevPhase, o.rir ?? null, 'prev-1'));
    }
  });

  return buildWeeklyTrainingReport({
    plannedPhase: phase,
    plannedDays: plannedDays(),
    contexts,
    logs,
    sessions: [...curSessions, ...prevSessions],
    planId: 'plan-1',
  });
};

describe('identidade estruturada da semana (WeekContext)', () => {
  it('a semana avaliada é a fase do plano, não os últimos 7 dias', () => {
    const r = build({ phase: 'semana_2' });
    expect(r.context.weekContextSource).toBe('structured_session');
    expect(r.context.currentStart.slice(0, 10)).toBe('2026-08-17');
    expect(r.context.currentEnd.slice(0, 10)).toBe('2026-08-24');
    expect(r.adherence.windowStart).toBe(r.context.currentStart);
    expect(r.adherence.windowEnd).toBe(r.context.currentEnd);
  });

  it('sessões estruturadas da mesma S2 são avaliadas juntas mesmo fora dos últimos 7 dias', () => {
    const contexts = ctxFor('semana_2');
    // sexta (dia 4 da fase) e segunda (dia 0) — janela móvel de 7d perderia parte
    const sessions = [
      session('s1', dayIn(contexts.current, 0), 'semana_2'),
      session('s2', dayIn(contexts.current, 4), 'semana_2'),
    ];
    const logs = [
      ...sets('SUPINO RETO', 100, 10, dayIn(contexts.current, 0), 'semana_2', null, 's1'),
      ...sets('AGACHAMENTO', 100, 10, dayIn(contexts.current, 4), 'semana_2', null, 's2'),
    ];
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(2), contexts, logs, sessions, planId: 'plan-1',
    });
    expect(r.adherence.sessionsExecuted).toBe(2);
    expect(r.context.structuredLogs).toBe(6);
  });

  it('sessão de S1 não entra na avaliação de S2 (fase explicitamente divergente)', () => {
    const contexts = ctxFor('semana_2');
    const sessions = [session('s1', dayIn(contexts.current, 1), 'semana_1')];
    const logs = sets('SUPINO RETO', 100, 10, dayIn(contexts.current, 1), 'semana_1', null, 's1');
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(2), contexts, logs, sessions, planId: 'plan-1',
    });
    expect(r.context.structuredLogs).toBe(0);
    expect(r.context.rejectedByPhase).toBeGreaterThan(0);
    expect(r.adherence.sessionsExecuted).toBe(0);
  });

  it('fase explicitamente divergente nunca é relaxada, mesmo esvaziando o filtro', () => {
    const contexts = ctxFor('semana_2');
    const logs = sets('SUPINO RETO', 100, 10, dayIn(contexts.current, 1), 'semana_1');
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(2), contexts, logs, sessions: [], planId: 'plan-1',
    });
    expect(r.context.phaseFilterRelaxed).toBe(false);
    expect(r.context.legacyLogs).toBe(0);
    expect(r.context.rejectedByPhase).toBe(3);
  });

  it('phase = null legado entra pelo fallback de janela temporal com confiança baixa', () => {
    const contexts = ctxFor('semana_2');
    const logs: RawSetLog[] = [];
    EXS.forEach((e) => {
      logs.push(...sets(e, 100, 10, dayIn(contexts.current, 1), null));
      logs.push(...sets(e, 100, 10, dayIn(contexts.previous!, 1), null));
    });
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(), contexts, logs,
      sessions: [session('s1', dayIn(contexts.current, 1), null)], planId: 'plan-1',
    });
    expect(r.context.legacyLogs).toBe(12);
    expect(r.context.structuredLogs).toBe(0);
    expect(r.context.comparisonBasis).toBe('legacy_time_window');
    expect(r.performance.confidence).toBe('low');
  });

  it('logs com session_id usam o contexto da workout_session', () => {
    const contexts = ctxFor('semana_2');
    // log com performed_at fora da janela mas sessão dentro da fase → aceito
    const inPhase = dayIn(contexts.current, 2);
    const outside = new Date(contexts.current.endedAt.getTime() + 3600_000).toISOString();
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(1), contexts,
      logs: sets('SUPINO RETO', 100, 10, outside, null, null, 's1'),
      sessions: [session('s1', inPhase, 'semana_2')], planId: 'plan-1',
    });
    expect(r.context.structuredLogs).toBe(3);
  });

  it('sem fase_inicio_data cai no fallback de janela móvel', () => {
    const contexts = resolveWeekContexts({ planId: 'p', phase: 'semana_2', phaseStartDate: null, now: NOW });
    expect(contexts.current.source).toBe('legacy_time_window');
    expect(contexts.comparisonBasis).toBe('legacy_time_window');
  });
});

describe('comparação entre fases', () => {
  it('S2 compara com S1 e S3 compara com S2', () => {
    expect(performanceComparablePhase('semana_2')).toBe('semana_1');
    expect(performanceComparablePhase('semana_3')).toBe('semana_2');
    expect(build({ phase: 'semana_2' }).context.comparedPhase).toBe('semana_1');
    expect(build({ phase: 'semana_3' }).context.comparedPhase).toBe('semana_2');
  });

  it('nova S1 não é comparada com o deload anterior', () => {
    expect(performanceComparablePhase('semana_1')).toBeNull();
    const r = build({ phase: 'semana_1', currentWeights: [120, 120, 120, 120] });
    expect(r.context.comparedPhase).toBeNull();
    expect(r.context.comparisonBasis).toBe('none');
    expect(r.performance.comparableExercises).toBe(0);
    expect(r.progression.improved.length).toBe(0);
  });

  it('S1 sem semana comparável → baixa confiança de performance', () => {
    const r = build({ phase: 'semana_1' });
    expect(r.performance.confidence).toBe('low');
    expect(r.resolution.reasons).toContain('performance_low_confidence');
  });

  it('S4 (deload) não gera comparação nem recomendação de sobrecarga', () => {
    const r = build({ phase: 'deload', currentWeights: [70, 70, 70, 70], prevWeights: [100, 100, 100, 100] });
    expect(r.context.comparedPhase).toBeNull();
    expect(r.performance.regressedCount).toBe(0);
    expect(r.performance.hasRelevantRegression).toBe(false);
    expect(r.resolution.reasons).not.toContain('significant_regression');
    expect(r.progression.performances.every((p) => p.nextAction !== 'increase_load')).toBe(true);
  });

  it('troca de plan_id impede a comparação', () => {
    const r = build({ prevPlanId: 'outro-plano', currentWeights: [120, 120, 120, 120] });
    expect(r.context.previousWeekComparable).toBe(false);
    expect(r.context.comparisonBasis).toBe('none');
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
    expect(r.resolution.activePhase).toBe('semana_3');
  });

  it('3. alta aderência + regressão confiável em S2 → hold', () => {
    const r = build({ currentWeights: [70, 70, 70, 70], prevWeights: [100, 100, 100, 100] });
    expect(r.context.comparisonBasis).toBe('structured_previous_phase');
    expect(r.performance.confidence).toBe('high');
    expect(r.performance.hasRelevantRegression).toBe(true);
    expect(r.resolution.decision).toBe('hold');
    expect(r.resolution.activePhase).toBe('semana_2');
  });

  it('5. baixa confiança de performance não bloqueia decisão por aderência', () => {
    const two = ['SUPINO RETO', 'REMADA'];
    const contexts = ctxFor('semana_2');
    const logs: RawSetLog[] = [];
    two.forEach((e) => logs.push(...sets(e, 100, 10, dayIn(contexts.current, 1), 'semana_2', null, 'cur-1')));
    logs.push(...sets('SUPINO RETO', 100, 10, dayIn(contexts.previous!, 1), 'semana_1', null, 'prev-1'));
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2',
      plannedDays: [{ day: 'DIA 1', exercises: two.map((e) => ({ exercise: e, series: '3', reps: '8-12' })) }] as any,
      contexts,
      logs,
      sessions: [
        session('cur-1', dayIn(contexts.current, 1), 'semana_2'),
        session('prev-1', dayIn(contexts.previous!, 1), 'semana_1'),
      ],
      planId: 'plan-1',
    });
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
      plannedPhase: 'semana_2', plannedDays: plannedDays(), contexts: ctxFor('semana_2'),
      logs: [], sessions: [], planId: 'plan-1',
    });
    expect(r.resolution.activePhase).toBe('semana_2');
    expect(r.resolution.decision).toBe('awaiting_data');
  });

  it('14. dados legados sem set_type/rir/sessões continuam funcionando', () => {
    const contexts = ctxFor('semana_2');
    const logs: RawSetLog[] = [];
    EXS.forEach((e) => {
      logs.push(
        ...sets(e, 100, 10, dayIn(contexts.current, 1), null).map((l) => ({ ...l, set_type: null })),
        ...sets(e, 100, 10, dayIn(contexts.previous!, 1), null).map((l) => ({ ...l, set_type: null })),
      );
    });
    const r = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(), contexts, logs, sessions: [], planId: null,
    });
    expect(r.adherence).toBeTruthy();
    expect(r.resolution.decision).toBeTruthy();
    expect(r.context.comparisonBasis).toBe('legacy_time_window');
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
