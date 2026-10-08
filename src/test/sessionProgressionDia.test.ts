import { describe, expect, it } from 'vitest';
import {
  buildSessionProgressionRecommendations,
  dropLoadOutliers,
  formatSessionHint,
  mergeProgressionSnapshots,
  missingExercisesFor,
  workRepRangeOf,
  type SessionLog,
} from '@/lib/sessionProgression';
import type { ParsedExercise } from '@/lib/trainingResultParser';

const ex = (exercise: string, reps = '8-10', extra: Partial<ParsedExercise> = {}) =>
  ({ exercise, series: '3', series2: '', reps, rir: '', pause: '', description: '', variation: '', ...extra }) as ParsedExercise;
const log = (name: string, dia: string, sid: string, n: number, w: number, r: number): SessionLog =>
  ({
    exercise_name: name,
    weight_kg: w,
    reps: r,
    rir: null,
    rpe: null,
    set_type: 'work',
    set_number: n,
    performed_at: `${dia}T10:00:00Z`,
    session_id: sid,
    phase: 'semana_1',
  }) as unknown as SessionLog;

describe('faixa das séries de trabalho', () => {
  it('"12 + 8-10" usa só o trabalho (8–10) e tempo não vira faixa', () => {
    expect(workRepRangeOf(ex('X', '12 + 8-10'))).toEqual({ min: 8, max: 10 });
    expect(workRepRangeOf(ex('X', '15s'))).toBeNull();
    expect(workRepRangeOf(ex('X', '30 seg'))).toBeNull();
  });
  it('setScheme: reconhecimento fica fora e séries iguais não viram esquema complexo', () => {
    const e = ex('X', '', {
      setScheme: {
        mode: 'per_set',
        sets: [
          { set_number: 1, set_type: 'recognition', target_reps: '12' },
          { set_number: 2, set_type: 'work', target_reps: '8-10' },
          { set_number: 3, set_type: 'work', target_reps: '8-10' },
        ],
      },
    } as Partial<ParsedExercise>);
    expect(workRepRangeOf(e)).toEqual({ min: 8, max: 10 });
  });
});

describe('histórico mais limpo', () => {
  it('ignora carga que parece erro de digitação (275 em vez de 27,5)', () => {
    const logs = [27.5, 27.5, 25, 275, 27.5].map((w, i) => log('REMADA UNILATERAL', '2026-09-10', 's1', i + 1, w, 10));
    const r = dropLoadOutliers(logs);
    expect(r.ignoredKg).toEqual([275]);
    expect(r.logs).toHaveLength(4);
  });

  it('sessão sem plan_id depois do início do plano conta como do plano (não é legado)', () => {
    const logs = [
      log('ELEVAÇÃO PELVICA', '2026-09-20', 's1', 1, 60, 10),
      log('ELEVAÇÃO PELVICA', '2026-09-20', 's1', 2, 60, 10),
      log('ELEVAÇÃO PÉLVICA', '2026-09-27', 's2', 1, 60, 10),
      log('ELEVAÇÃO PÉLVICA', '2026-09-27', 's2', 2, 60, 10),
    ];
    const snap = buildSessionProgressionRecommendations({
      exercises: [ex('ELEVAÇÃO PÉLVICA')],
      logs,
      currentSessionId: 'now',
      activePhase: 'semana_3',
      configuredIncrements: { 'ELEVACAO PELVICA': 5 },
      sessionMeta: { s1: { sessionId: 's1', planId: null }, s2: { sessionId: 's2', planId: null } },
      currentPlanId: 'P',
      currentPlanStartedAt: '2026-09-01T00:00:00Z',
    });
    const r = snap.recommendations['ELEVACAO PELVICA'];
    expect(r.legacyFallback).toBeFalsy();
    expect(r.action).toBe('increase_load');
    expect(r.recommendedLoadKg).toBe(65);
    expect(formatSessionHint(r)?.text).toContain('65 kg');
  });

  it('sessão sem plan_id ANTES do plano continua legado (confiança baixa)', () => {
    const logs = [
      log('SUPINO RETO', '2026-08-01', 'a', 1, 80, 12),
      log('SUPINO RETO', '2026-08-08', 'b', 1, 80, 12),
    ];
    const snap = buildSessionProgressionRecommendations({
      exercises: [ex('SUPINO RETO', '8-12')],
      logs,
      currentSessionId: 'now',
      activePhase: 'semana_1',
      configuredIncrements: {},
      sessionMeta: { a: { sessionId: 'a', planId: null }, b: { sessionId: 'b', planId: null } },
      currentPlanId: 'P',
      currentPlanStartedAt: '2026-09-01T00:00:00Z',
    });
    expect(snap.recommendations['SUPINO RETO'].legacyFallback).toBe(true);
  });
});

describe('snapshot completável (troca de dia)', () => {
  it('lista o que falta avaliar e junta sem sobrescrever', () => {
    const base = buildSessionProgressionRecommendations({
      exercises: [ex('CADEIRA EXTENSORA')],
      logs: [],
      currentSessionId: 'now',
      activePhase: 'semana_1',
      configuredIncrements: {},
    });
    expect(base.coveredKeys).toEqual(['CADEIRA EXTENSORA']);
    const faltam = missingExercisesFor(base, [ex('Cadeira Extensora'), ex('LEG PRESS')]);
    expect(faltam.map((e) => e.exercise)).toEqual(['LEG PRESS']);
    const extra = buildSessionProgressionRecommendations({
      exercises: faltam,
      logs: [],
      currentSessionId: 'now',
      activePhase: 'semana_1',
      configuredIncrements: {},
    });
    const juntos = mergeProgressionSnapshots(base, extra);
    expect(juntos.coveredKeys).toEqual(['CADEIRA EXTENSORA', 'LEG PRESS']);
    expect(missingExercisesFor(juntos, [ex('LEG PRESS')])).toHaveLength(0);
  });
});
