/**
 * FASE 6 — helpers PUROS de publicação de dieta structured.
 *
 * Princípio de autoridade:
 *   - rascunho  → `foods` atual manda;
 *   - publicado → `nutritionSnapshot` gravado na publicação manda.
 *
 * Nada aqui faz IO, chama IA ou altera quantidades. A publicação é o gate
 * definitivo: plano fora da meta/ com item não resolvido NÃO publica.
 */
import {
  FOOD_CONTRACT_VERSION,
  NUTRITION_ENGINE_VERSION,
  NUTRITION_SNAPSHOT_VERSION,
  computeItemMacros,
  makeNutritionSnapshot,
  roundForDisplay,
  type FoodRecord,
  type NutritionSnapshot,
} from "./nutritionCore.ts";
import type { FoodCatalog } from "./foodCatalog.ts";
import { ENERGY_WEEKDAYS, type EnergyWeekday } from "./dailyAdjustments.ts";

export const PUBLICATION_ADJUSTMENT_TOLERANCE_KCAL = 75;

export type PublicationErrorCode =
  | "not_authorized"
  | "plan_not_found"
  | "structured_plan_required"
  | "already_published"
  | "food_contract_invalid"
  | "unresolved_foods"
  | "publication_targets_invalid"
  | "nutrition_target_invalid"
  | "daily_adjustments_invalid"
  | "food_catalog_changed"
  | "draft_changed_refresh_required"
  | "publication_schema_invalid"
  | "publication_failed";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const majorVersion = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^v?(\d+)/i);
  return m ? Number(m[1]) : null;
};

/** STRUCTURED é definido pelo CONTRATO, não pela presença de foodId. */
export const isStructuredPlan = (plan: any): boolean => {
  const major = majorVersion(plan?.meta?.foodContractVersion);
  return major !== null && major >= 1;
};

export interface PlanItemRef {
  dayIndex: number;
  mealIndex: number;
  itemIndex: number;
  day: string;
  meal: string;
  name: string;
  item: any;
}

export const collectPlanItems = (plan: any): PlanItemRef[] => {
  const out: PlanItemRef[] = [];
  const days: any[] = Array.isArray(plan?.days) ? plan.days : [];
  days.forEach((day, dayIndex) => {
    const meals: any[] = Array.isArray(day?.meals) ? day.meals : [];
    meals.forEach((meal, mealIndex) => {
      const items: any[] = Array.isArray(meal?.items) ? meal.items : [];
      items.forEach((item, itemIndex) => {
        out.push({
          dayIndex,
          mealIndex,
          itemIndex,
          day: String(day?.label ?? day?.weekday ?? `dia ${dayIndex + 1}`),
          meal: String(meal?.name ?? `refeição ${mealIndex + 1}`),
          name: String(item?.name ?? item?.foodName ?? ""),
          item,
        });
      });
    });
  });
  return out;
};

export interface UnresolvedPublicationItem {
  day: string;
  meal: string;
  name: string;
  reason: "no_food_id" | "not_found" | "invalid_qty" | "unresolved";
}

/**
 * Contrato de PUBLICAÇÃO (mais estrito que o de geração): zero unresolved,
 * foodId real e qtyGrams > 0 em todos os itens.
 */
export const collectPublicationBlockers = (
  plan: any,
  catalog: FoodCatalog,
): UnresolvedPublicationItem[] => {
  const blockers: UnresolvedPublicationItem[] = [];
  for (const ref of collectPlanItems(plan)) {
    const base = { day: ref.day, meal: ref.meal, name: ref.name };
    const foodId = ref.item?.foodId;
    if (!foodId) {
      blockers.push({ ...base, reason: "no_food_id" });
      continue;
    }
    if (!catalog.index.byId.has(String(foodId))) {
      blockers.push({ ...base, reason: "not_found" });
      continue;
    }
    if (ref.item?.resolutionStatus === "unresolved") {
      blockers.push({ ...base, reason: "unresolved" });
      continue;
    }
    const qty = Number(ref.item?.qtyGrams);
    if (!Number.isFinite(qty) || qty <= 0) {
      blockers.push({ ...base, reason: "invalid_qty" });
    }
  }
  return blockers;
};

/* -------------------------------------------------------------------------- */
/* Food assertions (proteção TOCTOU)                                          */
/* -------------------------------------------------------------------------- */

export interface FoodAssertion {
  id: string;
  name: string;
  portionSize: number;
  kcal: number;
  p: number;
  c: number;
  g: number;
  brand: string | null;
  source: string | null;
}

const assertionFromFood = (food: FoodRecord): FoodAssertion => ({
  id: food.id,
  name: food.name,
  portionSize: num(food.portion_size) > 0 ? num(food.portion_size) : 100,
  kcal: num(food.calories),
  p: num(food.protein),
  c: num(food.carbs),
  g: num(food.fats),
  brand: food.brand ?? null,
  source: food.source ?? null,
});

const collectAdjustmentFoodIds = (adjustments: any): string[] => {
  const ids: string[] = [];
  if (!adjustments || typeof adjustments !== "object") return ids;
  for (const day of Object.values<any>(adjustments)) {
    for (const ins of day?.instructions ?? []) {
      const id = ins?.food_id ? String(ins.food_id) : "";
      if (id) ids.push(id);
    }
  }
  return ids;
};

/**
 * Lista ÚNICA por foodId com os valores usados para criar os snapshots.
 * FASE 6.1 — cobre também os `generated_adjustments` normalizados (que vivem
 * em `protocols.weekly_energy_schedule`, fora do plano).
 */
export const collectFoodAssertions = (
  plan: any,
  catalog: FoodCatalog,
  normalizedDailyAdjustments?: any,
): FoodAssertion[] => {
  const byId = new Map<string, FoodAssertion>();
  const push = (rawId: unknown) => {
    const id = rawId ? String(rawId) : "";
    if (!id || byId.has(id)) return;
    const food = catalog.index.byId.get(id);
    if (food) byId.set(id, assertionFromFood(food));
  };
  for (const ref of collectPlanItems(plan)) push(ref.item?.foodId);
  for (const id of collectAdjustmentFoodIds(plan?.dailyAdjustments)) push(id);
  for (const id of collectAdjustmentFoodIds(normalizedDailyAdjustments)) push(id);
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const round4 = (v: unknown): number => Math.round(num(v) * 10000) / 10000;
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/**
 * FASE 6.1 — o snapshot histórico gravado precisa ser EXATAMENTE o alimento
 * conferido contra `foods` (assertion). Mesma regra aplicada pela RPC.
 */
export const validateSnapshotAssertionIntegrity = (
  plan: any,
  assertions: FoodAssertion[],
  normalizedDailyAdjustments?: any,
): PublicationSchemaReport => {
  const issues: string[] = [];
  const byId = new Map<string, FoodAssertion>();
  for (const a of assertions ?? []) byId.set(String(a.id), a);

  for (const ref of collectPlanItems(plan)) {
    const path = `${ref.day} / ${ref.meal} / ${ref.name || "item"}`;
    const id = ref.item?.foodId ? String(ref.item.foodId) : "";
    const a = id ? byId.get(id) : undefined;
    if (!a) { issues.push(`${path}: sem assertion para o alimento.`); continue; }
    const s = ref.item?.nutritionSnapshot;
    if (!s) { issues.push(`${path}: sem nutritionSnapshot.`); continue; }
    if (round4(s.portionSize) !== round4(a.portionSize)) issues.push(`${path}: portionSize divergente.`);
    if (round4(s.kcal) !== round4(a.kcal)) issues.push(`${path}: kcal divergente.`);
    if (round4(s.p) !== round4(a.p)) issues.push(`${path}: proteína divergente.`);
    if (round4(s.c) !== round4(a.c)) issues.push(`${path}: carboidrato divergente.`);
    if (round4(s.g) !== round4(a.g)) issues.push(`${path}: gordura divergente.`);
    if (str(s.brand) !== str(a.brand)) issues.push(`${path}: marca divergente.`);
    if (str(s.source) !== str(a.source)) issues.push(`${path}: fonte divergente.`);
    if (str(ref.item?.name) !== str(a.name)) issues.push(`${path}: nome divergente do alimento.`);
  }

  for (const id of collectAdjustmentFoodIds(normalizedDailyAdjustments ?? plan?.dailyAdjustments)) {
    if (!byId.has(id)) issues.push(`Ajuste diário sem assertion para o alimento ${id}.`);
  }

  return { ok: issues.length === 0, issues };
};


/* -------------------------------------------------------------------------- */
/* Snapshot                                                                   */
/* -------------------------------------------------------------------------- */

export interface BuildSnapshotResult {
  plan: any;
  snapshotCount: number;
}

const addMacros = (a: any, b: any) => ({
  kcal: num(a.kcal) + num(b.kcal),
  p: num(a.p) + num(b.p),
  c: num(a.c) + num(b.c),
  g: num(a.g) + num(b.g),
});

/**
 * Cria o plano publicado: snapshot por item, resolutionStatus = "snapshot",
 * macros e totais recalculados pelo nutritionCore (nunca pela IA/draft).
 */
export const buildPublishedSnapshotPlan = (
  hydratedPlan: any,
  catalog: FoodCatalog,
): BuildSnapshotResult => {
  const plan = JSON.parse(JSON.stringify(hydratedPlan ?? {}));
  let snapshotCount = 0;

  for (const day of plan?.days ?? []) {
    let dayTotals = { kcal: 0, p: 0, c: 0, g: 0 };
    for (const meal of day?.meals ?? []) {
      let mealTotals = { kcal: 0, p: 0, c: 0, g: 0 };
      for (const item of meal?.items ?? []) {
        const food = catalog.index.byId.get(String(item?.foodId ?? ""));
        if (!food) continue; // bloqueado antes; defensivo
        const snapshot: NutritionSnapshot = makeNutritionSnapshot(food);
        item.nutritionSnapshot = snapshot;
        item.resolutionStatus = "snapshot";
        item.name = food.name;
        const computed = computeItemMacros(
          { foodId: food.id, name: food.name, qtyGrams: num(item?.qtyGrams), nutritionSnapshot: snapshot },
          catalog.index,
          "published",
          "strict_id",
        );
        item.macros = roundForDisplay(computed.macros);
        item.portionLabel = `${Math.round(num(item?.qtyGrams))} g`;
        mealTotals = addMacros(mealTotals, computed.macros);
        snapshotCount += 1;
      }
      meal.totals = roundForDisplay(mealTotals);
      dayTotals = addMacros(dayTotals, mealTotals);
    }
    day.totals = roundForDisplay(dayTotals);
  }

  plan.meta = {
    ...(plan.meta ?? {}),
    nutritionEngineVersion: NUTRITION_ENGINE_VERSION,
    foodContractVersion: FOOD_CONTRACT_VERSION,
    nutritionSnapshotVersion: NUTRITION_SNAPSHOT_VERSION,
  };

  return { plan, snapshotCount };
};

/** Rascunho nunca carrega snapshot: volta ao contrato foodId + foods atual. */
export const stripPublicationSnapshots = (publishedPlan: any): any => {
  const plan = JSON.parse(JSON.stringify(publishedPlan ?? {}));
  for (const day of plan?.days ?? []) {
    for (const meal of day?.meals ?? []) {
      for (const item of meal?.items ?? []) {
        delete item.nutritionSnapshot;
        if (item?.resolutionStatus === "snapshot") {
          item.resolutionStatus = item?.foodId ? "resolved_by_id" : "unresolved";
        }
      }
    }
  }
  if (plan.meta && typeof plan.meta === "object") {
    delete plan.meta.nutritionSnapshotVersion;
    delete plan.meta.publishedAt;
    delete plan.meta.publishedBy;
    delete plan.meta.publicationRevision;
  }
  return plan;
};

/* -------------------------------------------------------------------------- */
/* Validação estrutural do JSON final                                         */
/* -------------------------------------------------------------------------- */

export interface PublicationSchemaReport {
  ok: boolean;
  issues: string[];
}

export const validatePublicationPlan = (plan: any): PublicationSchemaReport => {
  const issues: string[] = [];
  if (!plan?.meta?.foodContractVersion) issues.push("meta.foodContractVersion ausente.");
  if (!plan?.meta?.nutritionSnapshotVersion) issues.push("meta.nutritionSnapshotVersion ausente.");
  const days = Array.isArray(plan?.days) ? plan.days : [];
  if (!days.length) issues.push("Plano sem dias.");
  for (const ref of collectPlanItems(plan)) {
    const path = `${ref.day} / ${ref.meal} / ${ref.name || "item"}`;
    if (!ref.item?.foodId) issues.push(`${path}: sem foodId.`);
    const qty = Number(ref.item?.qtyGrams);
    if (!Number.isFinite(qty) || qty <= 0) issues.push(`${path}: qtyGrams inválido.`);
    if (!ref.item?.nutritionSnapshot) issues.push(`${path}: sem nutritionSnapshot.`);
    if (ref.item?.resolutionStatus !== "snapshot") issues.push(`${path}: resolutionStatus != snapshot.`);
  }
  return { ok: issues.length === 0, issues };
};

/* -------------------------------------------------------------------------- */
/* Daily adjustments                                                          */
/* -------------------------------------------------------------------------- */

export interface DailyAdjustmentsPublicationReport {
  ok: boolean;
  issues: string[];
  /** Ajustes com food_name/estimated_kcal recalculados pela base atual. */
  adjustments: any | null;
}

/**
 * Revalida server-side os ajustes diários exigidos pelo schedule.
 * A estimativa da IA NUNCA é autoridade: kcal é recalculada pela base.
 */
export const validatePublicationDailyAdjustments = (
  protocols: any,
  catalog: FoodCatalog,
): DailyAdjustmentsPublicationReport => {
  const schedule = protocols?.weekly_energy_schedule ?? null;
  const generated = schedule?.generated_adjustments ?? null;
  const base = Math.round(num(schedule?.base_daily_kcal));

  const requiresAdjustments = !!schedule && base > 0 && ENERGY_WEEKDAYS.some((wd) => {
    const d = schedule?.days?.[wd];
    if (!d) return false;
    const target = d?.fixed_kcal != null && num(d.fixed_kcal) > 0
      ? Math.round(num(d.fixed_kcal))
      : Math.round(base + num(d?.adjustment_kcal));
    return target !== base;
  });

  if (!requiresAdjustments) {
    return { ok: true, issues: [], adjustments: generated ?? null };
  }
  if (!generated || typeof generated !== "object") {
    return { ok: false, issues: ["Ajustes diários ausentes."], adjustments: null };
  }

  const issues: string[] = [];
  const out = JSON.parse(JSON.stringify(generated));

  for (const wd of ENERGY_WEEKDAYS as EnergyWeekday[]) {
    const d = out?.[wd];
    if (!d) { issues.push(`${wd}: dia ausente.`); continue; }
    const scheduled = schedule?.days?.[wd];
    const target = scheduled?.fixed_kcal != null && num(scheduled.fixed_kcal) > 0
      ? Math.round(num(scheduled.fixed_kcal))
      : Math.round(base + num(scheduled?.adjustment_kcal));
    const requested = target - base;
    const instructions = Array.isArray(d.instructions) ? d.instructions : [];

    if (requested === 0) {
      if (instructions.length > 0) issues.push(`${wd}: dia base não pode ter instruções.`);
      d.requested_adjustment_kcal = 0;
      d.estimated_adjustment_kcal = 0;
      d.status = "base";
      continue;
    }

    if (instructions.length === 0) {
      issues.push(`${wd}: dia ajustado sem instruções.`);
      continue;
    }

    const expected = requested > 0 ? "add" : "remove";
    let estimated = 0;
    for (const ins of instructions) {
      if (ins?.action !== expected) {
        issues.push(`${wd}: instrução com sinal incompatível (${String(ins?.action)}).`);
        continue;
      }
      const foodId = ins?.food_id ? String(ins.food_id) : "";
      const food = foodId ? catalog.index.byId.get(foodId) : undefined;
      if (!food) { issues.push(`${wd}: instrução sem food_id válido.`); continue; }
      const qty = Number(ins?.quantity);
      if (!Number.isFinite(qty) || qty <= 0) { issues.push(`${wd}: quantidade inválida.`); continue; }
      const computed = computeItemMacros(
        { foodId: food.id, name: food.name, qtyGrams: qty },
        catalog.index,
        "draft",
        "strict_id",
      );
      ins.food_name = food.name;
      ins.estimated_kcal = Math.round(computed.macros.kcal);
      estimated += (expected === "add" ? 1 : -1) * computed.macros.kcal;
    }

    d.requested_adjustment_kcal = requested;
    d.estimated_adjustment_kcal = Math.round(estimated);
    d.status = "adjusted";
    const diff = Math.round(estimated) - requested;
    if (Math.abs(diff) > PUBLICATION_ADJUSTMENT_TOLERANCE_KCAL) {
      issues.push(`${wd}: fora da tolerância (${diff > 0 ? "+" : ""}${diff} kcal).`);
    }
  }

  return { ok: issues.length === 0, issues, adjustments: out };
};
