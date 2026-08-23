import { describe, it, expect } from 'vitest';
import {
  computeCompletion,
  classifyCompletion,
  isSessionStale,
  summarizeSessionState,
  STALE_INACTIVITY_MINUTES,
} from '@/lib/workoutSessionResolution';

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('classificação automática de sessões', () => {
  it('Caso A — treino praticamente completo => completed', () => {
    const r = computeCompletion({
      plannedExercises: 6,
      plannedSets: 18,
      executedExercises: 6,
      executedSets: 17,
    });
    expect(r.status).toBe('completed');
    expect(r.completionScore).toBeGreaterThanOrEqual(0.7);
  });

  it('Caso B — metade do treino => partial', () => {
    const r = computeCompletion({
      plannedExercises: 6,
      plannedSets: 18,
      executedExercises: 3,
      executedSets: 9,
    });
    expect(r.status).toBe('partial');
    expect(r.completionScore).toBeCloseTo(0.5, 5);
  });

  it('Caso C — apenas uma série => abandoned', () => {
    const r = computeCompletion({
      plannedExercises: 6,
      plannedSets: 18,
      executedExercises: 1,
      executedSets: 1,
    });
    expect(r.status).toBe('abandoned');
    expect(r.completionScore).toBeLessThan(0.25);
  });

  it('limiares centralizados', () => {
    expect(classifyCompletion(0.7)).toBe('completed');
    expect(classifyCompletion(0.69)).toBe('partial');
    expect(classifyCompletion(0.25)).toBe('partial');
    expect(classifyCompletion(0.24)).toBe('abandoned');
  });
});

describe('detecção de sessão parada', () => {
  it('Caso D — voltou 20 min depois: continua ativa', () => {
    expect(isSessionStale({ last_active_at: minsAgo(20), started_at: minsAgo(60) })).toBe(false);
  });

  it('Caso E — treino longo com atividade recente: não finaliza', () => {
    expect(isSessionStale({ last_active_at: minsAgo(5), started_at: minsAgo(190) })).toBe(false);
  });

  it('Caso F — sessão antiga sem atividade: stale', () => {
    expect(
      isSessionStale({ last_active_at: minsAgo(STALE_INACTIVITY_MINUTES + 1), started_at: minsAgo(300) }),
    ).toBe(true);
  });

  it('sem last_active_at usa started_at', () => {
    expect(isSessionStale({ started_at: minsAgo(200) })).toBe(true);
    expect(isSessionStale({ started_at: minsAgo(10) })).toBe(false);
  });
});

describe('leitura do session_state', () => {
  it('ignora mobilidade/alongamento e conta séries concluídas', () => {
    const state = {
      exerciseNames: ['SUPINO RETO', 'MOBILIDADE DE OMBRO', 'REMADA CURVADA'],
      plannedSets: [3, 2, 3],
      sets: {
        0: [{ completed: true }, { completed: true }, { completed: true }],
        1: [{ completed: true }, { completed: true }],
        2: [{ completed: true }, { completed: false }, { completed: false }],
      },
    };
    const s = summarizeSessionState(state as any, 3);
    expect(s.plannedExercises).toBe(2);
    expect(s.plannedSets).toBe(6);
    expect(s.executedExercises).toBe(2);
    expect(s.executedSets).toBe(4);
  });
});
