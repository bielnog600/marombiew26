/**
 * FASE 5 — testes do optimizer determinístico de porções.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  optimizeDietDay,
  optimizeDietPlan,
  buildPortionRule,
  stepForQuantity,
  compareScores,
  scoreAdjustmentCandidate,
} from '@/lib/dietAutoAdjust';
import type { FoodRecord } from '@/lib/nutritionEngine';

const food = (id: string, name: string, kcal: number, p: number, c: number, g: number): FoodRecord => ({
  id,
  name,
  portion_size: 100,
  calories: kcal,
  protein: p,
  carbs: c,
  fats: g,
});

const ARROZ = food('rice-id', 'Arroz branco', 130, 2.7, 28, 0.3);
const FRANGO = food('chicken-id', 'Frango grelhado', 165, 31, 0, 3.6);
const AZEITE = food('oil-id', 'Azeite', 884, 0, 0, 100);
const FOODS = [ARROZ, FRANGO, AZEITE];

const item = (f: FoodRecord, qty: number, extra: Record<string, unknown> = {}) => ({
  foodId: f.id,
  name: f.name,
  qtyGrams: qty,
  macros: { kcal: 0, p: 0, c: 0, g: 0 },
  ...extra,
});

const makePlan = (items: any[], weekday?: string) => ({
  meta: { version: '1.0' },
  targets: { kcal: 0, p: 0, c: 0, g: 0 },
  days: [
    {
      label: 'Padrão',
      ...(weekday ? { weekday } : {}),
      meals: [
        {
          id: 'm1',
          name: 'Almoço',
          order: 0,
          items,
          totals: { kcal: 0, p: 0, c: 0, g: 0 },
        },
      ],
      totals: { kcal: 0, p: 0, c: 0, g: 0 },
    },
  ],
});

const totalsOf = (items: Array<[FoodRecord, number]>) =>
  items.reduce(
    (acc, [f, q]) => ({
      kcal: acc.kcal + (f.calories * q) / 100,
      p: acc.p + (f.protein * q) / 100,
      c: acc.c + (f.carbs * q) / 100,
      g: acc.g + (f.fats * q) / 100,
    }),
    { kcal: 0, p: 0, c: 0, g: 0 },
  );

describe('Fase 5 — regras de quantidade', () => {
  it('G/H/I. steps e bounds derivam apenas da quantidade atual', () => {
    expect(stepForQuantity(10)).toBe(1);
    expect(stepForQuantity(80)).toBe(5);
    expect(stepForQuantity(200)).toBe(10);
    expect(buildPortionRule(10)).toEqual({ minGrams: 5, maxGrams: 16, stepGrams: 1 });
    expect(buildPortionRule(80).minGrams).toBe(40);
    expect(buildPortionRule(200)).toEqual({ minGrams: 100, maxGrams: 320, stepGrams: 10 });
  });
});

describe('Fase 5 — status do optimizer', () => {
  it('A. dentro da tolerância → already_within_target', () => {
    const plan = makePlan([item(ARROZ, 100), item(FRANGO, 100)]);
    const target = totalsOf([[ARROZ, 100], [FRANGO, 100]]);
    const res = optimizeDietDay({ plan, dayIndex: 0, target, foods: FOODS });
    expect(res.status).toBe('already_within_target');
    expect(res.changes).toHaveLength(0);
  });

  it('B. unresolved → blocked_unresolved', () => {
    const plan = makePlan([
      item(ARROZ, 200),
      { foodId: null, name: 'Tapioca artesanal', qtyGrams: 50, macros: { kcal: 0, p: 0, c: 0, g: 0 } },
    ]);
    const res = optimizeDietDay({
      plan,
      dayIndex: 0,
      target: { kcal: 1000, p: 80, c: 100, g: 30 },
      foods: FOODS,
    });
    expect(res.status).toBe('blocked_unresolved');
    expect(res.changes).toHaveLength(0);
  });

  it('C. todos locked → no_adjustable_items', () => {
    const plan = makePlan([
      item(ARROZ, 200, { manualLocked: true }),
      item(FRANGO, 200, { manualLocked: true }),
    ]);
    const res = optimizeDietDay({
      plan,
      dayIndex: 0,
      target: { kcal: 1200, p: 120, c: 120, g: 40 },
      foods: FOODS,
    });
    expect(res.status).toBe('no_adjustable_items');
    expect(res.changedItems).toBe(0);
  });
});

describe('Fase 5 — solver', () => {
  const targetSimple = totalsOf([[ARROZ, 150], [FRANGO, 150], [AZEITE, 15]]);

  it('K/E/F/J. fecha o caso simples sem trocar foodId/refeição e usando foods.calories', () => {
    const plan = makePlan([item(ARROZ, 250), item(FRANGO, 100), item(AZEITE, 10)]);
    const res = optimizeDietDay({ plan, dayIndex: 0, target: targetSimple, foods: FOODS });
    expect(res.status).toBe('feasible');
    expect(res.withinTolerance).toBe(true);
    const items = (res.adjustedPlan as any).days[0].meals[0].items;
    expect(items.map((i: any) => i.foodId)).toEqual(['rice-id', 'chicken-id', 'oil-id']);
    expect((res.adjustedPlan as any).days[0].meals[0].name).toBe('Almoço');
    // kcal oficial (130/100g), nunca 4/4/9 (que daria ~125,5 para o arroz)
    const rice = items[0];
    expect(rice.macros.kcal).toBeCloseTo((130 * rice.qtyGrams) / 100, 1);
  });

  it('D. item manualLocked nunca muda', () => {
    const plan = makePlan([
      item(ARROZ, 250, { manualLocked: true }),
      item(FRANGO, 100),
      item(AZEITE, 10),
    ]);
    const res = optimizeDietDay({ plan, dayIndex: 0, target: targetSimple, foods: FOODS });
    const items = (res.adjustedPlan as any).days[0].meals[0].items;
    expect(items[0].qtyGrams).toBe(250);
    expect(res.changes.every((c) => c.foodId !== 'rice-id')).toBe(true);
  });

  it('G/H/I. resultado respeita min, max e step', () => {
    const plan = makePlan([item(ARROZ, 200)]);
    const res = optimizeDietDay({
      plan,
      dayIndex: 0,
      target: { kcal: 5000, p: 300, c: 900, g: 10 },
      foods: FOODS,
    });
    const qty = (res.adjustedPlan as any).days[0].meals[0].items[0].qtyGrams;
    expect(qty).toBeLessThanOrEqual(320);
    expect(qty).toBeGreaterThanOrEqual(100);
    expect(qty % 10).toBe(0);
  });

  it('L. retorna infeasible quando é impossível', () => {
    const plan = makePlan([item(ARROZ, 100)]);
    const res = optimizeDietDay({
      plan,
      dayIndex: 0,
      target: { kcal: 600, p: 10, c: 40, g: 45 },
      foods: FOODS,
    });
    expect(res.status).toBe('infeasible');
    expect(res.withinTolerance).toBe(false);
    expect(res.reason).toContain('Não foi possível fechar os macros');
  });

  it('M/N. menor número de itens vence e o resultado é determinístico', () => {
    const plan = makePlan([item(ARROZ, 250), item(FRANGO, 100), item(AZEITE, 10)]);
    const a = optimizeDietDay({ plan, dayIndex: 0, target: targetSimple, foods: FOODS });
    const b = optimizeDietDay({
      plan: JSON.parse(JSON.stringify(plan)),
      dayIndex: 0,
      target: targetSimple,
      foods: FOODS,
    });
    expect(b.adjustedPlan).toEqual(a.adjustedPlan);
    expect(b.changes).toEqual(a.changes);
    expect(a.changedItems).toBeLessThanOrEqual(3);
  });

  it('O. tie-break é estável por refeição/posição', () => {
    const s = scoreAdjustmentCandidate({
      diff: { kcal: 0, p: 0, c: 0, g: 0 },
      changedItemCount: 2,
      totalRelativeChange: 0.1,
      totalAbsoluteGramChange: 10,
    });
    expect(compareScores(s, { ...s })).toBe(0);
  });

  it('S. carboidrato zero é meta válida (sem fallback)', () => {
    const plan = makePlan([item(FRANGO, 200), item(AZEITE, 20), item(ARROZ, 60)]);
    const target = { ...totalsOf([[FRANGO, 200], [AZEITE, 20]]), c: 0 };
    const res = optimizeDietDay({ plan, dayIndex: 0, target, foods: FOODS });
    expect(res.target.c).toBe(0);
    const carbs = res.after?.c ?? 999;
    expect(carbs).toBeLessThan(res.before.c);
  });

  it('T. homônimo resolve por foodId, nunca pelo nome', () => {
    const arrozB = food('rice-b', 'Arroz branco', 358, 6.6, 79, 0.6);
    const plan = makePlan([item(ARROZ, 300), item(FRANGO, 150)]);
    const target = totalsOf([[ARROZ, 180], [FRANGO, 150]]);
    const res = optimizeDietDay({ plan, dayIndex: 0, target, foods: [ARROZ, arrozB, FRANGO] });
    const rice = (res.adjustedPlan as any).days[0].meals[0].items[0];
    expect(rice.foodId).toBe('rice-id');
    expect(rice.macros.kcal).toBeCloseTo((130 * rice.qtyGrams) / 100, 1);
  });

  it('W/X/Y. não chama IA/rede e não muta o plano original', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(() => {
      throw new Error('network call not allowed');
    });
    const plan = makePlan([item(ARROZ, 250), item(FRANGO, 100), item(AZEITE, 10)]);
    const snapshot = JSON.parse(JSON.stringify(plan));
    const res = optimizeDietDay({ plan, dayIndex: 0, target: targetSimple, foods: FOODS });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(plan).toEqual(snapshot);
    expect(res.adjustedPlan).not.toBe(plan);
    fetchSpy.mockRestore();
  });
});

describe('Fase 5 — plano completo', () => {
  it('P. linear usa o mesmo target global em cada dia', () => {
    const target = totalsOf([[ARROZ, 150], [FRANGO, 150], [AZEITE, 15]]);
    const day = () => ({
      label: 'Dia',
      meals: [
        {
          id: 'm1',
          name: 'Almoço',
          order: 0,
          items: [item(ARROZ, 250), item(FRANGO, 100), item(AZEITE, 10)],
          totals: { kcal: 0, p: 0, c: 0, g: 0 },
        },
      ],
      totals: { kcal: 0, p: 0, c: 0, g: 0 },
    });
    const plan = { meta: { version: '1.0' }, targets: target, days: [day(), day()] };
    const res = optimizeDietPlan({ plan, targetsByDay: [target, target], foods: FOODS });
    expect(res.withinTolerance).toBe(true);
    expect(res.days).toHaveLength(2);
  });

  it('Q/R. carb cycling compara cada weekday com o seu próprio target', () => {
    const low = totalsOf([[ARROZ, 100], [FRANGO, 200], [AZEITE, 20]]);
    const high = totalsOf([[ARROZ, 400], [FRANGO, 200], [AZEITE, 20]]);
    const mkDay = (weekday: string) => ({
      label: weekday,
      weekday,
      meals: [
        {
          id: 'm1',
          name: 'Almoço',
          order: 0,
          items: [item(ARROZ, 250), item(FRANGO, 150), item(AZEITE, 15)],
          totals: { kcal: 0, p: 0, c: 0, g: 0 },
        },
      ],
      totals: { kcal: 0, p: 0, c: 0, g: 0 },
    });
    const plan = { meta: { version: '1.0' }, targets: low, days: [mkDay('seg'), mkDay('qua')] };
    const res = optimizeDietPlan({ plan, targetsByDay: [high, low], foods: FOODS });
    const seg = (res.adjustedPlan as any).days[0].meals[0].items[0].qtyGrams;
    const qua = (res.adjustedPlan as any).days[1].meals[0].items[0].qtyGrams;
    expect(seg).toBeGreaterThan(qua);
    expect(res.days[0].target.c).toBeCloseTo(high.c, 5);
    expect(res.days[1].target.c).toBeCloseTo(low.c, 5);
  });
});
