import { describe, it, expect } from 'vitest';
import {
  buildProfessorPrescriptionProfile,
  doesExerciseMatchPriority,
  type WorkoutPrescriptionEditRecord,
  type PrescriptionEditChange,
} from '../../supabase/functions/_shared/professorPrescriptionProfile';

const PROF = 'prof-1';

const edit = (
  over: Partial<WorkoutPrescriptionEditRecord> & { changes: PrescriptionEditChange[] },
): WorkoutPrescriptionEditRecord => ({
  professor_id: PROF,
  student_id: 'stu-1',
  plan_id: 'plan-1',
  cycle_key: null,
  source: 'manual_plan_editor',
  action_origin: 'manual',
  exclude_from_profile: false,
  context_snapshot: { level: 'avancado', priority_muscles: [] },
  ...over,
});

const setsChange = (
  exercise: string,
  before: number,
  after: number,
): PrescriptionEditChange => ({
  type: 'SETS_CHANGED',
  day_id: 'd1',
  day_name: 'A',
  exercise_id: `ex-${exercise}`,
  exercise_before: exercise,
  exercise_after: exercise,
  before: { series: String(before), series2: '', setScheme: null },
  after: { series: String(after), series2: '', setScheme: null },
  metadata: {},
});

const find = (profile: ReturnType<typeof buildProfessorPrescriptionProfile>, category: string) =>
  profile.preferences.find((p) => p.category === category);

describe('Etapa 3 — evidência', () => {
  it('1. um SETS_CHANGED gera evidência de direção', () => {
    const p = buildProfessorPrescriptionProfile([edit({ changes: [setsChange('Cadeira Extensora', 3, 4)] })]);
    const pref = find(p, 'SETS')!;
    expect(pref.pattern.direction).toBe('increase');
    expect(pref.pattern.typical_delta).toBe(1);
  });

  it('2. três eventos na mesma ficha contam 3 events e 1 caso', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({
        changes: [
          setsChange('Cadeira Extensora', 3, 4),
          setsChange('Mesa Flexora', 3, 4),
          setsChange('Panturrilha em pé', 3, 4),
        ],
      }),
    ]);
    const pref = find(p, 'SETS')!;
    expect(pref.evidence.supporting_event_count).toBe(3);
    expect(pref.evidence.supporting_case_count).toBe(1);
  });

  it('3. três alunos diferentes contam 3 distinct_student_count', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ student_id: 's1', plan_id: 'p1', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      edit({ student_id: 's2', plan_id: 'p2', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      edit({ student_id: 's3', plan_id: 'p3', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
    ]);
    expect(find(p, 'SETS')!.evidence.distinct_student_count).toBe(3);
  });

  it('4. cinco ciclos da mesma aluna = 5 casos, 1 aluno', () => {
    const p = buildProfessorPrescriptionProfile(
      [1, 2, 3, 4, 5].map((i) =>
        edit({ plan_id: `p${i}`, cycle_key: `c${i}`, changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      ),
    );
    const ev = find(p, 'SETS')!.evidence;
    expect(ev.supporting_case_count).toBe(5);
    expect(ev.distinct_student_count).toBe(1);
    expect(ev.longitudinal_support).toBe(true);
  });

  it('5. exclude_from_profile = true é ignorado', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ exclude_from_profile: true, changes: [setsChange('Cadeira Extensora', 3, 4)] }),
    ]);
    expect(p.preferences).toHaveLength(0);
    expect(p.generated_from.excluded_count).toBe(1);
  });

  it('6. ai_assisted é ignorado', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ action_origin: 'ai_assisted', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
    ]);
    expect(p.preferences).toHaveLength(0);
    expect(p.generated_from.ignored_ai_assisted).toBe(1);
  });

  it('7. save sem changes não entra', () => {
    const p = buildProfessorPrescriptionProfile([edit({ changes: [] })]);
    expect(p.generated_from.total_manual_edits).toBe(0);
    expect(p.generated_from.ignored_empty_edits).toBe(1);
  });

  it('8. campos não editados não geram preference', () => {
    const p = buildProfessorPrescriptionProfile([edit({ changes: [setsChange('Cadeira Extensora', 3, 4)] })]);
    expect(p.preferences.map((x) => x.category)).toEqual(['SETS']);
  });
});

describe('Etapa 3 — confidence', () => {
  it('9. 1 caso consistente tem confidence baixa', () => {
    const p = buildProfessorPrescriptionProfile([edit({ changes: [setsChange('Cadeira Extensora', 3, 4)] })]);
    expect(find(p, 'SETS')!.confidence).toBeLessThan(0.25);
  });

  it('10. 5 casos com 1 aluno continua limitado pelo cross_student_factor', () => {
    const p = buildProfessorPrescriptionProfile(
      [1, 2, 3, 4, 5].map((i) =>
        edit({ plan_id: `p${i}`, changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      ),
    );
    // consistency 1 * evidence 1 * (0.6 + 0.4 * 1/3) = 0.733
    expect(find(p, 'SETS')!.confidence).toBeCloseTo(0.733, 2);
  });

  it('11. 5 casos com 3 alunos tem confidence maior', () => {
    const students = ['s1', 's1', 's2', 's2', 's3'];
    const p = buildProfessorPrescriptionProfile(
      students.map((s, i) =>
        edit({ student_id: s, plan_id: `p${i}`, changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      ),
    );
    expect(find(p, 'SETS')!.confidence).toBeCloseTo(0.85, 2);
  });

  it('12. 5 support + 5 opposition = consistency 0.5', () => {
    const rows = [
      ...[1, 2, 3, 4, 5].map((i) => edit({ plan_id: `up${i}`, changes: [setsChange('Cadeira Extensora', 3, 4)] })),
      ...[1, 2, 3, 4, 5].map((i) => edit({ plan_id: `dn${i}`, changes: [setsChange('Cadeira Extensora', 4, 3)] })),
    ];
    expect(find(buildProfessorPrescriptionProfile(rows), 'SETS')!.consistency).toBe(0.5);
  });

  it('13. confidence nunca passa de 0.85', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      edit({ student_id: `s${i}`, plan_id: `p${i}`, changes: [setsChange('Cadeira Extensora', 3, 4)] }),
    );
    const p = buildProfessorPrescriptionProfile(rows);
    expect(p.preferences.every((x) => x.confidence <= 0.85)).toBe(true);
  });

  it('14/15. generalizable depende de >= 2 alunos', () => {
    const one = buildProfessorPrescriptionProfile([edit({ changes: [setsChange('Cadeira Extensora', 3, 4)] })]);
    expect(find(one, 'SETS')!.generalizable).toBe(false);
    const two = buildProfessorPrescriptionProfile([
      edit({ student_id: 's1', plan_id: 'p1', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      edit({ student_id: 's2', plan_id: 'p2', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
    ]);
    expect(find(two, 'SETS')!.generalizable).toBe(true);
  });
});

describe('Etapa 3 — contexto', () => {
  it('16. avançado não é agrupado com iniciante quando há evidência específica', () => {
    const rows = [
      ...[1, 2, 3].map((i) =>
        edit({
          student_id: `s${i}`,
          plan_id: `p${i}`,
          context_snapshot: { level: 'avancado', priority_muscles: [] },
          changes: [setsChange('Cadeira Extensora', 3, 4)],
        }),
      ),
      edit({
        student_id: 'sx',
        plan_id: 'px',
        context_snapshot: { level: 'iniciante', priority_muscles: [] },
        changes: [setsChange('Cadeira Extensora', 4, 3)],
      }),
    ];
    const pref = find(buildProfessorPrescriptionProfile(rows), 'SETS')!;
    expect(pref.applicable_context.level).toBe('avancado');
    expect(pref.evidence.opposing_case_count).toBe(0);
  });

  it('17. contexto null não vira false e não entra na assinatura', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ context_snapshot: { level: null, priority_muscles: [] }, changes: [setsChange('Cadeira Extensora', 3, 4)] }),
    ]);
    expect(find(p, 'SETS')!.applicable_context).not.toHaveProperty('level');
  });

  it('18. priority_match unknown permanece unknown (fora da assinatura)', () => {
    expect(doesExerciseMatchPriority('Cadeira Extensora', [])).toBe('unknown');
    expect(doesExerciseMatchPriority('Exercício Inexistente XPTO', ['gluteo'])).toBe('unknown');
    expect(doesExerciseMatchPriority('Elevação pélvica (hip thrust)', ['gluteo'])).toBe(true);
    expect(doesExerciseMatchPriority('Cadeira Extensora', ['gluteo'])).toBe(false);
  });

  it('19. contexto específico demais recua para agregação mais ampla', () => {
    // 2 casos avançados + 1 iniciante -> nenhum nível específico atinge 3 casos.
    const rows = [
      edit({ student_id: 's1', plan_id: 'p1', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      edit({ student_id: 's2', plan_id: 'p2', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      edit({
        student_id: 's3',
        plan_id: 'p3',
        context_snapshot: { level: 'iniciante', priority_muscles: [] },
        changes: [setsChange('Cadeira Extensora', 3, 4)],
      }),
    ];
    const pref = find(buildProfessorPrescriptionProfile(rows), 'SETS')!;
    expect(pref.applicable_context.level).toBeUndefined();
    expect(pref.evidence.supporting_case_count).toBe(3);
  });

  it('20. context signature nunca contém nome/id do aluno', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ student_id: 'aluna-thalita', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
    ]);
    const json = JSON.stringify(p.preferences);
    expect(json).not.toContain('aluna-thalita');
    expect(json).not.toContain('plan-1');
  });
});

describe('Etapa 3 — ordering', () => {
  const reorder = (
    exercise: string,
    from: number,
    to: number,
    op = 'reorder:d1',
  ): PrescriptionEditChange => ({
    type: 'EXERCISE_REORDERED',
    day_id: 'd1',
    day_name: 'A',
    exercise_id: `ex-${exercise}`,
    exercise_before: exercise,
    exercise_after: exercise,
    position_before: from,
    position_after: to,
    before: { position: from },
    after: { position: to },
    metadata: { reorder_operation_id: op },
  });

  it('21/23. uma operação gera 1 caso e movimentos acessórios não inflam', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({
        changes: [
          reorder('Elevação pélvica (hip thrust)', 3, 1),
          reorder('Cadeira Extensora', 1, 2),
          reorder('Mesa Flexora', 2, 3),
        ],
      }),
    ]);
    const pref = find(p, 'ORDERING')!;
    expect(pref.evidence.supporting_case_count).toBe(1);
    expect(pref.evidence.supporting_event_count).toBe(1);
  });

  it('22. movimento dominante gera move_earlier com priority_match', () => {
    const rows = [1, 2, 3].map((i) =>
      edit({
        student_id: `s${i}`,
        plan_id: `p${i}`,
        context_snapshot: { level: 'avancado', priority_muscles: ['gluteo'] },
        changes: [
          reorder('Elevação pélvica (hip thrust)', 3, 1, `reorder:d${i}`),
          reorder('Cadeira Extensora', 1, 2, `reorder:d${i}`),
        ],
      }),
    );
    const pref = find(buildProfessorPrescriptionProfile(rows), 'ORDERING')!;
    expect(pref.pattern.direction).toBe('move_earlier');
    expect(pref.applicable_context.priority_match).toBe(true);
  });
});

describe('Etapa 3 — replacement', () => {
  const replaced = (before: string, after: string): PrescriptionEditChange => ({
    type: 'EXERCISE_REPLACED',
    day_id: 'd1',
    day_name: 'A',
    exercise_id: 'ex-1',
    exercise_before: before,
    exercise_after: after,
    before: { exercise: before },
    after: { exercise: after },
    metadata: {},
  });

  it('24. mesma família é classificada quando a taxonomia permite', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ changes: [replaced('Mesa Flexora', 'Flexora em pé')] }),
    ]);
    expect(find(p, 'EXERCISE_REPLACEMENT')!.pattern.direction).toBe('same_family');
  });

  it('25/26. sem classificação confiável permanece unknown e não inventa família', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ changes: [replaced('Exercício XPTO', 'Exercício YZW')] }),
    ]);
    const pref = find(p, 'EXERCISE_REPLACEMENT')!;
    expect(pref.pattern.direction).toBe('unknown_family');
    expect(pref.applicable_context.exercise_role).toBeUndefined();
    expect(pref.applicable_context.exercise_function).toBeUndefined();
  });

  it('27. replacement não vira sets preference', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ changes: [replaced('Mesa Flexora', 'Cadeira Extensora')] }),
    ]);
    expect(find(p, 'SETS')).toBeUndefined();
  });
});

describe('Etapa 3 — per set', () => {
  const perSet = (beforeMode: string | null, afterMode: string | null): PrescriptionEditChange => ({
    type: 'PER_SET_REPS_CHANGED',
    day_id: 'd1',
    day_name: 'A',
    exercise_id: 'ex-1',
    exercise_before: 'Cadeira Extensora',
    exercise_after: 'Cadeira Extensora',
    before: {
      reps: '10',
      setScheme: beforeMode ? { mode: beforeMode, sets: [{ set_number: 1, set_type: 'work', target_reps: '10' }] } : null,
    },
    after: {
      reps: '15/12/10',
      setScheme: afterMode ? { mode: afterMode, sets: [{ set_number: 1, set_type: 'work', target_reps: '15' }] } : null,
    },
    metadata: {},
  });

  it('28. uniform -> per_set conta como adoção', () => {
    const p = buildProfessorPrescriptionProfile([edit({ changes: [perSet('uniform', 'per_set')] })]);
    expect(find(p, 'PER_SET_REPS')!.pattern.direction).toBe('adopt_per_set');
  });

  it('29. per_set -> uniform conta como remoção', () => {
    const p = buildProfessorPrescriptionProfile([edit({ changes: [perSet('per_set', 'uniform')] })]);
    expect(find(p, 'PER_SET_REPS')!.pattern.direction).toBe('remove_per_set');
  });

  it('30. mudar apenas targets dentro de per_set não vira adoção', () => {
    const p = buildProfessorPrescriptionProfile([edit({ changes: [perSet('per_set', 'per_set')] })]);
    expect(find(p, 'PER_SET_REPS')!.pattern.direction).toBe('adjust_per_set_distribution');
  });
});

describe('Etapa 3 — oposição', () => {
  it('31. increase vs decrease no mesmo contexto é oposição', () => {
    const p = buildProfessorPrescriptionProfile([
      edit({ student_id: 's1', plan_id: 'p1', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      edit({ student_id: 's2', plan_id: 'p2', changes: [setsChange('Cadeira Extensora', 4, 3)] }),
    ]);
    expect(find(p, 'SETS')!.evidence.opposing_case_count).toBe(1);
  });

  it('32. contexto materialmente diferente não vira oposição automática no nível específico', () => {
    const rows = [
      ...[1, 2, 3].map((i) =>
        edit({ student_id: `s${i}`, plan_id: `p${i}`, changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      ),
      edit({
        student_id: 'sz',
        plan_id: 'pz',
        context_snapshot: { level: 'iniciante', priority_muscles: [] },
        changes: [setsChange('Cadeira Extensora', 4, 3)],
      }),
    ];
    const pref = find(buildProfessorPrescriptionProfile(rows), 'SETS')!;
    expect(pref.applicable_context.level).toBe('avancado');
    expect(pref.consistency).toBe(1);
  });

  it('33. individualização real produz consistency baixa sem erro', () => {
    const rows = [
      edit({ student_id: 's1', plan_id: 'p1', changes: [setsChange('Cadeira Extensora', 3, 4)] }),
      edit({ student_id: 's2', plan_id: 'p2', changes: [setsChange('Cadeira Extensora', 4, 3)] }),
      edit({ student_id: 's3', plan_id: 'p3', changes: [setsChange('Cadeira Extensora', 4, 3)] }),
    ];
    const p = buildProfessorPrescriptionProfile(rows);
    expect(find(p, 'SETS')!.consistency).toBeLessThan(0.7);
    expect(p.notes).toContain('insufficient_consistency');
  });
});
