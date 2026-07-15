import { describe, it, expect } from 'vitest';
import { buildSetPlan, buildPlanSummary } from '@/lib/setPlanBuilder';
import { normalizeSetScheme, WorkoutExerciseSchema } from '@/lib/workoutSchema';
import { parseTrainingTable } from '@/lib/trainingResultParser';
import { workoutPlanToMarkdown } from '@/lib/workoutMarkdownSerializer';

describe('setScheme per_set — round trip', () => {
  it('buildSetPlan expands per_set into ordered plan', () => {
    const plan = buildSetPlan('3', '', '12 / 10 / 6', {
      mode: 'per_set',
      sets: [
        { set_number: 1, set_type: 'work', target_reps: '12' },
        { set_number: 2, set_type: 'work', target_reps: '10' },
        { set_number: 3, set_type: 'work', target_reps: '6' },
      ],
    });
    expect(plan).toHaveLength(3);
    expect(plan.map((s) => s.reps)).toEqual(['12', '10', '6']);
    expect(plan.every((s) => s.type === 'work')).toBe(true);
    expect(buildPlanSummary(plan)).toBe('1x12 + 1x10 + 1x6');
  });

  it('buildSetPlan falls back to legacy series/reps when scheme missing (backwards compat)', () => {
    const plan = buildSetPlan('3', '', '8-10');
    expect(plan).toHaveLength(3);
    expect(plan.every((s) => s.reps === '8-10')).toBe(true);
  });

  it('buildSetPlan still handles recognition + work (legacy composed)', () => {
    const plan = buildSetPlan('1', '3', '12 + 8-10');
    expect(plan).toHaveLength(4);
    expect(plan[0].type).toBe('recognition');
    expect(plan[0].reps).toBe('12');
    expect(plan.slice(1).every((s) => s.type === 'work' && s.reps === '8-10')).toBe(true);
  });

  it('normalizeSetScheme rejects invalid mode and empty sets', () => {
    expect(normalizeSetScheme(null)).toBeUndefined();
    expect(normalizeSetScheme({ mode: 'bogus', sets: [] })).toBeUndefined();
    expect(normalizeSetScheme({ mode: 'per_set', sets: [] })).toBeUndefined();
    expect(
      normalizeSetScheme({ mode: 'per_set', sets: [{ target_reps: '' }] }),
    ).toBeUndefined();
  });

  it('normalizeSetScheme fills set_number when missing', () => {
    const scheme = normalizeSetScheme({
      mode: 'per_set',
      sets: [{ target_reps: '12' }, { target_reps: '8' }],
    });
    expect(scheme?.sets.map((s) => s.set_number)).toEqual([1, 2]);
  });

  it('WorkoutExerciseSchema validates a per_set exercise', () => {
    const res = WorkoutExerciseSchema.safeParse({
      id: 'ex-1',
      exercise: 'SUPINO RETO',
      series: '3',
      reps: '12 / 10 / 6',
      setScheme: {
        mode: 'per_set',
        sets: [
          { set_number: 1, set_type: 'work', target_reps: '12' },
          { set_number: 2, set_type: 'work', target_reps: '10' },
          { set_number: 3, set_type: 'work', target_reps: '6' },
        ],
      },
    });
    expect(res.success).toBe(true);
  });
});

describe('setScheme markdown serialization', () => {
  const plan = {
    version: '2.0' as const,
    type: 'workout' as const,
    metadata: {},
    days: [
      {
        id: 'day-1',
        day: 'SEGUNDA-FEIRA',
        focus: 'PEITO',
        exercises: [
          {
            id: 'ex-1',
            exercise: 'SUPINO RETO',
            series: '3',
            reps: '12 / 10 / 6',
            setScheme: {
              mode: 'per_set' as const,
              sets: [
                { set_number: 1, set_type: 'work' as const, target_reps: '12' },
                { set_number: 2, set_type: 'work' as const, target_reps: '10' },
                { set_number: 3, set_type: 'work' as const, target_reps: '6' },
              ],
            },
          },
        ],
      },
    ],
  };

  it('serializes per_set reps as slash-joined string in the 9-column table', () => {
    const md = workoutPlanToMarkdown(plan as any);
    // 9-column shape preserved
    expect(md).toMatch(/\|.*SEGUNDA-FEIRA.*\|.*SUPINO RETO.*\|.*3.*\|.*\|.*12 \/ 10 \/ 6.*\|/);
    // Ensure 9 pipes in body row (10 pipe chars = 9 cells)
    const bodyRow = md.split('\n').find((l) => l.includes('SUPINO RETO'))!;
    expect((bodyRow.match(/\|/g) || []).length).toBe(10);
  });

  it('re-parses per_set markdown back into setScheme (round trip)', () => {
    const md = workoutPlanToMarkdown(plan as any);
    const tableLines = md.split('\n').filter((l) => l.trim().startsWith('|'));
    const days = parseTrainingTable(tableLines);
    expect(days).toHaveLength(1);
    const ex = days[0].exercises[0];
    expect(ex.reps).toBe('12 / 10 / 6');
    expect(ex.setScheme?.mode).toBe('per_set');
    expect(ex.setScheme?.sets.map((s) => s.target_reps)).toEqual(['12', '10', '6']);
  });
});

describe('setScheme backwards compatibility', () => {
  it('parses legacy 9-column row without slash as plain uniform reps (no setScheme)', () => {
    const md = [
      '| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |',
      '|---|---|---|---|---|---|---|---|---|',
      '| SEGUNDA-FEIRA | SUPINO RETO | 3 | - | 8-10 | 1-2 | 90s | Foco em técnica | SUPINO INCLINADO |',
    ];
    const days = parseTrainingTable(md);
    expect(days).toHaveLength(1);
    const ex = days[0].exercises[0];
    expect(ex.reps).toBe('8-10');
    expect(ex.setScheme).toBeUndefined();
  });
});