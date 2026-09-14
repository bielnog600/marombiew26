/**
 * Fase 3 — fechamento técnico.
 *  A/B/C  macro de fechamento no modo fixo (carboidrato nunca fecha);
 *  D      variable usa os macros CANÔNICOS resolvidos;
 *  E/F/G  validação por dia (HIGH contra HIGH, LOW contra LOW);
 *  H      servidor rejeita day.totals divergente do target do weekday;
 *  I      com o ciclo OFF a validação global antiga continua valendo;
 *  J      semana 6/7 não apresenta médias parciais como oficiais.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  defaultCarbCyclingConfig,
  buildCarbDayTypeTargets,
  buildWeeklyCarbTargets,
  calculateWeeklyAverage,
  FIXED_CLOSING_MACRO_OPTIONS,
  type CarbCyclingConfig,
} from '@/lib/carbCycling';
import { defaultMacroConfig, type MacroConfig } from '@/lib/macroConfig';
import { validateDietDaysMacros } from '@/lib/dietDayValidation';
import { validateDietMacros } from '@/lib/dietMacroValidation';
import { validateDayTargets } from '../../supabase/functions/_shared/dayTargets';

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

const cycle = (patch: Partial<CarbCyclingConfig> = {}): CarbCyclingConfig => ({
  ...defaultCarbCyclingConfig(),
  enabled: true,
  types: {
    low: { carbsPerKg: 1.4, carbGrams: null, carbBasis: 'body_weight', targetKcal: null },
    medium: { carbsPerKg: 2.5, carbGrams: null, carbBasis: 'body_weight', targetKcal: null },
    high: { carbsPerKg: 3.5, carbGrams: null, carbBasis: 'body_weight', targetKcal: null },
  },
  ...patch,
});

const resolved = { p: 196, c: 227, g: 71 };

describe('Fase 3 — macro de fechamento no modo fixo', () => {
  it('A. gordura fecha as calorias mesmo travada na configuração base', () => {
    const out = buildCarbDayTypeTargets({
      mode: 'fixed_calories',
      carbCycling: cycle({ mode: 'fixed_calories', fixedClosingMacro: 'fat' }),
      macroConfig: macros(),
      body,
      baseKcal: BASE_KCAL,
      baseResolvedMacros: resolved,
    });
    const low = out.low.target!;
    expect(out.low.status).toBe('ok');
    expect(low.kcal).toBe(BASE_KCAL);
    expect(low.p).toBe(196);
    expect(low.c).toBe(125);
    // gordura deixou de ser 71 g fixos: fechou as calorias.
    expect(low.g).not.toBe(71);
    expect(low.p * 4 + low.c * 4 + low.g * 9).toBeGreaterThan(BASE_KCAL - 50);
    expect(low.p * 4 + low.c * 4 + low.g * 9).toBeLessThan(BASE_KCAL + 50);
  });

  it('B. proteína fecha corretamente quando escolhida', () => {
    const out = buildCarbDayTypeTargets({
      mode: 'fixed_calories',
      carbCycling: cycle({ mode: 'fixed_calories', fixedClosingMacro: 'protein' }),
      macroConfig: macros(),
      body,
      baseKcal: BASE_KCAL,
      baseResolvedMacros: resolved,
    });
    const high = out.high.target!;
    expect(out.high.status).toBe('ok');
    expect(high.c).toBe(312);
    expect(high.g).toBe(71);
    expect(high.p).not.toBe(196);
    expect(high.kcal).toBe(BASE_KCAL);
  });

  it('C. carboidrato não é oferecido como macro de fechamento', () => {
    expect(FIXED_CLOSING_MACRO_OPTIONS).toEqual(['protein', 'fat']);
    expect(FIXED_CLOSING_MACRO_OPTIONS).not.toContain('carbs');
  });

  it('D. variable usa os macros canônicos resolvidos, não as travas cruas', () => {
    // Proteína LIVRE na base (fechou as calorias na Fase 2) → 210 g resolvidos.
    const cfg = macros();
    cfg.protein = { perKg: null, grams: null, basis: 'body_weight', locked: false };
    const out = buildCarbDayTypeTargets({
      mode: 'variable_calories',
      carbCycling: cycle(),
      macroConfig: cfg,
      body,
      baseKcal: BASE_KCAL,
      baseResolvedMacros: { p: 210, c: 227, g: 71 },
    });
    expect(out.low.target!.p).toBe(210);
    expect(out.low.target!.g).toBe(71);
    expect(out.low.target!.c).toBe(125);
  });
});

/* -------------------------------------------------------------------------- */

const foods = [
  { name: 'Arroz cozido', calories: 130, protein: 2.7, carbs: 28, fats: 0.3, portion_size: 100 },
  { name: 'Frango grelhado', calories: 165, protein: 31, carbs: 0, fats: 3.6, portion_size: 100 },
  { name: 'Azeite', calories: 884, protein: 0, carbs: 0, fats: 100, portion_size: 100 },
];

const dayItems = (arroz: number, frango: number, azeite: number) => [
  { name: 'Arroz cozido', qtyGrams: arroz },
  { name: 'Frango grelhado', qtyGrams: frango },
  { name: 'Azeite', qtyGrams: azeite },
];

describe('Fase 3 — validação por dia', () => {
  const targets = {
    seg: { kcal: 1201, p: 76, c: 140, g: 34, type: 'high' },
    qua: { kcal: 681, p: 65, c: 28, g: 33, type: 'low' },
  };

  it('E/F. cada dia é comparado com a própria meta', () => {
    const report = validateDietDaysMacros({
      days: [
        { weekday: 'seg', items: dayItems(500, 200, 25) },
        { weekday: 'qua', items: dayItems(100, 200, 25) },
      ],
      dayTargets: targets,
      foods,
    });
    expect(report.days.seg?.valid).toBe(true);
    expect(report.days.qua?.valid).toBe(true);
    expect(report.valid).toBe(true);
  });

  it('G. um único dia fora da tolerância invalida o relatório semanal', () => {
    // QA Fabiew: LOW devolvido com os carboidratos do HIGH → deve reprovar.
    const report = validateDietDaysMacros({
      days: [
        { weekday: 'seg', items: dayItems(500, 200, 25) },
        { weekday: 'qua', items: dayItems(500, 200, 25) },
      ],
      dayTargets: targets,
      foods,
    });
    expect(report.days.seg?.valid).toBe(true);
    expect(report.days.qua?.valid).toBe(false);
    expect(report.valid).toBe(false);
  });
});

describe('Fase 3 — validação determinística no servidor', () => {
  const schedule = {
    base_daily_kcal: 2315,
    days: {
      seg: { target_kcal: 2671, protein_g: 196, carbs_g: 312, fat_g: 71 },
      qua: { target_kcal: 1923, protein_g: 196, carbs_g: 125, fat_g: 71 },
    },
  };

  it('H. rejeita um dia LOW devolvido com os totais do HIGH', () => {
    const plan = {
      days: [
        { weekday: 'seg', totals: { kcal: 2671, p: 196, c: 312, g: 71 } },
        { weekday: 'qua', totals: { kcal: 2671, p: 196, c: 312, g: 71 } },
      ],
    };
    const result = validateDayTargets(plan, schedule);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.weekday)).toEqual(['qua']);
  });

  it('H2. aceita quando cada dia respeita a própria meta', () => {
    const plan = {
      days: [
        { weekday: 'seg', totals: { kcal: 2660, p: 194, c: 309, g: 72 } },
        { weekday: 'qua', totals: { kcal: 1930, p: 195, c: 126, g: 70 } },
      ],
    };
    expect(validateDayTargets(plan, schedule).ok).toBe(true);
  });

  it('H3. sem metas diárias de macro o validador não interfere', () => {
    const legacy = { base_daily_kcal: 2300, days: { seg: { target_kcal: 2300 } } };
    const result = validateDayTargets({ days: [{ weekday: 'seg', totals: { kcal: 10 } }] }, legacy);
    expect(result.ok).toBe(true);
    expect(result.checkedDays).toBe(0);
  });
});

describe('Fase 3 — ciclo desligado e média incompleta', () => {
  it('I. validação global antiga continua funcionando com o ciclo OFF', () => {
    const markdown = [
      '| Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| Almoço | 12:00 | Arroz cozido | 500g | 650 | 13 | 140 | 1 | - |',
      '| | 12:00 | Frango grelhado | 200g | 330 | 62 | 0 | 7 | - |',
      '| | 12:00 | Azeite | 25g | 221 | 0 | 0 | 25 | - |',
    ].join('\n');
    const report = validateDietMacros(
      markdown,
      { calories: 1201, protein: 76, carbs: 140, fats: 34 },
      foods,
    );
    expect(report.valid).toBe(true);
  });

  it('J. semana 6/7 não apresenta médias parciais como oficiais', () => {
    const config = cycle();
    const typeTargets = buildCarbDayTypeTargets({
      mode: 'variable_calories',
      carbCycling: config,
      macroConfig: macros(),
      body,
      baseKcal: BASE_KCAL,
      baseResolvedMacros: resolved,
    });
    const weekly = buildWeeklyCarbTargets(config, typeTargets);
    delete weekly.dom;
    const avg = calculateWeeklyAverage(weekly)!;
    expect(avg.days).toBe(6);
    expect(avg.complete).toBe(false);
    expect(avg.incompleteMessage).toBe('Configuração semanal incompleta — 6 de 7 dias válidos.');
  });
});

/* ===================== Micro-hardening final da Fase 3 ===================== */

import { evaluateDietCandidateValidity } from '../../supabase/functions/_shared/dietRoutingPolicy';

describe('Fase 3 — micro-hardening', () => {
  const fullSchedule = {
    base_daily_kcal: 2315,
    days: Object.fromEntries(
      ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((wd) => [
        wd,
        { target_kcal: 2315, protein_g: 196, carbs_g: 223, fat_g: 71 },
      ]),
    ),
  };
  const goodDay = (weekday: string) => ({
    weekday,
    totals: { kcal: 2315, p: 196, c: 223, g: 71 },
  });

  it('A. plano com 6 de 7 weekdays é rejeitado com missingDays', () => {
    const plan = { days: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map(goodDay) };
    const r = validateDayTargets(plan, fullSchedule);
    expect(r.ok).toBe(false);
    expect(r.missingDays).toEqual(['dom']);
  });

  it('B. weekday duplicado é rejeitado', () => {
    const plan = {
      days: ['seg', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map(goodDay),
    };
    const r = validateDayTargets(plan, fullSchedule);
    expect(r.ok).toBe(false);
    expect(r.duplicateDays).toContain('seg');
    expect(r.missingDays).toContain('dom');
  });

  const zeroSchedule = {
    days: { seg: { target_kcal: 1500, protein_g: 250, carbs_g: 0, fat_g: 56 } },
  };

  it('C. target C=0 com 100 g devolvidos é rejeitado', () => {
    const r = validateDayTargets(
      { days: [{ weekday: 'seg', totals: { kcal: 1500, p: 250, c: 100, g: 56 } }] },
      zeroSchedule,
    );
    expect(r.ok).toBe(false);
    expect(r.issues[0].reasons.join(' ')).toContain('C +100g');
  });

  it('D. target C=0 com 0 g devolvidos é aceito', () => {
    const r = validateDayTargets(
      { days: [{ weekday: 'seg', totals: { kcal: 1500, p: 250, c: 0, g: 56 } }] },
      zeroSchedule,
    );
    expect(r.ok).toBe(true);
  });

  it('E. no fixed mode o valor canônico vence o valor cru do macroConfig', () => {
    const cfg = macros();
    cfg.protein = { perKg: null, grams: 180, basis: 'body_weight', locked: true };
    const out = buildCarbDayTypeTargets({
      mode: 'fixed_calories',
      carbCycling: cycle({ mode: 'fixed_calories', fixedClosingMacro: 'fat' }),
      macroConfig: cfg,
      body,
      baseKcal: BASE_KCAL,
      baseResolvedMacros: { p: 210, c: 227, g: 71 },
    });
    expect(out.low.target!.p).toBe(210);
  });

  it('H. gate crítico considera as metas diárias (candidata pode ser substituída)', () => {
    const primary = evaluateDietCandidateValidity({
      nutritionOk: true,
      dailyAdjustmentsOk: true,
      dayTargetsOk: false,
    });
    expect(primary.criticalValid).toBe(false);
    expect(primary.reason).toBe('day_targets_invalid');
    const backup = evaluateDietCandidateValidity({
      nutritionOk: true,
      dailyAdjustmentsOk: true,
      dayTargetsOk: true,
    });
    expect(backup.criticalValid).toBe(true);
  });
});

describe('Fase 3 — prompts do diet-agent', () => {
  const src = readFileSync('supabase/functions/diet-agent/index.ts', 'utf8');

  it('F. regra genérica de proteína constante só existe sem metas diárias', () => {
    const idx = src.indexOf('A PROTEÍNA deve permanecer estável');
    expect(idx).toBeGreaterThan(-1);
    // O bloco genérico fica no ramo "else" (sem macros diários).
    const before = src.slice(Math.max(0, idx - 600), idx);
    expect(before).toContain('} else {');
    expect(src).toContain('NÃO aplique regras genéricas de estabilidade');
  });

  it('G. hormônios são apenas contexto clínico', () => {
    expect(src).not.toContain('proteína faixa superior, carbs mais elevados');
    expect(src).toContain('Nunca altere TMB, GET, calorias ou macros por causa deles');
    expect(src).not.toContain('SE os dados do aluno incluírem uma seção "RECOMENDAÇÃO CALCULADA"');
  });
});
