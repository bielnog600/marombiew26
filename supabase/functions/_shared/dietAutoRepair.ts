/**
 * Reparos determinísticos aplicados ao plano da IA ANTES da validação.
 * Toda conta usa a base `foods` (catálogo); nenhum macro da IA é usado.
 *
 * 1. normalizeScheduleMacros — dia com ±kcal mas macros globais: a diferença
 *    calórica vai para o carboidrato daquele dia (metas coerentes).
 * 2. repairInvalidFoodIds — foodId inexistente vira o equivalente do catálogo
 *    (nome exato único → melhor nome) ou o item é removido.
 * 3. enforceProteinFloors — almoço/jantar/café abaixo do mínimo: aumenta a
 *    fonte proteica da refeição e compensa nos lanches.
 */
import { foodMacroRole, normalizeFoodName, type FoodRecord } from "./nutritionCore.ts";
import type { FoodCatalog } from "./foodCatalog.ts";
import { normalizeName } from "./planSimilarity.ts";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const optNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const perGram = (food: FoodRecord, key: "calories" | "protein" | "carbs" | "fats") => {
  const base = num(food.portion_size) > 0 ? num(food.portion_size) : 100;
  return num(food[key]) / base;
};

export function normalizeScheduleMacros(schedule: any): { schedule: any; adjustedDays: string[] } {
  if (!schedule || typeof schedule !== "object" || !schedule.days) return { schedule, adjustedDays: [] };
  const out = clone(schedule);
  const adjustedDays: string[] = [];
  for (const [wd, d] of Object.entries<any>(out.days)) {
    const kcal = optNum(d?.target_kcal ?? d?.base_kcal);
    const p = optNum(d?.protein_g), c = optNum(d?.carbs_g), g = optNum(d?.fat_g);
    if (!kcal || p === null || c === null || g === null) continue;
    const diff = kcal - (p * 4 + c * 4 + g * 9);
    if (Math.abs(diff) <= 25) continue;
    d.carbs_g = Math.max(0, Math.round(c + diff / 4));
    adjustedDays.push(wd);
  }
  return { schedule: out, adjustedDays };
}

const ALIAS_STOP = new Set(["de", "da", "do", "das", "dos", "no", "na", "com", "sem", "em", "e"]);

const bestCatalogMatch = (name: string, catalog: FoodCatalog): FoodRecord | null => {
  const key = normalizeFoodName(name);
  if (!key) return null;
  const exact = catalog.index.byName.get(key) ?? [];
  if (exact.length === 1) return exact[0];
  const tokens = key.split(" ").filter((t) => t.length >= 3 && !ALIAS_STOP.has(t));
  if (!tokens.length) return exact[0] ?? null;
  let best: { f: FoodRecord; score: number; len: number } | null = null;
  for (const f of catalog.foods) {
    const words = normalizeFoodName(f.name).split(" ");
    if (!words.some((w) => w.startsWith(tokens[0]))) continue;
    const score = tokens.filter((t) => words.some((w) => w.startsWith(t))).length;
    if (!best || score > best.score || (score === best.score && f.name.length < best.len)) {
      best = { f, score, len: f.name.length };
    }
  }
  return best && best.score >= Math.min(2, tokens.length) ? best.f : null;
};

export interface FoodIdRepair {
  day: string;
  meal: string;
  from: string;
  to: string | null;
}

export function repairInvalidFoodIds(plan: any, catalog: FoodCatalog): { plan: any; repairs: FoodIdRepair[] } {
  const out = clone(plan);
  const repairs: FoodIdRepair[] = [];
  for (const day of out?.days ?? []) {
    for (const meal of day?.meals ?? []) {
      const items: any[] = Array.isArray(meal?.items) ? meal.items : [];
      const kept: any[] = [];
      for (const item of items) {
        const id = item?.foodId;
        if (!id || catalog.index.byId.has(String(id))) {
          kept.push(item);
          continue;
        }
        const name = String(item?.foodName ?? item?.name ?? "").trim();
        const match = name ? bestCatalogMatch(name, catalog) : null;
        repairs.push({ day: String(day?.weekday ?? ""), meal: String(meal?.name ?? ""), from: `${id}${name ? ` (${name})` : ""}`, to: match?.name ?? null });
        if (match) {
          item.foodId = match.id;
          kept.push(item);
        }
      }
      meal.items = kept;
    }
  }
  return { plan: out, repairs };
}

const MAIN = ["almoco", "jantar"];
const BREAKFAST = ["cafe da manha", "cafe manha", "desjejum"];
const mealKind = (m: any): "main" | "breakfast" | "other" => {
  const n = normalizeName(m?.name) || normalizeName(m?.id);
  if (MAIN.some((p) => n.includes(p))) return "main";
  if (BREAKFAST.some((p) => n.includes(p))) return "breakfast";
  return "other";
};

const isProteinFood = (f: FoodRecord) => {
  if (foodMacroRole(f) === "protein") return true;
  const kcal = perGram(f, "calories");
  return kcal > 0 && (perGram(f, "protein") * 4) / kcal >= 0.35;
};

export function enforceProteinFloors(
  plan: any,
  catalog: FoodCatalog,
  floors: { main: number; breakfast: number },
): { plan: any; adjusted: Array<{ day: string; meal: string; from: number; to: number }> } {
  const out = clone(plan);
  const adjusted: Array<{ day: string; meal: string; from: number; to: number }> = [];
  const foodOf = (item: any) => (item?.foodId ? catalog.index.byId.get(String(item.foodId)) ?? null : null);
  const mealProtein = (m: any) =>
    (m?.items ?? []).reduce((s: number, it: any) => {
      const f = foodOf(it);
      return s + (f ? perGram(f, "protein") * num(it.qtyGrams) : 0);
    }, 0);

  for (const day of out?.days ?? []) {
    const meals: any[] = day?.meals ?? [];
    for (const meal of meals) {
      const kind = mealKind(meal);
      if (kind === "other") continue;
      const floor = kind === "main" ? floors.main : floors.breakfast;
      const before = mealProtein(meal);
      if (before >= floor) continue;
      const candidates = (meal.items ?? [])
        .map((it: any) => ({ it, f: foodOf(it) }))
        .filter((x: any) => x.f && isProteinFood(x.f))
        .sort((a: any, b: any) => perGram(b.f, "protein") - perGram(a.f, "protein"));
      const pick = candidates[0];
      if (!pick) continue;
      const pPerG = perGram(pick.f, "protein");
      if (pPerG <= 0) continue;
      const need = floor + 1 - before;
      const addG = Math.ceil(need / pPerG / 5) * 5;
      pick.it.qtyGrams = num(pick.it.qtyGrams) + addG;
      pick.it.portionLabel = `${pick.it.qtyGrams} g`;
      const addedP = addG * pPerG;

      // Compensação: tira a mesma proteína das fontes proteicas dos lanches.
      let remaining = addedP;
      for (const other of meals) {
        if (remaining <= 1 || other === meal || mealKind(other) !== "other") continue;
        for (const it of other.items ?? []) {
          if (remaining <= 1) break;
          const f = foodOf(it);
          if (!f || !isProteinFood(f)) continue;
          const opg = perGram(f, "protein");
          if (opg <= 0) continue;
          const minQty = Math.max(5, num(it.qtyGrams) * 0.5);
          const canRemoveG = Math.max(0, num(it.qtyGrams) - minQty);
          const removeG = Math.min(canRemoveG, Math.floor(remaining / opg / 5) * 5);
          if (removeG <= 0) continue;
          it.qtyGrams = round5(num(it.qtyGrams) - removeG);
          it.portionLabel = `${it.qtyGrams} g`;
          remaining -= removeG * opg;
        }
      }
      adjusted.push({ day: String(day?.weekday ?? ""), meal: String(meal?.name ?? ""), from: Math.round(before), to: Math.round(mealProtein(meal)) });
    }
  }
  return { plan: out, adjusted };
}

/** Proteína do dia acima da meta: reduz fontes proteicas dos lanches e, depois, das principais acima do piso. */
export function trimDayProtein(
  plan: any,
  catalog: FoodCatalog,
  schedule: any,
  floors: { main: number; breakfast: number },
): { plan: any; trimmedDays: string[] } {
  const out = clone(plan);
  const trimmedDays: string[] = [];
  const foodOf = (item: any) => (item?.foodId ? catalog.index.byId.get(String(item.foodId)) ?? null : null);
  const protOf = (items: any[]) =>
    items.reduce((s, it) => {
      const f = foodOf(it);
      return s + (f ? perGram(f, "protein") * num(it.qtyGrams) : 0);
    }, 0);
  for (const day of out?.days ?? []) {
    const wd = String(day?.weekday || "").toLowerCase();
    const targetP = optNum(schedule?.days?.[wd]?.protein_g);
    if (targetP === null) continue;
    const meals: any[] = day?.meals ?? [];
    let excess = protOf(meals.flatMap((m) => m.items ?? [])) - (targetP + 5);
    if (excess <= 0) continue;
    const ordered = [...meals.filter((m) => mealKind(m) === "other"), ...meals.filter((m) => mealKind(m) !== "other")];
    for (const meal of ordered) {
      if (excess <= 0) break;
      const kind = mealKind(meal);
      const floor = kind === "main" ? floors.main + 2 : kind === "breakfast" ? floors.breakfast + 1 : 0;
      for (const it of meal.items ?? []) {
        if (excess <= 0) break;
        const f = foodOf(it);
        if (!f || !isProteinFood(f)) continue;
        const pg = perGram(f, "protein");
        if (pg <= 0) continue;
        const slack = protOf(meal.items) - floor;
        const maxByFloor = slack > 0 ? slack / pg : 0;
        const maxByQty = num(it.qtyGrams) * 0.5;
        const removeG = Math.floor(Math.min(maxByFloor, maxByQty, excess / pg) / 5) * 5;
        if (removeG <= 0) continue;
        it.qtyGrams = round5(num(it.qtyGrams) - removeG);
        it.portionLabel = `${it.qtyGrams} g`;
        excess -= removeG * pg;
      }
    }
    trimmedDays.push(wd);
  }
  return { plan: out, trimmedDays };
}
