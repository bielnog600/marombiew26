import { describe, expect, it } from 'vitest';
import type { FoodRecord } from '@/lib/nutritionEngine';
import { buildFoodIndex } from '@/lib/nutritionEngine';
import {
  bestSubstitutionTip,
  buildBestSubstitutionChoices,
} from '@/lib/canonicalFoodSubstitution';
import {
  buildFoodPreferencePrompt,
  inferFoodCategory,
  isWorkoutAdjacentMeal,
  resolveDietPreferenceGoal,
  sameFoodFamily,
} from '@/lib/foodPreference';

const food = (id: string, name: string, kcal: number, p: number, c: number, g = 1, categoria = 'massa'): FoodRecord => ({
  id, name, categoria, calories: kcal, protein: p, carbs: c, fats: g, portion_size: 100,
});
const ORIGINAL = food('original', 'Massa cozida', 158, 5.8, 30.9, 0.9);
const MILANEZA = food('milaneza', 'Massa de ovo Milaneza (cozida)', 146, 5.6, 27.6, 1.2);
const CONTINENTE = food('continente', 'Massa de ovo Continente (cozida)', 146, 5.2, 27.2, 1.3);
const INTEGRAL = food('integral', 'Macarrão integral cozido', 124, 5.3, 26.5, 0.54);
const ARROZ = food('arroz', 'Macarrão de arroz cozido', 108, 1.8, 24, 0.2);
const DRELLI = food('drelli', 'Massa High Protein Drelli (cozida)', 138, 11.6, 17.6, 1.1);
const CRUA = food('crua', 'Massa High Protein Drelli (crua)', 344, 29, 44, 2.7);
const FRANGO = food('frango', 'Frango grelhado', 165, 31, 0, 3.6, 'carne_branca');
const FOODS = [ORIGINAL, MILANEZA, CONTINENTE, INTEGRAL, ARROZ, DRELLI, CRUA, FRANGO];
const INDEX = buildFoodIndex(FOODS);
const CURRENT = { kcal: 158, p: 5.8, c: 30.9, g: 0.9 };

const choices = (objective: string, mealName = 'Almoço') => buildBestSubstitutionChoices({
  foods: FOODS,
  currentName: ORIGINAL.name,
  currentQtyGrams: 100,
  currentMacros: CURRENT,
  index: INDEX,
  preference: { objective, mealName },
});

describe('Melhor escolha por objetivo e família', () => {
  it('cutting coloca Drelli em primeiro com mais proteína e menos carbo', () => {
    const result = choices('Definição');
    expect(result[0].food.id).toBe('drelli');
    expect(result[0].reasons).toEqual(expect.arrayContaining(['Mais proteína', 'Menos carbo']));
    expect(result[0].option.qtyGrams).toBeGreaterThan(0);
    expect(bestSubstitutionTip(result[0])).toMatch(/Para o seu objetivo, a Massa High Protein Drelli .*proteína.*carbo.*nesse prato/);
  });

  it('bulking no pós-treino prioriza massa de ovo de digestão fácil', () => {
    const result = choices('Hipertrofia', 'Pós-treino');
    expect(result[0].food.id).toBe('milaneza');
    expect(result[0].reasons).toContain('Mais carbo p/ treino');
    expect(result.slice(0, 2).map((choice) => choice.food.id)).toEqual(['milaneza', 'continente']);
  });

  it('saúde/manutenção coloca a versão integral no topo', () => {
    const result = choices('Saúde e qualidade de vida');
    expect(result[0].food.id).toBe('integral');
    expect(result[0].reasons).toContain('Mais fibra');
  });

  it('nunca mistura massa com frango e respeita arroz/tubérculos como família', () => {
    expect(choices('cutting').some((choice) => choice.food.id === 'frango')).toBe(false);
    expect(sameFoodFamily(ORIGINAL, FRANGO)).toBe(false);
    expect(sameFoodFamily(
      { name: 'Arroz branco', categoria: 'arroz' },
      { name: 'Batata cozida', categoria: 'tuberculo' },
    )).toBe(true);
  });

  it('iogurte não mistura com queijo, e horário a até 2 h conta como pós-treino', () => {
    expect(sameFoodFamily(
      { name: 'Iogurte natural', categoria: 'laticinio' },
      { name: 'Iogurte grego', categoria: 'laticinio' },
    )).toBe(true);
    expect(sameFoodFamily(
      { name: 'Iogurte natural', categoria: 'laticinio' },
      { name: 'Queijo minas', categoria: 'laticinio' },
    )).toBe(false);
    expect(isWorkoutAdjacentMeal({ mealName: 'Jantar', mealTime: '20:00', workoutTime: '18:30' })).toBe(true);
    expect(isWorkoutAdjacentMeal({ mealName: 'Jantar', mealTime: '21:00', workoutTime: '18:00' })).toBe(false);
  });

  it('fase explícita tem prioridade sobre o objetivo antigo do perfil', () => {
    expect(resolveDietPreferenceGoal('Emagrecimento', 'bulking')).toBe('bulking');
  });

  it('infere famílias sem transformar massa de ovo em ovo', () => {
    expect(inferFoodCategory('Massa de ovo Milaneza')).toBe('massa');
    expect(inferFoodCategory('Pão integral')).toBe('pao');
    expect(inferFoodCategory('Iogurte proteico natural')).toBe('laticinio');
  });

  it('o gerador recebe Drelli antes das massas de ovo no cutting, sem recomendar crua', () => {
    const prompt = buildFoodPreferencePrompt(FOODS, { objective: 'cutting' });
    const massaLine = prompt.split('\n').find((line) => line.startsWith('- Massa:'));
    expect(massaLine).toContain('Massa High Protein Drelli (cozida)');
    expect(massaLine!.indexOf('(cozida)')).toBeLessThan(massaLine!.indexOf('Milaneza'));
    expect(massaLine).not.toContain('(crua)');
  });
});
