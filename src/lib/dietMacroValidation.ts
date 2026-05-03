import { parseSections, type ParsedFood, type ParsedMeal } from '@/lib/dietResultParser';

export interface DietMacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface FoodMacroRecord {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  portion_size?: number | null;
}

export interface DietMacroTotals extends DietMacroTargets {}

export interface MealMacroTotal extends DietMacroTotals {
  meal: string;
}

export interface DietMacroValidationReport {
  target: DietMacroTargets;
  generated: DietMacroTotals;
  difference: DietMacroTotals;
  valid: boolean;
  tolerances: DietMacroTargets;
  mealTotals: MealMacroTotal[];
  unmatchedFoods: string[];
  reasons: string[];
}

export const DIET_MACRO_TOLERANCES: DietMacroTargets = {
  calories: 50,
  protein: 10,
  carbs: 15,
  fats: 8,
};

const parseNumber = (value?: string) => {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/g, '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseQuantityGrams = (qty?: string) => {
  if (!qty) return 0;
  const normalized = qty.replace(',', '.');
  const gramsMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:g|gramas?)/i);
  if (gramsMatch) return Number(gramsMatch[1]) || 0;
  const firstNumber = normalized.match(/\d+(?:\.\d+)?/);
  return firstNumber ? Number(firstNumber[0]) || 0 : 0;
};

const normalizeFoodName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(cozid[oa]|grelhad[oa]|assad[oa]|cru[ao]|refogad[oa]|integral|branc[oa])\b/g, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const findFoodRecord = (foodName: string, foods: FoodMacroRecord[]) => {
  const normalized = normalizeFoodName(foodName);
  if (!normalized) return null;

  const exact = foods.find((food) => normalizeFoodName(food.name) === normalized);
  if (exact) return exact;

  return foods.find((food) => {
    const dbName = normalizeFoodName(food.name);
    return dbName && (normalized.includes(dbName) || dbName.includes(normalized));
  }) || null;
};

const calculateFoodMacros = (food: ParsedFood, foods: FoodMacroRecord[]): DietMacroTotals & { matched: boolean } => {
  const record = findFoodRecord(food.food, foods);
  const grams = parseQuantityGrams(food.qty);

  if (record && grams > 0) {
    const base = record.portion_size || 100;
    const scale = grams / base;
    return {
      calories: record.calories * scale,
      protein: record.protein * scale,
      carbs: record.carbs * scale,
      fats: record.fats * scale,
      matched: true,
    };
  }

  return {
    calories: parseNumber(food.kcal),
    protein: parseNumber(food.p),
    carbs: parseNumber(food.c),
    fats: parseNumber(food.g),
    matched: false,
  };
};

const addTotals = (a: DietMacroTotals, b: DietMacroTotals): DietMacroTotals => ({
  calories: a.calories + b.calories,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fats: a.fats + b.fats,
});

const roundTotals = (totals: DietMacroTotals): DietMacroTotals => ({
  calories: Math.round(totals.calories),
  protein: Math.round(totals.protein),
  carbs: Math.round(totals.carbs),
  fats: Math.round(totals.fats),
});

export const validateDietMacros = (
  markdown: string,
  target: DietMacroTargets,
  foods: FoodMacroRecord[],
): DietMacroValidationReport => {
  const sections = parseSections(markdown);
  const meals = sections.flatMap((section) => (section.type === 'meal' ? section.meals || [] : []));
  const unmatched = new Set<string>();

  let generated: DietMacroTotals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const mealTotals = meals.map((meal: ParsedMeal) => {
    let mealTotal: DietMacroTotals = { calories: 0, protein: 0, carbs: 0, fats: 0 };

    for (const food of meal.foods) {
      const macros = calculateFoodMacros(food, foods);
      if (!macros.matched) unmatched.add(food.food);
      mealTotal = addTotals(mealTotal, macros);
    }

    mealTotal = roundTotals(mealTotal);
    generated = addTotals(generated, mealTotal);
    return { meal: meal.name, ...mealTotal };
  });

  generated = roundTotals(generated);
  const difference: DietMacroTotals = {
    calories: generated.calories - target.calories,
    protein: generated.protein - target.protein,
    carbs: generated.carbs - target.carbs,
    fats: generated.fats - target.fats,
  };

  const reasons: string[] = [];
  if (meals.length === 0) reasons.push('Nenhuma tabela de refeições válida foi encontrada.');
  if (Math.abs(difference.calories) > DIET_MACRO_TOLERANCES.calories) reasons.push(`Calorias ${difference.calories > 0 ? '+' : ''}${difference.calories} kcal fora da tolerância.`);
  if (Math.abs(difference.protein) > DIET_MACRO_TOLERANCES.protein) reasons.push(`Proteína ${difference.protein > 0 ? '+' : ''}${difference.protein} g fora da tolerância.`);
  if (Math.abs(difference.carbs) > DIET_MACRO_TOLERANCES.carbs) reasons.push(`Carboidrato ${difference.carbs > 0 ? '+' : ''}${difference.carbs} g fora da tolerância.`);
  if (Math.abs(difference.fats) > DIET_MACRO_TOLERANCES.fats) reasons.push(`Gordura ${difference.fats > 0 ? '+' : ''}${difference.fats} g fora da tolerância.`);

  return {
    target,
    generated,
    difference,
    valid: reasons.length === 0,
    tolerances: DIET_MACRO_TOLERANCES,
    mealTotals,
    unmatchedFoods: Array.from(unmatched),
    reasons,
  };
};

export const formatDietMacroLine = (totals: DietMacroTargets) =>
  `${Math.round(totals.calories)} kcal / ${Math.round(totals.protein)}P / ${Math.round(totals.carbs)}C / ${Math.round(totals.fats)}G`;