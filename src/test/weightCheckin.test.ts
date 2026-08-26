import { describe, it, expect } from 'vitest';
import {
  WEIGHT_CHECKIN_INTERVAL_DAYS,
  addDaysIso,
  daysBetweenIso,
  isValidWeightKg,
  resolveWeightCheckin,
} from '@/lib/weightCheckin';
import {
  WEIGHT_REVIEW_CONFIG,
  clampCalorieReduction,
  evaluateWeightReview,
  isCuttingGoal,
  normalizeWeights,
} from '@/lib/weightReview';

const adherenceOk = { mealAdherence: 0.85, daysLogged: 12, workoutsCompleted: 8 };
const adherenceLow = { mealAdherence: 0.2, daysLogged: 12, workoutsCompleted: 1 };

describe('weight check-in (15 dias)', () => {
  it('sem peso → estado inicial', () => {
    const s = resolveWeightCheckin(null, '2026-08-26');
    expect(s.state).toBe('no_data');
    expect(s.nextCheckinDate).toBeNull();
  });

  it('14 dias → ainda não due', () => {
    const s = resolveWeightCheckin('2026-08-12', '2026-08-26');
    expect(s.state).toBe('due_soon');
    expect(s.daysUntil).toBe(1);
  });

  it('8 dias restantes → not_due', () => {
    const s = resolveWeightCheckin('2026-08-19', '2026-08-26');
    expect(s.state).toBe('not_due');
    expect(s.message).toContain('8 dias');
  });

  it('15 dias → due', () => {
    const s = resolveWeightCheckin('2026-08-11', '2026-08-26');
    expect(s.state).toBe('due');
  });

  it('>15 dias → overdue', () => {
    const s = resolveWeightCheckin('2026-08-08', '2026-08-26');
    expect(s.state).toBe('overdue');
    expect(s.daysOverdue).toBe(3);
  });

  it('helpers de data e validação', () => {
    expect(addDaysIso('2026-08-11', WEIGHT_CHECKIN_INTERVAL_DAYS)).toBe('2026-08-26');
    expect(daysBetweenIso('2026-08-11', '2026-08-26')).toBe(15);
    expect(isValidWeightKg(67.4)).toBe(true);
    expect(isValidWeightKg(10)).toBe(false);
    expect(isValidWeightKg(500)).toBe(false);
    expect(isValidWeightKg('abc')).toBe(false);
  });
});

describe('weight card data', () => {
  it('um peso → current sem previous', () => {
    const list = normalizeWeights([{ date: '2026-08-26', kg: 67.4 }]);
    expect(list).toHaveLength(1);
    expect(list[0].kg).toBe(67.4);
  });

  it('dois pesos → ordem e delta', () => {
    const list = normalizeWeights([
      { date: '2026-08-11', kg: 68.2 },
      { date: '2026-08-26', kg: 67.4 },
    ]);
    expect(list[0].date).toBe('2026-08-26');
    expect(Number((list[0].kg - list[1].kg).toFixed(1))).toBe(-0.8);
  });

  it('descarta registros inválidos', () => {
    expect(normalizeWeights([{ date: '2026-08-26', kg: 5 }])).toHaveLength(0);
  });
});

describe('weight review engine', () => {
  const cutting = 'Perda de gordura (cutting)';

  it('objetivo cutting reconhecido', () => {
    expect(isCuttingGoal(cutting)).toBe(true);
    expect(isCuttingGoal('Emagrecimento')).toBe(true);
    expect(isCuttingGoal('Hipertrofia')).toBe(false);
    expect(isCuttingGoal(null)).toBe(false);
  });

  it('cutting + peso caiu → nenhuma redução', () => {
    const r = evaluateWeightReview({
      goal: cutting,
      hasActiveDiet: true,
      adherence: adherenceOk,
      today: '2026-08-26',
      weights: [
        { date: '2026-08-26', kg: 67.4 },
        { date: '2026-08-11', kg: 68.2 },
      ],
    });
    expect(r.reason).toBe('progressing');
    expect(r.dietReviewRequired).toBe(false);
    expect(r.deltaKg).toBe(-0.8);
  });

  it('cutting + estagnação + adesão adequada → eligible', () => {
    const r = evaluateWeightReview({
      goal: cutting,
      hasActiveDiet: true,
      adherence: adherenceOk,
      today: '2026-08-26',
      weights: [
        { date: '2026-08-26', kg: 68.3 },
        { date: '2026-08-11', kg: 68.2 },
      ],
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe('eligible');
    expect(r.dietReviewRequired).toBe(true);
    expect(r.daysBetween).toBe(15);
  });

  it('peso subiu + baixa adesão → NÃO cortar', () => {
    const r = evaluateWeightReview({
      goal: cutting,
      hasActiveDiet: true,
      adherence: adherenceLow,
      today: '2026-08-26',
      weights: [
        { date: '2026-08-26', kg: 68.6 },
        { date: '2026-08-11', kg: 68.2 },
      ],
    });
    expect(r.reason).toBe('low_adherence');
    expect(r.dietReviewRequired).toBe(false);
  });

  it('hipertrofia + peso estável → NÃO cortar', () => {
    const r = evaluateWeightReview({
      goal: 'Hipertrofia',
      hasActiveDiet: true,
      adherence: adherenceOk,
      today: '2026-08-26',
      weights: [
        { date: '2026-08-26', kg: 68.2 },
        { date: '2026-08-11', kg: 68.2 },
      ],
    });
    expect(r.reason).toBe('not_cutting');
  });

  it('apenas 1 peso → NÃO cortar', () => {
    const r = evaluateWeightReview({
      goal: cutting,
      hasActiveDiet: true,
      adherence: adherenceOk,
      weights: [{ date: '2026-08-26', kg: 68.2 }],
    });
    expect(r.reason).toBe('insufficient_weights');
  });

  it('intervalo muito curto → NÃO cortar', () => {
    const r = evaluateWeightReview({
      goal: cutting,
      hasActiveDiet: true,
      adherence: adherenceOk,
      today: '2026-08-26',
      weights: [
        { date: '2026-08-26', kg: 68.3 },
        { date: '2026-08-22', kg: 68.2 },
      ],
    });
    expect(r.reason).toBe('invalid_interval');
  });

  it('ajuste recente → NÃO cortar novamente', () => {
    const r = evaluateWeightReview({
      goal: cutting,
      hasActiveDiet: true,
      adherence: adherenceOk,
      lastAutoAdjustmentDate: '2026-08-20',
      today: '2026-08-26',
      weights: [
        { date: '2026-08-26', kg: 68.3 },
        { date: '2026-08-11', kg: 68.2 },
      ],
    });
    expect(r.reason).toBe('recent_adjustment');
  });

  it('sem dieta ativa → não elegível', () => {
    const r = evaluateWeightReview({
      goal: cutting,
      hasActiveDiet: false,
      adherence: adherenceOk,
      today: '2026-08-26',
      weights: [
        { date: '2026-08-26', kg: 68.3 },
        { date: '2026-08-11', kg: 68.2 },
      ],
    });
    expect(r.reason).toBe('no_active_diet');
  });

  it('limita a redução calórica à faixa configurada', () => {
    const big = clampCalorieReduction(2000, 1500);
    expect(big.reductionPercent).toBe(WEIGHT_REVIEW_CONFIG.maxCalorieReductionPercent);
    expect(big.newKcal).toBe(1860);
    expect(big.clamped).toBe(true);

    const tiny = clampCalorieReduction(2000, 1990);
    expect(tiny.reductionPercent).toBe(WEIGHT_REVIEW_CONFIG.minCalorieReductionPercent);
    expect(tiny.newKcal).toBe(1940);
  });
});
