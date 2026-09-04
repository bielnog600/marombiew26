import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffWorkoutPlans, workoutPlansAreEquivalent } from '@/lib/workoutPlanDiff';
import type { WorkoutPlan, WorkoutExercise } from '@/lib/workoutSchema';

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

const plan = (exercises: WorkoutExercise[], dayId = 'day1', dayName = 'Treino A'): WorkoutPlan => ({
  version: '2.0',
  type: 'workout',
  metadata: {},
  days: [{ id: dayId, day: dayName, focus: '', exercises }],
});

const base = () =>
  plan([
    ex({ id: 'e1', exercise: 'Supino Reto', exerciseId: 'cat-1' }),
    ex({ id: 'e2', exercise: 'Remada Curvada', exerciseId: 'cat-2' }),
  ]);

const types = (p1: WorkoutPlan, p2: WorkoutPlan) => diffWorkoutPlans(p1, p2).map((c) => c.type);

describe('diffWorkoutPlans — eventos estruturais', () => {
  it('1. planos idênticos não geram eventos', () => {
    expect(diffWorkoutPlans(base(), base())).toEqual([]);
    expect(workoutPlansAreEquivalent(base(), base())).toBe(true);
  });

  it('2. exercício adicionado gera EXERCISE_ADDED', () => {
    const after = base();
    after.days[0].exercises.push(ex({ id: 'e3', exercise: 'Crucifixo' }));
    const changes = diffWorkoutPlans(base(), after);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('EXERCISE_ADDED');
    expect(changes[0].exercise_after).toBe('Crucifixo');
    expect(changes[0].position_after).toBe(3);
  });

  it('3. exercício removido gera EXERCISE_REMOVED', () => {
    const after = plan([base().days[0].exercises[0]]);
    const changes = diffWorkoutPlans(base(), after);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('EXERCISE_REMOVED');
    expect(changes[0].exercise_id).toBe('e2');
  });

  it('4. substituição no mesmo slot gera EXERCISE_REPLACED (nunca remove+add)', () => {
    const after = base();
    after.days[0].exercises[0] = ex({ id: 'e1', exercise: 'Supino Inclinado', exerciseId: 'cat-9' });
    const changes = diffWorkoutPlans(base(), after);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('EXERCISE_REPLACED');
    expect(changes[0].exercise_id).toBe('e1');
    expect(changes[0].before).toEqual({ exercise: 'Supino Reto', exerciseId: 'cat-1' });
    expect(changes[0].after).toEqual({ exercise: 'Supino Inclinado', exerciseId: 'cat-9' });
  });

  it('5. troca só de exerciseId (mesmo nome) também é substituição', () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], exerciseId: 'cat-99' };
    expect(types(base(), after)).toEqual(['EXERCISE_REPLACED']);
  });

  it('6. substituição não infla evidência com diffs de prescrição', () => {
    const after = base();
    after.days[0].exercises[0] = ex({ id: 'e1', exercise: 'Crucifixo', reps: '15', rir: '0', pause: '30s' });
    expect(types(base(), after)).toEqual(['EXERCISE_REPLACED']);
  });

  it('7. reorder gera EXERCISE_REORDERED com reorder_operation_id', () => {
    const b = base();
    const after = plan([b.days[0].exercises[1], b.days[0].exercises[0]]);
    const changes = diffWorkoutPlans(b, after);
    expect(changes.every((c) => c.type === 'EXERCISE_REORDERED')).toBe(true);
    expect(new Set(changes.map((c) => c.metadata.reorder_operation_id)).size).toBe(1);
    expect(changes[0].position_before).toBe(2);
    expect(changes[0].position_after).toBe(1);
  });

  it('8. reorder nunca vira remove + add', () => {
    const b = base();
    const after = plan([b.days[0].exercises[1], b.days[0].exercises[0]]);
    expect(types(b, after)).not.toContain('EXERCISE_REMOVED');
    expect(types(b, after)).not.toContain('EXERCISE_ADDED');
  });
});

describe('diffWorkoutPlans — campos de prescrição', () => {
  it('9. séries de trabalho geram SETS_CHANGED', () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], series: '4' };
    expect(types(base(), after)).toEqual(['SETS_CHANGED']);
  });

  it('10. séries de reconhecimento geram RECOGNITION_SETS_CHANGED', () => {
    const b = plan([ex({ id: 'e1', exercise: 'Agachamento', series: '1', series2: '3' })]);
    const a = plan([ex({ id: 'e1', exercise: 'Agachamento', series: '2', series2: '3' })]);
    expect(types(b, a)).toEqual(['RECOGNITION_SETS_CHANGED']);
  });

  it('11. reps textuais geram REPS_CHANGED', () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], reps: '6-8' };
    expect(types(base(), after)).toEqual(['REPS_CHANGED']);
  });

  it('12. per-set reps usam setScheme e geram PER_SET_REPS_CHANGED', () => {
    const scheme = (reps: string[]) => ({
      mode: 'per_set' as const,
      sets: reps.map((r, i) => ({ set_number: i + 1, set_type: 'work' as const, target_reps: r })),
    });
    const b = plan([ex({ id: 'e1', exercise: 'Leg Press', setScheme: scheme(['12', '10', '8']) })]);
    const a = plan([ex({ id: 'e1', exercise: 'Leg Press', setScheme: scheme(['12', '10', '6']) })]);
    expect(types(b, a)).toEqual(['PER_SET_REPS_CHANGED']);
  });

  it('13. ordem interna dos sets não altera a assinatura per-set', () => {
    const sets = [
      { set_number: 1, set_type: 'work' as const, target_reps: '10' },
      { set_number: 2, set_type: 'work' as const, target_reps: '8' },
    ];
    const b = plan([ex({ id: 'e1', exercise: 'Leg Press', setScheme: { mode: 'per_set', sets } })]);
    const a = plan([
      ex({ id: 'e1', exercise: 'Leg Press', setScheme: { mode: 'per_set', sets: [sets[1], sets[0]] } }),
    ]);
    expect(diffWorkoutPlans(b, a)).toEqual([]);
  });

  it('14. RIR alterado gera RIR_CHANGED', () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '0' };
    expect(types(base(), after)).toEqual(['RIR_CHANGED']);
  });

  it('15. descanso usa restSeconds como campo estruturado', () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], restSeconds: 90, pause: '90s' };
    const changes = diffWorkoutPlans(base(), after);
    expect(changes.map((c) => c.type)).toEqual(['REST_CHANGED']);
    expect(changes[0].after).toMatchObject({ restSeconds: 90 });
  });

  it('16. pause equivalente sem mudança real não gera evento', () => {
    const b = plan([ex({ id: 'e1', exercise: 'Supino', pause: '60s', restSeconds: 60 })]);
    const a = plan([ex({ id: 'e1', exercise: 'Supino', pause: '1min', restSeconds: 60 })]);
    expect(diffWorkoutPlans(b, a)).toEqual([]);
  });

  it('17. variação, descrição, tempo e notas geram seus eventos', () => {
    const b = plan([ex({ id: 'e1', exercise: 'Supino', variation: 'A', description: 'x', tempo: '2010', notes: 'n1' })]);
    const a = plan([ex({ id: 'e1', exercise: 'Supino', variation: 'B', description: 'y', tempo: '3010', notes: 'n2' })]);
    expect(types(b, a)).toEqual([
      'VARIATION_CHANGED',
      'DESCRIPTION_CHANGED',
      'TEMPO_CHANGED',
      'NOTES_CHANGED',
    ]);
  });

  it('18. nome do dia alterado gera DAY_CHANGED', () => {
    const b = base();
    const a = plan(b.days[0].exercises, 'day1', 'Treino A - Peito');
    expect(types(b, a)).toEqual(['DAY_CHANGED']);
  });

  it('19. diff é determinístico (mesma entrada, mesma saída)', () => {
    const b = base();
    const a = base();
    a.days[0].exercises[1] = { ...a.days[0].exercises[1], reps: '10' };
    expect(JSON.stringify(diffWorkoutPlans(b, a))).toBe(JSON.stringify(diffWorkoutPlans(b, a)));
  });
});

// ---- Captura ----

const insertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: (row: unknown) => insertMock(row) }),
    auth: { getUser: () => getUserMock() },
  },
}));

import { recordWorkoutPrescriptionEdit, buildPrescriptionContextSnapshot } from '@/lib/prescriptionEdits';

describe('recordWorkoutPrescriptionEdit — captura no save', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'prof-1' } } });
  });

  const args = {
    studentId: 'stu-1',
    planId: 'plan-1',
    source: 'manual_plan_editor' as const,
  };

  it('20. save sem mudança real não cria registro', async () => {
    const r = await recordWorkoutPrescriptionEdit({ before: base(), after: base(), ...args });
    expect(r).toEqual({ recorded: false, reason: 'no_changes' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('21. edição real cria registro com professor autenticado', async () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], reps: '5' };
    const r = await recordWorkoutPrescriptionEdit({ before: base(), after, ...args });
    expect(r.recorded).toBe(true);
    const row = insertMock.mock.calls[0][0];
    expect(row.professor_id).toBe('prof-1');
    expect(row.student_id).toBe('stu-1');
    expect(row.source).toBe('manual_plan_editor');
    expect(row.action_origin).toBe('manual');
    expect(row.exclude_from_profile).toBeUndefined();
    expect(row.changes).toHaveLength(1);
  });

  it('22. origem ai_assisted é registrada', async () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '1' };
    await recordWorkoutPrescriptionEdit({ before: base(), after, ...args, actionOrigin: 'ai_assisted' });
    expect(insertMock.mock.calls[0][0].action_origin).toBe('ai_assisted');
  });

  it('23. sem usuário autenticado não grava', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '1' };
    const r = await recordWorkoutPrescriptionEdit({ before: base(), after, ...args });
    expect(r).toEqual({ recorded: false, reason: 'no_professor' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('24. o próprio aluno nunca é registrado como professor', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'stu-1' } } });
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '1' };
    const r = await recordWorkoutPrescriptionEdit({ before: base(), after, ...args });
    expect(r).toEqual({ recorded: false, reason: 'no_professor' });
  });

  it('25. falta de plano ANTES não grava', async () => {
    const r = await recordWorkoutPrescriptionEdit({ before: null, after: base(), ...args });
    expect(r).toEqual({ recorded: false, reason: 'missing_data' });
  });

  it('26. erro no banco não lança exceção', async () => {
    insertMock.mockResolvedValue({ error: { message: 'boom' } });
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '1' };
    const r = await recordWorkoutPrescriptionEdit({ before: base(), after, ...args });
    expect(r).toMatchObject({ recorded: false, reason: 'error' });
  });

  it('27. context_snapshot é congelado com os campos exigidos', async () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '1' };
    await recordWorkoutPrescriptionEdit({
      before: base(),
      after,
      ...args,
      context: {
        objective: 'hipertrofia',
        level: 'intermediario',
        daysPerWeek: '4',
        periodization: { model: 'linear', block_type: 'acumulacao', block_number: 2, week: 3 },
        restrictions: { status: 'reviewed', explicit_restrictions: ['ombro'], pain_flags: ['dor'] },
        sessionContext: { day_id: 'day1', day_name: 'Treino A', session_role: 'main' },
      },
    });
    const snap = insertMock.mock.calls[0][0].context_snapshot;
    expect(snap.objective).toBe('hipertrofia');
    expect(snap.days_per_week).toBe(4);
    expect(snap.periodization.block_number).toBe(2);
    expect(snap.restrictions.pain_flags).toEqual(['dor']);
    expect(snap.session_context.day_id).toBe('day1');
    expect(typeof snap.captured_at).toBe('string');
  });

  it('28. contexto vazio produz snapshot neutro (sem inferência)', () => {
    const snap = buildPrescriptionContextSnapshot();
    expect(snap.objective).toBeNull();
    expect(snap.priority_muscles).toEqual([]);
    expect(snap.periodization.model).toBeNull();
    expect(snap.session_context.session_role).toBe('unknown');
  });

  it('29. modo treino usa source manual_training_mode', async () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '1' };
    await recordWorkoutPrescriptionEdit({ before: base(), after, ...args, source: 'manual_training_mode' });
    expect(insertMock.mock.calls[0][0].source).toBe('manual_training_mode');
  });

  it('30. before_json e after_json são gravados integralmente', async () => {
    const after = base();
    after.days[0].exercises[0] = { ...after.days[0].exercises[0], rir: '1' };
    await recordWorkoutPrescriptionEdit({ before: base(), after, ...args });
    const row = insertMock.mock.calls[0][0];
    expect(row.before_json.days[0].exercises[0].rir).toBe('2');
    expect(row.after_json.days[0].exercises[0].rir).toBe('1');
  });
});
