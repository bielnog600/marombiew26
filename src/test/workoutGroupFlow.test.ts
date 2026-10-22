import { describe, expect, it } from 'vitest';
import { nextGroupStep } from '@/hooks/useWorkoutGroupFlow';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';

const ex = (ordem: 'A' | 'B', pausa = 10): ParsedExercise => ({
  exercise: ordem === 'A' ? 'Supino inclinado halteres' : 'Puxada alta neutra',
  series: '3', reps: '8-10', pause: '90s',
  grupo_id: 'g1', tipo_grupo: 'superset', ordem_grupo: ordem, pausa_grupo_s: pausa,
} as ParsedExercise);

const exercises = [ex('A'), ex('B')];
const indices = [0, 1];
const sets = (a: boolean[], b: boolean[]): Record<number, MethodSetEntry[]> => ({
  0: a.map(c => ({ weight: '', reps: '', completed: c })),
  1: b.map(c => ({ weight: '', reps: '', completed: c })),
});

describe('nextGroupStep', () => {
  it('par ausente ou índice fora do array não dispara transição de grupo', () => {
    expect(nextGroupStep([ex('A')], [0, 1], 0, 0, sets([true], []), 90)).toBeNull();
    expect(nextGroupStep([ex('A'), null] as unknown as ParsedExercise[], [0, 1], 0, 0, sets([true], []), 90)).toBeNull();
    expect(nextGroupStep(exercises, [-1, 1], 1, 0, sets([true], [true]), 90)).toBeNull();
  });
  it('série do A concluída → troca para o B com a pausa do grupo (10s)', () => {
    const step = nextGroupStep(exercises, indices, 0, 0, sets([true, false, false], [false, false, false]), 90);
    expect(step).toEqual({ kind: 'swap', nextIndex: 1, seconds: 10, setIndex: 0 });
  });

  it('pausa A→B = 0s → troca direta, sem overlay de contagem', () => {
    const zero = [ex('A', 0), ex('B')];
    const step = nextGroupStep(zero, indices, 0, 0, sets([true, false, false], [false, false, false]), 90);
    expect(step).toEqual({ kind: 'swap', nextIndex: 1, seconds: 0, setIndex: 0 });
  });

  it('série do B concluída → descanso do grupo e volta para o A na série seguinte', () => {
    const step = nextGroupStep(exercises, indices, 1, 0, sets([true, false, false], [true, false, false]), 90);
    expect(step).toEqual({ kind: 'rest', nextIndex: 0, seconds: 90, setIndex: 1 });
  });

  it('última série do B concluída → grupo concluído', () => {
    const step = nextGroupStep(exercises, indices, 1, 2, sets([true, true, true], [true, true, true]), 90);
    expect(step).toEqual({ kind: 'done' });
  });

  it('B concluído antes do A (ordem manual) → volta para o A sem pausa', () => {
    const step = nextGroupStep(exercises, indices, 1, 0, sets([false, false, false], [true, false, false]), 90);
    expect(step).toEqual({ kind: 'swap', nextIndex: 0, seconds: 0, setIndex: 0 });
  });

  it('fora de grupo (índice único) → sem fluxo de grupo', () => {
    expect(nextGroupStep(exercises, [0], 0, 0, sets([true], []), 90)).toBeNull();
  });
});
