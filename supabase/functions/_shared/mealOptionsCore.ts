/**
 * Opções por refeição (até 3) — núcleo compartilhado entre o app e a publicação.
 *
 * Opção 1 é SEMPRE a refeição do plano (`meal.items`); as opções 2 e 3 vêm do
 * Banco de refeições. Dietas sem `options` continuam idênticas (1 opção).
 * Macros nunca são autoridade aqui: são recalculados pelo nutritionCore.
 */
import { computeItemMacros, roundForDisplay, type EngineMacros, type FoodIndex } from "./nutritionCore.ts";

export const MAX_MEAL_OPTIONS = 3;

export interface MealOptionItem {
  foodId: string | null;
  name: string;
  qtyGrams: number;
  macros: EngineMacros;
}

export interface MealOption {
  source: "plan" | "bank";
  bankCode?: string;
  name: string;
  prep?: string | null;
  items: MealOptionItem[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const sumOptionItems = (items: Array<{ macros?: Partial<EngineMacros> | null }>): EngineMacros =>
  items.reduce<EngineMacros>(
    (acc, it) => ({
      kcal: acc.kcal + num(it?.macros?.kcal),
      p: acc.p + num(it?.macros?.p),
      c: acc.c + num(it?.macros?.c),
      g: acc.g + num(it?.macros?.g),
    }),
    { kcal: 0, p: 0, c: 0, g: 0 },
  );

const joinPt = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;

/** Nome curto da opção 1, a partir dos alimentos com mais calorias. */
export const planOptionName = (items: Array<{ name?: string; macros?: Partial<EngineMacros> | null }>): string => {
  const top = [...(items ?? [])]
    .filter((i) => String(i?.name ?? "").trim())
    .sort((a, b) => num(b?.macros?.kcal) - num(a?.macros?.kcal))
    .slice(0, 3)
    .map((i) => String(i.name).trim());
  return joinPt(top) || "Refeição do plano";
};

/** Item da opção 1 espelhando um item canônico do plano. */
export const planItemToOptionItem = (item: any): MealOptionItem => ({
  foodId: item?.foodId ? String(item.foodId) : null,
  name: String(item?.name ?? ""),
  qtyGrams: num(item?.qtyGrams),
  macros: {
    kcal: num(item?.macros?.kcal),
    p: num(item?.macros?.p),
    c: num(item?.macros?.c),
    g: num(item?.macros?.g),
  },
});

/** Recalcula os macros de um item de opção pela base (rascunho = base manda). */
export const recomputeOptionItem = (item: MealOptionItem, index: FoodIndex): MealOptionItem => {
  const computed = computeItemMacros(
    { foodId: item.foodId, name: item.name, qtyGrams: num(item.qtyGrams) },
    index,
    "draft",
    item.foodId ? "strict_id" : "legacy",
  );
  if (!computed.food) return { ...item, qtyGrams: num(item.qtyGrams) };
  return {
    foodId: computed.food.id,
    name: computed.food.name,
    qtyGrams: num(item.qtyGrams),
    macros: roundForDisplay(computed.macros),
  };
};

const isOption = (o: any): o is MealOption =>
  !!o && typeof o === "object" && (o.source === "plan" || o.source === "bank") && Array.isArray(o.items);

/**
 * Normaliza `meal.options`: opção 1 = itens atuais da refeição (sempre em
 * sincronia), no máximo 3 opções, bancos com macros pela base quando houver
 * índice. Sem opções do banco → remove `options` (volta a 1 opção, sem seletor).
 */
export const syncMealOptions = (meal: any, index?: FoodIndex | null): any => {
  if (!meal || !Array.isArray(meal.options)) return meal;
  const bank = meal.options
    .filter((o: any) => isOption(o) && o.source === "bank")
    .slice(0, MAX_MEAL_OPTIONS - 1)
    .map((o: MealOption) => ({
      source: "bank" as const,
      ...(o.bankCode ? { bankCode: String(o.bankCode) } : {}),
      name: String(o.name ?? ""),
      ...(o.prep ? { prep: String(o.prep) } : {}),
      items: (o.items ?? []).map((it) => {
        const base: MealOptionItem = {
          foodId: it?.foodId ? String(it.foodId) : null,
          name: String(it?.name ?? ""),
          qtyGrams: num(it?.qtyGrams),
          macros: {
            kcal: num(it?.macros?.kcal),
            p: num(it?.macros?.p),
            c: num(it?.macros?.c),
            g: num(it?.macros?.g),
          },
        };
        return index ? recomputeOptionItem(base, index) : base;
      }),
    }));
  if (bank.length === 0) {
    const { options: _drop, ...rest } = meal;
    return rest;
  }
  const previousPlan = meal.options.find((o: any) => isOption(o) && o.source === "plan");
  const planItems = (meal.items ?? []).map(planItemToOptionItem);
  const plan: MealOption = {
    source: "plan",
    name: planOptionName(planItems),
    ...(previousPlan?.prep ? { prep: String(previousPlan.prep) } : {}),
    items: planItems,
  };
  return { ...meal, options: [plan, ...bank] };
};

export const syncPlanMealOptions = (plan: any, index?: FoodIndex | null): any => {
  if (!plan || !Array.isArray(plan.days)) return plan;
  const touches = plan.days.some((d: any) => (d?.meals ?? []).some((m: any) => Array.isArray(m?.options)));
  if (!touches) return plan;
  return {
    ...plan,
    days: plan.days.map((d: any) => ({
      ...d,
      meals: (d?.meals ?? []).map((m: any) => syncMealOptions(m, index)),
    })),
  };
};

/** Forma estável das opções para o fingerprint semântico (sem macros). */
export const semanticMealOptions = (meal: any) =>
  Array.isArray(meal?.options) && meal.options.length > 0
    ? {
      options: meal.options.map((o: any) => ({
        source: String(o?.source ?? ""),
        bankCode: String(o?.bankCode ?? ""),
        name: String(o?.name ?? ""),
        prep: String(o?.prep ?? ""),
        items: (o?.items ?? []).map((i: any) => ({
          foodId: String(i?.foodId ?? ""),
          name: String(i?.name ?? ""),
          qtyGrams: Math.round(num(i?.qtyGrams) * 10) / 10,
        })),
      })),
    }
    : {};
