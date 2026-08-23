import { describe, it, expect } from 'vitest';
import {
  computeCompletion,
  classifyCompletion,
  isSessionStale,
  summarizeSessionState,
  STALE_INACTIVITY_MINUTES,
  buildSessionStateLogRows,
} from '@/lib/workoutSessionResolution';
import { countsTowardWorkoutCompletion, isNoLoadExercise } from '@/lib/exerciseLoadType';

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

describe('peso corporal conta no completionScore', () => {
  it('barra fixa / flexão / prancha contam; mobilidade e aquecimento não', () => {
    expect(countsTowardWorkoutCompletion('BARRA FIXA')).toBe(true);
    expect(countsTowardWorkoutCompletion('FLEXÃO DE BRAÇO')).toBe(true);
    expect(countsTowardWorkoutCompletion('PRANCHA ISOMÉTRICA')).toBe(true);
    expect(countsTowardWorkoutCompletion('ABDOMINAL SUPRA')).toBe(true);
    expect(countsTowardWorkoutCompletion('MOBILIDADE DE QUADRIL')).toBe(false);
    expect(countsTowardWorkoutCompletion('ALONGAMENTO DE PEITORAL')).toBe(false);
    expect(countsTowardWorkoutCompletion('AQUECIMENTO ARTICULAR')).toBe(false);
    expect(countsTowardWorkoutCompletion('ATIVAÇÃO DE GLÚTEO')).toBe(false);
  });

  it('não exigir carga não remove o exercício da sessão', () => {
    expect(isNoLoadExercise('PRANCHA')).toBe(true);
    expect(countsTowardWorkoutCompletion('PRANCHA')).toBe(true);
  });

  it('sessão de peso corporal completa é classificada como completed', () => {
    const state = {
      exerciseNames: ['MOBILIDADE DE OMBRO', 'BARRA FIXA', 'FLEXÃO', 'PRANCHA'],
      plannedSets: [2, 3, 3, 3],
      sets: {
        0: [{ completed: false }, { completed: false }],
        1: [{ completed: true }, { completed: true }, { completed: true }],
        2: [{ completed: true }, { completed: true }, { completed: true }],
        3: [{ completed: true }, { completed: true }, { completed: true }],
      },
    };
    const r = computeCompletion(summarizeSessionState(state as any, 4));
    expect(r.plannedExercises).toBe(3);
    expect(r.status).toBe('completed');
  });
});

describe('flush parcial de exercise_set_logs', () => {
  const state = {
    exerciseNames: ['SUPINO RETO', 'REMADA CURVADA', 'AGACHAMENTO'],
    plannedSets: [6, 6, 6],
    muscleGroups: ['peito', 'costas', 'pernas'],
    sets: {
      0: Array.from({ length: 6 }, () => ({ reps: '10', weight: '60', completed: true })),
      1: Array.from({ length: 6 }, () => ({ reps: '10', weight: '40', completed: true })),
      2: Array.from({ length: 6 }, () => ({ reps: '10', weight: '80', completed: true })),
    },
  };

  it('monta TODAS as 18 séries concluídas, mesmo com séries já persistidas', () => {
    const { rows, totalSets } = buildSessionStateLogRows(
      { id: 'sess-1', student_id: 'stu-1', phase: 'A', day_name: 'Treino A' },
      state as any,
      new Date().toISOString(),
    );
    expect(totalSets).toBe(18);
    expect(rows).toHaveLength(18);

    // Simula 3 séries já existentes no banco (chave por série).
    const existing = new Set(['SUPINO RETO|1', 'SUPINO RETO|2', 'SUPINO RETO|3']);
    const keyOf = (r: any) => `${r.exercise_name}|${r.set_number}`;
    const inserted = rows.filter((r) => !existing.has(keyOf(r)));
    const ignored = rows.filter((r) => existing.has(keyOf(r)));

    // UNIQUE + upsert(ignoreDuplicates): 15 novas, 3 ignoradas, 0 duplicadas.
    expect(inserted).toHaveLength(15);
    expect(ignored).toHaveLength(3);
    expect(new Set(rows.map(keyOf)).size).toBe(18);
  });

  it('ignora séries não concluídas e não bloqueia por sessão', () => {
    const partial = {
      ...state,
      sets: {
        0: [
          { reps: '10', weight: '60', completed: true },
          { reps: '', weight: '', completed: false },
        ],
      },
    };
    const { rows, totalSets } = buildSessionStateLogRows(
      { id: 'sess-2', student_id: 'stu-1', phase: null, day_name: null },
      partial as any,
      new Date().toISOString(),
    );
    expect(totalSets).toBe(1);
    expect(rows[0].set_number).toBe(1);
  });
});
