/**
 * HOTFIX — dieta structured com dieta modelo / schedule linear.
 *
 * Cobre: parser com travessão, schedule linear × variação real e
 * preservação do food_id nos ajustes diários.
 */
import { describe, it, expect } from 'vitest';
import { extractModelDietFoodNames } from '@/lib/modelDietFoods';
import {
  hasMeaningfulDailyTargetVariation,
  scheduleHasDailyMacroTargets,
  validateDayTargets,
} from '../../supabase/functions/_shared/dayTargets';
import {
  normalizeDailyAdjustments,
  validateDailyAdjustments,
} from '../../supabase/functions/_shared/dailyAdjustments';

const WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;

const buildSchedule = (
  overrides: Partial<Record<(typeof WD)[number], any>> = {},
  base = 1740,
) => ({
  base_daily_kcal: base,
  days: Object.fromEntries(
    WD.map((wd) => [
      wd,
      {
        base_kcal: base,
        adjustment_kcal: 0,
        fixed_kcal: base,
        target_kcal: base,
        protein_g: 135,
        carbs_g: 175,
        fat_g: 55,
        ...(overrides[wd] ?? {}),
      },
    ]),
  ),
});

describe('parser da dieta modelo (travessão)', () => {
  it('A. reconhece "Banana — 100 g"', () => {
    expect(extractModelDietFoodNames('Banana — 100 g')).toEqual(['Banana']);
  });

  it('B. reconhece "Banana - 100 g"', () => {
    expect(extractModelDietFoodNames('Banana - 100 g')).toEqual(['Banana']);
  });

  it('C. ignora substituições "→ Maçã — 150 g"', () => {
    expect(extractModelDietFoodNames('→ Maçã — 150 g')).toEqual([]);
  });

  it('teste Izis: extrai os 4 alimentos e ignora a substituição', () => {
    const text = [
      'REFEIÇÃO 1 — PRÉ-TREINO — 07:00',
      '',
      'Iogurte skyr natural — 170 g',
      'Aveia em flocos — 30 g',
      'Banana — 100 g',
      'Sementes de chia — 10 g',
      '',
      'Substituições:',
      '',
      'Iogurte skyr natural — 170 g',
      '→ Iogurte grego natural magro — 200 g',
    ].join('\n');
    const names = extractModelDietFoodNames(text);
    expect(names).toEqual([
      'Iogurte skyr natural',
      'Aveia em flocos',
      'Banana',
      'Sementes de chia',
    ]);
    expect(names).not.toContain('Iogurte grego natural magro');
  });
});

describe('schedule linear × variação diária real', () => {
  it('D. 7 dias idênticos (1740/135/175/55) → sem variação', () => {
    expect(hasMeaningfulDailyTargetVariation(buildSchedule())).toBe(false);
  });

  it('E. SEG 1740 e TER 1600 → variação', () => {
    const s = buildSchedule({ ter: { fixed_kcal: 1600, target_kcal: 1600 } });
    expect(hasMeaningfulDailyTargetVariation(s)).toBe(true);
  });

  it('F. mesma kcal com carboidrato diferente → variação', () => {
    const s = buildSchedule({ ter: { carbs_g: 120 } });
    expect(hasMeaningfulDailyTargetVariation(s)).toBe(true);
  });

  it('G. linear não exige dailyAdjustments (gate combinado é falso)', () => {
    const s = buildSchedule();
    const dailyVariationMode =
      scheduleHasDailyMacroTargets(s) && hasMeaningfulDailyTargetVariation(s);
    expect(scheduleHasDailyMacroTargets(s)).toBe(true);
    expect(dailyVariationMode).toBe(false);
  });

  it('H. linear aceita um único day "Padrão"', () => {
    const plan = { days: [{ label: 'Padrão', totals: { kcal: 1740, p: 135, c: 175, g: 55 } }] };
    // Em modo linear o schedule não é usado como gate de weekdays.
    expect(validateDayTargets(plan, null).ok).toBe(true);
  });

  it('I. carb cycling real continua exigindo os weekdays', () => {
    const s = buildSchedule({ ter: { fixed_kcal: 2100, target_kcal: 2100, carbs_g: 260 } });
    expect(hasMeaningfulDailyTargetVariation(s)).toBe(true);
    const plan = { days: [{ weekday: 'seg', totals: { kcal: 1740, p: 135, c: 175, g: 55 } }] };
    const report = validateDayTargets(plan, s);
    expect(report.ok).toBe(false);
    expect(report.missingDays.length).toBeGreaterThan(0);
  });
});

describe('food_id nos ajustes diários', () => {
  const variedSchedule = buildSchedule({ ter: { fixed_kcal: 1900, target_kcal: 1900 } });

  const modelAdj = (instruction: Record<string, unknown>) =>
    Object.fromEntries(
      WD.map((wd) => [
        wd,
        wd === 'ter'
          ? {
              target_kcal: 1900,
              requested_adjustment_kcal: 160,
              estimated_adjustment_kcal: 160,
              status: 'adjusted',
              instructions: [instruction],
              summary: 'Mais carboidrato',
            }
          : {
              target_kcal: 1740,
              requested_adjustment_kcal: 0,
              estimated_adjustment_kcal: 0,
              status: 'base',
              instructions: [],
              summary: 'Manter plano base',
            },
      ]),
    );

  it('J. sanitizeInstruction preserva food_id', () => {
    const { adjustments } = normalizeDailyAdjustments(
      modelAdj({
        action: 'add',
        food_id: 'b3f1e1d2-0000-4000-8000-000000000001',
        food_name: 'Arroz branco cozido',
        quantity: 120,
        unit: 'g',
        estimated_kcal: 160,
      }),
      variedSchedule,
    );
    expect(adjustments.ter.instructions[0].food_id).toBe('b3f1e1d2-0000-4000-8000-000000000001');
    expect(validateDailyAdjustments(adjustments, []).ok).toBe(true);
  });

  it('K. dia ajustado sem food_id é inválido', () => {
    const { adjustments } = normalizeDailyAdjustments(
      modelAdj({
        action: 'add',
        food_name: 'Arroz branco cozido',
        quantity: 120,
        unit: 'g',
        estimated_kcal: 160,
      }),
      variedSchedule,
    );
    const result = validateDailyAdjustments(adjustments, []);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('food_id');
  });
});
