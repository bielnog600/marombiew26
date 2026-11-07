import { describe, expect, it, vi } from 'vitest';
import { buildSessionProgressionRecommendations, formatSessionHint } from '@/lib/sessionProgression';
import { setLoadDefaults, studentSuggestionLine, type PreviousExerciseSet } from '@/lib/studentExerciseLoadPresentation';
import { adminSetLoadDefaults } from '@/lib/adminSetLoadPrefill';
import { summarizeLastSession } from '@/components/training/exerciseLastLoad';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { SessionLog } from '@/lib/sessionProgression';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const NAME = 'LEG PRESS 45 ART';
const now = new Date('2026-11-07T12:00:00Z');
// Plano de hoje: 1 Preparatória + 2 Trabalho, sem carga alvo.
const legPress = (extra: Partial<ParsedExercise> = {}): ParsedExercise => ({
  exercise: NAME, series: '3', series2: '', reps: '6-8', rir: '1-2', pause: '120', description: '', variation: '',
  setScheme: { mode: 'per_set', sets: [
    { set_number: 1, set_type: 'preparatory', target_reps: '10' },
    { set_number: 2, set_type: 'work', target_reps: '6-8' },
    { set_number: 3, set_type: 'work', target_reps: '6-8' },
  ] } as any,
  ...extra,
});
const session = (id: string, date: string, sets: Array<[number, number, number | null]>): SessionLog[] =>
  sets.map(([kg, reps, rir], i) => ({
    exercise_name: NAME, weight_kg: kg, reps, rir, set_number: i + 1, set_type: 'work',
    performed_at: `${date}T10:0${i}:00Z`, session_id: id,
  }));
const snapshotFor = (logs: SessionLog[], ex = legPress(), increments: Record<string, number> = {}) =>
  buildSessionProgressionRecommendations({ exercises: [ex], logs, currentSessionId: 'hoje', activePhase: 'semana_2', configuredIncrements: increments, now });
const types = ['preparatory', 'work', 'work'];

// Caso real: 200×10 (rampa gravada como trabalho), 300×7, 300×5.
const realLogs = session('ultima', '2026-11-04', [[200, 10, null], [300, 7, null], [300, 5, null]]);
const previous: PreviousExerciseSet[] = realLogs.map((l) => ({
  set_number: l.set_number!, weight_kg: l.weight_kg, reps: l.reps, set_type: l.set_type, performed_at: l.performed_at,
}));

describe('carga de trabalho única (sem casar séries por posição)', () => {
  it('sugestão usa 300 kg para todas as séries de trabalho e ignora a série leve de 200', () => {
    const rec = snapshotFor(realLogs).recommendations[NAME];
    expect(rec.currentLoadKg).toBe(300);
    expect(rec.seriesTargets?.map((s) => s.setNumber)).toEqual([2, 3]);
    expect(rec.seriesTargets?.map((s) => s.recommendedLoadKg)).toEqual([300, 300]);
    expect(rec.seriesTargets?.some((s) => s.currentLoadKg === 200)).toBe(false);
  });

  it('pré-preenche Preparatória 255 e Trabalho 300 / 300', () => {
    const rec = snapshotFor(realLogs).recommendations[NAME];
    expect(setLoadDefaults(types, 3, previous, {}, rec, NAME)).toEqual([255, 300, 300]);
  });

  it('sem sugestão (variação/admin), a referência é a MAIOR carga de trabalho: 300, nunca 200', () => {
    expect(setLoadDefaults(types, 3, previous, {}, null, NAME)).toEqual([255, 300, 300]);
    const rowsNewestFirst = [...realLogs].reverse();
    const last = summarizeLastSession(rowsNewestFirst);
    expect(last.lastWorkLoad).toBe(300);
    expect(adminSetLoadDefaults({ exercise: NAME }, { plan: [{ kind: 'preparatory' }, { kind: 'work' }, { kind: 'work' }] as any, exerciseName: NAME, lastWorkLoad: last.lastWorkLoad }, 3, null))
      .toEqual([255, 300, 300]);
  });

  it('texto do card: uma linha de Trabalho com 300 kg e a Preparatória de 255, sem a série de 200', () => {
    const rec = snapshotFor(realLogs).recommendations[NAME];
    const text = formatSessionHint(rec, { setTypes: types, exerciseName: NAME })?.text ?? '';
    expect(text).toBe('Trabalho: mantém 300 kg e tenta 6–8 reps · Preparatória 255 kg');
    expect(text).not.toMatch(/200/);
    expect(text).not.toMatch(/Série \d/);
    expect(studentSuggestionLine({}, rec, '6-8', types, NAME)).toBe(`Sugestão: ${text}`);
  });

  it('quando sobe, todas as séries de trabalho sobem juntas e a Preparatória acompanha', () => {
    const logs = [
      ...session('antes', '2026-11-01', [[200, 10, null], [300, 8, null], [300, 8, 2]]),
      ...session('ultima', '2026-11-04', [[200, 10, null], [300, 8, null], [300, 8, 2]]),
    ];
    const rec = snapshotFor(logs, legPress(), { [NAME]: 10 }).recommendations[NAME];
    expect(rec.action).toBe('increase_load');
    expect(rec.seriesTargets?.map((s) => s.recommendedLoadKg)).toEqual([310, 310]);
    expect(setLoadDefaults(types, 3, [], {}, rec, NAME)).toEqual([262.5, 310, 310]);
  });

  it('carga alvo do plano continua com prioridade', () => {
    const rec = snapshotFor(realLogs).recommendations[NAME];
    expect(setLoadDefaults(types, 3, previous, { kg: 280 }, rec, NAME)).toEqual([237.5, 280, 280]);
  });

  it('pirâmide continua com carga própria por série', () => {
    const ex: ParsedExercise = { exercise: NAME, series: '3', series2: '', reps: '12/10/8', rir: '2', pause: '90', description: '', variation: '' };
    const logs = session('ultima', '2026-11-04', [[200, 11, null], [250, 9, null], [300, 7, 2]]);
    const rec = snapshotFor(logs, ex).recommendations[NAME];
    expect(rec.seriesTargets?.map((s) => s.recommendedLoadKg)).toEqual([200, 250, 300]);
    expect(setLoadDefaults(['work', 'work', 'work'], 3, [], {}, rec, NAME)).toEqual([200, 250, 300]);
  });
});
