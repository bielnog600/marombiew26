import { describe, it, expect } from 'vitest';
import { applyParsedDayToPlan, replacePlanExercise } from '@/lib/workoutPlanEdit';
import { workoutPlanToParsedDays, type WorkoutPlan } from '@/lib/workoutSchema';

const plan = (): WorkoutPlan => ({
  version: 2,
  days: [
    {
      id: 'day_1',
      day: 'Segunda',
      exercises: [
        { id: 'ex_a', exercise: 'Supino', exerciseId: 'cat_1', series: '3', series2: '', reps: '10', rir: '2', pause: '60s', restSeconds: 60, description: '', variation: '', notes: 'nota A' },
        { id: 'ex_b', exercise: 'Remada', series: '3', series2: '', reps: '10', rir: '2', pause: '60s', restSeconds: 60, description: '', variation: '' },
      ],
    },
  ],
} as unknown as WorkoutPlan);

describe('workoutPlanEdit — identidade', () => {
  it('preserva ids ao editar campos', () => {
    const p = plan();
    const days = workoutPlanToParsedDays(p);
    days[0].exercises[0].reps = '12';
    const next = applyParsedDayToPlan(p, days[0]);
    expect(next.days[0].exercises.map((e) => e.id)).toEqual(['ex_a', 'ex_b']);
    expect(next.days[0].exercises[0].reps).toBe('12');
    expect(next.days[0].exercises[0].notes).toBe('nota A');
  });

  it('reorder move a identidade junto', () => {
    const p = plan();
    const days = workoutPlanToParsedDays(p);
    days[0].exercises.reverse();
    const next = applyParsedDayToPlan(p, days[0]);
    expect(next.days[0].exercises.map((e) => e.id)).toEqual(['ex_b', 'ex_a']);
    expect(next.days[0].exercises[0].exercise).toBe('Remada');
  });

  it('remover apaga só o slot; adicionar cria id novo', () => {
    const p = plan();
    const days = workoutPlanToParsedDays(p);
    days[0].exercises.splice(0, 1);
    days[0].exercises.push({ exercise: 'Crucifixo', series: '3', series2: '', reps: '12', rir: '2', pause: '60s', description: '', variation: '' });
    const next = applyParsedDayToPlan(p, days[0]);
    const ids = next.days[0].exercises.map((e) => e.id);
    expect(ids[0]).toBe('ex_b');
    expect(ids[1]).not.toBe('ex_a');
    expect(new Set(ids).size).toBe(2);
  });

  it('substituição preserva o id do slot e troca exerciseId', () => {
    const p = plan();
    const days = workoutPlanToParsedDays(p);
    days[0].exercises[0] = { ...days[0].exercises[0], exercise: 'Supino Inclinado', exerciseId: 'cat_9' };
    const next = applyParsedDayToPlan(p, days[0]);
    expect(next.days[0].exercises[0].id).toBe('ex_a');
    expect(next.days[0].exercises[0].exerciseId).toBe('cat_9');
  });

  it('substituição sem catálogo não herda exerciseId antigo', () => {
    const p = plan();
    const days = workoutPlanToParsedDays(p);
    days[0].exercises[0] = { ...days[0].exercises[0], exercise: 'Crossover', exerciseId: undefined };
    const next = applyParsedDayToPlan(p, days[0]);
    expect(next.days[0].exercises[0].id).toBe('ex_a');
    expect(next.days[0].exercises[0].exerciseId).toBeUndefined();
  });

  it('replacePlanExercise troca no slot certo', () => {
    const next = replacePlanExercise(plan(), 'ex_b', { exercise: 'Puxada', exerciseId: 'cat_5' });
    expect(next.days[0].exercises[1]).toMatchObject({ id: 'ex_b', exercise: 'Puxada', exerciseId: 'cat_5' });
    expect(next.days[0].exercises[0].exercise).toBe('Supino');
  });
});
