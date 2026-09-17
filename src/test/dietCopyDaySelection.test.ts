import { describe, it, expect } from 'vitest';
import type { FoodRecord } from '@/lib/nutritionEngine';
import {
  simulateCopyDayToWeek,
  allDestinationIndexes,
  sameTypeDestinationIndexes,
  normalizeDayType,
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
];

const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const makePlan = (days = 4) => ({
  days: Array.from({ length: days }, (_, i) => ({
    label: `Dia ${i + 1}`,
    weekday: WEEKDAYS[i],
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

const TARGET = { kcal: 413, p: 47.2, c: 39.2, g: 5.5 };

describe('copiar dia com seleção de destinos', () => {
  it('A/C. Selecionar todos marca todos menos a origem', () => {
    expect(allDestinationIndexes(4, 2)).toEqual([0, 1, 3]);
    expect(allDestinationIndexes(4, 2)).not.toContain(2);
  });

  it('E/F. Selecionar mesmo tipo marca só o mesmo type e nunca a origem', () => {
    const types = ['MEDIUM', 'HIGH', 'LOW', 'HIGH', 'LOW', 'LOW', 'MEDIUM'];
    expect(sameTypeDestinationIndexes(types, 2)).toEqual([4, 5]);
    expect(sameTypeDestinationIndexes(types, 2)).not.toContain(2);
    expect(sameTypeDestinationIndexes([null, null], 0)).toEqual([]);
    expect(normalizeDayType('low')).toBe('LOW');
    expect(normalizeDayType('xx')).toBeNull();
  });

  it('H/I. simulação usa apenas os destinationIndexes selecionados', () => {
    const plan: any = makePlan(4);
    plan.days[1].meals[0].items[0].qtyGrams = 10;
    plan.days[3].meals[0].items[0].qtyGrams = 42;
    const sim = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      destinationIndexes: [1],
      targetsByDay: [null, TARGET, TARGET, TARGET],
      foods: FOODS,
    });
    expect(sim.results.map((r) => r.dayIndex)).toEqual([1]);
    expect((sim.plan as any).days[2]).toEqual(plan.days[2]);
    expect((sim.plan as any).days[3].meals[0].items[0].qtyGrams).toBe(42);
  });

  it('J/K/Q/R. destino válido é alterado, origem intacta, sem lock/snapshot copiado', () => {
    const plan: any = makePlan(2);
    plan.days[0].meals[0].items[0].manualLocked = true;
    plan.days[0].meals[0].items[0].nutritionSnapshot = { kcal: 1 };
    plan.days[1].meals[0].items = [
      { foodId: 'f1', name: 'Arroz integral', qtyGrams: 10, resolutionStatus: 'resolved_by_id', macros: { kcal: 0, p: 0, c: 0, g: 0 } },
    ];
    const sim = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      destinationIndexes: [1],
      targetsByDay: [null, TARGET],
      foods: FOODS,
    });
    expect(sim.results[0].status).toBe('ok');
    expect((sim.plan as any).days[0]).toEqual(plan.days[0]);
    const items = (sim.plan as any).days[1].meals[0].items;
    expect(items).toHaveLength(2);
    items.forEach((it: any) => {
      expect(it.manualLocked).toBe(false);
      expect(it.nutritionSnapshot).toBeUndefined();
    });
  });

  it('L/M. destino inviável fica intacto e o target usado é o do destino', () => {
    const plan: any = makePlan(2);
    plan.days[1].meals[0].items[0].qtyGrams = 42;
    const sim = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      destinationIndexes: [1],
      targetsByDay: [null, { kcal: 9000, p: 800, c: 900, g: 700 }],
      foods: FOODS,
    });
    expect(sim.results[0].status).toBe('infeasible');
    expect(sim.results[0].target?.kcal).toBe(9000);
    expect((sim.plan as any).days[1].meals[0].items[0].qtyGrams).toBe(42);
  });

  it('V/W. lista nova de destinos vale na nova simulação e ausência mantém legado', () => {
    const plan: any = makePlan(3);
    const first = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      destinationIndexes: [1],
      targetsByDay: [null, TARGET, TARGET],
      foods: FOODS,
    });
    expect(first.results.map((r) => r.dayIndex)).toEqual([1]);
    const second = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      destinationIndexes: [2],
      targetsByDay: [null, TARGET, TARGET],
      foods: FOODS,
    });
    expect(second.results.map((r) => r.dayIndex)).toEqual([2]);
    const legacy = simulateCopyDayToWeek({
      plan,
      sourceIndex: 0,
      targetsByDay: [null, TARGET, TARGET],
      foods: FOODS,
    });
    expect(legacy.results.map((r) => r.dayIndex)).toEqual([1, 2]);
  });
});
