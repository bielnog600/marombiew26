import { describe, it, expect } from 'vitest';
import {
  normalizeDailyAdjustments,
  evaluateTolerance,
  TOLERANCE_KCAL,
} from '@/lib/dailyAdjustments';
import type { WeeklyEnergySchedule } from '@/lib/weeklyEnergy';

function schedule(base: number, adj: Record<string, number>): WeeklyEnergySchedule {
  const days: any = {};
  for (const wd of ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']) {
    days[wd] = { base_kcal: base, adjustment_kcal: adj[wd] ?? 0, fixed_kcal: null };
  }
  return { base_daily_kcal: base, days } as any;
}

describe('normalizeDailyAdjustments — soma assinada das instruções', () => {
  const sch = schedule(2200, { seg: 250, qui: 250, sab: -200, dom: -300 });

  it('estimated = +292 quando add soma 292', () => {
    const model = {
      seg: {
        estimated_adjustment_kcal: 999, // será ignorado na validação
        summary: 's',
        instructions: [
          { action: 'add', food_name: 'arroz', quantity: 50, unit: 'g', estimated_kcal: 180 },
          { action: 'add', food_name: 'banana', quantity: 100, unit: 'g', estimated_kcal: 112 },
        ],
      },
    };
    const { adjustments } = normalizeDailyAdjustments(model, sch);
    expect(adjustments.seg.estimated_adjustment_kcal).toBe(292);
    expect(adjustments.seg.model_estimated_adjustment_kcal).toBe(999);
  });

  it('estimated = -141 para remove com kcals 100+41', () => {
    const model = {
      sab: {
        estimated_adjustment_kcal: -200,
        summary: 's',
        instructions: [
          { action: 'remove', food_name: 'arroz', quantity: 30, unit: 'g', estimated_kcal: 100 },
          { action: 'remove', food_name: 'azeite', quantity: 5, unit: 'g', estimated_kcal: 41 },
        ],
      },
    };
    const { adjustments } = normalizeDailyAdjustments(model, sch);
    expect(adjustments.sab.estimated_adjustment_kcal).toBe(-141);
  });

  it('dia base zera estimated', () => {
    const model = { ter: { estimated_adjustment_kcal: 50, summary: '', instructions: [] } };
    const { adjustments } = normalizeDailyAdjustments(model, sch);
    expect(adjustments.ter.estimated_adjustment_kcal).toBe(0);
    expect(adjustments.ter.status).toBe('base');
  });
});

describe('evaluateTolerance — MVP ±75 kcal', () => {
  it('TOLERANCE_KCAL fixa em 75', () => {
    expect(TOLERANCE_KCAL).toBe(75);
  });

  it('diferença 42 kcal está dentro (+250 vs +292)', () => {
    const r = evaluateTolerance(250, 292);
    expect(r.state).toBe('within_tolerance');
    expect(r.tolerance_kcal).toBe(75);
    expect(r.difference_kcal).toBe(42);
  });

  it('diferença 59 kcal está dentro (-200 vs -141)', () => {
    const r = evaluateTolerance(-200, -141);
    expect(r.state).toBe('within_tolerance');
    expect(r.difference_kcal).toBe(59);
  });

  it('diferença 31 kcal está dentro (-300 vs -269)', () => {
    const r = evaluateTolerance(-300, -269);
    expect(r.state).toBe('within_tolerance');
  });

  it('diferença 100 kcal está fora', () => {
    const r = evaluateTolerance(250, 350);
    expect(r.state).toBe('outside_tolerance');
  });

  it('requested=0 retorna base_day', () => {
    const r = evaluateTolerance(0, 0);
    expect(r.state).toBe('base_day');
  });

  it('estimated ausente retorna missing_data', () => {
    const r = evaluateTolerance(250, null);
    expect(r.state).toBe('missing_data');
  });
});