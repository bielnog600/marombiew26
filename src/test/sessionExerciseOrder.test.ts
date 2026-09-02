import { describe, it, expect } from 'vitest';
import {
  buildExerciseUids,
  makeExerciseUid,
  reorderExercisesByUid,
  resolveCurrentIndexAfterReorder,
} from '@/lib/sessionExerciseOrder';

interface Ex { exercise: string }
interface St { weight: string; savedSets: number }

const setup = () => {
  const exercises: Ex[] = [
    { exercise: 'SUPINO' },
    { exercise: 'LEG PRESS' },
    { exercise: 'REMADA' },
    { exercise: 'CADEIRA EXTENSORA' },
  ];
  const states: Record<number, St> = {
    0: { weight: '40', savedSets: 3 },
    1: { weight: '120', savedSets: 0 },
    2: { weight: '60', savedSets: 0 },
    3: { weight: '50', savedSets: 0 },
  };
  const uids = buildExerciseUids(exercises.length);
  return { exercises, states, uids };
};

describe('sessionExerciseOrder', () => {
  it('gera uids únicos e estáveis', () => {
    const a = makeExerciseUid();
    const b = makeExerciseUid();
    expect(a).not.toBe(b);
    const uids = buildExerciseUids(3);
    const kept = buildExerciseUids(4, uids);
    expect(kept.slice(0, 3)).toEqual(uids);
    expect(new Set(kept).size).toBe(4);
  });

  it('move exercício, estado e uid juntos (dados seguem o exercício)', () => {
    const { exercises, states, uids } = setup();
    // CADEIRA EXTENSORA (idx 3) -> posição 1 (onde estava LEG PRESS)
    const res = reorderExercisesByUid(exercises, states, uids, uids[3], uids[1]);
    expect(res).not.toBeNull();
    expect(res!.exercises.map((e) => e.exercise)).toEqual([
      'SUPINO',
      'CADEIRA EXTENSORA',
      'LEG PRESS',
      'REMADA',
    ]);
    // 50kg continua com a CADEIRA EXTENSORA; 120kg continua com o LEG PRESS
    expect(res!.states[1].weight).toBe('50');
    expect(res!.states[2].weight).toBe('120');
    // exercício concluído permanece concluído
    expect(res!.states[0].savedSets).toBe(3);
    expect(res!.uids[1]).toBe(uids[3]);
    expect(new Set(res!.uids).size).toBe(4);
  });

  it('preserva quantidade e não duplica', () => {
    const { exercises, states, uids } = setup();
    const res = reorderExercisesByUid(exercises, states, uids, uids[0], uids[3])!;
    expect(res.exercises).toHaveLength(4);
    expect(new Set(res.exercises.map((e) => e.exercise)).size).toBe(4);
    expect(Object.keys(res.states)).toHaveLength(4);
  });

  it('é idempotente ao reaplicar a mesma ordem', () => {
    const { exercises, states, uids } = setup();
    const first = reorderExercisesByUid(exercises, states, uids, uids[3], uids[1])!;
    const again = reorderExercisesByUid(
      first.exercises,
      first.states,
      first.uids,
      first.uids[1],
      first.uids[1],
    );
    expect(again).toBeNull();
  });

  it('retorna null para uid inexistente', () => {
    const { exercises, states, uids } = setup();
    expect(reorderExercisesByUid(exercises, states, uids, 'nope', uids[1])).toBeNull();
  });

  it('recalcula o índice do exercício atual pela identidade', () => {
    const { exercises, states, uids } = setup();
    const currentUid = uids[3];
    const res = reorderExercisesByUid(exercises, states, uids, uids[3], uids[1])!;
    expect(resolveCurrentIndexAfterReorder(res.uids, currentUid)).toBe(1);
    expect(resolveCurrentIndexAfterReorder(res.uids, null)).toBeNull();
  });
});
