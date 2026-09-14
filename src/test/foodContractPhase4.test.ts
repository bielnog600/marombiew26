import { describe, it, expect } from 'vitest';
import {
  buildFoodCatalog,
  type FoodCatalog,
} from '../../supabase/functions/_shared/foodCatalog';
import { validateFoodContract } from '../../supabase/functions/_shared/foodContract';
import { hydrateDietPlanFromFoods } from '../../supabase/functions/_shared/dietHydration';
import { detectNewFoodsFromPlan } from '@/lib/newFoodsDetector';

const ID_ARROZ_A = '11111111-1111-4111-8111-111111111111';
const ID_ARROZ_B = '22222222-2222-4222-8222-222222222222';
const ID_FRANGO = '33333333-3333-4333-8333-333333333333';

const rows = [
  {
    id: ID_ARROZ_A,
    name: 'Arroz branco',
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fats: 0.3,
    portion: 'gramas',
    portion_size: 100,
    brand: null,
    source: 'TACO',
    barcode: null,
    source_food_id: null,
  },
  {
    id: ID_ARROZ_B,
    name: 'Arroz branco',
    calories: 358,
    protein: 7.2,
    carbs: 78,
    fats: 0.6,
    portion: 'gramas',
    portion_size: 100,
    brand: 'Cigala',
    source: 'rotulo',
    barcode: '5601234567890',
    source_food_id: null,
  },
  {
    id: ID_FRANGO,
    name: 'Frango grelhado',
    calories: 165,
    protein: 31,
    carbs: 0,
    fats: 3.6,
    portion: 'gramas',
    portion_size: 100,
    brand: null,
    source: null,
    barcode: null,
    source_food_id: null,
  },
];

const catalog: FoodCatalog = buildFoodCatalog(rows as any);

const planWith = (items: any[]) => ({
  meta: {},
  targets: { kcal: 2000, p: 150, c: 200, g: 60 },
  days: [
    {
      weekday: 'seg',
      meals: [{ id: 'm1', name: 'Almoço', items, totals: { kcal: 9999, p: 9, c: 9, g: 9 } }],
      totals: { kcal: 9999, p: 9, c: 9, g: 9 },
    },
  ],
});

describe('Fase 4 — contrato de alimentos', () => {
  it('A. aceita itens com foodId real do catálogo', () => {
    const plan = planWith([{ foodId: ID_FRANGO, foodName: 'Frango', qtyGrams: 200 }]);
    const report = validateFoodContract(plan, catalog, []);
    expect(report.valid).toBe(true);
    expect(report.invalidFoodIds).toEqual([]);
  });

  it('B. reprova foodId inventado', () => {
    const plan = planWith([
      { foodId: '99999999-9999-4999-8999-999999999999', qtyGrams: 100 },
    ]);
    const report = validateFoodContract(plan, catalog, []);
    expect(report.valid).toBe(false);
    expect(report.invalidFoodIds.length).toBe(1);
  });

  it('C. reprova item sem foodId quando não autorizado', () => {
    const plan = planWith([{ foodName: 'Tofu defumado', qtyGrams: 80 }]);
    const report = validateFoodContract(plan, catalog, []);
    expect(report.valid).toBe(false);
    expect(report.missingFoodIds.length).toBe(1);
  });

  it('D. aceita item sem foodId quando o nome está autorizado', () => {
    const plan = planWith([{ foodName: 'Tofu defumado', qtyGrams: 80 }]);
    const report = validateFoodContract(plan, catalog, ['tofu defumado']);
    expect(report.valid).toBe(true);
    expect(report.unresolvedAllowed.length).toBe(1);
  });

  it('E. ignora completamente macros falsos vindos da IA', () => {
    const plan = planWith([
      {
        foodId: ID_FRANGO,
        foodName: 'Frango',
        qtyGrams: 200,
        macros: { kcal: 9999, p: 999, c: 999, g: 999 },
      },
    ]);
    const { plan: hydrated } = hydrateDietPlanFromFoods(plan, catalog, 'strict_id');
    const item = hydrated.days[0].meals[0].items[0];
    expect(item.macros.kcal).toBe(330);
    expect(item.macros.p).toBe(62);
    expect(hydrated.days[0].totals.kcal).toBe(330);
  });

  it('F. duplicidade de nome: o ID escolhido manda, nunca o nome', () => {
    const plan = planWith([{ foodId: ID_ARROZ_B, foodName: 'Arroz branco', qtyGrams: 100 }]);
    const { plan: hydrated } = hydrateDietPlanFromFoods(plan, catalog, 'strict_id');
    const item = hydrated.days[0].meals[0].items[0];
    expect(item.foodId).toBe(ID_ARROZ_B);
    expect(item.macros.kcal).toBe(358);
  });

  it('G. item sem foodId vira unresolved com macros zerados', () => {
    const plan = planWith([{ foodName: 'Tofu defumado', qtyGrams: 80 }]);
    const { plan: hydrated, unresolvedItems, requiresResolution } = hydrateDietPlanFromFoods(
      plan,
      catalog,
      'strict_id',
    );
    const item = hydrated.days[0].meals[0].items[0];
    expect(item.resolutionStatus).toBe('unresolved');
    expect(item.macros.kcal).toBe(0);
    expect(unresolvedItems.length).toBe(1);
    expect(requiresResolution).toBe(true);
  });

  it('H. detectNewFoodsFromPlan usa unresolved, não semelhança de nome', () => {
    const plan = planWith([
      { foodId: ID_FRANGO, foodName: 'Frango', qtyGrams: 200 },
      { foodName: 'Tofu defumado', qtyGrams: 80 },
    ]);
    const { plan: hydrated } = hydrateDietPlanFromFoods(plan, catalog, 'strict_id');
    const candidates = detectNewFoodsFromPlan(hydrated as any, ['Frango grelhado']);
    expect(candidates.map((c) => c.name)).toEqual(['Tofu defumado']);
  });
});
