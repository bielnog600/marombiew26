/**
 * Validador do contrato de alimentos devolvido pela IA (Fase 4).
 *
 * A IA só pode usar foodIds presentes no FOOD CATALOG daquela requisição.
 * `foodId: null` só é aceito para nomes explicitamente autorizados.
 * Nenhum fuzzy match: ID inválido nunca vira "resolvido por nome".
 */
import { normalizeFoodName } from "./nutritionCore.ts";
import type { FoodCatalog } from "./foodCatalog.ts";

export interface FoodContractIssue {
  path: string;
  reason:
    | "invalid_food_id"
    | "missing_food_id"
    | "invalid_qty"
    | "unauthorized_unresolved";
  detail: string;
}

export interface FoodContractReport {
  valid: boolean;
  invalidFoodIds: string[];
  /** Itens sem foodId e sem autorização. */
  missingFoodIds: string[];
  unresolvedAllowed: string[];
  usedFoodIds: string[];
  issues: FoodContractIssue[];
}

const isFiniteNumber = (v: unknown) => Number.isFinite(Number(v));

export interface ContractItemRef {
  path: string;
  foodId?: string | null;
  foodName?: string | null;
  qtyGrams?: unknown;
  /** Quantidade em outra unidade (dailyAdjustments) — validada da mesma forma. */
  quantity?: unknown;
}

/** Percorre o plano bruto e lista todas as referências a alimentos. */
export function collectFoodReferences(plan: any): ContractItemRef[] {
  const refs: ContractItemRef[] = [];
  const days = Array.isArray(plan?.days) ? plan.days : [];
  days.forEach((day: any, di: number) => {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    meals.forEach((meal: any, mi: number) => {
      const items = Array.isArray(meal?.items) ? meal.items : [];
      items.forEach((item: any, ii: number) => {
        refs.push({
          path: `days[${di}].meals[${mi}].items[${ii}]`,
          foodId: item?.foodId ?? null,
          foodName: item?.foodName ?? item?.name ?? null,
          qtyGrams: item?.qtyGrams,
        });
      });
    });
  });
  const adj = plan?.dailyAdjustments;
  if (adj && typeof adj === "object") {
    for (const [wd, day] of Object.entries<any>(adj)) {
      const instructions = Array.isArray(day?.instructions) ? day.instructions : [];
      instructions.forEach((ins: any, i: number) => {
        // Compatibilidade: instruções antigas só têm food_name.
        if (ins?.food_id == null && ins?.food_name != null) return;
        refs.push({
          path: `dailyAdjustments.${wd}.instructions[${i}]`,
          foodId: ins?.food_id ?? null,
          foodName: ins?.food_name ?? null,
          quantity: ins?.quantity,
        });
      });
    }
  }
  return refs;
}

export function validateFoodContract(
  plan: any,
  catalog: FoodCatalog,
  allowedUnresolvedNames: string[] = [],
): FoodContractReport {
  const allowed = new Set(
    (allowedUnresolvedNames ?? []).map((n) => normalizeFoodName(String(n ?? ""))).filter(Boolean),
  );
  const issues: FoodContractIssue[] = [];
  const invalidFoodIds: string[] = [];
  const missingFoodIds: string[] = [];
  const unresolvedAllowed: string[] = [];
  const usedFoodIds: string[] = [];

  for (const ref of collectFoodReferences(plan)) {
    const qty = ref.qtyGrams !== undefined ? ref.qtyGrams : ref.quantity;
    if (qty !== undefined) {
      const n = Number(qty);
      if (!isFiniteNumber(qty) || n < 0) {
        issues.push({
          path: ref.path,
          reason: "invalid_qty",
          detail: `Quantidade inválida: ${String(qty)}`,
        });
      }
    }

    if (ref.foodId) {
      const id = String(ref.foodId);
      if (!catalog.index.byId.has(id)) {
        invalidFoodIds.push(id);
        issues.push({
          path: ref.path,
          reason: "invalid_food_id",
          detail: `foodId inexistente no catálogo: ${id}`,
        });
      } else {
        usedFoodIds.push(id);
      }
      continue;
    }

    const name = String(ref.foodName ?? "").trim();
    const key = normalizeFoodName(name);
    if (key && allowed.has(key)) {
      unresolvedAllowed.push(name);
      continue;
    }
    missingFoodIds.push(name || ref.path);
    issues.push({
      path: ref.path,
      reason: name ? "unauthorized_unresolved" : "missing_food_id",
      detail: name
        ? `Alimento sem foodId e não autorizado: "${name}"`
        : "Item sem foodId e sem nome.",
    });
  }

  return {
    valid: issues.length === 0,
    invalidFoodIds: Array.from(new Set(invalidFoodIds)),
    missingFoodIds: Array.from(new Set(missingFoodIds)),
    unresolvedAllowed: Array.from(new Set(unresolvedAllowed)),
    usedFoodIds: Array.from(new Set(usedFoodIds)),
    issues,
  };
}
