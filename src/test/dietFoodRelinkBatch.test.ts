import { describe, it, expect } from 'vitest';
import {
  relinkResolvableUnresolvedFoods,
  linkPlanItemsToFood,
  normalizeFoodForPreparationMatch,
  findFoodCandidates,
} from '@/lib/dietFoodRelink';
import { groupUnresolvedItems } from '@/components/diet/UnresolvedFoodsPanel';
import { foodRecordFromRow, type FoodRecord } from '@/lib/nutritionEngine';

const food = (id: string, name: string, kcal = 100, p = 10, c = 5, g = 2): FoodRecord =>
  foodRecordFromRow({
    id,
    name,
    calories: kcal,
    protein: p,
    carbs: c,
    fats: g,
    portion: 'gramas',
    portion_size: 100,
  });

const weekPlan = (name: string, qtys: number[]) => ({
  days: qtys.map((q, i) => ({
    label: `Dia ${i + 1}`,
    meals: [
      {
        name: 'Almoço',
        items: [
          {
            foodId: null,
            name,
            qtyGrams: q,
            resolutionStatus: 'unresolved',
            macros: { kcal: 0, p: 0, c: 0, g: 0 },
          },
        ],
        totals: { kcal: 0, p: 0, c: 0, g: 0 },
      },
    ],
    totals: { kcal: 0, p: 0, c: 0, g: 0 },
  })),
});

describe('HOTFIX UX — resolver alimentos não vinculados em lote', () => {
  it('A. agrupa 7 ocorrências em 1 grupo', () => {
    const groups = groupUnresolvedItems(weekPlan('Batata-doce cozida', [100, 110, 120, 130, 140, 150, 160]));
    expect(groups).toHaveLength(1);
    expect(groups[0].occurrences).toBe(7);
  });

  it('B. resolver o grupo aplica o mesmo foodId em todas as ocorrências', () => {
    const chosen = food('bd', 'Batata-doce', 86, 1.6, 20, 0.1);
    const r = linkPlanItemsToFood(
      weekPlan('Batata-doce cozida', [100, 110, 120, 130, 140, 150, 160]),
      'Batata-doce cozida',
      chosen,
      [chosen],
    );
    expect(r.resolvedCount).toBe(7);
    const ids = r.plan.days.map((d: any) => d.meals[0].items[0].foodId);
    expect(new Set(ids)).toEqual(new Set(['bd']));
  });

  it('C. quantidades individuais permanecem diferentes', () => {
    const chosen = food('bd', 'Batata-doce');
    const r = linkPlanItemsToFood(weekPlan('Batata-doce cozida', [171, 159, 168]), 'Batata-doce cozida', chosen, [chosen]);
    expect(r.plan.days.map((d: any) => d.meals[0].items[0].qtyGrams)).toEqual([171, 159, 168]);
  });

  it('D. preparation match encontra "Batata-doce"', () => {
    expect(normalizeFoodForPreparationMatch('Batata-doce cozida')).toBe('batata-doce');
    expect(findFoodCandidates('Batata-doce cozida', [food('bd', 'Batata-doce')]).map((f) => f.id)).toEqual(['bd']);
  });

  it('E. preparation match encontra "Peito de Frango" quando único', () => {
    const r = relinkResolvableUnresolvedFoods(weekPlan('Peito de frango grelhado', [150]), [
      food('pf', 'Peito de Frango', 165, 31, 0, 3.6),
    ]);
    expect(r.changed).toBe(true);
    expect(r.plan.days[0].meals[0].items[0].foodId).toBe('pf');
  });

  it('F. 2 candidatos após normalização → não auto-resolve', () => {
    const r = relinkResolvableUnresolvedFoods(weekPlan('Peito de frango grelhado', [150]), [
      food('a', 'Peito de Frango'),
      food('b', 'Peito de frango'),
    ]);
    expect(r.changed).toBe(false);
  });

  it('G. azeite duplicado exige escolha manual', () => {
    const r = relinkResolvableUnresolvedFoods(weekPlan('Azeite de Oliva', [10, 10]), [
      food('a1', 'Azeite de oliva', 884, 0, 0, 100),
      food('a2', 'Azeite de Oliva', 900, 0, 0, 100),
    ]);
    expect(r.changed).toBe(false);
  });

  it('H. escolha manual resolve todas as ocorrências do nome', () => {
    const chosen = food('a2', 'Azeite de Oliva', 884, 0, 0, 100);
    const r = linkPlanItemsToFood(weekPlan('Azeite de Oliva', [10, 10, 10]), 'Azeite de Oliva', chosen, [chosen]);
    expect(r.resolvedCount).toBe(3);
  });

  it('I. nenhum fuzzy matching', () => {
    const r = relinkResolvableUnresolvedFoods(weekPlan('Frango xadrez', [100]), [food('pf', 'Peito de Frango')]);
    expect(r.changed).toBe(false);
    expect(findFoodCandidates('Batata frita', [food('bd', 'Batata-doce')])).toEqual([]);
  });

  it('J. macros e totais recalculados após resolução em lote', () => {
    const chosen = food('bd', 'Batata-doce', 100, 2, 20, 0);
    const r = linkPlanItemsToFood(weekPlan('Batata-doce cozida', [200, 50]), 'Batata-doce cozida', chosen, [chosen]);
    expect(r.plan.days[0].meals[0].items[0].macros.kcal).toBe(200);
    expect(r.plan.days[0].totals.kcal).toBe(200);
    expect(r.plan.days[1].totals.kcal).toBe(50);
  });
});
