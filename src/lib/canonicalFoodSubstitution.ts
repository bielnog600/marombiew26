/**
 * MICRO-HOTFIX UX — substituição canônica de alimento (ADMIN, structured).
 *
 * Determinístico, sem IA, sem optimizer do dia. Toda a matemática usa o motor
 * único (nutritionCore): foodId → foods → macros. O nome nunca é autoridade.
 */
import {
  buildFoodIndex,
  computeItemMacros,
  type EngineMacros,
  type FoodIndex,
  type FoodRecord,
} from './nutritionEngine';

export const ZERO: EngineMacros = { kcal: 0, p: 0, c: 0, g: 0 };

/** Macros REAIS de um alimento da base, em precisão integral. */
export const macrosForFoodQty = (
  foodId: string,
  qtyGrams: number,
  index: FoodIndex,
): EngineMacros =>
  computeItemMacros(
    { foodId, name: '', qtyGrams: Math.max(0, Number(qtyGrams) || 0) },
    index,
    'draft',
    'strict_id',
  ).macros;

/** Passos do projeto: até 20 g → 1 g; 20–100 g → 5 g; acima → 10 g. */
export const quantizeGrams = (grams: number): number => {
  const g = Math.max(0, Number(grams) || 0);
  const step = g <= 20 ? 1 : g <= 100 ? 5 : 10;
  return Math.max(step, Math.round(g / step) * step);
};

export const substitutionScore = (candidate: EngineMacros, target: EngineMacros): number =>
  (Math.abs(candidate.kcal - target.kcal) / Math.max(target.kcal, 1)) * 2 +
  Math.abs(candidate.p - target.p) / Math.max(target.p, 5) +
  Math.abs(candidate.c - target.c) / Math.max(target.c, 5) +
  Math.abs(candidate.g - target.g) / Math.max(target.g, 3);

export type EquivalenceLevel = 'equivalent' | 'close' | 'different';

export const equivalenceLevel = (
  candidate: EngineMacros,
  target: EngineMacros,
): EquivalenceLevel => {
  const dKcal = Math.abs(candidate.kcal - target.kcal) / Math.max(target.kcal, 1);
  const dP = Math.abs(candidate.p - target.p);
  const dC = Math.abs(candidate.c - target.c);
  const dG = Math.abs(candidate.g - target.g);
  if (dKcal <= 0.05 && dP <= 4 && dC <= 6 && dG <= 3) return 'equivalent';
  if (dKcal <= 0.15 && dP <= 10 && dC <= 15 && dG <= 8) return 'close';
  return 'different';
};

export const EQUIVALENCE_LABEL: Record<EquivalenceLevel, string> = {
  equivalent: 'Equivalente',
  close: 'Próximo',
  different: 'Perfil nutricional diferente',
};

export interface SubstitutionCandidate {
  food: FoodRecord;
  qtyGrams: number;
  macros: EngineMacros;
  diff: EngineMacros;
  score: number;
  level: EquivalenceLevel;
}

/**
 * Melhor porção equivalente: parte de kcal e faz busca local determinística
 * (±30%) com os passos do projeto, minimizando kcal + P/C/G normalizados.
 */
export const bestEquivalentPortion = (
  food: FoodRecord,
  target: EngineMacros,
  index: FoodIndex,
): SubstitutionCandidate | null => {
  if (!food?.id) return null;
  const portion = Number(food.portion_size) > 0 ? Number(food.portion_size) : 100;
  const kcalPerGram = Number(food.calories) > 0 ? Number(food.calories) / portion : 0;

  const base = kcalPerGram > 0 && target.kcal > 0 ? target.kcal / kcalPerGram : portion;
  const candidates = new Set<number>([quantizeGrams(base)]);
  const low = base * 0.7;
  const high = base * 1.3;
  const step = base <= 20 ? 1 : base <= 100 ? 5 : 10;
  for (let q = Math.max(step, Math.floor(low)); q <= Math.ceil(high); q += step) {
    candidates.add(quantizeGrams(q));
  }

  let best: SubstitutionCandidate | null = null;
  candidates.forEach((qty) => {
    if (!(qty > 0)) return;
    const macros = macrosForFoodQty(String(food.id), qty, index);
    const score = substitutionScore(macros, target);
    if (!best || score < best.score || (score === best.score && qty < best.qtyGrams)) {
      best = {
        food,
        qtyGrams: qty,
        macros,
        diff: {
          kcal: macros.kcal - target.kcal,
          p: macros.p - target.p,
          c: macros.c - target.c,
          g: macros.g - target.g,
        },
        score,
        level: equivalenceLevel(macros, target),
      };
    }
  });
  return best;
};

/** Ordena candidatos (já filtrados pela busca) pelo melhor equivalente. */
export const buildSubstitutionCandidates = (
  foods: FoodRecord[],
  target: EngineMacros,
  index?: FoodIndex,
  limit = 60,
): SubstitutionCandidate[] => {
  const idx = index ?? buildFoodIndex(foods ?? []);
  return (foods ?? [])
    .map((food) => bestEquivalentPortion(food, target, idx))
    .filter((c): c is SubstitutionCandidate => !!c)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
};

export const addMacros = (a: EngineMacros, b: EngineMacros): EngineMacros => ({
  kcal: a.kcal + b.kcal,
  p: a.p + b.p,
  c: a.c + b.c,
  g: a.g + b.g,
});

export const subMacros = (a: EngineMacros, b: EngineMacros): EngineMacros => ({
  kcal: a.kcal - b.kcal,
  p: a.p - b.p,
  c: a.c - b.c,
  g: a.g - b.g,
});

/** total - original + candidato (não recalcula o resto da dieta). */
export const totalsAfterSwap = (
  totals: EngineMacros,
  original: EngineMacros,
  candidate: EngineMacros,
): EngineMacros => addMacros(subMacros(totals, original), candidate);
