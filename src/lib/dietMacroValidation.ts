import { buildFoodIndex, computeItemMacros, type FoodIndex } from '@/lib/nutritionEngine';
import { OFFICIAL_MACRO_TOLERANCE_LABELS } from '@/lib/macroTolerances';
import { parseSections, type ParsedFood, type ParsedMeal } from '@/lib/dietResultParser';

export interface DietMacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface FoodMacroRecord {
  /** Fase 4.2: id real da base — obrigatório no fluxo structured. */
  id?: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  portion_size?: number | null;
}

export type DietMacroTotals = DietMacroTargets;

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

/** Fonte única (Fase 4.2): `_shared/macroTolerances`. */
export const DIET_MACRO_TOLERANCES: DietMacroTargets = { ...OFFICIAL_MACRO_TOLERANCE_LABELS };

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

/**
 * O cálculo é delegado ao nutritionEngine: a base `foods` é a autoridade e a
 * correspondência é exata pelo nome normalizado (sem fuzzy match silencioso).
 */
const calculateFoodMacros = (
  food: ParsedFood,
  index: FoodIndex,
): DietMacroTotals & { matched: boolean } => {
  const grams = parseQuantityGrams(food.qty);
  const computed = computeItemMacros(
    {
      name: food.food,
      qtyGrams: grams,
      macros: {
        kcal: parseNumber(food.kcal),
        p: parseNumber(food.p),
        c: parseNumber(food.c),
        g: parseNumber(food.g),
      },
    },
    index,
  );
  const validated = computed.validated && grams > 0;
  return {
    calories: computed.macros.kcal,
    protein: computed.macros.p,
    carbs: computed.macros.c,
    fats: computed.macros.g,
    matched: validated,
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
  const index = buildFoodIndex(
    (foods ?? []).map((f, i) => ({
      id: (f as { id?: string }).id ?? `food-${i}`,
      name: f.name,
      portion_size: f.portion_size ?? 100,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fats: f.fats,
    })),
  );

  // Soma em precisão integral — nunca somando valores já arredondados.
  let generated: DietMacroTotals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const mealTotals = meals.map((meal: ParsedMeal) => {
    let mealTotal: DietMacroTotals = { calories: 0, protein: 0, carbs: 0, fats: 0 };

    for (const food of meal.foods) {
      const macros = calculateFoodMacros(food, index);
      if (!macros.matched) unmatched.add(food.food);
      mealTotal = addTotals(mealTotal, macros);
    }

    generated = addTotals(generated, mealTotal);
    return { meal: meal.name, ...roundTotals(mealTotal) };
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