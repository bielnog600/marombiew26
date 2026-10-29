import { describe, expect, it } from 'vitest';
import { buildActivityExercises } from '@/lib/adminActivityExercises';
import { exerciseProgress } from '@/lib/adminExerciseProgress';

const plans = [
  ['MOBILIDADE TORÁCICA 5', 'MOBILIDADE TORÁCICA 4', '1'],
  ['FACE PULL', 'CRUCIFIXO INVERSO BANCO', '3'],
  ['REMADA PRONADA BANCO', 'REMADA PRONADA MÁQUINA', '3'],
  ['SUPINO RETO', 'SUPINO RETO HALTERES', '3'],
  ['PULL DOWN', 'PULLDOWN', '3'],
  ['PUXADA NA POLIA', 'PUXADA ALTA UNIL.', '3'],
  ['ELEVAÇÃO LATERAL MÁQ.', 'ELEVAÇÃO LATERAL', '3'],
  ['TRÍCEPS BARRA', 'TRÍCEPS BARRA 2', '3'],
  ['ABDOMINAL BOLA SUIÇA', 'ABDOMINAL SUPRA PESO 2', '3'],
].map(([exercise, variation, series], i) => ({ id: `slot-${i}`, exercise, variation, series, reps: '12-15' }));
const executed = plans.map((p, i) => [2, 4, 6, 7].includes(i) ? p.variation : p.exercise);
const logs = plans.flatMap((p, i) => Array.from({ length: Number(p.series) }, (_, set) => ({
  exercise_name: executed[i], exercise_slot_id: null, set_number: set + 1, reps: 12, weight_kg: 30, set_type: 'work',
})));

describe('admin summary variation assembly', () => {
  it('Thalita Thursday: nine performed exercises, four variations, 25/25 sets in planned order', () => {
    const result = buildActivityExercises({}, [...logs].reverse(), plans);
    expect(result.map(e => e.name)).toEqual(executed);
    expect(result).toHaveLength(9);
    expect(result.reduce((n, e) => n + e.planned, 0)).toBe(25);
    expect(result.reduce((n, e) => n + e.sets.filter(s => s.completed).length, 0)).toBe(25);
    expect(result.filter(e => e.variationOf).map(e => e.variationOf)).toEqual([
      'REMADA PRONADA BANCO', 'PULL DOWN', 'ELEVAÇÃO LATERAL MÁQ.', 'TRÍCEPS BARRA',
    ]);
  });
  it('normalizes original and variation names without merging different names by fuzzy matching', () => {
    const result = buildActivityExercises({}, [{ ...logs[0], exercise_name: ' elevacao   lateral ' }], [plans[6]]);
    expect(result).toHaveLength(1);
    expect(result[0].plan).toBe(plans[6]);
    expect(result[0].variationOf).toBe('ELEVAÇÃO LATERAL MÁQ.');
  });
  it('keeps an unmatched execution as an extra and missing planned sets as incomplete', () => {
    const result = buildActivityExercises({}, [{ ...logs[0], exercise_name: 'EXTRA', set_number: 1 }], [plans[4]]);
    expect(result.map(e => e.name)).toEqual(['PULL DOWN', 'EXTRA']);
    expect(result[0].sets.filter(s => s.completed)).toHaveLength(0);
    expect(result[1].planned).toBe(1);
  });
  it('prioritizes slot IDs for repeated names and does not duplicate original/variation logs in one planned slot', () => {
    const result = buildActivityExercises({}, [
      { ...logs[0], exercise_name: 'PULL DOWN', exercise_slot_id: 'slot-4' },
      { ...logs[0], exercise_name: 'PULLDOWN', exercise_slot_id: 'slot-4', set_number: 2 },
    ], [plans[4], { ...plans[4], id: 'other-slot' }]);
    expect(result).toHaveLength(2);
    expect(result[0].sets.filter(s => s.completed)).toHaveLength(2);
    expect(result[1].sets.filter(s => s.completed)).toHaveLength(0);
  });
  it('uses history of the executed variation rather than history of the original', () => {
    const ex = buildActivityExercises({}, logs, plans)[4];
    const history = [
      { exercise_name: 'PULL DOWN', weight_kg: 100, reps: 12 },
      { exercise_name: 'PULLDOWN', weight_kg: 25, reps: 12 },
    ].map(row => ({ ...row, session_id: 'previous', performed_at: '2026-10-28T10:00:00Z' }));
    const progress = exerciseProgress(ex.name, ex.sets, history, 'current', '2026-10-29T20:51:00Z', ex.plan);
    expect(progress.lastLoad).toBe(25);
    expect(progress.todayLoad).toBe(30);
    expect(progress.status).toBe('up');
  });
  it('preserves live state indices, draft completion and variation plan association', () => {
    const result = buildActivityExercises({ session_state: {
      exerciseNames: ['PULLDOWN'], exerciseSlotIds: ['slot-4'], plannedSets: [3],
      sets: [[{ weight: 30, reps: 12, completed: false }]], plannedSetTypes: [['work']],
    } }, [], plans);
    expect(result).toHaveLength(1);
    expect(result[0].variationOf).toBe('PULL DOWN');
    expect(result[0].sets[0]).toMatchObject({ completed: false, set_type: 'work' });
  });
});