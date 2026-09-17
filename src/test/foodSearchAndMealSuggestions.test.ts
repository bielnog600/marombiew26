import { describe, it, expect } from 'vitest';
import {
  normalizeFoodSearch,
  filterFoodsBySearch,
  foodSearchRank,
} from '@/lib/foodSearch';
import {
  buildMealSuggestionRequest,
  validateMealSuggestions,
  applyMealSuggestion,
  collectUsedFoodsForDay,
} from '@/lib/mealAiSuggestions';
import type { FoodRecord } from '@/lib/nutritionEngine';

const food = (id: string, name: string, c: number, p: number, carb: number, g: number): FoodRecord =>
  ({
    id,
    name,
    calories: c,
    protein: p,
    carbs: carb,
    fats: g,
    portion: 'g',
    portion_size: 100,
  }) as FoodRecord;

const FOODS: FoodRecord[] = [
  food('f1', 'Pão Integral', 250, 9, 45, 3),
  food('f2', 'Farinha para Pão', 340, 10, 70, 1),
  food('f3', 'Açaí', 60, 1, 6, 4),
  food('f4', 'Maçã', 52, 0.3, 14, 0.2),
  food('f5', 'Peito de Frango', 165, 31, 0, 3.6),
  food('f6', 'Arroz Integral', 124, 2.6, 26, 1),
];

const basePlan = () => ({
  meta: { foodContractVersion: '1.0' },
  days: [
    {
      label: 'SEG',
      meals: [
        {
          id: 'm1',
          name: 'Almoço',
          time: '13:00',
          order: 0,
          items: [
            { foodId: 'f5', name: 'Peito de Frango', qtyGrams: 150, resolutionStatus: 'resolved_by_id' },
          ],
          totals: { kcal: 0, p: 0, c: 0, g: 0 },
        },
        {
          id: 'm2',
          name: 'Jantar',
          time: '20:00',
          order: 1,
          items: [
            { foodId: 'f4', name: 'Maçã', qtyGrams: 100, resolutionStatus: 'resolved_by_id' },
          ],
          totals: { kcal: 0, p: 0, c: 0, g: 0 },
        },
      ],
      totals: { kcal: 0, p: 0, c: 0, g: 0 },
    },
  ],
});

describe('A–H — busca de alimentos sem acento', () => {
  it('A. normaliza acentos e caixa', () => {
    expect(normalizeFoodSearch('Pão')).toBe('pao');
    expect(normalizeFoodSearch('PAO')).toBe('pao');
    expect(normalizeFoodSearch('Pão  Integral')).toBe('pao integral');
    expect(normalizeFoodSearch('Açaí')).toBe('acai');
    expect(normalizeFoodSearch('Queijo São Jorge')).toBe('queijo sao jorge');
  });

  it('B. "pao" encontra "Pão Integral"', () => {
    const r = filterFoodsBySearch(FOODS, 'pao');
    expect(r.map((f) => f.name)).toContain('Pão Integral');
  });

  it('C. "PAO" também encontra', () => {
    expect(filterFoodsBySearch(FOODS, 'PAO').length).toBe(2);
  });

  it('D. "acai" encontra "Açaí"', () => {
    expect(filterFoodsBySearch(FOODS, 'acai')[0].name).toBe('Açaí');
  });

  it('E. "maca" encontra "Maçã"', () => {
    expect(filterFoodsBySearch(FOODS, 'maca')[0].name).toBe('Maçã');
  });

  it('F. prefixo ranqueia antes de contém', () => {
    const r = filterFoodsBySearch(FOODS, 'pao');
    expect(r[0].name).toBe('Pão Integral');
    expect(r[1].name).toBe('Farinha para Pão');
  });

  it('G. sem termo devolve a lista intacta', () => {
    expect(filterFoodsBySearch(FOODS, '  ')).toHaveLength(FOODS.length);
  });

  it('H. termo sem correspondência devolve vazio e rank 0', () => {
    expect(filterFoodsBySearch(FOODS, 'zzz')).toHaveLength(0);
    expect(foodSearchRank(FOODS[0], 'zzz')).toBe(0);
  });
});

describe('I–T — sugestões de IA por refeição', () => {
  it('I. contexto envia apenas a refeição alvo como meal', () => {
    const req = buildMealSuggestionRequest({
      plan: basePlan(),
      dayIndex: 0,
      mealIndex: 1,
      priority: 'varied',
      foods: FOODS,
    });
    expect(req.meal.name).toBe('Jantar');
    expect(req.otherMeals).toHaveLength(1);
    expect(req.otherMeals[0].name).toBe('Almoço');
  });

  it('J. target enviado é o target do dia ativo', () => {
    const req = buildMealSuggestionRequest({
      plan: basePlan(),
      dayIndex: 0,
      mealIndex: 1,
      priority: 'varied',
      foods: FOODS,
      target: { kcal: 1634, p: 148, c: 94, g: 74 },
      dayType: 'LOW',
    });
    expect(req.dayTarget?.kcal).toBe(1634);
    expect(req.dayType).toBe('LOW');
  });

  it('K. catálogo enviado contém IDs reais', () => {
    const req = buildMealSuggestionRequest({
      plan: basePlan(),
      dayIndex: 0,
      mealIndex: 0,
      priority: 'simple',
      foods: FOODS,
    });
    expect(req.foodCatalog.map((f) => f.id)).toContain('f5');
  });

  it('L. usedFoods lista alimentos das outras refeições', () => {
    const used = collectUsedFoodsForDay(basePlan().days[0], 1);
    expect(used).toEqual([{ meal: 'Almoço', foodId: 'f5', name: 'Peito de Frango' }]);
  });

  it('M. foodId inexistente é rejeitado', () => {
    const r = validateMealSuggestions({
      raw: { suggestions: [{ title: 'x', items: [{ foodId: 'nope', qtyGrams: 100 }] }] },
      plan: basePlan(),
      dayIndex: 0,
      mealIndex: 1,
      foods: FOODS,
    });
    expect(r.suggestions).toHaveLength(0);
    expect(r.discarded).toBe(1);
  });

  it('N. qtyGrams <= 0 é rejeitado', () => {
    const r = validateMealSuggestions({
      raw: { suggestions: [{ items: [{ foodId: 'f5', qtyGrams: 0 }] }] },
      plan: basePlan(),
      dayIndex: 0,
      mealIndex: 1,
      foods: FOODS,
    });
    expect(r.suggestions).toHaveLength(0);
  });

  it('O. macros são calculados pela base e macros da IA são ignorados', () => {
    const r = validateMealSuggestions({
      raw: {
        suggestions: [
          {
            title: 'Opção 1',
            items: [{ foodId: 'f6', qtyGrams: 200, kcal: 9999, protein: 999 } as any],
          },
        ],
      },
      plan: basePlan(),
      dayIndex: 0,
      mealIndex: 1,
      foods: FOODS,
    });
    expect(r.suggestions[0].mealTotals.kcal).toBe(248);
    expect(r.suggestions[0].items[0].macros.p).toBeCloseTo(5.2, 1);
  });

  it('P. status de meta usa a tolerância oficial', () => {
    const plan = basePlan();
    const r = validateMealSuggestions({
      raw: { suggestions: [{ items: [{ foodId: 'f6', qtyGrams: 100 }] }] },
      plan,
      dayIndex: 0,
      mealIndex: 1,
      foods: FOODS,
      target: { kcal: 371, p: 49, c: 26, g: 6.4 },
    });
    expect(r.suggestions[0].withinTarget).toBe(true);
  });

  it('Q. aplicar altera somente aquela refeição e preserva id/nome/horário', () => {
    const plan = basePlan();
    const next: any = applyMealSuggestion({
      plan,
      dayIndex: 0,
      mealIndex: 1,
      items: [{ foodId: 'f6', qtyGrams: 120 }],
      foods: FOODS,
    });
    expect(next.days[0].meals[0].items[0].foodId).toBe('f5');
    expect(next.days[0].meals[1].id).toBe('m2');
    expect(next.days[0].meals[1].name).toBe('Jantar');
    expect(next.days[0].meals[1].time).toBe('20:00');
    expect(next.days[0].meals[1].items).toHaveLength(1);
    expect(next.days[0].meals[1].items[0].foodId).toBe('f6');
  });

  it('R. itens aplicados ficam resolved_by_id, sem snapshot antigo e destravados', () => {
    const plan: any = basePlan();
    plan.days[0].meals[1].items[0].nutritionSnapshot = { kcal: 1 };
    const next: any = applyMealSuggestion({
      plan,
      dayIndex: 0,
      mealIndex: 1,
      items: [{ foodId: 'f6', qtyGrams: 120 }],
      foods: FOODS,
    });
    const item = next.days[0].meals[1].items[0];
    expect(item.resolutionStatus).toBe('resolved_by_id');
    expect(item.nutritionSnapshot).toBeUndefined();
    expect(item.manualLocked).toBe(false);
  });

  it('S. aplicar recalcula os totais do dia (sem publicar nada)', () => {
    const plan = basePlan();
    const next: any = applyMealSuggestion({
      plan,
      dayIndex: 0,
      mealIndex: 1,
      items: [{ foodId: 'f6', qtyGrams: 100 }],
      foods: FOODS,
    });
    expect(next.days[0].totals.kcal).toBe(371);
    expect(next.publishedAt).toBeUndefined();
    expect((plan as any).days[0].meals[1].items[0].foodId).toBe('f4');
  });

  it('T. exatamente 3 sugestões válidas são mantidas e inválidas contadas', () => {
    const r = validateMealSuggestions({
      raw: {
        suggestions: [
          { items: [{ foodId: 'f6', qtyGrams: 100 }] },
          { items: [{ foodId: 'f5', qtyGrams: 120 }] },
          { items: [{ foodId: 'f4', qtyGrams: 80 }] },
          { items: [{ foodId: 'inexistente', qtyGrams: 80 }] },
        ],
      },
      plan: basePlan(),
      dayIndex: 0,
      mealIndex: 1,
      foods: FOODS,
    });
    expect(r.suggestions).toHaveLength(3);
    expect(r.discarded).toBe(1);
  });
});
