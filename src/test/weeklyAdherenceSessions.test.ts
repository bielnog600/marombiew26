import { describe, it, expect } from 'vitest';
import {
  buildAdherenceReport,
  STRUCTURED_SESSIONS_SINCE,
  type AdherenceLog,
  type AdherenceSession,
} from '@/lib/weeklyAdherence';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';

const day = (name: string, exercises: string[]): ParsedTrainingDay =>
  ({ day: name, exercises: exercises.map((e) => ({ exercise: e, sets: '3', reps: '10' })) }) as any;

const plan: ParsedTrainingDay[] = [
  day('A', ['SUPINO RETO', 'REMADA CURVADA']),
  day('B', ['AGACHAMENTO', 'LEG PRESS']),
  day('C', ['DESENVOLVIMENTO', 'ROSCA DIRETA']),
  day('D', ['TERRA', 'PUXADA']),
];

const log = (name: string, date: string): AdherenceLog => ({
  exercise_name: name,
  reps: 10,
  weight_kg: 40,
  performed_at: `${date}T10:00:00.000Z`,
});

const sess = (status: string, date: string): AdherenceSession => ({
  status,
  completed_at: `${date}T11:00:00.000Z`,
  started_at: `${date}T10:00:00.000Z`,
});

const W = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-08T00:00:00Z') };

describe('fallback legado de sessionsExecuted', () => {
  it('dados novos: uma única série não vira sessão executada', () => {
    const r = buildAdherenceReport(plan, [log('SUPINO RETO', '2026-09-02')], W.start, W.end, []);
    expect(r.sessionsExecuted).toBe(0);
    expect(r.sessionsFromStructured).toBe(true);
  });

  it('dados novos: só sessões completed contam; partial entra ponderada', () => {
    const sessions = [
      sess('completed', '2026-09-02'),
      sess('completed', '2026-09-04'),
      sess('completed', '2026-09-05'),
      sess('partial', '2026-09-06'),
    ];
    const logs = sessions.map((_, i) => log('SUPINO RETO', `2026-09-0${i + 2}`));
    const r = buildAdherenceReport(plan, logs, W.start, W.end, sessions);
    expect(r.sessionsExecuted).toBe(3);
    expect(r.sessionsPartial).toBe(1);
    expect(r.weightedSessionAdherence).toBeCloseTo(0.875, 5);
  });

  it('dados legados (antes do cutoff): dias com logs ainda contam', () => {
    const start = new Date('2026-05-01T00:00:00Z');
    const end = new Date('2026-05-08T00:00:00Z');
    const logs = [log('SUPINO RETO', '2026-05-02'), log('AGACHAMENTO', '2026-05-04')];
    const r = buildAdherenceReport(plan, logs, start, end, []);
    expect(r.sessionsExecuted).toBe(2);
    expect(r.sessionsFromStructured).toBe(false);
    expect(new Date(`${STRUCTURED_SESSIONS_SINCE}T00:00:00Z`) > start).toBe(true);
  });

  it('dia legado com sessão estruturada não é contado duas vezes', () => {
    const start = new Date('2026-05-01T00:00:00Z');
    const end = new Date('2026-05-08T00:00:00Z');
    const r = buildAdherenceReport(
      plan,
      [log('SUPINO RETO', '2026-05-02')],
      start,
      end,
      [sess('completed', '2026-05-02')],
    );
    expect(r.sessionsExecuted).toBe(1);
  });
});
