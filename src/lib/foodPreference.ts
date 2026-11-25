export * from '../../supabase/functions/_shared/foodPreference.ts';

import { normalizeFoodName, type FoodRecord, type EngineMacros } from './nutritionEngine';
import { foodCategoryOf, rankFoodsForGoal as sharedRank, resolveDietPreferenceGoal, sameFoodFamily as sharedFamily, type FoodPreferenceContext } from '../../supabase/functions/_shared/foodPreference.ts';

const nameOf = (food: Pick<FoodRecord, 'name'>) => normalizeFoodName(food.name);
export const isYogurtFamily = (food: Pick<FoodRecord, 'name'>) =>
  /iogurte|yogurt|skyr|kefir|coalhada|quark/.test(nameOf(food));
const isDairyFat = (food: Pick<FoodRecord, 'name'>) => /creme de leite|natas|manteiga/.test(nameOf(food));

/** Presentation-only tiers; macro ranking stays unchanged inside each tier. */
export function substitutionFamilyTier(original: FoodRecord, candidate: FoodRecord): 0 | 1 | 2 {
  if (isDairyFat(candidate)) return 2;
  if (isYogurtFamily(original)) {
    if (isYogurtFamily(candidate)) return 0;
    return ['laticinio', 'whey', 'ovo'].includes(foodCategoryOf(candidate) ?? '') ? 1 : 2;
  }
  if (sharedFamily(original, candidate)) return 0;
  return 2;
}

/** Yogurts have a protein role even in bulking; starch rules remain shared. */
export function rankFoodsForGoal(foods: FoodRecord[], original: FoodRecord | null, context: FoodPreferenceContext, limit = 3) {
  const goal = resolveDietPreferenceGoal(context.objective, context.dietPhase);
  if (!original || !isYogurtFamily(original) || !goal) return sharedRank(foods, original, context, limit);
  const per100 = (food: FoodRecord, field: 'calories' | 'protein') => Number(food[field]) * 100 / (Number(food.portion_size) || 100);
  const natural = (food: FoodRecord) => /natural|coalhada|kefir/.test(nameOf(food)) && !/sabor|morango|acucar|adocad/.test(nameOf(food));
  const originalP = per100(original, 'protein');
  return foods.filter(food => food.id !== original.id && nameOf(food) !== nameOf(original) && substitutionFamilyTier(original, food) === 0)
    .map(food => {
      const p = per100(food, 'protein');
      const kcal = per100(food, 'calories');
      const reasons = goal === 'health'
        ? natural(food) ? ['Natural'] : []
        : p > originalP + 0.5 ? ['Mais proteína'] : [];
      const simpleNatural = /iogurte natural|coalhada|kefir/.test(nameOf(food)) && !/proteico|skyr/.test(nameOf(food));
      const score = goal === 'health' ? Number(natural(food)) * 100 + Number(simpleNatural) * 10 - kcal * 0.01 : p / Math.max(kcal, 1) * 100;
      return { food, category: 'laticinio', score, reasons };
    }).filter(choice => choice.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'pt-BR')).slice(0, limit);
}

export function substitutionDisplayDelta(diff: EngineMacros, originalKcal: number): { text: string; positive: boolean } | null {
  if (Math.abs(diff.p) >= 4) return { text: `${diff.p > 0 ? '+' : ''}${diff.p.toFixed(1).replace('.', ',')} g P`, positive: diff.p > 0 };
  if (originalKcal > 0 && Math.abs(diff.kcal) >= originalKcal * 0.1 - 1e-8) return { text: `${diff.kcal > 0 ? '+' : ''}${Math.round(diff.kcal)} kcal`, positive: false };
  return null;
}
