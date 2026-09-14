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
  normalizeFoodName,
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
  reason: "no_food_id" | "ambiguous_name" | "not_found";
  /** Preenchido quando o alimento foi autorizado antes da geração. */
  authorizationSource?: string;
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

export interface HydrationOptions {
  /** Nome normalizado → origem da autorização do unresolved. */
  authorizationBySource?: Record<string, string>;
}

/**
 * @param policy `strict_id` para geração nova (contrato da IA);
 *               `legacy` para planos antigos (fallback por nome exato).
 */
export function hydrateDietPlanFromFoods(
  rawPlan: any,
  catalog: FoodCatalog,
  policy: ResolutionPolicy = "strict_id",
  options: HydrationOptions = {},
): HydrationResult {
  const plan = JSON.parse(JSON.stringify(rawPlan ?? {}));
  const unresolvedItems: UnresolvedItemRef[] = [];
  let resolvedCount = 0;

  const days = Array.isArray(plan?.days) ? plan.days : [];
  for (const day of days) {
    let dayTotals: EngineMacros = { ...ZERO_MACROS };
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    let mealIndex = 0;
    for (const meal of meals) {
      // Campos estruturais obrigatórios preenchidos deterministicamente
      // (a IA não precisa mais devolvê-los).
      if (typeof meal.id !== "string" || !meal.id) {
        meal.id = `${String(day?.weekday ?? "dia")}-${mealIndex + 1}`;
      }
      if (typeof meal.order !== "number" || !Number.isFinite(meal.order)) {
        meal.order = mealIndex + 1;
      }
      mealIndex += 1;
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
          const authKey = normalizeFoodName(item.name);
          const authorizationSource = options.authorizationBySource?.[authKey];
          unresolvedItems.push({
            day: String(day?.weekday ?? day?.label ?? ""),
            meal: String(meal?.name ?? ""),
            name: item.name,
            ambiguous: Boolean(computed.ambiguous),
            reason: computed.ambiguous
              ? "ambiguous_name"
              : (item.foodId ? "not_found" : "no_food_id"),
            ...(authorizationSource ? { authorizationSource } : {}),
          });
        }
      }
      meal.totals = roundForDisplay(mealTotals);
      dayTotals = add(dayTotals, mealTotals);
    }
    day.totals = roundForDisplay(dayTotals);
  }

  // dailyAdjustments: nome canônico E estimated_kcal recalculados pela base.
  // A IA não é autoridade nem aqui.
  const adj = plan?.dailyAdjustments;
  if (adj && typeof adj === "object") {
    for (const day of Object.values<any>(adj)) {
      const instructions = Array.isArray(day?.instructions) ? day.instructions : [];
      for (const ins of instructions) {
        if (!ins?.food_id) continue;
        const food = catalog.index.byId.get(String(ins.food_id));
        if (!food) continue;
        ins.food_name = food.name;
        const computed = computeItemMacros(
          { foodId: food.id, name: food.name, qtyGrams: Number(ins.quantity) || 0 },
          catalog.index,
          "draft",
          "strict_id",
        );
        ins.estimated_kcal = Math.round(computed.macros.kcal);
      }
    }
  }

  const hasSnapshot = days.some((d: any) =>
    (d?.meals ?? []).some((m: any) => (m?.items ?? []).some((i: any) => i?.nutritionSnapshot)),
  );

  plan.meta = {
    ...(plan.meta ?? {}),
    nutritionEngineVersion: NUTRITION_ENGINE_VERSION,
    foodContractVersion: FOOD_CONTRACT_VERSION,
    // Snapshot definitivo é Fase 6: só versionamos se realmente houver snapshot.
    ...(hasSnapshot ? { nutritionSnapshotVersion: NUTRITION_SNAPSHOT_VERSION } : {}),
  };

  return {
    plan,
    unresolvedItems,
    requiresResolution: unresolvedItems.length > 0,
    resolvedCount,
  };
}
