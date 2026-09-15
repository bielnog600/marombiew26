/**
 * HOTFIX FINAL — Carb Cycling não pode exigir dailyAdjustments duplicado.
 * Separação weekdayTargetMode × dailyAdjustmentMode.
 */
import { describe, it, expect } from 'vitest';
import {
  scheduleHasDailyMacroTargets,
  hasMeaningfulDailyTargetVariation,
  hasManualWeeklyAdjustment,
  validateDayTargets,
} from '../../supabase/functions/_shared/dayTargets.ts';
import { validatePublicationDailyAdjustments } from '../../supabase/functions/_shared/dietPublication.ts';
import { modelDietMentionsLinearTargets } from '@/lib/modelDietFoods';

const WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;

const day = (kcal: number, p: number, c: number, g: number, type?: string) => ({
  base_kcal: 1740,
  adjustment_kcal: 0,
  fixed_kcal: kcal,
  target_kcal: kcal,
  day_type: type ?? null,
  protein_g: p,
  carbs_g: c,
  fat_g: g,
});

// Carb cycling: MEDIUM / HIGH / MEDIUM / HIGH / LOW / LOW / MEDIUM
const carbCyclingSchedule = () => ({
  base_daily_kcal: 1740,
  days: {
    seg: day(1742, 148, 121, 74, 'medium'),
    ter: day(1903, 148, 161, 74, 'high'),
    qua: day(1742, 148, 121, 74, 'medium'),
    qui: day(1903, 148, 161, 74, 'high'),
    sex: day(1580, 148, 81, 74, 'low'),
    sab: day(1580, 148, 81, 74, 'low'),
    dom: day(1742, 148, 121, 74, 'medium'),
  },
});

const linearSchedule = () => ({
  base_daily_kcal: 1740,
  days: Object.fromEntries(WD.map((wd) => [wd, day(1740, 135, 175, 55)])),
});

const manualSchedule = () => ({
  base_daily_kcal: 1740,
  days: Object.fromEntries(
    WD.map((wd) => {
      const extra = wd === 'ter' || wd === 'qui' ? 160 : wd === 'sex' || wd === 'sab' ? -140 : 0;
      return [wd, {
        base_kcal: 1740,
        adjustment_kcal: extra,
        fixed_kcal: null,
        target_kcal: 1740 + extra,
        protein_g: 135,
        carbs_g: 175 + extra / 4,
        fat_g: 55,
      }];
    }),
  ),
});

// Espelho exato das flags do diet-agent.
const flags = (schedule: any, carbCyclingEnabled: boolean) => {
  const weekdayTargetMode =
    scheduleHasDailyMacroTargets(schedule) && hasMeaningfulDailyTargetVariation(schedule);
  return {
    weekdayTargetMode,
    dailyAdjustmentMode:
      weekdayTargetMode && !carbCyclingEnabled && hasManualWeeklyAdjustment(schedule),
  };
};

const planFromSchedule = (schedule: any) => ({
  days: WD.map((wd) => ({
    weekday: wd,
    totals: {
      kcal: schedule.days[wd].target_kcal,
      p: schedule.days[wd].protein_g,
      c: schedule.days[wd].carbs_g,
      g: schedule.days[wd].fat_g,
    },
  })),
});

describe('Carb Cycling × dailyAdjustments', () => {
  it('A. carb cycling com 7 metas diferentes → weekdayTargetMode e sem dailyAdjustmentMode', () => {
    const f = flags(carbCyclingSchedule(), true);
    expect(f.weekdayTargetMode).toBe(true);
    expect(f.dailyAdjustmentMode).toBe(false);
  });

  it('B/C/D. validateDayTargets continua obrigatório e nada de daily_adjustments_invalid', () => {
    const s = carbCyclingSchedule();
    const report = validateDayTargets(planFromSchedule(s), s);
    expect(report.ok).toBe(true);
    expect(report.checkedDays).toBe(7);
    expect(flags(s, true).dailyAdjustmentMode).toBe(false);
  });

  it('E. linear (7 dias iguais) → nenhum dos dois modos', () => {
    const f = flags(linearSchedule(), false);
    expect(f.weekdayTargetMode).toBe(false);
    expect(f.dailyAdjustmentMode).toBe(false);
  });

  it('F. carb cycling off + ajustes manuais por dia → os dois modos ativos', () => {
    const f = flags(manualSchedule(), false);
    expect(f.weekdayTargetMode).toBe(true);
    expect(f.dailyAdjustmentMode).toBe(true);
  });

  it('I/J. LOW valida contra LOW e HIGH contra HIGH', () => {
    const s = carbCyclingSchedule();
    const plan = planFromSchedule(s);
    // SEX (LOW) recebendo os totais do dia HIGH deve reprovar.
    plan.days[4].totals = { kcal: 1903, p: 148, c: 161, g: 74 };
    const report = validateDayTargets(plan, s);
    expect(report.ok).toBe(false);
    expect(report.issues[0].weekday).toBe('sex');
  });
});

describe('Publicação com carb cycling', () => {
  const protocols = (carb: boolean) => ({
    carb_cycling: { enabled: carb },
    weekly_energy_schedule: carbCyclingSchedule(),
  });

  it('G. não exige generated_adjustments quando carb cycling está ativo', () => {
    const r = validatePublicationDailyAdjustments(protocols(true), new Map() as any);
    expect(r.ok).toBe(true);
  });

  it('H. modo manual continua exigindo os ajustes', () => {
    const r = validatePublicationDailyAdjustments(
      { carb_cycling: { enabled: false }, weekly_energy_schedule: carbCyclingSchedule() },
      new Map() as any,
    );
    expect(r.ok).toBe(false);
  });
});

describe('Aviso de dieta modelo linear', () => {
  it('K. detecta menção a dieta linear', () => {
    expect(modelDietMentionsLinearTargets('Plano sem ciclagem de carboidratos')).toBe(true);
    expect(modelDietMentionsLinearTargets('Meta única para os 7 dias')).toBe(true);
    expect(modelDietMentionsLinearTargets('Mesma meta todos os dias')).toBe(true);
    expect(modelDietMentionsLinearTargets('Café da manhã: ovos — 100 g')).toBe(false);
  });
});
