import { describe, it, expect } from 'vitest';
import {
  relinkResolvableUnresolvedFoods,
  linkPlanItemsToFood,
  findExactFoodMatches,
} from '@/lib/dietFoodRelink';
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

const planWith = (name: string) => ({
  days: [
    {
      label: 'Padrão',
      meals: [
        {
          name: 'Almoço',
          items: [
            {
              foodId: null,
              name,
              qtyGrams: 150,
              resolutionStatus: 'unresolved',
              macros: { kcal: 0, p: 0, c: 0, g: 0 },
              nutritionSnapshot: { kcal: 0 },
            },
          ],
          totals: { kcal: 0, p: 0, c: 0, g: 0 },
        },
      ],
      totals: { kcal: 0, p: 0, c: 0, g: 0 },
    },
  ],
});

describe('HOTFIX — relink de alimentos não validados', () => {
  it('A. vincula quando existe 1 correspondência exata normalizada', () => {
    const r = relinkResolvableUnresolvedFoods(planWith('Curgete cozida'), [
      food('f1', 'Curgete Cozida'),
    ]);
    const item: any = r.plan.days[0].meals[0].items[0];
    expect(r.changed).toBe(true);
    expect(item.foodId).toBe('f1');
    expect(item.name).toBe('Curgete Cozida');
  });

  it('B. preserva qtyGrams', () => {
    const r = relinkResolvableUnresolvedFoods(planWith('Curgete cozida'), [
      food('f1', 'Curgete cozida'),
    ]);
    expect((r.plan.days[0].meals[0].items[0] as any).qtyGrams).toBe(150);
  });

  it('C. status vira resolved_by_id e snapshot antigo é removido', () => {
    const r = relinkResolvableUnresolvedFoods(planWith('Curgete cozida'), [
      food('f1', 'Curgete cozida'),
    ]);
    const item: any = r.plan.days[0].meals[0].items[0];
    expect(item.resolutionStatus).toBe('resolved_by_id');
    expect(item.nutritionSnapshot).toBeUndefined();
  });

  it('D. macros e totais são recalculados pela base', () => {
    const r = relinkResolvableUnresolvedFoods(planWith('Curgete cozida'), [
      food('f1', 'Curgete cozida', 100, 10, 5, 2),
    ]);
    const day: any = r.plan.days[0];
    expect(day.meals[0].items[0].macros.kcal).toBe(150);
    expect(day.meals[0].totals.kcal).toBe(150);
    expect(day.totals.kcal).toBe(150);
  });

  it('E. 0 correspondências → continua unresolved', () => {
    const r = relinkResolvableUnresolvedFoods(planWith('Quiabo grelhado'), [
      food('f1', 'Curgete cozida'),
    ]);
    expect(r.changed).toBe(false);
    expect((r.plan.days[0].meals[0].items[0] as any).foodId).toBeNull();
  });

  it('F. 2 correspondências → continua unresolved', () => {
    const r = relinkResolvableUnresolvedFoods(planWith('Azeite de Oliva'), [
      food('f1', 'Azeite de oliva'),
      food('f2', 'Azeite de Oliva'),
    ]);
    expect(r.changed).toBe(false);
    expect((r.plan.days[0].meals[0].items[0] as any).resolutionStatus).toBe('unresolved');
  });

  it('G. nenhum fuzzy matching', () => {
    const r = relinkResolvableUnresolvedFoods(planWith('Peito frango grelhado'), [
      food('f1', 'Peito de Frango'),
    ]);
    expect(r.changed).toBe(false);
  });

  it('H. vínculo direto após adicionar à base, sem regerar', () => {
    const created = food('novo', 'Iogurte Skyr Natural', 60, 10, 4, 0);
    const r = linkPlanItemsToFood(planWith('Iogurte Skyr Natural'), 'Iogurte Skyr Natural', created, []);
    const item: any = r.plan.days[0].meals[0].items[0];
    expect(item.foodId).toBe('novo');
    expect(item.resolutionStatus).toBe('resolved_by_id');
    expect(item.macros.kcal).toBe(90);
  });

  it('I. guard anti-duplicata encontra o registro existente', () => {
    const existing = [{ id: 'f1', name: 'Batata-doce' }, { id: 'f2', name: 'Arroz integral' }];
    expect(findExactFoodMatches('batata-doce', existing).map((f) => f.id)).toEqual(['f1']);
    expect(findExactFoodMatches('Frango', existing)).toEqual([]);
  });

  it('J. sem mudanças devolve a mesma referência (sem loop)', () => {
    const plan = planWith('Quiabo grelhado');
    const r = relinkResolvableUnresolvedFoods(plan, [food('f1', 'Curgete cozida')]);
    expect(r.plan).toBe(plan);
    expect(r.changed).toBe(false);
    const second = relinkResolvableUnresolvedFoods(
      relinkResolvableUnresolvedFoods(planWith('Curgete cozida'), [food('f1', 'Curgete cozida')]).plan,
      [food('f1', 'Curgete cozida')],
    );
    expect(second.changed).toBe(false);
  });
});
