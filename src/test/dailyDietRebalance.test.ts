import { describe, it, expect } from 'vitest';
import {
  classifyFood,
  mealMacros,
  rebalanceFutureMeals,
  resolveMealStates,
  scaleFood,
  sumMealMacros,
} from '@/lib/dailyDietRebalance';
import type { ParsedMeal } from '@/lib/dietResultParser';

const food = (name: string, qty: string, kcal: number, p: number, c: number, g: number) => ({
  food: name,
  qty,
  kcal: String(kcal),
  p: String(p),
  c: String(c),
  g: String(g),
});

const buildDay = (): ParsedMeal[] => [
  { name: 'Café da manhã', foods: [food('Ovos', '100 g', 300, 25, 5, 20)] },
  { name: 'Almoço', foods: [food('Frango', '150 g', 300, 45, 0, 12), food('Arroz', '150 g', 300, 6, 65, 1)] },
  { name: 'Lanche', foods: [food('Whey', '30 g', 200, 24, 8, 3)] },
  { name: 'Jantar', foods: [food('Carne', '150 g', 400, 40, 0, 25), food('Batata', '200 g', 200, 4, 45, 0)] },
  { name: 'Ceia', foods: [food('Iogurte', '200 g', 300, 20, 30, 8)] },
];

describe('classifyFood', () => {
  it('classifies dominant macro sources', () => {
    expect(classifyFood(food('Frango', '150 g', 300, 45, 0, 12))).toBe('protein');
    expect(classifyFood(food('Arroz', '150 g', 300, 6, 65, 1))).toBe('carb');
    expect(classifyFood(food('Azeite', '10 g', 90, 0, 0, 10))).toBe('fat');
    expect(classifyFood(food('Alface', '50 g', 8, 0.5, 1, 0))).toBe('low_calorie');
  });
});

describe('scaleFood', () => {
  it('scales quantity and macros', () => {
    const scaled = scaleFood(food('Arroz', '150 g', 300, 6, 66, 2), 2);
    expect(scaled.qty).toBe('300 g');
    expect(Number(scaled.kcal)).toBe(600);
    expect(Number(scaled.c)).toBe(132);
  });
});

describe('rebalanceFutureMeals', () => {
  const day = buildDay();
  const dailyTarget = sumMealMacros(day);

  it('never modifies completed meals nor the edited meal', () => {
    const edited = day.map((m, i) =>
      i === 1 ? { ...m, foods: [m.foods[0]] } : m,
    ); // remove arroz (-300 kcal)
    const result = rebalanceFutureMeals({
      meals: edited,
      completedIndexes: [0],
      currentIndex: 1,
      dailyTarget,
    });
    expect(result.meals[0]).toBe(edited[0]);
    expect(result.meals[1]).toBe(edited[1]);
    expect(result.futureIndexes).toEqual([2, 3, 4]);
  });

  it('redistributes a removal across future meals keeping the daily target', () => {
    const edited = day.map((m, i) => (i === 1 ? { ...m, foods: [m.foods[0]] } : m));
    const result = rebalanceFutureMeals({
      meals: edited,
      completedIndexes: [0],
      currentIndex: 1,
      dailyTarget,
    });
    const total = sumMealMacros(result.meals);
    // Macros are the primary target; kcal follows within a small tolerance.
    expect(Math.abs(total.c - dailyTarget.c)).toBeLessThan(5);
    expect(Math.abs(total.p - dailyTarget.p)).toBeLessThan(5);
    expect(Math.abs(total.kcal - dailyTarget.kcal)).toBeLessThan(dailyTarget.kcal * 0.1);
    expect(mealMacros(result.meals[3]).kcal).toBeGreaterThan(mealMacros(day[3]).kcal);
  });

  it('reduces future meals when the student adds food', () => {
    const edited = day.map((m, i) =>
      i === 1 ? { ...m, foods: [...m.foods, food('Pão', '100 g', 250, 8, 50, 2)] } : m,
    );
    const result = rebalanceFutureMeals({
      meals: edited,
      completedIndexes: [0],
      currentIndex: 1,
      dailyTarget,
    });
    expect(mealMacros(result.meals[3]).kcal).toBeLessThan(mealMacros(day[3]).kcal);
    const total = sumMealMacros(result.meals);
    expect(Math.abs(total.c - dailyTarget.c)).toBeLessThan(8);
    expect(Math.abs(total.kcal - dailyTarget.kcal)).toBeLessThan(dailyTarget.kcal * 0.1);
  });

  it('does nothing when there is no future meal', () => {
    const result = rebalanceFutureMeals({
      meals: day,
      completedIndexes: [0, 1, 2, 3],
      currentIndex: 4,
      dailyTarget,
    });
    expect(result.applied).toBe(false);
    expect(result.meals).toBe(day);
  });
});

describe('resolveMealStates', () => {
  it('marks completed, current and future meals', () => {
    expect(resolveMealStates(4, [0], 1)).toEqual(['completed', 'current', 'future', 'future']);
  });
});
