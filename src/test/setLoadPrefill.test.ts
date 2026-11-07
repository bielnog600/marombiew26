import { describe, expect, it, vi } from 'vitest';
import { applyLoadPrefill, isPrefillOnlySet, lastWorkSetLoad } from '@/lib/setLoadPrefill';
import { setLoadDefaults, type PreviousExerciseSet } from '@/lib/studentExerciseLoadPresentation';
import { buildSessionStateLogRows } from '@/lib/workoutSessionResolution';
import type { SessionRecommendation } from '@/lib/sessionProgression';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const at = '2026-11-01T10:00:00Z';
// Última sessão: aquecimento 50, preparatória 90, trabalho 110 e 105 (última de trabalho = 105).
const lastSession: PreviousExerciseSet[] = [
  { set_number: 1, weight_kg: 50, reps: 15, set_type: 'warmup', performed_at: at },
  { set_number: 2, weight_kg: 90, reps: 10, set_type: 'preparatory', performed_at: at },
  { set_number: 3, weight_kg: 110, reps: 8, set_type: 'work', performed_at: at },
  { set_number: 4, weight_kg: 105, reps: 7, set_type: 'work', performed_at: at },
];
const typed = ['warmup', 'preparatory', 'work', 'work'];
const empty = () => typed.map(() => ({ weight: '', reps: '', completed: false } as { weight: string; reps: string; completed: boolean; weightAuto?: string }));
const recommendation = {
  action: 'increase_load', currentLoadKg: 105, recommendedLoadKg: 107.5,
  repRange: { min: 6, max: 8 }, qualitative: false, bodyweight: false, reasons: [],
} as unknown as SessionRecommendation;
const fill = (sets: ReturnType<typeof empty>, prev = lastSession, rec: SessionRecommendation | null = null, name = 'Leg press') =>
  applyLoadPrefill(sets, setLoadDefaults(typed, sets.length, prev, {}, rec, name), typed, 'comma') ?? sets;

describe('carga pré-preenchida por série', () => {
  it('trabalho usa a carga da última série de trabalho; log sem tipo conta como trabalho', () => {
    expect(lastWorkSetLoad(lastSession)).toBe(105);
    expect(lastWorkSetLoad([{ set_number: 1, weight_kg: 80, set_type: null, performed_at: at }, { set_number: 2, weight_kg: 60, set_type: 'warmup', performed_at: at }])).toBe(80);
  });

  it('preenche trabalho 105, preparatória 85% (90) e aquecimento 50% (52,5)', () => {
    expect(fill(empty()).map((s) => s.weight)).toEqual(['52,5', '90', '105', '105']);
  });

  it('com sugestão de progressão, usa a sugestão', () => {
    expect(fill(empty(), lastSession, recommendation).map((s) => s.weight)).toEqual(['55', '92,5', '107,5', '107,5']);
  });

  it('reconhecimento recebe 85% e halter arredonda a 1 kg', () => {
    const types = ['recognition', 'work'];
    const prev: PreviousExerciseSet[] = [{ set_number: 2, weight_kg: 23, reps: 8, set_type: 'work', performed_at: at }];
    const sets = applyLoadPrefill([{ weight: '' }, { weight: '' }], setLoadDefaults(types, 2, prev, {}, null, 'Rosca com halteres'), types, 'comma');
    expect(sets?.map((s) => s.weight)).toEqual(['20', '23']);
  });

  it('nunca sobrescreve o que foi digitado nem a série confirmada', () => {
    const sets = empty();
    sets[2] = { weight: '100', reps: '', completed: false };
    sets[0] = { weight: '40', reps: '15', completed: true };
    const out = fill(sets);
    expect(out[0].weight).toBe('40');
    expect(out[2].weight).toBe('100');
  });

  it('mudar a 1ª série de trabalho recalcula só as seguintes ainda preenchidas pelo app', () => {
    const filled = fill([...empty(), { weight: '', reps: '', completed: false }]);
    // 5 séries: AQ, PREP, T1, T2, T3 (tipo extra cai como trabalho)
    filled[2] = { ...filled[2], weight: '115' };            // digitou na 1ª de trabalho
    filled[3] = { ...filled[3], completed: true };          // T2 já registrada com 105
    const out = applyLoadPrefill(filled, setLoadDefaults(typed, 5, lastSession, {}, null, 'Leg press'), typed, 'comma') ?? filled;
    expect(out.map((s) => s.weight)).toEqual(['52,5', '90', '115', '105', '115']);
  });

  it('apagar o valor preenchido deixa o campo vazio', () => {
    const filled = fill(empty());
    filled[3] = { ...filled[3], weight: '' };
    expect(fill(filled)[3].weight).toBe('');
  });

  it('sem histórico do exercício, fica vazio', () => {
    expect(fill(empty(), []).map((s) => s.weight)).toEqual(['', '', '', '']);
  });

  it('exercício sem tipo definido: todas as séries recebem a carga da última vez', () => {
    const prev: PreviousExerciseSet[] = [
      { set_number: 1, weight_kg: 40, reps: 10, set_type: null, performed_at: at },
      { set_number: 2, weight_kg: 42.5, reps: 8, set_type: null, performed_at: at },
    ];
    const sets = applyLoadPrefill([{ weight: '' }, { weight: '' }, { weight: '' }], setLoadDefaults([], 3, prev, {}, null, 'Supino'), [], 'comma');
    expect(sets?.map((s) => s.weight)).toEqual(['42,5', '42,5', '42,5']);
  });

  it('preencher não registra: série não confirmada não vira log', () => {
    const filled = fill(empty());
    expect(isPrefillOnlySet(filled[2])).toBe(true);
    const rows = buildSessionStateLogRows({ id: 's', student_id: 'u', phase: null, day_name: 'Terça' },
      { exerciseNames: ['LEG PRESS'], sets: { 0: filled } }, '2026-11-07T10:00:00Z').rows;
    expect(rows).toHaveLength(0);
  });
});
