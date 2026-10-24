import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, renderHook } from '@testing-library/react';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { groupExercises, groupExercisesByIndex, matchSetCount, ungroupExercises, moveExerciseBlock, exerciseBlocks, methodPatch, methodParameters, methodOnSet, makeSubRecords, methodLogFields, subRecordVolume, validateGroups } from '@/lib/workoutExecutionMethods';
import { normalizeWorkoutPlan, parsedDaysToWorkoutPlan, validateWorkoutPlan, workoutPlanToParsedDays } from '@/lib/workoutSchema';
import { applyParsedDayToPlan } from '@/lib/workoutPlanEdit';
import { buildSessionStateLogRows } from '@/lib/workoutSessionResolution';
import { MethodSetRows } from '@/components/training/MethodSetRows';
import { useWorkoutGroupFlow } from '@/hooks/useWorkoutGroupFlow';
import { useState } from 'react';

const exercise = (id: string): ParsedExercise => ({ id, exercise: id, series: '3', series2: '', reps: '8-10', rir: '2', pause: '60s', description: '', variation: '' });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('métodos de treino — regras', () => {
  it('bi-set sem par vira bloco individual e slots ausentes não deslocam os índices da sessão', () => {
    const a = { ...exercise('a'), grupo_id: 'partial', tipo_grupo: 'biset' as const, ordem_grupo: 'A' as const };
    const sparse = [null, a, undefined, exercise('c')] as unknown as ParsedExercise[];
    expect(exerciseBlocks(sparse)).toEqual([{ id: 'a', indices: [1] }, { id: 'c', indices: [3] }]);
    const normalized = normalizeWorkoutPlan({ type: 'workout', days: [{ day: 'Sábado', exercises: sparse }] });
    expect(normalized?.days[0].exercises.map(ex => ex.id)).toEqual(['a', 'c']);
    expect(exerciseBlocks(normalized ? workoutPlanToParsedDays(normalized)[0].exercises : [])).toEqual([
      { id: 'a', indices: [0] }, { id: 'c', indices: [1] },
    ]);
  });
  it('agrupa pares válidos mesmo com buraco no array, mantendo os slots originais', () => {
    const grouped = groupExercises([exercise('a'), exercise('b')], ['a', 'b'], 'superset', 'g');
    const sparse = [grouped[0], , grouped[1]] as ParsedExercise[];
    expect(exerciseBlocks(sparse)).toEqual([{ id: 'g', indices: [0, 2] }]);
  });
  it('agrupa exatamente 2 exercícios com igual número de séries', () => {
    const ex = [exercise('a'), exercise('b'), exercise('c')];
    expect(() => groupExercises(ex, ['a'], 'superset', 'g')).toThrow();
    expect(() => groupExercises([ex[0], { ...ex[1], series: '4' }], ['a', 'b'], 'superset', 'g')).toThrow();
    const grouped = groupExercises(ex, ['a', 'b'], 'superset', 'g');
    expect(grouped.slice(0, 2).map(e => e.ordem_grupo)).toEqual(['A', 'B']);
    expect(validateGroups(grouped)).toBeNull();
  });
  it('pausa A→B aceita 0 e 10s, rejeita 11s', () => {
    const grouped = groupExercises([exercise('a'), exercise('b')], ['a', 'b'], 'biset', 'g');
    expect(validateGroups(grouped)).toBeNull();
    expect(validateGroups(grouped.map(ex => ({ ...ex, pausa_grupo_s: 10 })))).toBeNull();
    expect(validateGroups(grouped.map(ex => ({ ...ex, pausa_grupo_s: 11 })))).not.toBeNull();
  });
  it('arrasta bloco inteiro e desagrupa preservando exercícios', () => {
    const grouped = groupExercises([exercise('a'), exercise('b'), exercise('c')], ['a', 'b'], 'biset', 'g');
    const moved = moveExerciseBlock(grouped, 'g', 'c');
    expect(moved.map(ex => ex.id)).toEqual(['c', 'a', 'b']);
    expect(exerciseBlocks(moved).map(b => b.indices)).toEqual([[0], [1, 2]]);
    expect(ungroupExercises(moved, 'g').every(ex => !ex.grupo_id)).toBe(true);
  });
  it('Drop set padrão 25%, 2 drops, última série; limita 1–3 drops', () => {
    const ex = { ...exercise('a'), ...methodPatch('dropset') };
    expect(methodParameters(ex)).toMatchObject({ drops: 2, reducao_pct: 25, aplicar: 'ultima' });
    expect(methodOnSet(ex, 1, 3)).toBe(false);
    expect(methodOnSet(ex, 2, 3)).toBe(true);
    expect(methodParameters({ ...ex, method: { slug: 'drop_set', params: { drops: 8 } }, metodo_params: undefined }).drops).toBe(3);
    expect(makeSubRecords(ex, { weight: '80', reps: '8' }).map(r => r.weight)).toEqual(['80', '60', '45']);
    // Drops arredondados em 0,5 kg: 65 → 48,75→49? Não: 65×0,75=48,75 → 49; 65×0,75²=36,56 → 36,5
    expect(makeSubRecords(ex, { weight: '65', reps: '10' }).map(r => r.weight)).toEqual(['65', '49', '36,5']);
  });
  it('trocar de método limpa os parâmetros dos outros métodos', () => {
    const drop = { ...exercise('a'), ...methodPatch('dropset') };
    const rp = methodPatch('restpause', { ...methodParameters(drop), minis: 3 });
    expect(Object.keys(rp.method!.params!).sort()).toEqual(['aplicar', 'minis', 'pausa_s']);
    expect(rp.metodo_params).not.toHaveProperty('drops');
    expect(rp.metodo_params).not.toHaveProperty('blocos');
  });
  it('Rest-pause padrão 15s e 2 minis, intervalo 10–20s', () => {
    const ex = { ...exercise('a'), ...methodPatch('restpause') };
    expect(methodParameters(ex)).toMatchObject({ pausa_s: 15, minis: 2 });
    expect(methodParameters({ ...ex, metodo_params: { ...methodParameters(ex), pausa_s: 50 } }).pausa_s).toBe(20);
    expect(methodParameters({ ...ex, metodo_params: { ...methodParameters(ex), pausa_s: 1 } }).pausa_s).toBe(10);
  });
  it('Cluster padrão 3×3 e 20s, intervalo 15–30s', () => {
    const ex = { ...exercise('a'), ...methodPatch('cluster') };
    expect(methodParameters(ex)).toMatchObject({ blocos: 3, reps_bloco: 3, pausa_s: 20 });
    expect(makeSubRecords(ex, { weight: '', reps: '' })).toHaveLength(3);
    expect(methodParameters({ ...ex, metodo_params: { ...methodParameters(ex), pausa_s: 1 } }).pausa_s).toBe(15);
    expect(methodParameters({ ...ex, metodo_params: { ...methodParameters(ex), pausa_s: 99 } }).pausa_s).toBe(30);
  });
  it('todas as séries não aplica método no reconhecimento', () => {
    const ex = { ...exercise('a'), ...methodPatch('dropset', { ...methodParameters(exercise('a')), aplicar: 'todas' }) };
    expect(methodOnSet(ex, 0, 3)).toBe(true);
    expect(methodOnSet(ex, 0, 3, true)).toBe(false);
  });
  it('preserva grupos e método no JSON, projeção, edição e normalização', () => {
    const exercises = groupExercises([exercise('a'), { ...exercise('b'), ...methodPatch('cluster') }], ['a', 'b'], 'superset', 'g');
    const plan = parsedDaysToWorkoutPlan([{ day: 'Terça', exercises }]);
    const normalized = normalizeWorkoutPlan(plan);
    expect(normalized?.days[0].exercises[1].metodo).toBe('cluster');
    const days = workoutPlanToParsedDays(plan);
    expect(days[0].exercises[0].grupo_id).toBe('g');
    const edited = applyParsedDayToPlan(plan, days[0], 0);
    expect(edited.days[0].exercises[1]).toMatchObject({ grupo_id: 'g', metodo: 'cluster', method: { slug: 'cluster_set' } });
  });
  it('retomada/cancelamento guarda partes e só 1 série principal para progressão', () => {
    const ex = { ...exercise('a'), ...methodPatch('dropset') };
    const set = { weight: '80', reps: '8', completed: true, subRecords: makeSubRecords(ex, { weight: '80', reps: '8' }).map((r, i) => ({ ...r, reps: String(8 - i), completed: true })) };
    expect(methodLogFields(ex, set).training_method).toBe('dropset');
    const result = buildSessionStateLogRows({ id: 's', student_id: 'u', phase: null, day_name: 'Terça' }, { exerciseNames: ['a'], exerciseSlotIds: ['a'], executionMethods: ['dropset'], sets: { 0: [set] } }, '2026-10-17T14:00:00Z');
    expect(result.totalSets).toBe(1);
    expect(result.rows[0]).toMatchObject({ weight_kg: 80, reps: 8, exercise_slot_id: 'a' });
    expect(result.rows[0].sub_records).toHaveLength(3);
    expect(result.totalVolumeKg).toBe(subRecordVolume(set));
  });
  it('treino sem método mantém registros simples e não cria sub-registros', () => {
    const ex = exercise('a');
    expect(methodOnSet(ex, 2, 3)).toBe(false);
    expect(methodLogFields(ex, { weight: '40', reps: '10' })).toEqual({});
  });
  it('agrupa por índice: par fica seguido na posição do A, com orderMap para remapear séries', () => {
    const res = groupExercisesByIndex([exercise('a'), exercise('b'), exercise('c')], 0, 2, 'biset', 'g')!;
    expect(res.orderMap).toEqual([0, 2, 1]);
    expect(res.exercises.map(ex => [ex.id, ex.ordem_grupo])).toEqual([['a', 'A'], ['c', 'B'], ['b', undefined]]);
    expect(res.exercises[0].grupo_id).toBe('g');
    expect(res.exercises[1].pausa_grupo_s).toBe(0);
    expect(validateGroups(res.exercises)).toBeNull();
    // B antes do A: o par fica na posição do A.
    const res2 = groupExercisesByIndex([exercise('a'), exercise('b'), exercise('c')], 2, 0, 'superset', 'g2')!;
    expect(res2.orderMap).toEqual([1, 2, 0]);
    expect(res2.exercises.map(ex => ex.ordem_grupo)).toEqual([undefined, 'A', 'B']);
    // Exercício já agrupado não pode ser agrupado de novo.
    expect(groupExercisesByIndex(res.exercises, 0, 2, 'biset', 'x')).toBeNull();
  });
  it('matchSetCount ajusta o B para o número de séries do A', () => {
    expect(matchSetCount(exercise('a'), 3)).toEqual({ series: '3', series2: '' });
    expect(matchSetCount({ ...exercise('a'), series: '4' }, 3)).toEqual({ series: '3', series2: '' });
    const recon = { ...exercise('a'), series: '1', series2: '3', reps: '15 + 8-10' };
    expect(matchSetCount(recon, 5)).toEqual({ series2: '4' });
    const perSet = { ...exercise('a'), setScheme: { mode: 'per_set' as const, sets: [
      { set_number: 1, set_type: 'work' as const, target_reps: '12' },
      { set_number: 2, set_type: 'work' as const, target_reps: '10' },
    ] } };
    const padded = matchSetCount(perSet, 4).setScheme!;
    expect(padded.sets.map(s => [s.set_number, s.target_reps])).toEqual([[1, '12'], [2, '10'], [3, '10'], [4, '10']]);
    expect(matchSetCount(perSet, 1).setScheme!.sets).toHaveLength(1);
  });
  it('schema aceita os parâmetros parciais gerados por methodPatch (bug "Required; Required")', () => {
    const ex = [
      { ...exercise('a'), ...methodPatch('dropset') },
      { ...exercise('b'), ...methodPatch('restpause') },
      { ...exercise('c'), ...methodPatch('cluster') },
    ];
    const result = validateWorkoutPlan(parsedDaysToWorkoutPlan([{ day: 'Segunda', exercises: ex }]));
    expect(result.success).toBe(true);
  });
});
describe('execução compartilhada', () => {
  it('Rest-pause pausa 15s antes de liberar a próxima mini-série', () => {
    vi.useFakeTimers();
    const ex = { ...exercise('a'), ...methodPatch('restpause') };
    let latest: import('@/lib/workoutExecutionMethods').MethodSetEntry | undefined;
    function Harness() {
      const [set, update] = useState({ weight: '40', reps: '8' } as import('@/lib/workoutExecutionMethods').MethodSetEntry);
      return <MethodSetRows exercise={ex} set={set} index={2} count={3} onChange={entry => { latest = entry; update(entry); }} onComplete={() => {}} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Confirmar série 3 Principal'));
    expect(latest?.pauseUntil).toBe(Date.now() + 15000);
    expect((screen.getByLabelText('Série 3 Mini-série 1 reps') as HTMLInputElement).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(15000); });
    fireEvent.click(screen.getByLabelText('Registrar 4 reps em Mini-série 1'));
    expect(latest?.subRecords?.[1]).toMatchObject({ reps: '4', weight: '40', completed: true });
  });
  it('drop salva principal e sub-registros com cargas 80/60/45', () => {
    const ex = { ...exercise('a'), ...methodPatch('dropset') };
    let completed: any;
    function Harness() {
      const [set, update] = useState({ weight: '80', reps: '', completed: false } as import('@/lib/workoutExecutionMethods').MethodSetEntry);
      return <MethodSetRows exercise={ex} set={set} index={2} count={3} onChange={update} onComplete={entry => { completed = entry; }} />;
    }
    render(<Harness />);
    ['Principal', 'Drop 1', 'Drop 2'].forEach(label => {
      fireEvent.change(screen.getByLabelText(`Série 3 ${label} reps`), { target: { value: '8' } });
      fireEvent.click(screen.getByLabelText(`Confirmar série 3 ${label}`));
    });
    expect(completed.subRecords.map((r: any) => r.weight)).toEqual(['80', '60', '45']);
    expect(completed.weight).toBe('80'); expect(completed.reps).toBe('8');
  });
  it('A → pausa 5s → B → descanso 60s → A', () => {
    vi.useFakeTimers();
    const ex = groupExercises([exercise('a'), exercise('b')], ['a', 'b'], 'superset', 'g').map(e => ({ ...e, pausa_grupo_s: 5 }));
    const select = vi.fn();
    const { result, rerender } = renderHook(({ current }) => useWorkoutGroupFlow(ex, current, select), { initialProps: { current: 0 } });
    act(() => { result.current.complete(0, { 0: [{ weight: '40', reps: '8', completed: true }, { weight: '', reps: '' }], 1: [{ weight: '', reps: '' }, { weight: '', reps: '' }] }, 60); });
    act(() => { vi.advanceTimersByTime(5000); }); expect(select).toHaveBeenCalledWith(1);
    rerender({ current: 1 });
    act(() => { result.current.complete(0, { 0: [{ weight: '40', reps: '8', completed: true }, { weight: '', reps: '' }], 1: [{ weight: '20', reps: '8', completed: true }, { weight: '', reps: '' }] }, 60); });
    act(() => { vi.advanceTimersByTime(60000); }); expect(select).toHaveBeenLastCalledWith(0);
  });
});