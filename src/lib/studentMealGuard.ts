/**
 * Proteções da meta do dia na tela de dieta do aluno. Determinístico, sem IA.
 *
 * - recomputeMealTotals: totais da refeição sempre a partir dos alimentos.
 * - rebalanceSingleMeal: ajusta as porções de UMA refeição (incluindo
 *   alimentos adicionados) para fechar a meta do dia, reduzindo/aumentando
 *   primeiro carbo de base e gordura e preservando a proteína principal.
 * - mealCompletionExcess: quanto o dia passa da meta ao registrar uma refeição.
 */
import type { ParsedFood, ParsedMeal } from './dietResultParser';
import { addMacros, foodMacros, mealMacros, subMacros, ZERO_MACROS, type Macros } from './dailyDietRebalance';
import { parseQty } from './studentPortionAdjust';

export const KCAL_TOLERANCE = 50;

const fmt = (n: number) => String(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const recomputeMealTotals = <T extends ParsedMeal>(meal: T): T => {
  const t = mealMacros(meal);
  return { ...meal, totalKcal: `${Math.round(t.kcal)} kcal`, totalP: fmt(t.p), totalC: fmt(t.c), totalG: fmt(t.g) };
};

const CARB_BASE = /(arroz|batata|pao|massa|macarr|mandioca|aipim|tapioca|cuscuz|aveia|inhame|quinoa|wrap|tortilha|tortilla|granola|cereal)/;
const FAT = /(abacate|azeite|oleo|pasta de amendoim|amendoim|castanha|nozes|amendoa|queijo|cottage|manteiga|requeijao|creme de leite|chocolate)/;
const OIL = /(azeite|oleo|manteiga)/;

interface Unitized { n: number; unit: string; grams: boolean; min: number; max: number; step: number }

const unitize = (food: ParsedFood, originalN: number): Unitized | null => {
  const q = parseQty(food.qty);
  if (!q) return null;
  if (q.grams) {
    const min = OIL.test(norm(food.food)) ? 5 : Math.min(q.n, 30);
    return { n: q.n, unit: q.unit, grams: true, min, max: Math.max(q.n, originalN * 2), step: 5 };
  }
  return { n: q.n, unit: q.unit, grams: false, min: Math.min(q.n, 1), max: Math.max(q.n, Math.ceil(originalN * 2)), step: 1 };
};

const withQty = (base: ParsedFood, baseN: number, n: number, unit: string): ParsedFood => {
  const m = foodMacros(base);
  const r = n / baseN;
  return {
    ...base,
    qty: unit ? `${String(n).replace('.', ',')} ${unit}` : String(n),
    kcal: fmt(m.kcal * r),
    p: fmt(m.p * r),
    c: fmt(m.c * r),
    g: fmt(m.g * r),
  };
};

export interface MealPortionChange { foodName: string; before: string; after: string }

export interface SingleMealRebalance {
  ok: boolean;
  foods: ParsedFood[];
  changes: MealPortionChange[];
  mealTargetKcal: number;
  beforeKcal: number;
  afterKcal: number;
  dayAfter: Macros;
  suggestion: string | null;
}

/**
 * @param foods alimentos atuais da refeição (versão do aluno)
 * @param prescribedFoods alimentos prescritos (para saber o que foi adicionado e a proteína principal)
 * @param otherTotal macros das demais refeições consideradas no dia
 */
export const rebalanceSingleMeal = (input: {
  foods: ParsedFood[];
  prescribedFoods: ParsedFood[];
  otherTotal: Macros;
  dailyTarget: Macros;
}): SingleMealRebalance => {
  const { foods, prescribedFoods, otherTotal, dailyTarget } = input;
  const prescribedNames = new Set(prescribedFoods.map((f) => norm(f.food)));
  const added = foods.filter((f) => !prescribedNames.has(norm(f.food)));

  // Proteína principal: maior proteína entre os alimentos de classe proteica (preservada).
  let mainProteinIdx = -1;
  foods.forEach((f, i) => {
    const m = foodMacros(f);
    const isProtein = m.p * 4 >= (m.p * 4 + m.c * 4 + m.g * 9) * 0.5;
    if (isProtein && !FAT.test(norm(f.food)) && (mainProteinIdx < 0 || m.p > foodMacros(foods[mainProteinIdx]).p)) mainProteinIdx = i;
  });

  const state = foods.map((f, i) => {
    const orig = prescribedFoods.find((p) => norm(p.food) === norm(f.food));
    const origN = orig ? parseQty(orig.qty)?.n ?? 0 : 0;
    const u = unitize(f, origN || parseQty(f.qty)?.n || 0);
    const name = norm(f.food);
    const tier = i === mainProteinIdx ? 9 : CARB_BASE.test(name) || FAT.test(name) || !prescribedNames.has(name) ? 0 : 1;
    return { food: f, baseN: u?.n ?? 0, u, n: u?.n ?? 0, tier };
  });

  const mealTargetKcal = dailyTarget.kcal - otherTotal.kcal;
  const beforeKcal = foods.reduce((s, f) => s + foodMacros(f).kcal, 0);
  const kcalOf = (s: (typeof state)[number]) => (s.baseN > 0 ? (foodMacros(s.food).kcal * s.n) / s.baseN : foodMacros(s.food).kcal);
  const total = () => state.reduce((acc, s) => acc + kcalOf(s), 0);

  // Arredonda gramas para múltiplos de 5 antes de começar.
  state.forEach((s) => { if (s.u?.grams) s.n = Math.max(s.u.min, Math.round(s.n / 5) * 5); });

  for (const tier of [0, 1]) {
    for (let guard = 0; guard < 500; guard++) {
      const diff = total() - mealTargetKcal;
      if (Math.abs(diff) <= KCAL_TOLERANCE / 2) break;
      const reducing = diff > 0;
      const pool = state.filter((s) => s.u && s.tier === tier && (reducing ? s.n - s.u.step >= s.u.min : s.n + s.u.step <= s.u.max));
      if (pool.length === 0) break;
      // Fonte mais calórica primeiro; empate decidido pela ordem.
      pool.sort((a, b) => kcalOf(b) - kcalOf(a));
      const pick = pool[0];
      const stepKcal = pick.baseN > 0 ? (foodMacros(pick.food).kcal * pick.u!.step) / pick.baseN : 0;
      if (stepKcal <= 0) break;
      // Não ultrapassar demais na direção oposta.
      if (Math.abs(diff) < stepKcal / 2) break;
      pick.n += reducing ? -pick.u!.step : pick.u!.step;
    }
  }

  const nextFoods = state.map((s) => (s.u && s.n !== s.baseN ? withQty(s.food, s.baseN, s.n, s.u.unit) : s.food));
  const changes: MealPortionChange[] = nextFoods
    .map((f, i) => ({ foodName: f.food, before: foods[i].qty, after: f.qty }))
    .filter((c) => c.before !== c.after);
  const afterKcal = nextFoods.reduce((s, f) => s + foodMacros(f).kcal, 0);
  const dayAfter = addMacros(otherTotal, nextFoods.reduce<Macros>((a, f) => addMacros(a, foodMacros(f)), ZERO_MACROS));
  const ok = Math.abs(dayAfter.kcal - dailyTarget.kcal) <= KCAL_TOLERANCE;

  let suggestion: string | null = null;
  if (!ok) {
    const biggest = [...foods].sort((a, b) => foodMacros(b).kcal - foodMacros(a).kcal)[0];
    if (dayAfter.kcal > dailyTarget.kcal) {
      suggestion = added.length > 0
        ? `Para bater a meta, retire o ${added[0].food} ou reduza ${biggest?.food ?? 'a maior fonte calórica'}.`
        : `Para bater a meta, reduza ${biggest?.food ?? 'a maior fonte calórica'}.`;
    } else {
      suggestion = `Para bater a meta, aumente ${biggest?.food ?? 'uma fonte de carboidrato'} ou adicione um alimento.`;
    }
  }

  return { ok, foods: nextFoods, changes, mealTargetKcal, beforeKcal, afterKcal, dayAfter, suggestion };
};

export interface CompletionExcess { exceeds: boolean; kcal: number; p: number; c: number; g: number; dayTotal: Macros }

/** Total do dia (refeições já registradas + a que vai ser registrada) contra a meta. */
export const mealCompletionExcess = (input: {
  meals: ParsedMeal[];
  completedIndexes: number[];
  mealIndex: number;
  dailyTarget: Macros;
}): CompletionExcess => {
  const { meals, completedIndexes, mealIndex, dailyTarget } = input;
  const idx = new Set([...completedIndexes, mealIndex]);
  const dayTotal = meals.reduce<Macros>((acc, m, i) => (idx.has(i) ? addMacros(acc, mealMacros(m)) : acc), ZERO_MACROS);
  const d = subMacros(dayTotal, dailyTarget);
  return { exceeds: dailyTarget.kcal > 0 && d.kcal > KCAL_TOLERANCE, kcal: d.kcal, p: d.p, c: d.c, g: d.g, dayTotal };
};

/** Diferença assinada (consumo/plano − meta) em texto. */
export const formatSignedKcalDiff = (planMinusTarget: number): string => {
  const r = Math.round(planMinusTarget);
  if (r > 0) return `+${r} kcal acima da meta`;
  if (r < 0) return `−${Math.abs(r)} kcal abaixo da meta`;
  return 'na meta';
};
