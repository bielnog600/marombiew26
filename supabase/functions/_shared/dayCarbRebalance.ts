/**
 * Ajuste determinístico de carboidrato por dia (metas diárias).
 *
 * Quando a IA monta praticamente o mesmo cardápio em todos os dias, o
 * carboidrato de cada weekday fica longe da meta daquele dia. Antes de
 * reprovar, escalamos apenas as porções de alimentos com perfil de carboidrato
 * daquele dia. Os macros são sempre recalculados pela base (hidratação).
 */
import { foodMacroRole } from "./nutritionCore.ts";
import type { FoodCatalog } from "./foodCatalog.ts";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const MIN_FACTOR = 0.4;
const MAX_FACTOR = 2.0;
const TRIGGER_G = 10;

/** Devolve um novo plano (não muta). Itens fora do catálogo não são tocados. */
export function rebalanceDayCarbs(
  plan: any,
  schedule: any,
  catalog: FoodCatalog,
): { plan: any; adjustedDays: string[] } {
  const out = JSON.parse(JSON.stringify(plan ?? {}));
  const adjustedDays: string[] = [];
  const days: any[] = Array.isArray(out?.days) ? out.days : [];
  for (const day of days) {
    const wd = String(day?.weekday || "").toLowerCase();
    const targetC = schedule?.days?.[wd]?.carbs_g;
    if (targetC == null || !Number.isFinite(Number(targetC))) continue;
    const carbItems: Array<{ item: any; cPerGram: number }> = [];
    let currentC = 0;
    let currentK = 0;
    for (const meal of day?.meals ?? []) {
      for (const item of meal?.items ?? []) {
        const food = item?.foodId ? catalog.index.byId.get(String(item.foodId)) : null;
        if (!food) continue;
        const base = num(food.portion_size) > 0 ? num(food.portion_size) : 100;
        const cPerGram = num(food.carbs) / base;
        currentC += cPerGram * num(item.qtyGrams);
        currentK += (num(food.calories) / base) * num(item.qtyGrams);
        if (foodMacroRole(food) === "carb" && cPerGram > 0) carbItems.push({ item, cPerGram });
      }
    }
    // Mira a caloria do dia sem tirar o carbo da tolerância (±12 g de folga).
    const carbDelta = Number(targetC) - currentC;
    const targetK = num(schedule?.days?.[wd]?.target_kcal ?? schedule?.days?.[wd]?.base_kcal);
    const kcalDeltaAsCarb = targetK > 0 ? (targetK - currentK) / 4 : carbDelta;
    const delta = Math.min(carbDelta + 12, Math.max(carbDelta - 12, kcalDeltaAsCarb));
    if (Math.abs(delta) <= TRIGGER_G || carbItems.length === 0) continue;
    const carbFromItems = carbItems.reduce((s, x) => s + x.cPerGram * num(x.item.qtyGrams), 0);
    if (carbFromItems <= 0) continue;
    const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, (carbFromItems + delta) / carbFromItems));
    for (const { item } of carbItems) {
      const q = Math.max(5, Math.round((num(item.qtyGrams) * factor) / 5) * 5);
      item.qtyGrams = q;
      item.portionLabel = `${q} g`;
    }
    adjustedDays.push(wd);

    // Sobra calórica (ex.: gordura abaixo da meta): fecha com a fonte de gordura do dia.
    let k2 = 0;
    let gNow = 0;
    const fatItems: Array<{ item: any; gPerGram: number }> = [];
    for (const meal of day?.meals ?? []) {
      for (const item of meal?.items ?? []) {
        const food = item?.foodId ? catalog.index.byId.get(String(item.foodId)) : null;
        if (!food) continue;
        const base = num(food.portion_size) > 0 ? num(food.portion_size) : 100;
        k2 += (num(food.calories) / base) * num(item.qtyGrams);
        gNow += (num(food.fats) / base) * num(item.qtyGrams);
        if (foodMacroRole(food) === "fat" && num(food.fats) > 0) fatItems.push({ item, gPerGram: num(food.fats) / base });
      }
    }
    const targetG = Number(schedule?.days?.[wd]?.fat_g);
    const residualK = targetK > 0 ? targetK - k2 : 0;
    if (Math.abs(residualK) > 35 && fatItems.length) {
      const fatDelta = Number.isFinite(targetG)
        ? Math.min(targetG + 6 - gNow, Math.max(targetG - 6 - gNow, residualK / 9))
        : residualK / 9;
      const fatFromItems = fatItems.reduce((s, x) => s + x.gPerGram * num(x.item.qtyGrams), 0);
      if (fatFromItems > 0 && Math.abs(fatDelta) >= 1) {
        const f = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, (fatFromItems + fatDelta) / fatFromItems));
        for (const { item } of fatItems) {
          const q = Math.max(5, Math.round((num(item.qtyGrams) * f) / 5) * 5);
          item.qtyGrams = q;
          item.portionLabel = `${q} g`;
        }
      }
    }
  }
  return { plan: out, adjustedDays };
}
