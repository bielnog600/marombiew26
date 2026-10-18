import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { pyramidPatch, pyramidType } from '@/lib/workoutPyramid';
import { methodLogFields, methodOnSet, methodPatch, type MethodSetEntry } from '@/lib/workoutExecutionMethods';
import { buildSetPlan } from '@/lib/setPlanBuilder';
import { normalizeWorkoutPlan, parsedDaysToWorkoutPlan, workoutPlanToParsedDays } from '@/lib/workoutSchema';
import { applyParsedDayToPlan } from '@/lib/workoutPlanEdit';
import { workoutPlanToMarkdown } from '@/lib/workoutMarkdownSerializer';
import { MethodSetRows } from '@/components/training/MethodSetRows';
import { buildSessionStateLogRows } from '@/lib/workoutSessionResolution';

const original: ParsedExercise = { id: 'slot', exercise: 'SUPINO', series: '4', series2: '', reps: '8-12', rir: '2', pause: '90s', description: '', variation: '' };
const make = (type: 'crescente' | 'decrescente') => ({ ...original, ...pyramidPatch(original, type) });
afterEach(cleanup);

describe('Pirâmide por série', () => {
  it('crescente sugere 12/10/8/6 em quatro séries', () => {
    const ex = make('crescente');
    expect(ex.method).toEqual({ slug: 'pyramid_up' });
    expect(buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme).map(set => set.reps)).toEqual(['12', '10', '8', '6']);
    expect(original.reps).toBe('8-12');
  });
  it('decrescente sugere 6/8/10/12 em quatro séries', () => {
    const ex = make('decrescente');
    expect(ex.method).toEqual({ slug: 'pyramid_down' });
    expect(ex.setScheme?.sets.map(set => set.target_reps)).toEqual(['6', '8', '10', '12']);
  });
  it('trocar o tipo inverte metas personalizadas sem alterar cargas prescritas', () => {
    const ex = { ...make('crescente'), targetLoadPerSet: [{ set_number: 1, load_kg: 40 }] };
    const customized = { ...ex, setScheme: { mode: 'per_set' as const, sets: ex.setScheme?.sets.map((set, i) => ({ ...set, target_reps: String(15 - i * 3) })) ?? [] } };
    const next = { ...customized, ...pyramidPatch(customized, 'decrescente') };
    expect(next.setScheme.sets.map(set => set.target_reps)).toEqual(['6', '9', '12', '15']);
    expect(next.targetLoadPerSet).toEqual([{ set_number: 1, load_kg: 40 }]);
  });
  it('reaproveita metas por série existentes ao escolher Pirâmide', () => {
    const ex = { ...make('crescente'), method: undefined };
    expect(pyramidPatch(ex, 'crescente').setScheme).toEqual(ex.setScheme);
  });
  it('preserva método e metas no salvamento, edição e leitura JSON', () => {
    const plan = parsedDaysToWorkoutPlan([{ day: 'SEGUNDA', exercises: [make('decrescente'), original] }]);
    const normalized = normalizeWorkoutPlan(JSON.parse(JSON.stringify(plan)));
    expect(normalized).toBeDefined();
    if (!normalized) throw new Error('Plano inválido');
    const days = workoutPlanToParsedDays(normalized);
    expect(pyramidType(days[0].exercises[0])).toBe('decrescente');
    expect(days[0].exercises[0].setScheme?.sets.map(set => set.target_reps)).toEqual(['6', '8', '10', '12']);
    expect(applyParsedDayToPlan(normalized, days[0], 0).days[0].exercises[0].method).toEqual({ slug: 'pyramid_down' });
    expect(days[0].exercises[1].setScheme).toBeUndefined();
    expect(workoutPlanToMarkdown(normalized)).toContain('6 / 8 / 10 / 12');
  });
  it('Pirâmide usa séries comuns, sem pausas internas ou sub-registros', () => {
    const ex = make('crescente');
    for (let index = 0; index < 4; index++) expect(methodOnSet(ex, index, 4)).toBe(false);
    expect(methodLogFields(ex, { weight: '40', reps: '12', completed: true })).toEqual({});
    const drop = { ...original, ...methodPatch('dropset') };
    expect(make('crescente').metodo).toBe('nenhum');
    expect(pyramidPatch(drop, 'crescente').metodo_params).toBeUndefined();
    expect(methodOnSet(drop, 3, 4)).toBe(true);
  });
  it('registra reps e cargas independentes para as quatro séries na execução', () => {
    const ex = make('crescente');
    let final: MethodSetEntry[] = [];
    function Player() {
      const [sets, update] = useState<MethodSetEntry[]>(Array.from({ length: 4 }, () => ({ weight: '', reps: '' })));
      final = sets;
      return <>{sets.map((set, index) => <MethodSetRows key={index} exercise={ex} set={set} index={index} count={4} targetReps={ex.setScheme?.sets[index]?.target_reps} onChange={next => update(prev => prev.map((entry, i) => i === index ? next : entry))} onComplete={() => {}} />)}</>;
    }
    render(<Player />);
    [12, 10, 8, 6].forEach((reps, index) => {
      fireEvent.change(screen.getByLabelText(`Série ${index + 1} Principal carga`), { target: { value: String(40 + index * 5) } });
      fireEvent.change(screen.getByLabelText(`Série ${index + 1} Principal reps`), { target: { value: String(reps) } });
      fireEvent.click(screen.getByLabelText(`Confirmar série ${index + 1} Principal`));
    });
    expect(final.map(set => [set.weight, set.reps, set.completed])).toEqual([['40', '12', true], ['45', '10', true], ['50', '8', true], ['55', '6', true]]);
    expect(final.every(set => !set.subRecords && !set.pauseUntil)).toBe(true);
    const result = buildSessionStateLogRows({ id: 's', student_id: 'u', phase: null, day_name: 'SEGUNDA' }, { exerciseNames: ['SUPINO'], exerciseSlotIds: ['slot'], sets: { 0: final } }, '2026-10-18T08:26:00Z');
    expect(result.rows.map(row => [row.weight_kg, row.reps])).toEqual([[40, 12], [45, 10], [50, 8], [55, 6]]);
    expect(result.totalSets).toBe(4);
  });
});