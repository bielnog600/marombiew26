import { describe, it, expect } from 'vitest';
import { resolveDayTarget, applyDayTargetToSchedule, scheduleDayTarget } from '@/lib/dietDayTargets';
import { parsedDaysToDietPlan } from '@/lib/dietPlanAdapter';
import type { DietTargets } from '@/lib/dietSchema';

const schedule = {
  base_daily_kcal: 2660,
  days: {
    seg: { adjustment_kcal: -83 },
    ter: { target_kcal: 2700 },
    qua: { fixed_kcal: 2400, target_kcal: 2700 },
  },
};

describe('resolveDayTarget', () => {
  it('usa base + ajuste do cronograma (segunda)', () => {
    expect(resolveDayTarget({ schedule, dayIndex: 0, planTargetKcal: 2660 })).toBe(2577);
  });

  it('prioriza target_kcal persistido', () => {
    expect(resolveDayTarget({ schedule, dayIndex: 1, planTargetKcal: 2660 })).toBe(2700);
  });

  it('prioriza fixed_kcal sobre target_kcal', () => {
    expect(resolveDayTarget({ schedule, dayIndex: 2, planTargetKcal: 2660 })).toBe(2400);
  });

  it('cai para a meta do plano quando o dia não está no cronograma', () => {
    expect(resolveDayTarget({ schedule, dayIndex: 4, planTargetKcal: 2660 })).toBe(2660);
  });

  it('cai para o total atual em planos legados sem meta', () => {
    expect(resolveDayTarget({ dayIndex: 0, planTargetKcal: 0, currentTotalKcal: 1980 })).toBe(1980);
  });

  it('sem cronograma retorna null em scheduleDayTarget', () => {
    expect(scheduleDayTarget(null, 0, 2000)).toBeNull();
  });
});

describe('applyDayTargetToSchedule', () => {
  it('altera somente o dia editado', () => {
    const next = applyDayTargetToSchedule(schedule, 0, 2500)!;
    expect(next.days!.seg).toMatchObject({ fixed_kcal: 2500, target_kcal: 2500 });
    expect(next.days!.ter).toEqual(schedule.days.ter);
    expect(schedule.days.seg).toEqual({ adjustment_kcal: -83 });
  });
});

describe('parsedDaysToDietPlan', () => {
  const targets: DietTargets = { kcal: 2000, p: 150, c: 200, g: 60 };
  const days = [
    { label: 'Segunda', meals: [{ name: 'Café', time: '07:00', foods: [{ food: 'Ovo', qty: '100 g', kcal: '150', p: '13', c: '1', g: '10' }] }] },
    { label: 'Terça', meals: [{ name: 'Café', time: '07:00', foods: [{ food: 'Aveia', qty: '50 g', kcal: '190', p: '6', c: '33', g: '3' }] }] },
  ] as any;

  it('preserva todos os dias no plano canônico', () => {
    const plan = parsedDaysToDietPlan(days, targets);
    expect(plan.days).toHaveLength(2);
    expect(plan.days.map(d => d.label)).toEqual(['Segunda', 'Terça']);
    expect(plan.days[1].meals[0].items[0].name).toBe('Aveia');
  });

  it('preserva metadados do plano anterior', () => {
    const base: any = { meta: { version: '1.0', objective: 'cutting' }, targets, days: [], tips: ['beber água'] };
    const plan = parsedDaysToDietPlan(days, targets, base);
    expect(plan.meta.objective).toBe('cutting');
    expect(plan.tips).toEqual(['beber água']);
  });
});
