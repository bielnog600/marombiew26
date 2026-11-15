/**
 * Receitas e Opção 2 automática na dieta do aluno — regras puras.
 *
 * - Receitas: refeições do banco do mesmo horário, calculadas na hora a partir
 *   da Opção 1 (mesmo ajuste do "Gerar opções"); nada fica salvo na dieta.
 * - Opção 2 automática: refeição sem `options` salvas ganha a primeira refeição
 *   do banco que bate, escolhida de forma determinística (plano + dia + refeição)
 *   e sem repetir no mesmo dia nem no mesmo horário do dia anterior.
 */
import type { EngineMacros, FoodIndex } from '@/lib/nutritionEngine';
import {
  eligibleBankMeals,
  fitBankMeal,
  fichaMatchScore,
  foodViolates,
  mainProteinGroup,
  mealSlotsFor,
  mealTargetMacros,
  normText,
  originsForCountry,
  planItemToOptionItem,
  portionRuleFor,
  rankBankMeals,
  sumOptionItems,
  type BankFit,
  type BankMeal,
  type MacroTarget,
  type MealOption,
  type MealOrigin,
  type MealSlot,
  type StudentCountry,
  type StudentMealContext,
} from './index';

/* ---------------------------------------------------------------- filtros */

export interface RecipeTraits {
  ovo: boolean;
  lactose: boolean;
  doce: boolean;
  salgado: boolean;
  pratico: boolean;
  /** Tem modo de preparo. */
  receita: boolean;
}

export interface RecipeFilters {
  semOvo: boolean;
  semLactose: boolean;
  doce: boolean;
  salgado: boolean;
  pratico: boolean;
  /** Países ligados; vazio = todos. */
  countries: StudentCountry[];
}

export const defaultRecipeFilters = (country: StudentCountry | null): RecipeFilters => ({
  semOvo: false,
  semLactose: false,
  doce: false,
  salgado: false,
  pratico: false,
  countries: country ? [country] : [],
});

const EGG_RE = /\bovos?\b|\bclaras?\b|omelete/;
const LACTOSE_RE = /\bleite\b|iogurte|skyr|queijo|requeijao|cottage/;
const PLANT_MILK_RE = /leite de (coco|amendoa|aveia|soja|arroz|caju)/;
const SAVORY_KINDS = new Set(['meat', 'egg', 'eggWhite', 'coldCut', 'veg', 'legume']);
const SWEET_KINDS = new Set(['fruit', 'driedFruit', 'sweet', 'oat', 'whey', 'yogurt']);
const PRACTICAL_TAGS = ['pratico', 'rapido', 'leva facil'];

/** Sem ovo = nenhum ovo/clara/omelete. */
export const foodHasEgg = (name: string): boolean => EGG_RE.test(normText(name));

/** Sem lactose = sem leite, iogurte, skyr, queijo, requeijão, cottage (exceto "sem lactose" no nome). */
export const foodHasLactose = (name: string): boolean => {
  const n = normText(name);
  if (/sem lactose|zero lactose/.test(n) || PLANT_MILK_RE.test(n)) return false;
  return LACTOSE_RE.test(n);
};

export const recipeTraits = (meal: BankMeal, index: FoodIndex): RecipeTraits => {
  const names = meal.items.map((i) => index.byId.get(i.foodId)?.name ?? '').filter(Boolean);
  const tags = (meal.tags ?? []).map(normText);
  const kinds = names.map((n) => portionRuleFor(n).kind);
  const cheese = names.some((n) => /queijo|requeijao|mussarela|mozzarella|fiambre|presunto/.test(normText(n)));
  const tagDoce = tags.includes('doce');
  const tagSalgado = tags.includes('salgado');
  // Sem etiqueta: almoço/jantar e pratos com carne/ovo/legumes são salgados; o resto com fruta/aveia/whey é doce.
  const salgado = tagSalgado || (!tagDoce && (meal.slot === 'almoco' || meal.slot === 'jantar' || cheese || kinds.some((k) => SAVORY_KINDS.has(k))));
  const doce = tagDoce || (!tagSalgado && !salgado && kinds.some((k) => SWEET_KINDS.has(k)));
  const pratico = tags.some((t) => PRACTICAL_TAGS.includes(t)) ||
    (!meal.prep && meal.items.length <= 3 && !kinds.some((k) => k === 'meat' || k === 'carb'));
  return {
    ovo: names.some(foodHasEgg),
    lactose: names.some(foodHasLactose),
    doce,
    salgado,
    pratico,
    receita: !!String(meal.prep ?? '').trim(),
  };
};

export const originsForFilters = (filters: RecipeFilters): MealOrigin[] => {
  if (filters.countries.length !== 1) return ['BR', 'PT', 'BR/PT'];
  return originsForCountry(filters.countries[0]);
};

export const passesRecipeFilters = (meal: BankMeal, traits: RecipeTraits, filters: RecipeFilters): boolean => {
  if (!originsForFilters(filters).includes(meal.origin)) return false;
  if (filters.semOvo && traits.ovo) return false;
  if (filters.semLactose && traits.lactose) return false;
  if ((filters.doce || filters.salgado) && !((filters.doce && traits.doce) || (filters.salgado && traits.salgado))) return false;
  if (filters.pratico && !traits.pratico) return false;
  return true;
};

/* ---------------------------------------------------------------- receitas */

export interface StudentRecipe {
  meal: BankMeal;
  fit: BankFit;
  traits: RecipeTraits;
  /** Bate com a refeição (kcal ±10 %, P ±25 %, C ±30 %, G ±40 %, limites de porção). */
  ok: boolean;
  totals: EngineMacros;
  /** Esta receita − refeição atual. */
  diff: EngineMacros;
}

export interface StudentRecipesInput {
  bank: BankMeal[];
  index: FoodIndex;
  ctx: StudentMealContext;
  slots: MealSlot[];
  target: MacroTarget;
  filters: RecipeFilters;
  /** Códigos que já aparecem como cartão (Opção 2). */
  excludeCodes?: string[];
}

const fullTarget = (t: MacroTarget): EngineMacros => ({ kcal: t.kcal || 0, p: t.p ?? 0, c: t.c ?? 0, g: t.g ?? 0 });

/**
 * Receitas do horário com as gramas já ajustadas à refeição. As que batem vêm
 * primeiro (alimentos da ficha, horário principal e kcal mais perto); as que não
 * batem ficam no fim.
 */
export const studentRecipesFor = (input: StudentRecipesInput): StudentRecipe[] => {
  const { bank, index, ctx, slots, target, filters } = input;
  if (!slots.length || !(target.kcal > 0)) return [];
  const exclude = new Set(input.excludeCodes ?? []);
  const t = fullTarget(target);
  const pool = eligibleBankMeals(bank, slots, { ...ctx, origins: ['BR', 'PT', 'BR/PT'] }, index)
    .filter((m) => !exclude.has(m.code));
  const out: Array<StudentRecipe & { score: number }> = [];
  for (const meal of pool) {
    const traits = recipeTraits(meal, index);
    if (!passesRecipeFilters(meal, traits, filters)) continue;
    const fit = fitBankMeal(meal, index, target, { slots, ctx });
    const totals = sumOptionItems(fit.option.items);
    const names = meal.items.map((i) => index.byId.get(i.foodId)?.name ?? '');
    out.push({
      meal,
      fit,
      traits,
      ok: fit.ok,
      totals,
      diff: { kcal: totals.kcal - t.kcal, p: totals.p - t.p, c: totals.c - t.c, g: totals.g - t.g },
      score: fichaMatchScore(names, ctx.ficha) * 3 + (meal.slot === slots[0] ? 5 : 0),
    });
  }
  return out
    .sort((a, b) =>
      Number(b.ok) - Number(a.ok) ||
      b.score - a.score ||
      Math.abs(a.diff.kcal) - Math.abs(b.diff.kcal) ||
      a.meal.code.localeCompare(b.meal.code))
    .map(({ score: _s, ...r }) => r);
};

/* ------------------------------------------------------- Opção 2 automática */

const savedBankOptions = (meal: any): MealOption[] =>
  (Array.isArray(meal?.options) ? meal.options : []).filter(
    (o: any) => o?.source === 'bank' && Array.isArray(o?.items) && o.items.length > 0,
  );

export interface AutoOptionsInput {
  planId: string;
  /** Refeições canônicas de cada dia Seg..Dom (null = dia sem refeições). */
  weekDays: Array<any[] | null>;
  bank: BankMeal[];
  index: FoodIndex;
  ctx: StudentMealContext;
}

/**
 * Opção 2 de cada refeição da semana, por refeição canônica: a salva pelo admin
 * (primeira do banco) ou, se não houver, a primeira do banco que bate — sempre a
 * mesma para aquele plano/dia/refeição. `null` = nenhuma refeição do banco coube.
 */
export const autoBankOptionsForWeek = (input: AutoOptionsInput): Array<Array<MealOption | null>> => {
  const { planId, weekDays, bank, index, ctx } = input;
  const usedOtherDays = new Set<string>();
  let prevDay = new Map<string, Set<string>>();
  return weekDays.map((meals, dayIndex) => {
    const usedToday = new Set<string>();
    const thisDay = new Map<string, Set<string>>();
    (meals ?? []).forEach((meal) => savedBankOptions(meal).forEach((o) => o.bankCode && usedToday.add(o.bankCode)));
    const out = (meals ?? []).map((meal: any, mealIndex: number) => {
      const slots = mealSlotsFor(meal?.name ?? '', meal?.time);
      const mealKey = `${slots[0] ?? ''}|${normText(meal?.name)}`;
      const saved = savedBankOptions(meal)[0];
      if (saved) {
        if (saved.bankCode) { usedOtherDays.add(saved.bankCode); thisDay.set(mealKey, new Set([saved.bankCode])); }
        return saved;
      }
      const target = mealTargetMacros(meal);
      if (!slots.length || !(target.kcal > 0)) return null;
      const ranked = rankBankMeals(eligibleBankMeals(bank, slots, ctx, index), {
        slots,
        planProtein: mainProteinGroup((meal?.items ?? []).map(planItemToOptionItem)),
        usedToday,
        usedOtherDays,
        usedPrevDaySameMeal: prevDay.get(mealKey),
        targetKcal: target.kcal,
        seed: `${planId}|${dayIndex}|${mealIndex}`,
      }, ctx, index);
      for (const r of ranked) {
        const fit = fitBankMeal(r.meal, index, target, { slots, ctx });
        if (!fit.ok) continue;
        usedToday.add(r.meal.code);
        usedOtherDays.add(r.meal.code);
        thisDay.set(mealKey, new Set([r.meal.code]));
        return fit.option;
      }
      return null;
    });
    prevDay = thisDay;
    return out;
  });
};

/** Artigo do nome da refeição ("o Almoço", "a Ceia"). */
export const mealArticle = (name: string): 'o' | 'a' =>
  /^(ceia|merenda|refeicao|colacao|janta\b)/.test(normText(name)) ? 'a' : 'o';

export { foodViolates };
