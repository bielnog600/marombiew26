import { describe, expect, it, vi } from 'vitest';
import {
  buildWarmupPrepWorkSets, isWorkLogSetType, normalizePlanSetType, suggestedLoadForSetType, typedSetsSummary,
} from '@/lib/setTypes';
import { normalizeSetScheme } from '@/lib/workoutSchema';
import { buildSetPlan } from '@/lib/setPlanBuilder';
import { setRoleOf, selectBestSet } from '@/lib/weeklyProgression';
import { studentWeightPlaceholder, setTypeContexts, lastWorkSetLine, type PreviousExerciseSet } from '@/lib/studentExerciseLoadPresentation';
import { finalWorkingSetIndex } from '@/lib/finalWorkingSetRir';
import { seriesDeTrabalho } from '@/lib/officeWizard/treinoAnalysis';
import { buildSessionStateLogRows } from '@/lib/workoutSessionResolution';
import type { SessionRecommendation } from '@/lib/sessionProgression';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const scheme = { mode: 'per_set' as const, sets: buildWarmupPrepWorkSets({ warmup: true, workSets: 2 }) };

describe('tipos de série: aquecimento, preparatória, reconhecimento e trabalho', () => {
  it('atalho cria 1 aquecimento 12-15, 1 preparatória 10 e N trabalho 6-8', () => {
    expect(scheme.sets).toEqual([
      { set_number: 1, set_type: 'warmup', target_reps: '12-15' },
      { set_number: 2, set_type: 'preparatory', target_reps: '10' },
      { set_number: 3, set_type: 'work', target_reps: '6-8' },
      { set_number: 4, set_type: 'work', target_reps: '6-8' },
    ]);
  });

  it('sem aquecimento: só preparatória + trabalho', () => {
    expect(buildWarmupPrepWorkSets({ warmup: false, workSets: 3 }).map((s) => s.set_type))
      .toEqual(['preparatory', 'work', 'work', 'work']);
  });

  it('resumo do card agrupa por tipo', () => {
    expect(typedSetsSummary(scheme.sets)).toBe('Aquec. 1×12-15 · Prep. 1×10 · Trabalho 2×6-8');
  });

  it('o plano preserva os tipos novos e planos antigos continuam válidos', () => {
    expect(normalizeSetScheme(scheme)?.sets.map((s) => s.set_type)).toEqual(['warmup', 'preparatory', 'work', 'work']);
    expect(normalizeSetScheme({ mode: 'per_set', sets: [{ set_type: 'recognition', target_reps: '12' }, { set_type: 'qualquer', target_reps: '8' }] })?.sets.map((s) => s.set_type))
      .toEqual(['recognition', 'work']);
    expect(buildSetPlan('4', '', '', scheme).map((p) => p.type)).toEqual(['warmup', 'preparatory', 'work', 'work']);
    expect(normalizePlanSetType(undefined)).toBe('work');
  });

  it('volume conta só as séries de trabalho', () => {
    expect(seriesDeTrabalho({ exercise: 'Leg press', series: '4', series2: '', reps: '', rir: '', pause: '', description: '', variation: '', setScheme: scheme } as never)).toBe(2);
  });

  it('aquecimento/preparatória nunca são série de trabalho; log nulo (legado) conta como trabalho', () => {
    expect(setRoleOf({ set_type: 'preparatory' })).toBe('preparation');
    expect(setRoleOf({ set_type: 'warmup' })).toBe('preparation');
    expect(setRoleOf({ set_type: null })).toBe('primary');
    expect(isWorkLogSetType(null)).toBe(true);
    expect(isWorkLogSetType('preparatory')).toBe(false);
    const best = selectBestSet([
      { exercise_name: 'LEG PRESS', weight_kg: 110, reps: 10, set_type: 'preparatory', performed_at: '2026-11-01T10:00:00Z' },
      { exercise_name: 'LEG PRESS', weight_kg: 100, reps: 8, set_type: 'work', performed_at: '2026-11-01T10:05:00Z' },
    ]);
    expect(best?.weightKg).toBe(100);
  });

  it('RIR final fica na última série de trabalho', () => {
    expect(finalWorkingSetIndex(['warmup', 'preparatory', 'work', 'work'])).toBe(3);
    expect(finalWorkingSetIndex(['work', 'preparatory'])).toBe(0);
  });
});

describe('carga sugerida por tipo', () => {
  it('aquecimento ~50% e preparatória ~85% da carga de trabalho, arredondadas a 2,5 kg (halter 1 kg)', () => {
    expect(suggestedLoadForSetType(110, 'warmup', 'Leg press')).toBe(55);
    expect(suggestedLoadForSetType(110, 'preparatory', 'Leg press')).toBe(92.5);
    expect(suggestedLoadForSetType(110, 'work', 'Leg press')).toBe(110);
    expect(suggestedLoadForSetType(23, 'preparatory', 'Supino com halteres')).toBe(20);
    expect(suggestedLoadForSetType(23, 'warmup', 'Supino com halteres')).toBe(12);
  });

  it('a 1ª série (aquecimento) não recebe mais a carga de trabalho', () => {
    const rec = { action: 'maintain', currentLoadKg: 110, recommendedLoadKg: 110, qualitative: false, bodyweight: false, reasons: [] } as unknown as SessionRecommendation;
    const ctx = setTypeContexts(['warmup', 'preparatory', 'work', 'work'], 'Leg press');
    expect(studentWeightPlaceholder(1, [], {}, rec, ctx[0])).toBe('55');
    expect(studentWeightPlaceholder(2, [], {}, rec, ctx[1])).toBe('92,5');
    expect(studentWeightPlaceholder(3, [], {}, rec, ctx[2])).toBe('110');
  });

  it('carga de trabalho do histórico ignora aquecimento/preparatória', () => {
    const prev: PreviousExerciseSet[] = [
      { set_number: 1, weight_kg: 50, reps: 15, set_type: 'warmup', performed_at: '2026-11-01T10:00:00Z' },
      { set_number: 2, weight_kg: 90, reps: 10, set_type: 'preparatory', performed_at: '2026-11-01T10:00:00Z' },
      { set_number: 3, weight_kg: 100, reps: 8, set_type: 'work', performed_at: '2026-11-01T10:00:00Z' },
    ];
    const ctx = setTypeContexts(['warmup', 'preparatory', 'work'], 'Leg press');
    expect(studentWeightPlaceholder(1, prev, {}, null, ctx[0])).toBe('50');
    expect(lastWorkSetLine(prev)).toBe('Última vez: 100 kg × 8 · 01/11');
  });

  it('log legado sem tipo continua contando como trabalho no "Última vez"', () => {
    expect(lastWorkSetLine([{ set_number: 1, weight_kg: 80, reps: 8, set_type: null, performed_at: '2026-11-01T10:00:00Z' }]))
      .toBe('Última vez: 80 kg × 8 · 01/11');
  });
});

describe('gravação do set_type', () => {
  it('sessão recuperada grava aquecimento/preparatória e o volume total soma só trabalho', () => {
    const result = buildSessionStateLogRows({ id: 's', student_id: 'u', phase: null, day_name: 'Terça' }, {
      exerciseNames: ['LEG PRESS'],
      plannedSetTypes: [['warmup', 'preparatory', 'work']],
      sets: { 0: [
        { reps: '15', weight: '50', completed: true },
        { reps: '10', weight: '90', completed: true },
        { reps: '8', weight: '100', completed: true },
      ] },
    } as never, '2026-11-02T10:00:00Z');
    expect(result.rows.map((r) => r.set_type)).toEqual(['warmup', 'preparatory', 'work']);
    expect(result.totalVolumeKg).toBe(800);
    expect(result.totalSets).toBe(3);
  });
});
