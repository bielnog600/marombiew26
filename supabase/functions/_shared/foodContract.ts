/**
 * Validador do contrato de alimentos devolvido pela IA (Fase 4).
 *
 * A IA só pode usar foodIds presentes no FOOD CATALOG daquela requisição.
 * `foodId: null` só é aceito para nomes explicitamente autorizados ANTES da
 * geração (dieta modelo / alimento exigido pelo treinador).
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

/** Origem da autorização de um alimento sem cadastro. Nunca "AI". */
export type AllowedUnresolvedSource = "model_diet" | "trainer_required";

export const ALLOWED_UNRESOLVED_SOURCES: AllowedUnresolvedSource[] = [
  "model_diet",
  "trainer_required",
];

export interface AllowedUnresolvedFood {
  name: string;
  source: AllowedUnresolvedSource;
}

/** Contrato "fresh" = resposta atual da IA. "legacy" = plano já persistido. */
export type ContractMode = "fresh" | "legacy";

export interface FoodContractReport {
  valid: boolean;
  mode: ContractMode;
  invalidFoodIds: string[];
  /** Itens sem foodId e sem autorização. */
  missingFoodIds: string[];
  unresolvedAllowed: string[];
  /** Nome normalizado → origem da autorização. */
  authorizationBySource: Record<string, AllowedUnresolvedSource>;
  usedFoodIds: string[];
  issues: FoodContractIssue[];
}

export interface ContractItemRef {
  path: string;
  kind: "meal_item" | "daily_adjustment";
  foodId?: string | null;
  foodName?: string | null;
  qty?: unknown;
  /** true quando o campo de quantidade nem sequer existe no objeto. */
  qtyPresent: boolean;
  /** true quando a referência possui campo food_id/foodId declarado. */
  foodIdPresent: boolean;
}

/**
 * Só aceita autorizações com proveniência explícita.
 * Strings soltas (formato legado) são tratadas como `trainer_required`.
 */
export function normalizeAllowedUnresolved(
  input: Array<AllowedUnresolvedFood | string> | undefined | null,
  mode: ContractMode = "legacy",
): AllowedUnresolvedFood[] {
  const out: AllowedUnresolvedFood[] = [];
  for (const raw of input ?? []) {
    if (typeof raw === "string") {
      // Contrato FRESH: string solta nunca vira `trainer_required`.
      if (mode === "fresh") continue;
      const name = raw.trim();
      if (name) out.push({ name, source: "trainer_required" });
      continue;
    }
    const name = String(raw?.name ?? "").trim();
    const source = raw?.source as AllowedUnresolvedSource;
    if (!name) continue;
    if (!ALLOWED_UNRESOLVED_SOURCES.includes(source)) continue; // origem AI/ausente: recusada
    out.push({ name, source });
  }
  return out;
}

/** Percorre o plano bruto e lista todas as referências a alimentos. */
export function collectFoodReferences(
  plan: any,
  mode: ContractMode = "fresh",
): ContractItemRef[] {
  const refs: ContractItemRef[] = [];
  const days = Array.isArray(plan?.days) ? plan.days : [];
  days.forEach((day: any, di: number) => {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    meals.forEach((meal: any, mi: number) => {
      const items = Array.isArray(meal?.items) ? meal.items : [];
      items.forEach((item: any, ii: number) => {
        refs.push({
          path: `days[${di}].meals[${mi}].items[${ii}]`,
          kind: "meal_item",
          foodId: item?.foodId ?? null,
          foodName: item?.foodName ?? item?.name ?? null,
          qty: item?.qtyGrams,
          qtyPresent: item != null && "qtyGrams" in item,
          foodIdPresent: item != null && "foodId" in item,
        });
      });
    });
  });
  const adj = plan?.dailyAdjustments;
  if (adj && typeof adj === "object") {
    for (const [wd, day] of Object.entries<any>(adj)) {
      const instructions = Array.isArray(day?.instructions) ? day.instructions : [];
      instructions.forEach((ins: any, i: number) => {
        // Compatibilidade APENAS para ajustes já persistidos (legacy).
        // Uma resposta atual da IA é sempre fresh e exige food_id.
        if (mode === "legacy" && ins?.food_id == null && ins?.food_name != null) return;
        refs.push({
          path: `dailyAdjustments.${wd}.instructions[${i}]`,
          kind: "daily_adjustment",
          foodId: ins?.food_id ?? null,
          foodName: ins?.food_name ?? null,
          qty: ins?.quantity,
          qtyPresent: ins != null && "quantity" in ins,
          foodIdPresent: ins != null && "food_id" in ins,
        });
      });
    }
  }
  return refs;
}

export interface ValidateFoodContractOptions {
  mode?: ContractMode;
  allowedUnresolved?: Array<AllowedUnresolvedFood | string>;
}

export function validateFoodContract(
  plan: any,
  catalog: FoodCatalog,
  options: ValidateFoodContractOptions | Array<AllowedUnresolvedFood | string> = {},
): FoodContractReport {
  const opts: ValidateFoodContractOptions = Array.isArray(options)
    ? { allowedUnresolved: options }
    : options;
  const mode: ContractMode = opts.mode ?? "fresh";
  const authorized = normalizeAllowedUnresolved(opts.allowedUnresolved, mode);
  const allowed = new Map<string, AllowedUnresolvedSource>();
  for (const a of authorized) {
    const key = normalizeFoodName(a.name);
    if (key) allowed.set(key, a.source);
  }

  const issues: FoodContractIssue[] = [];
  const invalidFoodIds: string[] = [];
  const missingFoodIds: string[] = [];
  const unresolvedAllowed: string[] = [];
  const authorizationBySource: Record<string, AllowedUnresolvedSource> = {};
  const usedFoodIds: string[] = [];

  for (const ref of collectFoodReferences(plan, mode)) {
    // --- quantidade: obrigatória e > 0 em contrato fresh ---
    const n = Number(ref.qty);
    const qtyValid = ref.qtyPresent && ref.qty !== null && ref.qty !== "" &&
      Number.isFinite(n) && n > 0;
    if (mode === "fresh" ? !qtyValid : ref.qtyPresent && (!Number.isFinite(n) || n < 0)) {
      issues.push({
        path: ref.path,
        reason: "invalid_qty",
        detail: `Quantidade inválida (obrigatória, numérica e > 0): ${
          ref.qtyPresent ? String(ref.qty) : "ausente"
        }`,
      });
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

    // Ajuste diário em contrato fresh nunca pode vir sem food_id.
    if (ref.kind === "daily_adjustment" && mode === "fresh") {
      missingFoodIds.push(name || ref.path);
      issues.push({
        path: ref.path,
        reason: "missing_food_id",
        detail: `Ajuste diário sem food_id${name ? `: "${name}"` : ""}.`,
      });
      continue;
    }

    if (key && allowed.has(key)) {
      unresolvedAllowed.push(name);
      authorizationBySource[key] = allowed.get(key)!;
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
    mode,
    invalidFoodIds: Array.from(new Set(invalidFoodIds)),
    missingFoodIds: Array.from(new Set(missingFoodIds)),
    unresolvedAllowed: Array.from(new Set(unresolvedAllowed)),
    authorizationBySource,
    usedFoodIds: Array.from(new Set(usedFoodIds)),
    issues,
  };
}
