/**
 * Hidratação do plano (Fase 4).
 *
 * A IA devolve apenas `foodId + qtyGrams`. Aqui o servidor monta o DietPlan
 * canônico: nome oficial da base, macros calculados pelo nutritionCore,
 * totais de refeição e de dia recalculados. Qualquer macro/total devolvido pela
 * IA é descartado.
 */
import {
  FOOD_CONTRACT_VERSION,
  NUTRITION_ENGINE_VERSION,
  NUTRITION_SNAPSHOT_VERSION,
  ZERO_MACROS,
  computeItemMacros,
  roundForDisplay,
  type EngineMacros,
  type ResolutionPolicy,
} from "./nutritionCore.ts";
import type { FoodCatalog } from "./foodCatalog.ts";

export interface UnresolvedItemRef {
  day: string;
  meal: string;
  name: string;
  ambiguous: boolean;
}

export interface HydrationResult {
  plan: any;
  unresolvedItems: UnresolvedItemRef[];
  requiresResolution: boolean;
  /** Quantos itens foram calculados pela base. */
  resolvedCount: number;
}

const add = (a: EngineMacros, b: EngineMacros): EngineMacros => ({
  kcal: a.kcal + b.kcal,
  p: a.p + b.p,
  c: a.c + b.c,
  g: a.g + b.g,
});

/**
 * @param policy `strict_id` para geração nova (contrato da IA);
 *               `legacy` para planos antigos (fallback por nome exato).
 */
export function hydrateDietPlanFromFoods(
  rawPlan: any,
  catalog: FoodCatalog,
  policy: ResolutionPolicy = "strict_id",
): HydrationResult {
  const plan = JSON.parse(JSON.stringify(rawPlan ?? {}));
  const unresolvedItems: UnresolvedItemRef[] = [];
  let resolvedCount = 0;

  const days = Array.isArray(plan?.days) ? plan.days : [];
  for (const day of days) {
    let dayTotals: EngineMacros = { ...ZERO_MACROS };
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const meal of meals) {
      let mealTotals: EngineMacros = { ...ZERO_MACROS };
      const items = Array.isArray(meal?.items) ? meal.items : [];
      for (const item of items) {
        const fallbackName = String(item?.foodName ?? item?.name ?? "").trim();
        const computed = computeItemMacros(
          {
            foodId: item?.foodId ?? null,
            name: fallbackName,
            qtyGrams: Number(item?.qtyGrams) || 0,
            // Macros da IA NUNCA entram: não repassamos item.macros.
          },
          catalog.index,
          "draft",
          policy,
        );

        const food = computed.food;
        item.foodId = food?.id ?? null;
        item.name = food?.name ?? (fallbackName || "Alimento não identificado");
        delete item.foodName;
        item.qtyGrams = computed.qtyGrams;
        if (!item.portionLabel) item.portionLabel = `${Math.round(computed.qtyGrams)} g`;
        item.resolutionStatus = computed.status;

        if (computed.validated) {
          item.macros = roundForDisplay(computed.macros);
          mealTotals = add(mealTotals, computed.macros);
          resolvedCount++;
        } else {
          // Item não validado pela base não recebe macros estimados pela IA.
          item.macros = { kcal: 0, p: 0, c: 0, g: 0 };
          unresolvedItems.push({
            day: String(day?.label ?? day?.weekday ?? ""),
            meal: String(meal?.name ?? ""),
            name: item.name,
            ambiguous: Boolean(computed.ambiguous),
          });
        }
      }
      meal.totals = roundForDisplay(mealTotals);
      dayTotals = add(dayTotals, mealTotals);
    }
    day.totals = roundForDisplay(dayTotals);
  }

  // dailyAdjustments: o nome de apresentação vem SEMPRE do registro real.
  const adj = plan?.dailyAdjustments;
  if (adj && typeof adj === "object") {
    for (const day of Object.values<any>(adj)) {
      const instructions = Array.isArray(day?.instructions) ? day.instructions : [];
      for (const ins of instructions) {
        if (ins?.food_id) {
          const food = catalog.index.byId.get(String(ins.food_id));
          if (food) ins.food_name = food.name;
        }
      }
    }
  }

  plan.meta = {
    ...(plan.meta ?? {}),
    nutritionEngineVersion: NUTRITION_ENGINE_VERSION,
    nutritionSnapshotVersion: NUTRITION_SNAPSHOT_VERSION,
    foodContractVersion: FOOD_CONTRACT_VERSION,
  };

  return {
    plan,
    unresolvedItems,
    requiresResolution: unresolvedItems.length > 0,
    resolvedCount,
  };
}
