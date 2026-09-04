import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffWorkoutPlans } from '@/lib/workoutPlanDiff';
import { applyParsedDayToPlan } from '@/lib/workoutPlanEdit';
import {
  normalizeWorkoutPlan,
  workoutPlanToParsedDays,
  type WorkoutPlan,
  type WorkoutExercise,
} from '@/lib/workoutSchema';

/**
 * Etapa 2C — o fluxo da aba Treino do aluno (StudentTrainingTab) passou a ser
 * JSON-first: conteudo_json -> normalizeWorkoutPlan -> edição estruturada ->
 * saveWorkoutPlanJSON -> recordWorkoutPrescriptionEdit.
 *
 * Estes testes exercitam exatamente esse pipeline (sem markdown intermediário).
 */

const insertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: (row: unknown) => insertMock(row) }),
    auth: { getUser: () => getUserMock() },
  },
}));

import { recordWorkoutPrescriptionEdit } from '@/lib/prescriptionEdits';

const ex = (over: Partial<WorkoutExercise> & { id: string; exercise: string }): WorkoutExercise => ({
  series: '3',
  series2: '',
  reps: '8-12',
  rir: '2',
  pause: '60s',
  restSeconds: 60,
  description: '',
  variation: '',
  ...over,
});

/** Linha persistida em ai_plans (v2). */
const persistedRow = () => ({
  id: 'plan-1',
  version: 1,
  conteudo_json: {
    version: '2.0',
    type: 'workout',
    metadata: {},
    days: [
      {
        id: 'day1',
        day: 'Treino A',
        focus: '',
        exercises: [
          ex({ id: 'e1', exercise: 'Leg Press', exerciseId: 'cat-1' }),
          ex({ id: 'e2', exercise: 'Cadeira Extensora', exerciseId: 'cat-2' }),
          ex({ id: 'e3', exercise: 'Mesa Flexora', exerciseId: 'cat-3' }),
        ],
      },
    ],
  },
});

/** Simula a edição feita pela UI: dias parseados -> mutação -> volta ao plano. */
const editDay = (
  plan: WorkoutPlan,
  mutate: (days: ReturnType<typeof workoutPlanToParsedDays>) => void,
): WorkoutPlan => {
  const days = workoutPlanToParsedDays(plan);
  mutate(days);
  return applyParsedDayToPlan(plan, days[0], 0);
};

const baseline = (): WorkoutPlan => normalizeWorkoutPlan(persistedRow().conteudo_json) as WorkoutPlan;

const typesOf = (after: WorkoutPlan) => diffWorkoutPlans(baseline(), after).map((c) => c.type);

describe('StudentTrainingTab — edição JSON-first', () => {
  it('1. plano v2 carregado preserva day/exercise ids', () => {
    const plan = baseline();
    expect(plan.days[0].id).toBe('day1');
    expect(plan.days[0].exercises.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('2. alterar séries gera SETS_CHANGED', () => {
    const after = editDay(baseline(), (d) => { d[0].exercises[0].series = '4'; });
    expect(typesOf(after)).toContain('SETS_CHANGED');
  });

  it('3. alterar reps gera REPS_CHANGED', () => {
    const after = editDay(baseline(), (d) => { d[0].exercises[0].reps = '6-8'; });
    expect(typesOf(after)).toContain('REPS_CHANGED');
  });

  it('4. per_set gera PER_SET_REPS_CHANGED', () => {
    const after = editDay(baseline(), (d) => {
      d[0].exercises[0].setScheme = {
        mode: 'per_set',
        sets: [
          { set_number: 1, set_type: 'work', target_reps: '12' },
          { set_number: 2, set_type: 'work', target_reps: '10' },
        ],
      } as never;
    });
    expect(typesOf(after)).toContain('PER_SET_REPS_CHANGED');
  });

  it('5. alterar RIR gera RIR_CHANGED', () => {
    const after = editDay(baseline(), (d) => { d[0].exercises[0].rir = '1'; });
    expect(typesOf(after)).toContain('RIR_CHANGED');
  });

  it('6. alterar descanso gera REST_CHANGED', () => {
    const after = editDay(baseline(), (d) => { d[0].exercises[0].pause = '90s'; });
    expect(typesOf(after)).toContain('REST_CHANGED');
  });

  it('7. alterar variation gera VARIATION_CHANGED', () => {
    const after = editDay(baseline(), (d) => { d[0].exercises[0].variation = 'unilateral'; });
    expect(typesOf(after)).toContain('VARIATION_CHANGED');
  });

  it('8. reorder gera EXERCISE_REORDERED (não remove/add)', () => {
    const after = editDay(baseline(), (d) => {
      const list = d[0].exercises;
      list.unshift(list.pop()!);
    });
    const types = typesOf(after);
    expect(types).toContain('EXERCISE_REORDERED');
    expect(types).not.toContain('EXERCISE_ADDED');
    expect(types).not.toContain('EXERCISE_REMOVED');
    expect(after.days[0].exercises.map((e) => e.id)).toEqual(['e3', 'e1', 'e2']);
  });

  it('9. substituição no mesmo slot gera EXERCISE_REPLACED e preserva o id', () => {
    const after = editDay(baseline(), (d) => {
      d[0].exercises[0] = { ...d[0].exercises[0], exercise: 'Hack Machine', exerciseId: 'cat-9' };
    });
    expect(typesOf(after)).toContain('EXERCISE_REPLACED');
    expect(after.days[0].exercises[0].id).toBe('e1');
    expect(after.days[0].exercises[0].exerciseId).toBe('cat-9');
  });

  it('10. add e remove são registrados corretamente', () => {
    const added = editDay(baseline(), (d) => {
      d[0].exercises.push({
        exercise: 'Panturrilha em pé', series: '3', series2: '', reps: '15',
        rir: '1', pause: '45s', description: '', variation: '',
      });
    });
    expect(typesOf(added)).toContain('EXERCISE_ADDED');

    const removed = editDay(baseline(), (d) => { d[0].exercises.splice(1, 1); });
    const removedTypes = typesOf(removed);
    expect(removedTypes).toContain('EXERCISE_REMOVED');
    expect(removed.days[0].exercises.map((e) => e.id)).toEqual(['e1', 'e3']);
  });
});

describe('StudentTrainingTab — captura no save', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'prof-1' } } });
  });

  const args = { studentId: 'stu-1', planId: 'plan-1', source: 'manual_plan_editor' as const };

  it('11. save sem mudança no treino não cria registro', async () => {
    const r = await recordWorkoutPrescriptionEdit({ before: baseline(), after: baseline(), ...args });
    expect(r).toEqual({ recorded: false, reason: 'no_changes' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('12. mudar somente fase/data não cria registro (plano idêntico)', async () => {
    // A UI só chama a captura no caminho JSON; fase/data isoladas nem chegam aqui.
    const r = await recordWorkoutPrescriptionEdit({ before: baseline(), after: baseline(), ...args });
    expect(r.recorded).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('13. AI Adjust Geral grava action_origin = ai_assisted', async () => {
    const after = editDay(baseline(), (d) => { d[0].exercises[0].reps = '10-12'; });
    const r = await recordWorkoutPrescriptionEdit({
      before: baseline(), after, ...args, actionOrigin: 'ai_assisted',
    });
    expect(r.recorded).toBe(true);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      source: 'manual_plan_editor',
      action_origin: 'ai_assisted',
      professor_id: 'prof-1',
      student_id: 'stu-1',
    });
  });

  it('14. aplicar template não gera captura (nenhuma chamada)', async () => {
    // Template substitui o plano inteiro sem passar por recordWorkoutPrescriptionEdit.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('15. legacy sem JSON confiável não produz diff capturável', async () => {
    const r = await recordWorkoutPrescriptionEdit({ before: null, after: baseline(), ...args });
    expect(r).toEqual({ recorded: false, reason: 'missing_data' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('16/17. baseline avança: o segundo save compara contra o último estado salvo', async () => {
    const first = editDay(baseline(), (d) => { d[0].exercises[0].series = '4'; });
    const r1 = await recordWorkoutPrescriptionEdit({ before: baseline(), after: first, ...args });
    expect(r1.recorded).toBe(true);

    // baseline := first
    const second = editDay(first, (d) => { d[0].exercises[1].rir = '0'; });
    const r2 = await recordWorkoutPrescriptionEdit({ before: first, after: second, ...args });
    expect(r2.recorded).toBe(true);
    if (r2.recorded) {
      const types = r2.changes.map((c) => c.type);
      expect(types).toEqual(['RIR_CHANGED']);
      expect(types).not.toContain('SETS_CHANGED');
    }
  });

  it('18. save manual real grava source, origin e changes', async () => {
    const after = editDay(baseline(), (d) => {
      d[0].exercises[0].series = '4';
      d[0].exercises[0].reps = '6-8';
    });
    const r = await recordWorkoutPrescriptionEdit({ before: baseline(), after, ...args });
    expect(r.recorded).toBe(true);
    const row = insertMock.mock.calls[0][0] as { changes: unknown[]; action_origin: string };
    expect(row.action_origin).toBe('manual');
    expect(row.changes.length).toBeGreaterThan(0);
  });
});
