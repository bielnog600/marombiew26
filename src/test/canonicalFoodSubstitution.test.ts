/**
 * MICRO-HOTFIX UX — substituição canônica de alimento (ADMIN).
 * Determinístico: sem IA, sem optimizer do dia.
 */
import { describe, it, expect } from 'vitest';
import {
  bestEquivalentPortion,
  buildSubstitutionCandidates,
  quantizeGrams,
  equivalenceLevel,
  totalsAfterSwap,
  macrosForFoodQty,
} from '@/lib/canonicalFoodSubstitution';
import { buildFoodIndex, type FoodRecord } from '@/lib/nutritionEngine';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import { recomputeDayFromFoods } from '@/lib/dietFoodResolution';

const food = (over: Partial<FoodRecord>): FoodRecord =>
  ({
    id: 'x',
    name: 'X',
    calories: 100,
    protein: 10,
    carbs: 10,
    fats: 1,
    portion: '100g',
    portion_size: 100,
    ...over,
  }) as FoodRecord;

const FRANGO = food({ id: 'f1', name: 'Peito de Frango', calories: 156, protein: 31, carbs: 0, fats: 3.6 });
const CARNE = food({ id: 'f2', name: 'Carne Bovina', calories: 210, protein: 26, carbs: 0, fats: 12 });
const PAO = food({ id: 'f3', name: 'Pão Integral', calories: 247, protein: 10, carbs: 41, fats: 3.4 });
const FOODS = [FRANGO, CARNE, PAO];
const index = buildFoodIndex(FOODS);

const target = macrosForFoodQty('f1', 130, index);

describe('substituição canônica', () => {
  it('C. busca sem acento encontra Pão', () => {
    expect(filterFoodsBySearch(FOODS, 'pao').map((f) => f.id)).toContain('f3');
  });

  it('D/G. target vem dos macros reais do item atual (nutritionCore)', () => {
    expect(target.kcal).toBeCloseTo(156 * 1.3, 5);
    expect(target.p).toBeCloseTo(31 * 1.3, 5);
  });

  it('E/F. candidato usa foodId real e quantidade sugerida > 0', () => {
    const c = bestEquivalentPortion(CARNE, target, index)!;
    expect(c.food.id).toBe('f2');
    expect(c.qtyGrams).toBeGreaterThan(0);
  });

  it('quantiza gramas conforme as faixas do projeto', () => {
    expect(quantizeGrams(17.4)).toBe(17);
    expect(quantizeGrams(63)).toBe(65);
    expect(quantizeGrams(134)).toBe(130);
  });

  it('macros do candidato vêm da base, não de números inventados', () => {
    const c = bestEquivalentPortion(CARNE, target, index)!;
    expect(c.macros.kcal).toBeCloseTo((210 / 100) * c.qtyGrams, 5);
  });

  it('Q/R. perfil muito diferente continua selecionável e mostra diferenças', () => {
    const c = bestEquivalentPortion(PAO, target, index)!;
    expect(equivalenceLevel(c.macros, target)).toBe('different');
    expect(Math.abs(c.diff.p)).toBeGreaterThan(10);
  });

  it('ranking prioriza o melhor equivalente', () => {
    const list = buildSubstitutionCandidates(FOODS, target, index);
    expect(list[0].food.id).toBe('f1');
  });

  it('impacto na refeição/dia é total - original + candidato', () => {
    const c = bestEquivalentPortion(CARNE, target, index)!;
    const after = totalsAfterSwap({ kcal: 500, p: 40, c: 35, g: 20 }, target, c.macros);
    expect(after.kcal).toBeCloseTo(500 - target.kcal + c.macros.kcal, 5);
  });

  it('I/J/K/L/M/N/O. troca afeta somente aquele item e recalcula o dia', () => {
    const plan: any = {
      days: [
        {
          meals: [
            {
              name: 'R1',
              items: [
                {
                  foodId: 'f1',
                  name: 'Peito de Frango',
                  qtyGrams: 130,
                  resolutionStatus: 'resolved_by_id',
                  nutritionSnapshot: { kcal: 999 },
                },
                { foodId: 'f3', name: 'Pão Integral', qtyGrams: 50, resolutionStatus: 'resolved_by_id' },
              ],
            },
          ],
        },
      ],
    };
    const c = bestEquivalentPortion(CARNE, target, index)!;
    const item = plan.days[0].meals[0].items[0];
    item.foodId = c.food.id;
    item.name = c.food.name;
    item.qtyGrams = c.qtyGrams;
    item.resolutionStatus = 'resolved_by_id';
    item.manualLocked = true;
    delete item.nutritionSnapshot;
    recomputeDayFromFoods(plan.days[0], FOODS);

    expect(item.foodId).toBe('f2');
    expect(item.resolutionStatus).toBe('resolved_by_id');
    expect(item.manualLocked).toBe(true);
    expect(item.nutritionSnapshot).toBeUndefined();
    expect(plan.days[0].meals[0].items[1].qtyGrams).toBe(50);
    expect(plan.days[0].totals.kcal).toBeGreaterThan(0);
  });
});
