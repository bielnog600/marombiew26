import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DailyCaloriesCard from '@/components/diet/DailyCaloriesCard';
import {
  formatSignedKcalDiff,
  mealCompletionExcess,
  rebalanceSingleMeal,
  recomputeMealTotals,
} from '@/lib/studentMealGuard';

const food = (name: string, qty: string, kcal: number, p: number, c: number, g: number) => ({
  food: name, qty, kcal: String(kcal), p: String(p), c: String(c), g: String(g),
});
const TARGET = { kcal: 2452, p: 207, c: 258, g: 67 };

describe('DailyCaloriesCard usa a meta prescrita', () => {
  it('2651 consumidas contra meta 2452 mostra +199 kcal acima da meta, não "Meta atingida"', () => {
    const { getByText, queryByText } = render(
      <DailyCaloriesCard consumed={2651} target={2452}
        protein={{ current: 223, target: 207 }} carbs={{ current: 257, target: 258 }} fats={{ current: 82, target: 67 }} />,
    );
    expect(getByText('+199 kcal acima da meta')).toBeTruthy();
    expect(queryByText('Meta atingida')).toBeNull();
  });

  it('gordura 82/67 g é destacada; carbo 257/258 não', () => {
    const { container } = render(
      <DailyCaloriesCard consumed={2651} target={2452}
        protein={{ current: 223, target: 207 }} carbs={{ current: 257, target: 258 }} fats={{ current: 82, target: 67 }} />,
    );
    const pills = container.querySelectorAll('[data-over]');
    expect(pills[1].getAttribute('data-over')).toBe('false');
    expect(pills[2].getAttribute('data-over')).toBe('true');
  });

  it('abaixo da meta continua "Restam X kcal"', () => {
    const { getByText } = render(
      <DailyCaloriesCard consumed={2000} target={2452}
        protein={{ current: 0, target: 207 }} carbs={{ current: 0, target: 258 }} fats={{ current: 0, target: 67 }} />,
    );
    expect(getByText('Restam 452 kcal')).toBeTruthy();
  });
});

describe('aviso ao concluir refeição acima da meta', () => {
  const meals = [
    { name: 'Almoço', foods: [food('Frango', '200 g', 1900, 180, 200, 40)] },
    { name: 'Jantar', foods: [food('Arroz', '380 g', 751, 43, 57, 42)] },
  ] as any;
  it('jantar leva o dia a 2651 kcal → +199 kcal e G +15', () => {
    const r = mealCompletionExcess({ meals, completedIndexes: [0], mealIndex: 1, dailyTarget: TARGET });
    expect(r.exceeds).toBe(true);
    expect(Math.round(r.kcal)).toBe(199);
    expect(Math.round(r.g)).toBe(15);
  });
  it('dentro de +50 kcal não avisa', () => {
    const r = mealCompletionExcess({ meals, completedIndexes: [0], mealIndex: 1, dailyTarget: { ...TARGET, kcal: 2620 } });
    expect(r.exceeds).toBe(false);
  });
});

describe('rebalanceamento da última refeição incluindo alimento adicionado', () => {
  const prescribed = [food('Tilápia', '200 g', 200, 40, 0, 4), food('Arroz branco', '300 g', 390, 8, 84, 1)];
  const edited = [
    food('Tilápia', '200 g', 200, 40, 0, 4),
    food('Arroz branco', '380 g', 494, 10, 106, 1),
    food('Abacate', '100 g', 160, 2, 9, 15),
    food('Queijo cottage', '100 g', 100, 11, 3, 4),
  ];
  const other = { kcal: 2452 - 505, p: 160, c: 170, g: 50 };
  const r = rebalanceSingleMeal({ foods: edited, prescribedFoods: prescribed, otherTotal: other, dailyTarget: TARGET });

  it('fecha o dia dentro de ±50 kcal', () => {
    expect(r.ok).toBe(true);
    expect(Math.abs(r.dayAfter.kcal - 2452)).toBeLessThanOrEqual(50);
  });
  it('preserva a proteína principal', () => {
    expect(r.foods[0].qty).toBe('200 g');
  });
  it('reduz arroz e mexe no alimento adicionado, com gramas múltiplas de 5 e mínimo realista', () => {
    const names = r.changes.map((c) => c.foodName);
    expect(names).toContain('Arroz branco');
    r.foods.forEach((f) => {
      const n = Number(f.qty.split(' ')[0]);
      expect(n % 5).toBe(0);
      expect(n).toBeGreaterThanOrEqual(30);
    });
  });
  it('quando não dá para fechar, sugere retirar o alimento adicionado', () => {
    const bad = rebalanceSingleMeal({
      foods: edited, prescribedFoods: prescribed, otherTotal: { kcal: 2400, p: 200, c: 250, g: 60 }, dailyTarget: TARGET,
    });
    expect(bad.ok).toBe(false);
    expect(bad.suggestion).toContain('retire o Abacate');
  });
});

describe('totais por refeição recalculados a partir dos alimentos', () => {
  it('jantar com totalKcal prescrito 505 passa a 751', () => {
    const meal = {
      name: 'Jantar', totalKcal: '505 kcal', totalP: '40', totalC: '50', totalG: '10',
      foods: [food('Arroz', '380 g', 494, 10, 106, 1), food('Abacate', '100 g', 160, 2, 9, 15), food('Cottage', '100 g', 97, 11, 3, 4)],
    } as any;
    const r = recomputeMealTotals(meal);
    expect(r.totalKcal).toBe('751 kcal');
    expect(r.totalG).toBe('20');
  });
});

describe('diferença com sinal', () => {
  it('+199 / −120', () => {
    expect(formatSignedKcalDiff(199)).toBe('+199 kcal acima da meta');
    expect(formatSignedKcalDiff(-120)).toBe('−120 kcal abaixo da meta');
  });
});
