import { describe, it, expect } from 'vitest';
import { buildWeeklyTrainingReport, type RawSetLog, type RawSession } from '@/lib/weeklyTraining';
import { resolveWeekContexts, fetchRangeFor } from '@/lib/weekContext';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';

const NOW = new Date('2026-08-20T10:00:00Z');
const CYCLE_START = '2026-08-10';
const EXS = ['SUPINO RETO', 'AGACHAMENTO', 'REMADA', 'LEG PRESS'];

const plannedDays = (): ParsedTrainingDay[] =>
  Array.from({ length: 4 }, (_, i) => ({
    day: `DIA ${i + 1}`,
    exercises: EXS.map((e) => ({ exercise: e, series: '3', reps: '8-12' })),
  })) as unknown as ParsedTrainingDay[];

const ctx = (planId: string) =>
  resolveWeekContexts({ planId, phase: 'semana_2', phaseStartDate: CYCLE_START, cycleDays: 7, now: NOW });

const dayIn = (w: { startedAt: Date }, offset: number) => {
  const d = new Date(w.startedAt);
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

const studentData = (planId: string, weight: number) => {
  const c = ctx(planId);
  const sessions: RawSession[] = [
    { id: `${planId}-cur`, status: 'completed', completed_at: dayIn(c.current, 1), started_at: dayIn(c.current, 1), created_at: dayIn(c.current, 1), plan_id: planId, phase: 'semana_2' },
    { id: `${planId}-cur2`, status: 'completed', completed_at: dayIn(c.current, 2), started_at: dayIn(c.current, 2), created_at: dayIn(c.current, 2), plan_id: planId, phase: 'semana_2' },
    { id: `${planId}-cur3`, status: 'completed', completed_at: dayIn(c.current, 3), started_at: dayIn(c.current, 3), created_at: dayIn(c.current, 3), plan_id: planId, phase: 'semana_2' },
    { id: `${planId}-cur4`, status: 'completed', completed_at: dayIn(c.current, 4), started_at: dayIn(c.current, 4), created_at: dayIn(c.current, 4), plan_id: planId, phase: 'semana_2' },
    { id: `${planId}-prev`, status: 'completed', completed_at: dayIn(c.previous!, 1), started_at: dayIn(c.previous!, 1), created_at: dayIn(c.previous!, 1), plan_id: planId, phase: 'semana_1' },
  ];
  const logs: RawSetLog[] = [];
  EXS.forEach((e) => {
    [1, 2, 3].forEach((n) => {
      logs.push({ exercise_name: e, weight_kg: weight, reps: 10, performed_at: dayIn(c.current, 1), set_number: n, set_type: 'work', rir: null, phase: 'semana_2', session_id: `${planId}-cur` });
      logs.push({ exercise_name: e, weight_kg: 100, reps: 10, performed_at: dayIn(c.previous!, 1), set_number: n, set_type: 'work', rir: null, phase: 'semana_1', session_id: `${planId}-prev` });
    });
  });
  return { contexts: c, sessions, logs };
};

describe('paridade entre visão individual e resumo em lote do admin', () => {
  it('a decisão do aluno e do lote é matematicamente idêntica', () => {
    const A = studentData('plan-a', 110);
    const B = studentData('plan-b', 80);

    // Individual (useWeeklyTraining)
    const individual = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(), contexts: A.contexts,
      logs: A.logs, sessions: A.sessions, planId: 'plan-a',
    });

    // Lote (useStudentsWeeklySummary): 1 conjunto de logs + 1 de sessões para
    // todos os alunos, particionado localmente por student_id.
    const allLogs = [...A.logs, ...B.logs];
    const allSessions = [...A.sessions, ...B.sessions];
    const partitionA = {
      logs: allLogs.filter((l) => l.session_id?.startsWith('plan-a')),
      sessions: allSessions.filter((s) => s.plan_id === 'plan-a'),
    };
    const batch = buildWeeklyTrainingReport({
      plannedPhase: 'semana_2', plannedDays: plannedDays(), contexts: A.contexts,
      logs: partitionA.logs, sessions: partitionA.sessions, planId: 'plan-a',
    });

    expect(batch.resolution.decision).toBe(individual.resolution.decision);
    expect(batch.resolution.activePhase).toBe(individual.resolution.activePhase);
    expect(batch.resolution.reasons).toEqual(individual.resolution.reasons);
    expect(batch.performance).toEqual(individual.performance);
    expect(batch.context.comparisonBasis).toBe(individual.context.comparisonBasis);
  });

  it('o lote cobre todos os contextos com uma única faixa temporal (zero N+1)', () => {
    const contexts = [ctx('plan-a'), ctx('plan-b'), ctx('plan-c')];
    let from = new Date(NOW);
    let to = new Date(NOW);
    for (const c of contexts) {
      const r = fetchRangeFor(c);
      if (r.from < from) from = r.from;
      if (r.to > to) to = r.to;
    }
    // Uma faixa só cobre a semana atual e a anterior de todos os alunos.
    for (const c of contexts) {
      expect(from.getTime()).toBeLessThanOrEqual(c.previous!.startedAt.getTime());
      expect(to.getTime()).toBeGreaterThanOrEqual(c.current.endedAt.getTime());
    }
  });
});
