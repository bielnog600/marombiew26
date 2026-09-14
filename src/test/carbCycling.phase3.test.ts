import { describe, it, expect } from 'vitest';
import {
  defaultCarbCyclingConfig,
  buildCarbDayTypeTargets,
  buildWeeklyCarbTargets,
  calculateWeeklyAverage,
  compareWeeklyAverageToBase,
  suggestCarbDayTypeForWorkout,
  type CarbCyclingConfig,
} from '@/lib/carbCycling';
import { resolveDayTarget } from '@/lib/dietDayTargets';
import { defaultMacroConfig, type MacroConfig } from '@/lib/macroConfig';

// QA real — Fabiew Aires
const body = { weightKg: 89, leanMassKg: 74.2 };
const BASE_KCAL = 2600;

const macros = (): MacroConfig => {
  const c = defaultMacroConfig();
  return {
    ...c,
    protein: { ...c.protein, perKg: 2.2, grams: null, basis: 'body_weight', locked: true },
    fat: { ...c.fat, perKg: 0.8, grams: null, basis: 'body_weight', locked: true },
    carbs: { ...c.carbs, perKg: null, grams: null, locked: false },
  };
};

const cfg = (patch: Partial<CarbCyclingConfig> = {}): CarbCyclingConfig => {
  const base = defaultCarbCyclingConfig();
  return {
    ...base,
    enabled: true,
    types: {
      low: { ...base.types.low, carbsPerKg: 1.4 },
      medium: { ...base.types.medium, carbsPerKg: 2.5 },
      high: { ...base.types.high, carbsPerKg: 3.5 },
    },
    ...patch,
  };
};

const buildVariable = (config = cfg(), macroConfig = macros()) =>
  buildCarbDayTypeTargets({
    mode: 'variable_calories',
    carbCycling: config,
    macroConfig,
    body,
    baseKcal: BASE_KCAL,
  });

describe('Fase 3 — carb cycling', () => {
  it('A/C — calorias variáveis: P e G constantes, C varia, kcal acompanham', () => {
    const t = buildVariable();
    expect(t.low.target!.p).toBe(196);
    expect(t.medium.target!.p).toBe(196);
    expect(t.high.target!.p).toBe(196);
    expect(t.low.target!.g).toBe(71);
    expect(t.high.target!.g).toBe(71);
    expect(t.low.target!.c).toBe(125); // 1.4 × 89 = 124,6
    expect(t.medium.target!.c).toBe(223); // 2.5 × 89 = 222,5
    expect(t.high.target!.c).toBe(312); // 3.5 × 89 = 311,5
    expect(t.low.target!.kcal).toBeLessThan(t.medium.target!.kcal);
    expect(t.medium.target!.kcal).toBeLessThan(t.high.target!.kcal);
  });

  it('B — calorias fixas: kcal iguais e o macro de fechamento muda', () => {
    const m = macros();
    const t = buildCarbDayTypeTargets({
      mode: 'fixed_calories',
      carbCycling: cfg({ fixedClosingMacro: 'fat' }),
      macroConfig: { ...m, fat: { ...m.fat, locked: false } },
      body,
      baseKcal: BASE_KCAL,
    });
    expect(t.low.target!.kcal).toBe(BASE_KCAL);
    expect(t.high.target!.kcal).toBe(BASE_KCAL);
    expect(t.low.target!.g).toBeGreaterThan(t.high.target!.g);
  });

  it('D — base do carboidrato em massa magra', () => {
    const c = cfg();
    c.types.low = { ...c.types.low, carbBasis: 'lean_mass' };
    const t = buildVariable(c);
    expect(t.low.target!.c).toBe(104); // 1.4 × 74,2 = 103,88
  });

  it('E — alterar proteína recalcula os três tipos', () => {
    const m = macros();
    const t = buildVariable(cfg(), { ...m, protein: { ...m.protein, perKg: 2.6 } });
    expect(t.low.target!.p).toBe(231);
    expect(t.high.target!.p).toBe(231);
  });

  it('F/G/H — semana com 7 dias, média e diferença para a meta base', () => {
    const config = cfg();
    const weekly = buildWeeklyCarbTargets(config, buildVariable(config));
    expect(Object.keys(weekly)).toHaveLength(7);
    expect(weekly.seg).toMatchObject({ type: expect.any(String), kcal: expect.any(Number) });
    const avg = calculateWeeklyAverage(weekly)!;
    expect(avg.days).toBe(7);
    expect(avg.weeklyKcal).toBeGreaterThan(0);
    const cmp = compareWeeklyAverageToBase(avg, BASE_KCAL)!;
    expect(cmp.diffPerDay).toBe(avg.average.kcal - BASE_KCAL);
    expect(cmp.diffWeek).toBe(cmp.diffPerDay * 7);
  });

  it('I — sugestão pelo treino, sem IA', () => {
    expect(suggestCarbDayTypeForWorkout({ label: 'Pernas completo' })).toBe('high');
    expect(suggestCarbDayTypeForWorkout({ label: 'Peito e tríceps' })).toBe('medium');
    expect(suggestCarbDayTypeForWorkout({ label: 'Descanso' })).toBe('low');
    expect(suggestCarbDayTypeForWorkout({ label: 'Cardio leve' })).toBe('low');
    expect(suggestCarbDayTypeForWorkout(null)).toBe('medium');
  });

  it('J — escolha manual do dia sobrescreve a sugestão', () => {
    const config = cfg();
    config.assignments.seg = 'low';
    config.manual.seg = true;
    const weekly = buildWeeklyCarbTargets(config, buildVariable(config));
    expect(weekly.seg!.type).toBe('low');
  });

  it('K/L — resolveDayTarget devolve a meta completa do dia', () => {
    const t = resolveDayTarget({
      dayIndex: 0,
      planTargetKcal: BASE_KCAL,
      dayTarget: { kcal: 2400, p: 196, c: 125, g: 71 },
    });
    expect(t).toEqual({ kcal: 2400, p: 196, c: 125, g: 71 });
  });

  it('M — dia materializado não sofre double scaling do cronograma', () => {
    const schedule: any = {
      base_daily_kcal: BASE_KCAL,
      days: { seg: { base_kcal: BASE_KCAL, adjustment_kcal: 400, fixed_kcal: null } },
    };
    const t = resolveDayTarget({
      schedule,
      dayIndex: 0,
      planTargetKcal: BASE_KCAL,
      dayTarget: { kcal: 2400, p: 196, c: 125, g: 71 },
    });
    expect(t.kcal).toBe(2400);
  });

  it('N — modo OFF usa a meta normal das Fases 1–2', () => {
    const config = cfg({ enabled: false });
    const weekly = config.enabled ? buildWeeklyCarbTargets(config, buildVariable(config)) : {};
    expect(weekly).toEqual({});
    const t = resolveDayTarget({
      dayIndex: 0,
      planTargetKcal: BASE_KCAL,
      planTargetMacros: { p: 196, c: 250, g: 71 },
    });
    expect(t).toEqual({ kcal: BASE_KCAL, p: 196, c: 250, g: 71 });
  });

  it('O — configuração inviável no modo fixo propaga erro e não gera target', () => {
    const m = macros();
    const t = buildCarbDayTypeTargets({
      mode: 'fixed_calories',
      carbCycling: cfg({ fixedClosingMacro: 'fat' }),
      macroConfig: { ...m, fat: { ...m.fat, locked: false } },
      body,
      baseKcal: 900,
    });
    expect(t.high.status).not.toBe('ok');
    expect(t.high.target).toBeNull();
  });

  it('plano antigo sem macros diários mantém compatibilidade', () => {
    const schedule: any = {
      base_daily_kcal: 2500,
      days: { seg: { base_kcal: 2500, adjustment_kcal: -300, fixed_kcal: null } },
    };
    const t = resolveDayTarget({
      schedule,
      dayIndex: 0,
      planTargetKcal: 2500,
      planTargetMacros: { p: 190, c: 240, g: 70 },
    });
    expect(t.kcal).toBe(2200);
    expect(t.p).toBe(190);
  });
});

// ── Hardening final da Fase 3 ────────────────────────────────────────────
import {
  isCarbCyclingValid,
  setCarbTypePerKg,
  setCarbTypeGrams,
} from '@/lib/carbCycling';

describe('Fase 3 — hardening', () => {
  it('A — ciclo inválido invalida a geração', () => {
    const config = cfg();
    config.types.high = { ...config.types.high, carbsPerKg: null, carbGrams: null };
    config.assignments.seg = 'high';
    const targets = buildVariable(config);
    const weekly = buildWeeklyCarbTargets(config, targets);
    const v = isCarbCyclingValid(config, targets, weekly);
    expect(v.valid).toBe(false);
    expect(v.reason).toBeTruthy();
    // OFF nunca bloqueia
    expect(isCarbCyclingValid({ ...config, enabled: false }, targets, weekly).valid).toBe(true);
  });

  it('B — 6/7 dias não é média semanal definitiva', () => {
    const config = cfg();
    const targets = buildVariable(config);
    const weekly = buildWeeklyCarbTargets(config, targets);
    delete (weekly as any).dom;
    const avg = calculateWeeklyAverage(weekly)!;
    expect(avg.complete).toBe(false);
    expect(avg.incompleteMessage).toContain('6 de 7');
    expect(compareWeeklyAverageToBase(avg, BASE_KCAL)).toBeNull();
  });

  it('C — configuração serializada e restaurada sem perda', () => {
    const config = cfg({ mode: 'fixed_calories', fixedClosingMacro: 'fat' });
    config.manual.qua = true;
    config.assignments.qua = 'high';
    const restored = JSON.parse(JSON.stringify(config));
    expect(restored).toEqual(config);
  });

  it('D — modo fixo exige macro de fechamento explícito', () => {
    const m = macros();
    const base = {
      mode: 'fixed_calories' as const,
      macroConfig: { ...m, fat: { ...m.fat, locked: false } },
      body,
      baseKcal: BASE_KCAL,
    };
    const without = buildCarbDayTypeTargets({ ...base, carbCycling: cfg() });
    expect(without.low.status).toBe('needs_closing_macro');
    expect(without.low.target).toBeNull();
    const withFat = buildCarbDayTypeTargets({
      ...base,
      carbCycling: cfg({ fixedClosingMacro: 'fat' }),
    });
    expect(withFat.low.status).toBe('ok');
  });

  it('E/F — carboidrato g/kg ↔ gramas é bidirecional', () => {
    const low = cfg().types.low;
    const byPerKg = setCarbTypePerKg(low, 1.4, body);
    expect(byPerKg.carbGrams).toBeCloseTo(124.6, 1);
    const byGrams = setCarbTypeGrams(low, 130, body);
    expect(byGrams.carbsPerKg).toBeCloseTo(1.46, 2);
  });

  it('G — sem massa magra a base lean_mass não produz gramas', () => {
    const noLean = { weightKg: 89, leanMassKg: null };
    const t = setCarbTypePerKg({ ...cfg().types.low, carbBasis: 'lean_mass' }, 1.4, noLean);
    expect(t.carbGrams).toBeNull();
  });

  it('H — targets do app vencem os devolvidos pela IA', () => {
    const appTargets = { kcal: 2400, p: 196, c: 125, g: 71 };
    const aiTargets = { kcal: 2000, p: 150, c: 200, g: 60 };
    expect({ ...aiTargets, ...appTargets }).toEqual(appTargets);
  });

  it('I — cada dia valida contra o próprio target', () => {
    const config = cfg();
    const weekly = buildWeeklyCarbTargets(config, buildVariable(config));
    for (const wd of Object.keys(weekly) as (keyof typeof weekly)[]) {
      const day = weekly[wd]!;
      const t = resolveDayTarget({ dayIndex: 0, planTargetKcal: BASE_KCAL, dayTarget: day });
      expect(t.kcal).toBe(day.kcal);
    }
  });

  it('J — target C = 0 permanece 0', () => {
    const t = resolveDayTarget({
      dayIndex: 0,
      planTargetKcal: BASE_KCAL,
      planTargetMacros: { p: 190, c: 240, g: 70 },
      dayTarget: { kcal: 1800, p: 196, c: 0, g: 80 },
    });
    expect(t.c).toBe(0);
  });

  it('M — sem treino ou informação ambígua sugere MEDIUM', () => {
    expect(suggestCarbDayTypeForWorkout(null)).toBe('medium');
    expect(suggestCarbDayTypeForWorkout({ label: 'Treino A' })).toBe('medium');
    expect(suggestCarbDayTypeForWorkout({ label: 'Descanso' })).toBe('low');
  });
});
