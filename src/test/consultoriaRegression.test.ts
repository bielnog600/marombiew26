import { describe, it, expect } from 'vitest';
import { assessExerciseRegression, shouldTagRegression, isNoLoadExercise } from '@/lib/consultoriaRegression';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const d = (daysAgo: number) => new Date(NOW - daysAgo * 86400000).toISOString();
const log = (sid: string, daysAgo: number, w: number | null, r: number, n = 1, type: string | null = 'work') =>
  ({ session_id: sid, performed_at: d(daysAgo), weight_kg: w, reps: r, set_number: n, set_type: type, exercise_name: 'X' } as any);

describe('consultoriaRegression', () => {
  it('queda de e1RM ≥10% é regressão', () => {
    const a = assessExerciseRegression({ exerciseName: 'SUPINO', logs: [log('a', 7, 60, 10), log('b', 1, 50, 8)] });
    expect(a.kind).toBe('regression');
  });
  it('queda menor que 10% não é regressão', () => {
    expect(assessExerciseRegression({ exerciseName: 'SUPINO', logs: [log('a', 7, 60, 10), log('b', 1, 57.5, 10)] }).kind).toBe('ok');
  });
  it('referência > 28 dias vira retomada', () => {
    expect(assessExerciseRegression({ exerciseName: 'SUPINO', logs: [log('a', 40, 60, 10), log('b', 1, 40, 8)] }).kind).toBe('resume');
  });
  it('ignora reconhecimento e séries sem carga', () => {
    const a = assessExerciseRegression({ exerciseName: 'SUPINO', logs: [
      log('a', 7, 60, 10), log('b', 1, 20, 12, 1, 'recognition'), log('b', 1, 0, 12, 2), log('b', 1, 60, 10, 3),
    ] });
    expect(a.kind).toBe('ok');
  });
  it('descarta outlier de digitação (>250% da mediana)', () => {
    const a = assessExerciseRegression({ exerciseName: 'SUPINO', logs: [log('a', 14, 60, 10), log('b', 7, 600, 10), log('c', 1, 60, 10)] });
    expect(a.kind).toBe('ok');
  });
  it('drop set usa só a primeira série de trabalho', () => {
    const planned = { exercise: 'FLEXORA', metodo: 'dropset' } as any;
    const a = assessExerciseRegression({ exerciseName: 'FLEXORA', planned, logs: [
      log('a', 7, 60, 12, 1), log('b', 1, 60, 12, 1), log('b', 1, 70, 12, 0),
    ].map((l, i) => (i === 2 ? { ...l, set_number: 2, weight_kg: 30 } : l)) });
    expect(a.kind).toBe('ok');
  });
  it('mobilidade/abdominal sem orientação de carga', () => {
    expect(isNoLoadExercise('ABDOMINAL INFRA')).toBe(true);
    expect(isNoLoadExercise('PRANCHA', 'Abdômen')).toBe(true);
    expect(isNoLoadExercise('SUPINO', 'Peito')).toBe(false);
  });
  it('tag exige 2 regressões nos últimos 14 dias', () => {
    const r = { kind: 'regression' as const, currentAt: NOW - 86400000 };
    expect(shouldTagRegression([r], NOW)).toBe(false);
    expect(shouldTagRegression([r, r], NOW)).toBe(true);
    expect(shouldTagRegression([r, { ...r, currentAt: NOW - 20 * 86400000 }], NOW)).toBe(false);
  });
});

import { isNoLoadExercise as noLoadRule } from '@/lib/consultoriaRegression';
import { buildWeeklyFocus } from '@/lib/weeklyCoachingFocus';

describe('exercícios sem carga ampliados', () => {
  it('reconhece prefixos, OMBRO exato, catálogo e grupos', () => {
    for (const n of ['ALONGAMENTO BACK', 'ESCAPULAR NA POLIA', 'Escorpião', 'PRANCHA LATERAL', 'Mountain climbers', 'MOUTAIN CLIMBERS', 'BEAR TO PLANK', 'OMBRO']) {
      expect(noLoadRule(n)).toBe(true);
    }
    expect(noLoadRule('OMBRO DESENVOLVIMENTO')).toBe(false);
    expect(noLoadRule('SUPINO RETO')).toBe(false);
    expect(noLoadRule('BURPEE', null, false)).toBe(true);
    expect(noLoadRule('ESTEIRA', 'Cardio')).toBe(true);
  });
  it('foco não gera "Revisar execução / registrar dados" para sem carga', () => {
    const items = buildWeeklyFocus({ performances: [{ exerciseName: 'ALONGAMENTO BACK', status: 'missing', nextAction: 'review' } as any] });
    expect(items).toHaveLength(0);
  });
});
