import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ plan: null as any, updated: null as any }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const q: any = {};
    for (const m of ['select', 'eq']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: { id: 'plan', conteudo: '', conteudo_json: db.plan }, error: null });
    q.update = (value: any) => { db.updated = value; return { eq: async () => ({ error: null }) }; };
    return q;
  },
} }));
vi.mock('@/lib/prescriptionEdits', () => ({ recordWorkoutPrescriptionEdit: async () => {} }));

import { applyLoadPrefill } from '@/lib/setLoadPrefill';
import { adminPrefillSets } from '@/lib/adminSetLoadPrefill';
import { canToggleSessionVariation, restoreSessionVariation, toggleSessionVariation, planViewOfExercise } from '@/lib/sessionVariation';
import { makeDaySignature } from '@/components/training/TrainerLogSheetUtils';
import { persistSessionDayEditsToPlan } from '@/lib/sessionPlanPersistence';
import type { ParsedExercise } from '@/lib/trainingResultParser';

const hack: ParsedExercise = {
  id: 'slot-hack', exercise: 'HACK MACHINE', variation: 'AGACHAMENTO LIVRE', series: '3', series2: '', reps: '8-12',
  rir: '', pause: '90s', description: '', targetLoadKg: 120, targetLoadPerSet: [{ set_number: 1, load_kg: 125 }],
};
const workPlan = [{ kind: 'work' as const }, { kind: 'work' as const }];
const empty = () => [{ weight: '', reps: '' }, { weight: '', reps: '' }];

describe('session variation swap (Modo Treino admin)', () => {
  it('swaps to the plan variation without the original plan target, and back restores it', () => {
    const v = toggleSessionVariation(hack)!;
    expect(v.exercise).toBe('AGACHAMENTO LIVRE');
    expect(v.targetLoadKg).toBeUndefined();
    expect(v.targetLoadPerSet).toBeUndefined();
    const back = toggleSessionVariation(v)!;
    expect(back.exercise).toBe('HACK MACHINE');
    expect(back.variation).toBe('AGACHAMENTO LIVRE');
    expect(back.targetLoadKg).toBe(120);
    expect(back.targetLoadPerSet).toEqual([{ set_number: 1, load_kg: 125 }]);
    expect('sessionVariation' in back).toBe(false);
  });

  it('only offers the button when the plan has a different variation', () => {
    expect(canToggleSessionVariation(hack)).toBe(true);
    expect(canToggleSessionVariation({ ...hack, variation: '' })).toBe(false);
    expect(canToggleSessionVariation({ ...hack, variation: 'hack machine' })).toBe(false);
  });

  it('keeps the draft key of the plan day when the session swaps to the variation', () => {
    const day = { day: 'SEGUNDA', exercises: [hack] } as any;
    expect(makeDaySignature({ ...day, exercises: [toggleSessionVariation(hack)!] })).toBe(makeDaySignature(day));
  });

  it('restores a swap saved in the session draft (exercise or registered name)', () => {
    expect(restoreSessionVariation(hack, null, 'AGACHAMENTO LIVRE').exercise).toBe('AGACHAMENTO LIVRE');
    expect(restoreSessionVariation(hack, toggleSessionVariation(hack), null).exercise).toBe('AGACHAMENTO LIVRE');
    expect(restoreSessionVariation(hack, null, 'HACK MACHINE').exercise).toBe('HACK MACHINE');
  });
});

describe('admin load prefill — variation and groups', () => {
  it('original uses the plan target; the variation uses only its own last work load', () => {
    const st = { plan: workPlan, exerciseName: 'HACK MACHINE', lastWorkLoad: 100 };
    expect(adminPrefillSets(hack, st, empty())?.map((s) => s.weight)).toEqual(['125', '120']);
    const v = toggleSessionVariation(hack)!;
    expect(adminPrefillSets(v, { plan: workPlan, exerciseName: v.exercise, lastWorkLoad: 60 }, empty())?.map((s) => s.weight)).toEqual(['60', '60']);
  });

  it('a variation without history clears the values the app filled for the original', () => {
    const filled = adminPrefillSets(hack, { plan: workPlan, exerciseName: 'HACK MACHINE', lastWorkLoad: 100 }, empty())!;
    const v = toggleSessionVariation(hack)!;
    const out = adminPrefillSets(v, { plan: workPlan, exerciseName: v.exercise, lastWorkLoad: null }, filled)!;
    expect(out.map((s) => s.weight)).toEqual(['', '']);
  });

  it('never clears a load typed by hand or a confirmed set', () => {
    const sets = [{ weight: '70', reps: '' }, { weight: '80', reps: '8', completed: true, weightAuto: '80' }];
    expect(applyLoadPrefill(sets, [null, null], ['work', 'work'], 'dot')).toBeNull();
  });

  it('each group exercise gets warm-up 50% / preparatory 85% of its own work load', () => {
    const plan = [{ kind: 'warmup' as const }, { kind: 'preparatory' as const }, { kind: 'work' as const }];
    const supino = { exercise: 'SUPINO RETO', grupo_id: 'g', tipo_grupo: 'biset', ordem_grupo: 'A' };
    const out = adminPrefillSets(supino, { plan, exerciseName: 'SUPINO RETO', lastWorkLoad: 40 }, [{ weight: '' }, { weight: '' }, { weight: '' }]);
    expect(out?.map((s) => s.weight)).toEqual(['20', '35', '40']);
  });
});

describe('saving the session to the plan', () => {
  const plan = { type: 'workout', version: '2', days: [{ id: 'd1', day: 'SEGUNDA', exercises: [{ ...hack }] }] };
  const run = async (keep: boolean) => {
    db.plan = JSON.parse(JSON.stringify(plan)); db.updated = null;
    const swapped = toggleSessionVariation(hack)!;
    const res = await persistSessionDayEditsToPlan({
      planId: 'plan', dayName: 'SEGUNDA', exercises: [swapped],
      states: { 0: { exerciseName: swapped.exercise, plan: [{ kind: 'work' }, { kind: 'work' }, { kind: 'work' }] } },
      keepSessionVariations: keep,
    });
    if (!db.updated) throw new Error(JSON.stringify(res));
    return db.updated.conteudo_json.days[0].exercises[0];
  };

  it('finishing the session keeps the original exercise and its target in the plan', async () => {
    const saved = await run(false);
    expect(saved.exercise).toBe('HACK MACHINE');
    expect(saved.variation).toBe('AGACHAMENTO LIVRE');
    expect(saved.targetLoadKg).toBe(120);
    expect(saved.sessionVariation).toBeUndefined();
  });

  it('"Salvar no plano do aluno" writes the variation as the exercise, without the original target', async () => {
    const saved = await run(true);
    expect(saved.exercise).toBe('AGACHAMENTO LIVRE');
    expect(saved.variation).toBe('HACK MACHINE');
    expect(saved.targetLoadKg).toBeUndefined();
    expect(saved.sessionVariation).toBeUndefined();
    expect(planViewOfExercise(hack)).toBe(hack);
  });
});
