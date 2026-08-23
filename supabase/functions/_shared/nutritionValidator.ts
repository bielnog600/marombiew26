export type DietNutritionIssue = {
  meal: string;
  reason: "missing_primary_protein" | "protein_below_floor" | "low_protein_share" | "breakfast_missing_protein" | "breakfast_protein_below_floor";
  proteinG: number;
};

export type DietNutritionValidation = {
  ok: boolean;
  issues: DietNutritionIssue[];
};

export function validateDietNutrition(plan: any): DietNutritionValidation {
  const issues: DietNutritionIssue[] = [];
  
  if (!plan?.meals || !Array.isArray(plan.meals)) return { ok: true, issues: [] };

  for (const meal of plan.meals) {
    const name = (meal.meal || "").toLowerCase();
    const protein = meal.total_protein || 0;
    
    const isMainMeal = name.includes("almoço") || name.includes("jantar") || name.includes("ceia");
    const isBreakfast = name.includes("café") || name.includes("desjejum");

    if (isMainMeal && protein < 30) {
      issues.push({ meal: meal.meal, reason: "protein_below_floor", proteinG: protein });
    }
    if (isBreakfast && protein < 15) {
      issues.push({ meal: meal.meal, reason: "breakfast_protein_below_floor", proteinG: protein });
    }
  }

  return { ok: issues.length === 0, issues };
}
