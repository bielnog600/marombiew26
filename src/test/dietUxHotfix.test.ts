import { describe, it, expect } from 'vitest';
import type { FoodRecord } from '@/lib/nutritionEngine';
import {
  buildWorkingPlan,
  stripPreviewMeta,
  setPreviewItemQty,
  replacePreviewItemFood,
  removePreviewItem,
  canRemovePreviewItem,
  diffPreviewDay,
  previewDayStatus,
  parsePreviewGrams,
  PREVIEW_SRC_KEY,
} from '@/lib/dietPreviewEdits';
import {
  prepareDayCopy,
  simulateCopyDayToWeek,
  dayIsFullyResolved,
  COPY_DAY_MESSAGES,
} from '@/lib/dietCopyDay';

const food = (id: string, name: string, kcal: number, p: number, c: number, g: number): FoodRecord =>
  ({
    id,
    name,
    calories: kcal,
    protein: p,
    carbs: c,
    fats: g,
    portion_size: 100,
    portion: '100g',
    brand: null,
    source: null,
  }) as unknown as FoodRecord;

const FOODS: FoodRecord[] = [
  food('f1', 'Arroz integral', 130, 2.7, 28, 0.3),
  food('f2', 'Peito de Frango', 165, 31, 0, 3.6),
  food('f3', 'Azeite de oliva', 884, 0, 0, 100),
];

const makePlan = (days = 2) => ({
  days: Array.from({ length: days }, (_, i) => ({
    label: `Dia ${i + 1}`,
    weekday: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'][i],
    totals: { kcal: 0, p: 0, c: 0, g: 0 },
    meals: [
      {
        name: 'Almoço',
        totals: { kcal: 0, p: 0, c: 0, g: 0 },
        items: [
          {
            foodId: 'f1',
            name: 'Arroz integral',
            qtyGrams: 100,
            resolutionStatus: 'resolved_by_id',
            macros: { kcal: 0, p: 0, c: 0, g: 0 },
          },
          {
            foodId: 'f2',
            name: 'Peito de Frango',
            qtyGrams: 100,
            resolutionStatus: 'resolved_by_id',
            macros: { kcal: 0, p: 0, c: 0, g: 0 },
          },
        ],
      },
    ],
  })),
});

describe('preview editável do autoajuste', () => {
  it('A. buildWorkingPlan marca índices de origem e stripPreviewMeta os remove', () => {
    const wp: any = buildWorkingPlan(makePlan(), 0);
    expect(wp.days[0].meals[0].items[1][PREVIEW_SRC_KEY]).toBe(1);
    const clean: any = stripPreviewMeta(wp);
    expect(clean.days[0].meals[0].items[1][PREVIEW_SRC_KEY]).toBeUndefined();
  });

  it('B. parsePreviewGrams aceita vírgula e rejeita zero/negativo/vazio', () => {
    expect(parsePreviewGrams('130,5')).toBe(130.5);
    expect(parsePreviewGrams('0')).toBeNull();
    expect(parsePreviewGrams('-5')).toBeNull();
    expect(parsePreviewGrams('')).toBeNull();
  });

  it('C. editar quantidade recalcula macros pelo nutritionCore e trava o item', () => {
    const wp = buildWorkingPlan(makePlan(), 0);
    const next: any = setPreviewItemQty(wp, { dayIndex: 0, mealIndex: 0, itemIndex: 0 }, 200, FOODS);
    expect(next.days[0].meals[0].items[0].qtyGrams).toBe(200);
    expect(next.days[0].meals[0].items[0].manualLocked).toBe(true);
    expect(Math.round(next.days[0].meals[0].items[0].macros.kcal)).toBe(260);
  });

  it('D. plano original não é mutado pelas edições do preview', () => {
    const original: any = makePlan();
    const wp = buildWorkingPlan(original, 0);
    setPreviewItemQty(wp, { dayIndex: 0, mealIndex: 0, itemIndex: 0 }, 300, FOODS);
    expect(original.days[0].meals[0].items[0].qtyGrams).toBe(100);
  });

  it('E. substituir alimento mantém a quantidade e vincula por foodId', () => {
    const wp = buildWorkingPlan(makePlan(), 0);
    const next: any = replacePreviewItemFood(
      wp,
      { dayIndex: 0, mealIndex: 0, itemIndex: 0 },
      FOODS[2],
      FOODS,
    );
    const item = next.days[0].meals[0].items[0];
    expect(item.foodId).toBe('f3');
    expect(item.qtyGrams).toBe(100);
    expect(item.resolutionStatus).toBe('resolved_by_id');
    expect(item.manualLocked).toBe(true);
  });

  it('F. remover item funciona, mas a refeição nunca fica vazia', () => {
    const wp = buildWorkingPlan(makePlan(), 0);
    const next: any = removePreviewItem(wp, { dayIndex: 0, mealIndex: 0, itemIndex: 1 }, FOODS);
    expect(next.days[0].meals[0].items).toHaveLength(1);
    expect(canRemovePreviewItem(next, { dayIndex: 0, mealIndex: 0, itemIndex: 0 })).toBe(false);
    const blocked = removePreviewItem(next, { dayIndex: 0, mealIndex: 0, itemIndex: 0 }, FOODS);
    expect(blocked).toBe(next);
  });

  it('G. diff reporta quantidade, substituição e remoção', () => {
    const original = makePlan();
    let wp: any = buildWorkingPlan(original, 0);
    wp = setPreviewItemQty(wp, { dayIndex: 0, mealIndex: 0, itemIndex: 0 }, 150, FOODS);
    wp = replacePreviewItemFood(wp, { dayIndex: 0, mealIndex: 0, itemIndex: 1 }, FOODS[2], FOODS);
    const diffs = diffPreviewDay(original, wp, 0);
    expect(diffs.map((d) => d.kind).sort()).toEqual(['qty', 'replace']);
    const removed = removePreviewItem(wp, { dayIndex: 0, mealIndex: 0, itemIndex: 1 }, FOODS);
    expect(diffPreviewDay(original, removed, 0).some((d) => d.kind === 'remove')).toBe(true);
  });

  it('H. previewDayStatus usa a tolerância oficial', () => {
    const wp = buildWorkingPlan(makePlan(), 0);
    const target = { kcal: 295, p: 33.7, c: 28, g: 3.9 };
    const status = previewDayStatus(wp, 0, target, FOODS);
    expect(status.withinTolerance).toBe(true);
    const off = previewDayStatus(wp, 0, { ...target, kcal: 1200 }, FOODS);
    expect(off.withinTolerance).toBe(false);
  });

  it('I. sem meta, o preview nunca se declara dentro da tolerância', () => {
    const wp = buildWorkingPlan(makePlan(), 0);
    const status = previewDayStatus(wp, 0, null, FOODS);
    expect(status.diff).toBeNull();
    expect(status.withinTolerance).toBe(false);
  });
});

describe('copiar dia para a semana', () => {
  it('J. dia com alimento não validado bloqueia a cópia', () => {
    const plan: any = makePlan();
    plan.days[0].meals[0].items[0].foodId = null;
    expect(dayIsFullyResolved(plan, 0, FOODS)).toBe(false);
    const sim = simulateCopyDayToWeek({ plan, sourceIndex: 0, foods: FOODS });
    expect(sim.blocked).toBe(COPY_DAY_MESSAGES.unresolved);
    expect(sim.plan).toBe(plan);
  });

  it('K. prepareDayCopy preserva weekday/label do destino e destrava os itens', () => {
    const plan: any = makePlan();
    plan.days[0].meals[0].items[0].manualLocked = true;
    const dest = prepareDayCopy(plan.days[0], plan.days[1]);
    expect(dest.weekday).toBe('ter');
    expect(dest.label).toBe('Dia 2');
    expect(dest.meals[0].items[0].manualLocked).toBe(false);
  });

  it('L. destino sem meta válida não é sobrescrito', () => {
    const plan: any = makePlan();
    plan.days[1].meals[0].items[0].qtyGrams = 999;
    const sim = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      targetsByDay: [null, null],
      foods: FOODS,
    });
    expect(sim.results[0].status).toBe('no_target');
    expect((sim.plan as any).days[1].meals[0].items[0].qtyGrams).toBe(999);
  });

  it('M. destino com meta atingível recebe o cardápio ajustado à própria meta', () => {
    const plan: any = makePlan();
    plan.days[1].meals[0].items = [
      { foodId: 'f1', name: 'Arroz integral', qtyGrams: 10, resolutionStatus: 'resolved_by_id', macros: { kcal: 0, p: 0, c: 0, g: 0 } },
    ];
    const target = { kcal: 590, p: 67.4, c: 56, g: 7.8 };
    const sim = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      targetsByDay: [null, target],
      foods: FOODS,
    });
    expect(sim.results[0].status).toBe('ok');
    const destItems = (sim.plan as any).days[1].meals[0].items;
    expect(destItems).toHaveLength(2);
    expect(destItems.map((i: any) => i.foodId)).toEqual(['f1', 'f2']);
    expect(Math.abs((sim.results[0].totals as any).kcal - target.kcal)).toBeLessThanOrEqual(50);
  });

  it('N. o dia de origem nunca é alterado pela cópia', () => {
    const plan: any = makePlan();
    const sim = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      targetsByDay: [null, { kcal: 590, p: 67.4, c: 56, g: 7.8 }],
      foods: FOODS,
    });
    expect((sim.plan as any).days[0]).toEqual(plan.days[0]);
  });

  it('O. meta impossível marca o destino como inviável sem sobrescrever', () => {
    const plan: any = makePlan();
    plan.days[1].meals[0].items[0].qtyGrams = 42;
    const sim = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      targetsByDay: [null, { kcal: 9000, p: 800, c: 900, g: 700 }],
      foods: FOODS,
    });
    expect(sim.results[0].status).toBe('infeasible');
    expect((sim.plan as any).days[1].meals[0].items[0].qtyGrams).toBe(42);
  });
});
