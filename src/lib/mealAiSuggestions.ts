/**
 * HOTFIX UX — sugestões de IA por refeição (editor canônico do ADMIN).
 *
 * A IA escolhe SOMENTE `foodId` + `qtyGrams` de alimentos reais do catálogo.
 * Os macros exibidos são SEMPRE calculados aqui pelo nutritionCore; qualquer
 * valor nutricional devolvido pelo modelo é ignorado.
 *
 * Nada aqui publica, altera metas, carb cycling ou o food contract.
 */
import {
  buildFoodIndex,
  computeDayTotals,
  roundForDisplay,
  type EngineMacros,
  type FoodRecord,
} from './nutritionEngine';
import { recomputeDayFromFoods } from './dietFoodResolution';
import { OFFICIAL_MACRO_TOLERANCE } from './macroTolerances';
import type { DayTarget } from './dietDayTargets';

export type SuggestionPriority = 'varied' | 'similar' | 'simple';

export const SUGGESTION_PRIORITY_LABELS: Record<SuggestionPriority, string> = {
  varied: 'Mais variada',
  similar: 'Mais semelhante',
  simple: 'Mais simples',
};

/** Sanidade básica de porção — não cria regra nutricional nova. */
export const MAX_SUGGESTION_QTY_GRAMS = 2000;

export interface RawSuggestionItem {
  foodId?: unknown;
  qtyGrams?: unknown;
  foodName?: unknown;
}

export interface RawSuggestion {
  title?: unknown;
  reason?: unknown;
  items?: unknown;
}

export interface ValidatedSuggestionItem {
  foodId: string;
  name: string;
  qtyGrams: number;
  macros: EngineMacros;
}

export interface ValidatedSuggestion {
  title: string;
  reason: string;
  items: ValidatedSuggestionItem[];
  mealTotals: EngineMacros;
  dayTotalsBefore: EngineMacros;
  dayTotalsAfter: EngineMacros;
  withinTarget: boolean | null;
}

export interface SuggestionValidationResult {
  suggestions: ValidatedSuggestion[];
  discarded: number;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const toNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const engineMeals = (day: any) =>
  (day?.meals ?? []).map((m: any) => ({
    items: (m?.items ?? []).map((it: any) => ({
      foodId: it?.foodId ?? null,
      name: String(it?.name ?? ''),
      qtyGrams: Number(it?.qtyGrams) || 0,
    })),
  }));

/** Totais reais do dia, pelo motor único. */
export const computeDayMacros = (day: any, foods: FoodRecord[]): EngineMacros => {
  const index = buildFoodIndex(foods);
  return computeDayTotals(engineMeals(day), index, 'draft', 'strict_id').totals;
};

export interface UsedFoodRef {
  meal: string;
  foodId: string | null;
  name: string;
}

/** Alimentos já usados nas OUTRAS refeições do mesmo dia (contexto de repetição). */
export const collectUsedFoodsForDay = (
  day: any,
  excludeMealIndex: number,
): UsedFoodRef[] => {
  const out: UsedFoodRef[] = [];
  (day?.meals ?? []).forEach((meal: any, mi: number) => {
    if (mi === excludeMealIndex) return;
    (meal?.items ?? []).forEach((item: any) => {
      out.push({
        meal: String(meal?.name ?? `Refeição ${mi + 1}`),
        foodId: item?.foodId ?? null,
        name: String(item?.name ?? ''),
      });
    });
  });
  return out;
};

export interface MealSuggestionRequest {
  mode: 'meal_suggestions';
  priority: SuggestionPriority;
  meal: {
    name: string;
    time: string | null;
    items: Array<{ foodId: string | null; name: string; qtyGrams: number; macros: EngineMacros }>;
    totals: EngineMacros;
  };
  otherMeals: Array<{
    name: string;
    items: Array<{ foodId: string | null; name: string; qtyGrams: number }>;
  }>;
  usedFoods: UsedFoodRef[];
  dayTarget: DayTarget | null;
  dayTotals: EngineMacros;
  dayType: string | null;
  studentContext: Record<string, unknown> | null;
  trainingContext: string | null;
  foodCatalog: Array<{
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    portion_size: number;
    brand?: string | null;
    source?: string | null;
  }>;
}

/** Monta o payload da chamada — uma refeição por vez. */
export const buildMealSuggestionRequest = (input: {
  plan: any;
  dayIndex: number;
  mealIndex: number;
  priority: SuggestionPriority;
  foods: FoodRecord[];
  target?: DayTarget | null;
  dayType?: string | null;
  studentContext?: Record<string, unknown> | null;
  trainingContext?: string | null;
}): MealSuggestionRequest => {
  const { plan, dayIndex, mealIndex, priority, foods } = input;
  const day = plan?.days?.[dayIndex];
  const meal = day?.meals?.[mealIndex];
  const index = buildFoodIndex(foods);
  const computedDay = computeDayTotals(engineMeals(day), index, 'draft', 'strict_id');
  const computedMeal = computedDay.meals[mealIndex];

  return {
    mode: 'meal_suggestions',
    priority,
    meal: {
      name: String(meal?.name ?? ''),
      time: meal?.time ?? null,
      items: (meal?.items ?? []).map((it: any, i: number) => ({
        foodId: it?.foodId ?? null,
        name: String(it?.name ?? ''),
        qtyGrams: Number(it?.qtyGrams) || 0,
        macros: roundForDisplay(computedMeal?.items?.[i]?.macros ?? { kcal: 0, p: 0, c: 0, g: 0 }),
      })),
      totals: roundForDisplay(computedMeal?.totals ?? { kcal: 0, p: 0, c: 0, g: 0 }),
    },
    otherMeals: (day?.meals ?? [])
      .map((m: any, mi: number) => ({ m, mi }))
      .filter(({ mi }) => mi !== mealIndex)
      .map(({ m }) => ({
        name: String(m?.name ?? ''),
        items: (m?.items ?? []).map((it: any) => ({
          foodId: it?.foodId ?? null,
          name: String(it?.name ?? ''),
          qtyGrams: Number(it?.qtyGrams) || 0,
        })),
      })),
    usedFoods: collectUsedFoodsForDay(day, mealIndex),
    dayTarget: input.target ?? null,
    dayTotals: roundForDisplay(computedDay.totals),
    dayType: input.dayType ?? null,
    studentContext: input.studentContext ?? null,
    trainingContext: input.trainingContext ?? null,
    foodCatalog: (foods ?? []).map((f) => ({
      id: String(f.id),
      name: f.name,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fats: f.fats,
      portion_size: f.portion_size || 100,
      brand: (f as any).brand ?? null,
      source: (f as any).source ?? null,
    })),
  };
};

/** Aplica os itens sugeridos SOMENTE naquela refeição e recalcula o dia. */
export const applyMealSuggestion = <TPlan = any>(input: {
  plan: TPlan;
  dayIndex: number;
  mealIndex: number;
  items: Array<{ foodId: string; qtyGrams: number }>;
  foods: FoodRecord[];
}): TPlan => {
  const { plan, dayIndex, mealIndex, items, foods } = input;
  const next: any = clone(plan);
  const meal = next?.days?.[dayIndex]?.meals?.[mealIndex];
  if (!meal) return next;
  const index = buildFoodIndex(foods);
  meal.items = items.map((it) => {
    const food = index.byId.get(String(it.foodId));
    return {
      foodId: String(it.foodId),
      name: food?.name ?? '',
      qtyGrams: it.qtyGrams,
      resolutionStatus: 'resolved_by_id',
      manualLocked: false,
      macros: { kcal: 0, p: 0, c: 0, g: 0 },
    };
  });
  recomputeDayFromFoods(next.days[dayIndex], foods);
  return next as TPlan;
};

const withinOfficialTolerance = (totals: EngineMacros, target: DayTarget): boolean =>
  Math.abs(totals.kcal - target.kcal) <= OFFICIAL_MACRO_TOLERANCE.kcal &&
  Math.abs(totals.p - target.p) <= OFFICIAL_MACRO_TOLERANCE.p &&
  Math.abs(totals.c - target.c) <= OFFICIAL_MACRO_TOLERANCE.c &&
  Math.abs(totals.g - target.g) <= OFFICIAL_MACRO_TOLERANCE.g;

/**
 * Valida a resposta da IA e calcula TUDO deterministicamente.
 * Sugestão com foodId inexistente, qtyGrams <= 0 ou vazia é descartada.
 */
export const validateMealSuggestions = (input: {
  raw: unknown;
  plan: any;
  dayIndex: number;
  mealIndex: number;
  foods: FoodRecord[];
  target?: DayTarget | null;
}): SuggestionValidationResult => {
  const { raw, plan, dayIndex, mealIndex, foods, target } = input;
  const list: RawSuggestion[] = Array.isArray((raw as any)?.suggestions)
    ? (raw as any).suggestions
    : [];
  const index = buildFoodIndex(foods);
  const day = plan?.days?.[dayIndex];
  const dayTotalsBefore = roundForDisplay(
    computeDayTotals(engineMeals(day), index, 'draft', 'strict_id').totals,
  );

  const suggestions: ValidatedSuggestion[] = [];
  let discarded = 0;

  list.forEach((sug, si) => {
    const rawItems = Array.isArray(sug?.items) ? (sug.items as RawSuggestionItem[]) : [];
    if (rawItems.length === 0) {
      discarded += 1;
      return;
    }
    const items: Array<{ foodId: string; qtyGrams: number }> = [];
    let invalid = false;
    for (const it of rawItems) {
      const foodId = String(it?.foodId ?? '').trim();
      const qty = toNumber(it?.qtyGrams);
      const food = foodId ? index.byId.get(foodId) : undefined;
      if (!food || !Number.isFinite(qty) || qty <= 0 || qty > MAX_SUGGESTION_QTY_GRAMS) {
        invalid = true;
        break;
      }
      items.push({ foodId, qtyGrams: Math.round(qty * 10) / 10 });
    }
    if (invalid || items.length === 0) {
      discarded += 1;
      return;
    }

    const candidate = applyMealSuggestion({ plan, dayIndex, mealIndex, items, foods });
    const candidateDay = (candidate as any)?.days?.[dayIndex];
    const computed = computeDayTotals(engineMeals(candidateDay), index, 'draft', 'strict_id');
    const mealComputation = computed.meals[mealIndex];
    if (mealComputation.items.some((i) => i.status === 'unresolved')) {
      discarded += 1;
      return;
    }

    suggestions.push({
      title: String(sug?.title ?? '').trim() || `Opção ${si + 1}`,
      reason: String(sug?.reason ?? '').trim(),
      items: items.map((it, ii) => ({
        foodId: it.foodId,
        name: index.byId.get(it.foodId)?.name ?? '',
        qtyGrams: it.qtyGrams,
        macros: roundForDisplay(mealComputation.items[ii].macros),
      })),
      mealTotals: roundForDisplay(mealComputation.totals),
      dayTotalsBefore,
      dayTotalsAfter: roundForDisplay(computed.totals),
      withinTarget: target ? withinOfficialTolerance(computed.totals, target) : null,
    });
  });

  return { suggestions, discarded };
};
