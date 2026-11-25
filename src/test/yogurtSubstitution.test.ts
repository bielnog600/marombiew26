import { describe, expect, it } from 'vitest';
import { buildBestSubstitutionChoices } from '@/lib/canonicalFoodSubstitution';
import { substitutionDisplayDelta, substitutionFamilyTier } from '@/lib/foodPreference';
import type { FoodRecord } from '@/lib/nutritionEngine';

const food = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number, categoria = 'laticinio'): FoodRecord => ({ id, name, calories, protein, carbs, fats, categoria, portion_size: 100 });
export const YOGURT_FOODS = [
  food('greek', 'Iogurte grego natural', 106, 3.8, 4.2, 8.2),
  food('skyr', 'Iogurte Skyr Natural', 59, 10, 4, 0.2),
  food('protein', 'Iogurte proteico natural', 60, 10, 4, 0.2),
  food('natural', 'Iogurte natural integral', 105, 6, 8, 5),
  food('kefir', 'Kefir', 60, 3, 4, 3),
  food('coalhada', 'Coalhada natural', 61, 4, 4, 3, 'outros'),
  food('milk', 'Leite magro', 35, 3.5, 5, 0.1),
  food('peanut', 'Amendoim torrado', 600, 26, 20, 48, 'gordura_boa'),
  food('cream', 'Creme de leite light', 160, 3, 4, 15),
];
const choices = (objective: string) => buildBestSubstitutionChoices({
  foods: YOGURT_FOODS, currentName: 'Iogurte grego natural', currentQtyGrams: 170,
  currentMacros: { kcal: 180.2, p: 6.46, c: 7.14, g: 13.94 }, preference: { objective },
});

describe('Preferências de iogurte na troca', () => {
  it('cutting recomenda Skyr com Mais proteína', () => {
    expect(choices('cutting')[0].food.id).toBe('skyr');
    expect(choices('cutting')[0].reasons).toContain('Mais proteína');
  });
  it('hipertrofia também prioriza iogurte proteico, não carboidratos de um lácteo', () => {
    expect(choices('Hipertrofia')[0].food.id).toBe('skyr');
    expect(choices('Hipertrofia')[0].reasons).toEqual(['Mais proteína']);
  });
  it('manutenção recomenda iogurtes naturais da mesma família', () => {
    expect(choices('Manutenção')[0].reasons).toContain('Natural');
    expect(choices('Manutenção').every(choice => substitutionFamilyTier(YOGURT_FOODS[0], choice.food) === 0)).toBe(true);
  });
  it('iogurte inclui skyr, kefir e coalhada antes de leite; amendoim e creme ficam em outras opções', () => {
    expect(YOGURT_FOODS.slice(1).map(candidate => substitutionFamilyTier(YOGURT_FOODS[0], candidate))).toEqual([0, 0, 0, 0, 0, 1, 2, 2]);
  });
  it('não mostra delta de −2,2 g P, nem deltas de carbo ou gordura', () => {
    expect(substitutionDisplayDelta({ kcal: 0, p: -2.2, c: 20, g: 8 }, 180)).toBeNull();
  });
  it('mostra delta de proteína a partir de 4 g em ambos os sentidos', () => {
    expect(substitutionDisplayDelta({ kcal: 0, p: -4, c: 0, g: 0 }, 180)?.text).toBe('-4,0 g P');
    expect(substitutionDisplayDelta({ kcal: 0, p: 4, c: 0, g: 0 }, 180)?.positive).toBe(true);
  });
  it('mostra delta calórico apenas a partir de 10% do original', () => {
    expect(substitutionDisplayDelta({ kcal: 17.9, p: 0, c: 0, g: 0 }, 180)).toBeNull();
    expect(substitutionDisplayDelta({ kcal: -18, p: 0, c: 0, g: 0 }, 180)?.text).toBe('-18 kcal');
  });
});