/**
 * Substituição canônica de alimento (ALUNO e ADMIN).
 *
 * Determinístico, sem IA e sem optimizer do dia. Toda a matemática usa o motor
 * único (nutritionCore): foodId → foods → macros. O nome só classifica fontes
 * proteicas e unidades; nunca é autoridade para calcular macros.
 */
import {
  buildFoodIndex,
  computeItemMacros,
  normalizeFoodName,
  type EngineMacros,
  type FoodIndex,
  type FoodRecord,
} from './nutritionEngine';
import {
  rankFoodsForGoal,
  type FoodPreferenceContext,
  type RankedFoodChoice,
} from './foodPreference';

export const ZERO: EngineMacros = { kcal: 0, p: 0, c: 0, g: 0 };
export const PROTEIN_KCAL_TOLERANCE = 0.1;
export const PROTEIN_EQUIVALENCE_GRAMS = 4;
export const PROTEIN_WARNING_GRAMS = 8;

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

/** Fonte proteica: proteína priorizada (3×), depois kcal e gordura (1×). */
export const proteinSubstitutionScore = (candidate: EngineMacros, target: EngineMacros): number =>
  Math.abs(candidate.p - target.p) * 3 +
  Math.abs(candidate.kcal - target.kcal) +
  Math.abs(candidate.g - target.g);

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

/** Regra específica da troca proteica: P ±4 g e kcal ±10%. */
export const isProteinEquivalent = (candidate: EngineMacros, target: EngineMacros): boolean =>
  Math.abs(candidate.p - target.p) <= PROTEIN_EQUIVALENCE_GRAMS &&
  Math.abs(candidate.kcal - target.kcal) <= Math.max(target.kcal, 1) * PROTEIN_KCAL_TOLERANCE + 1e-8;

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
  /** Na opção "Mesma proteína": o teto de +10% impediu bater toda a proteína. */
  proteinLimitedByCalories?: boolean;
  proteinShortfall?: number;
}

const candidateAt = (
  food: FoodRecord,
  qtyGrams: number,
  target: EngineMacros,
  index: FoodIndex,
  proteinMode = false,
): SubstitutionCandidate => {
  const macros = macrosForFoodQty(String(food.id), qtyGrams, index);
  const diff = subMacros(macros, target);
  return {
    food,
    qtyGrams,
    macros,
    diff,
    score: proteinMode ? proteinSubstitutionScore(macros, target) : substitutionScore(macros, target),
    level: proteinMode
      ? isProteinEquivalent(macros, target) ? 'equivalent' : 'different'
      : equivalenceLevel(macros, target),
  };
};

/**
 * Melhor porção por calorias: comportamento anterior, com busca local
 * determinística (±30%) e os passos do projeto.
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
    const next = candidateAt(food, qty, target, index);
    if (!best || next.score < best.score || (next.score === best.score && qty < best.qtyGrams)) best = next;
  });
  return best;
};

/** Ordenação antiga preservada para carboidratos, gorduras e alimentos mistos. */
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

/* -------------------------------------------------------------------------- */
/* Fonte de proteína e unidades                                               */
/* -------------------------------------------------------------------------- */

const PROTEIN_NAME = /(?:\bwhey\b|\bfrango\b|\bperu\b|\bcarne\b|\bbife\b|\bpatinho\b|\balcatra\b|\bpeixe\b|\batum\b|\bsalmao\b|\bsardinha\b|\btilapia\b|\bporco\b|\blombo\b|\bovo\b|\bovos\b|\bclara\b|\bclaras\b|\btofu\b|\btempeh\b|\bseitan\b|\bpts\b|proteina de soja|proteina vegetal|iogurte proteico|\bskyr\b|\bquark\b|\bcottage\b)/;
const NOT_WHOLE_EGG = /(?:clara|codorna|massa|omelete|mexido|salada|pao|bolo)/;

/** Categoria proteica por nome OU proteína ≥40% das kcal cadastradas. */
export const isProteinSource = (name: string, macros: EngineMacros): boolean => {
  const normalized = normalizeFoodName(name);
  if (PROTEIN_NAME.test(normalized)) return true;
  return macros.kcal > 0 && (macros.p * 4) / macros.kcal >= 0.4;
};

export interface FoodUnitWeight {
  food_id: string;
  tamanho: string;
  gramas: number;
}

/** Peso médio por unidade; ovo=50 g e clara=33 g só quando não há cadastro. */
export const unitGramsForFood = (food: FoodRecord, rows: FoodUnitWeight[] = []): number | null => {
  const own = rows.filter((r) => r.food_id === food.id && Number(r.gramas) > 0);
  if (own.length > 0) {
    const preferred = own.filter((r) => /^(?:medio|media|unidade|unidade media)$/.test(normalizeFoodName(r.tamanho)));
    const use = preferred.length > 0 ? preferred : own;
    return use.reduce((sum, r) => sum + Number(r.gramas), 0) / use.length;
  }
  const name = normalizeFoodName(food.name);
  if (/\bclaras?\b/.test(name)) return 33;
  if (/\bovos?\b/.test(name) && !NOT_WHOLE_EGG.test(name)) return 50;
  return null;
};

const unitName = (food: FoodRecord, count: number): string => {
  const name = normalizeFoodName(food.name);
  if (/\bclaras?\b/.test(name)) return count === 1 ? 'clara' : 'claras';
  if (/\bovos?\b/.test(name)) return count === 1 ? 'ovo' : 'ovos';
  return count === 1 ? 'unidade' : 'unidades';
};

const cleanNumber = (n: number): string => {
  const r = Math.round(n * 10) / 10;
  return String(Number.isInteger(r) ? r : r.toFixed(1)).replace('.', ',');
};

/** Ex.: "2 ovos (100 g)" / "5 claras (165 g)"; sem unidade, só as gramas. */
export const formatSubstitutionQuantity = (
  food: FoodRecord,
  qtyGrams: number,
  unitWeights: FoodUnitWeight[] = [],
): string => {
  const unit = unitGramsForFood(food, unitWeights);
  const grams = Math.round(qtyGrams * 10) / 10;
  if (!unit) return `${cleanNumber(grams)} g`;
  const count = Math.max(1, Math.round(grams / unit));
  return `${count} ${unitName(food, count)} (${cleanNumber(count * unit)} g)`;
};

const portionInUnits = (
  food: FoodRecord,
  desiredGrams: number,
  unitWeights: FoodUnitWeight[],
  maxGrams?: number,
): number | null => {
  const unit = unitGramsForFood(food, unitWeights);
  if (!unit) return null;
  let count = Math.max(1, Math.round(desiredGrams / unit));
  if (maxGrams != null) count = Math.max(1, Math.floor(maxGrams / unit));
  return count * unit;
};

/** Porção para bater P; se necessário, corta no teto de kcal original +10%. */
export const bestProteinPortion = (
  food: FoodRecord,
  target: EngineMacros,
  index: FoodIndex,
  unitWeights: FoodUnitWeight[] = [],
): SubstitutionCandidate | null => {
  const portion = Number(food.portion_size) > 0 ? Number(food.portion_size) : 100;
  const proteinPerGram = Number(food.protein) > 0 ? Number(food.protein) / portion : 0;
  const kcalPerGram = Number(food.calories) > 0 ? Number(food.calories) / portion : 0;
  if (!food?.id || proteinPerGram <= 0 || kcalPerGram <= 0 || target.p <= 0) return null;

  const desired = target.p / proteinPerGram;
  const cap = (target.kcal * (1 + PROTEIN_KCAL_TOLERANCE)) / kcalPerGram;
  const limited = desired > cap + 1e-8;
  const base = Math.min(desired, cap);
  const unit = unitGramsForFood(food, unitWeights);
  const quantities = new Set<number>();

  if (unit) {
    const maxCount = Math.floor(cap / unit);
    const desiredCount = Math.max(1, Math.round(desired / unit));
    for (let count = Math.max(1, desiredCount - 3); count <= Math.min(maxCount, desiredCount + 3); count += 1) {
      quantities.add(count * unit);
    }
  } else {
    const step = base <= 20 ? 1 : base <= 100 ? 5 : 10;
    for (let q = Math.max(step, base * 0.7); q <= Math.min(cap, base * 1.3) + 1e-8; q += step) {
      quantities.add(quantizeGrams(q));
    }
    let capped = quantizeGrams(base);
    while (capped > step && capped > cap + 1e-8) capped -= step;
    quantities.add(capped);
  }

  let result: SubstitutionCandidate | null = null;
  quantities.forEach((qty) => {
    if (!(qty > 0) || qty > cap + 1e-8) return;
    const next = candidateAt(food, qty, target, index, true);
    const preferred = !result ||
      (next.level === 'equivalent' && result.level !== 'equivalent') ||
      (next.level === result.level && (next.score < result.score || (next.score === result.score && qty < result.qtyGrams)));
    if (preferred) result = next;
  });
  if (!result) return null;
  const chosen = result as SubstitutionCandidate;
  chosen.proteinLimitedByCalories = limited && chosen.macros.p < target.p - 0.05;
  chosen.proteinShortfall = Math.max(0, target.p - chosen.macros.p);
  return chosen;
};

export interface SmartSubstitutionCandidate {
  food: FoodRecord;
  /** Padrão quando o original é proteico; null para alimento sem proteína. */
  sameProtein: SubstitutionCandidate | null;
  sameCalories: SubstitutionCandidate;
}

/** Duas opções por candidato; ranking proteico usa |ΔP|×3 + |Δkcal| + |ΔG|. */
export const buildSmartSubstitutionCandidates = (
  foods: FoodRecord[],
  target: EngineMacros,
  originalName: string,
  index?: FoodIndex,
  unitWeights: FoodUnitWeight[] = [],
  limit = 60,
): { proteinSource: boolean; candidates: SmartSubstitutionCandidate[] } => {
  const idx = index ?? buildFoodIndex(foods ?? []);
  const proteinSource = isProteinSource(originalName, target);
  if (!proteinSource) {
    return {
      proteinSource,
      candidates: buildSubstitutionCandidates(foods, target, idx, limit).map((sameCalories) => ({
        food: sameCalories.food,
        sameProtein: null,
        sameCalories,
      })),
    };
  }
  const candidates = (foods ?? []).flatMap((food) => {
    const portion = Number(food.portion_size) > 0 ? Number(food.portion_size) : 100;
    const kcalPerGram = Number(food.calories) > 0 ? Number(food.calories) / portion : 0;
    const calorieBase = bestEquivalentPortion(food, target, idx);
    if (!calorieBase) return [];
    // Nesta aba a regra é literalmente "Mesmas calorias" (como no aluno),
    // sem deixar outro macro afastar a porção do equivalente calórico.
    const desiredCalorieQty = kcalPerGram > 0 && target.kcal > 0 ? target.kcal / kcalPerGram : calorieBase.qtyGrams;
    const unitQty = portionInUnits(food, desiredCalorieQty, unitWeights);
    const calorieQty = unitQty ?? quantizeGrams(desiredCalorieQty);
    const calculated = candidateAt(food, calorieQty, target, idx, true);
    return [{
      food,
      sameProtein: bestProteinPortion(food, target, idx, unitWeights),
      sameCalories: calculated,
    }];
  });
  candidates.sort((a, b) => {
    const aOption = a.sameProtein ?? a.sameCalories;
    const bOption = b.sameProtein ?? b.sameCalories;
    const aScore = a.sameProtein?.score ?? a.sameCalories.score + 1_000_000;
    const bScore = b.sameProtein?.score ?? b.sameCalories.score + 1_000_000;
    return Number(bOption.level === 'equivalent') - Number(aOption.level === 'equivalent') ||
      aScore - bScore || a.food.name.localeCompare(b.food.name, 'pt-BR');
  });
  return { proteinSource, candidates: candidates.slice(0, limit) };
};

export interface BestSubstitutionChoice extends RankedFoodChoice {
  /** Porção pela regra existente: mesma proteína para original proteico; senão kcal. */
  option: SubstitutionCandidate;
}

/** Até 3 escolhas da mesma família; a lista por equivalência não é alterada. */
export const buildBestSubstitutionChoices = (input: {
  foods: FoodRecord[];
  currentName: string;
  currentQtyGrams: number;
  currentMacros: EngineMacros;
  index?: FoodIndex;
  unitWeights?: FoodUnitWeight[];
  preference: FoodPreferenceContext;
  limit?: number;
}): BestSubstitutionChoice[] => {
  const idx = input.index ?? buildFoodIndex(input.foods ?? []);
  const matches = idx.byName.get(normalizeFoodName(input.currentName)) ?? [];
  const portion = Number(input.currentQtyGrams) > 0 ? Number(input.currentQtyGrams) : 100;
  const original: FoodRecord = matches[0] ?? {
    id: 'current-food',
    name: input.currentName,
    portion_size: portion,
    calories: input.currentMacros.kcal,
    protein: input.currentMacros.p,
    carbs: input.currentMacros.c,
    fats: input.currentMacros.g,
  };
  const ranked = rankFoodsForGoal(input.foods, original, input.preference, input.limit ?? 3);
  return ranked.flatMap((choice) => {
    if (!choice.reasons.length) return [];
    const candidate = buildSmartSubstitutionCandidates(
      [choice.food], input.currentMacros, input.currentName, idx, input.unitWeights ?? [], 1,
    ).candidates[0];
    const option = candidate?.sameProtein ?? candidate?.sameCalories;
    return option ? [{ ...choice, option }] : [];
  });
};

/** Dica só quando a diferença no prato é relevante; números vêm da porção calculada. */
export const bestSubstitutionTip = (choice: BestSubstitutionChoice | undefined): string | null => {
  if (!choice) return null;
  const diff = choice.option.diff;
  const benefits: string[] = [];
  if (diff.p >= 2) benefits.push(`+${cleanNumber(diff.p)} g de proteína`);
  if (diff.c <= -5) benefits.push(`−${cleanNumber(Math.abs(diff.c))} g de carbo`);
  if (diff.kcal <= -20) benefits.push(`−${Math.round(Math.abs(diff.kcal))} kcal`);
  if (choice.reasons.includes('Mais carbo p/ treino') && diff.c >= 5) benefits.push(`+${cleanNumber(diff.c)} g de carbo p/ treino`);
  if (!benefits.length) return null;
  return `Para o seu objetivo, a ${choice.food.name} dá ${benefits.slice(0, 2).join(' e ')} nesse prato.`;
};

/* -------------------------------------------------------------------------- */
/* Combinações proteicas                                                      */
/* -------------------------------------------------------------------------- */

export interface SubstitutionCombinationItem {
  food: FoodRecord;
  qtyGrams: number;
  macros: EngineMacros;
}

export interface SubstitutionCombination {
  id: string;
  name: string;
  items: SubstitutionCombinationItem[];
  macros: EngineMacros;
  diff: EngineMacros;
  score: number;
  level: EquivalenceLevel;
}

const findNamedFood = (
  foods: FoodRecord[],
  match: (normalizedName: string, food: FoodRecord) => boolean,
  preferred: string[] = [],
): FoodRecord | null => {
  const hits = foods.filter((f) => match(normalizeFoodName(f.name), f));
  hits.sort((a, b) => {
    const an = normalizeFoodName(a.name);
    const bn = normalizeFoodName(b.name);
    const ap = preferred.indexOf(an);
    const bp = preferred.indexOf(bn);
    return (ap < 0 ? 999 : ap) - (bp < 0 ? 999 : bp) || an.length - bn.length || an.localeCompare(bn, 'pt-BR');
  });
  return hits[0] ?? null;
};

const wholeEgg = (foods: FoodRecord[]) => findNamedFood(
  foods,
  (n) => /\bovos?\b/.test(n) && !NOT_WHOLE_EGG.test(n),
  ['ovo inteiro cozido', 'ovo cozido', 'ovo', 'ovo inteiro'],
);
const eggWhite = (foods: FoodRecord[]) => findNamedFood(foods, (n) => /\bclaras?\b/.test(n), ['clara de ovo', 'claras de ovo']);
const whey = (foods: FoodRecord[]) => findNamedFood(foods, (n) => /\bwhey\b/.test(n), ['whey protein isolado', 'whey protein concentrado']);
const tuna = (foods: FoodRecord[]) => findNamedFood(foods, (n) => /\batum\b/.test(n), ['atum em agua', 'atum ao natural', 'atum fresco grelhado']);
const chicken = (foods: FoodRecord[]) => findNamedFood(foods, (n) => /\bfrango\b/.test(n), ['peito de frango grelhado', 'file de frango grelhado', 'frango desfiado']);
const proteinYogurt = (foods: FoodRecord[]) => findNamedFood(
  foods,
  (n, f) => /\biogurte\b/.test(n) && (/proteico|skyr/.test(n) || Number(f.protein) >= 8),
  ['iogurte proteico natural', 'iogurte skyr natural', 'iogurte grego natural 0%'],
);
const tofu = (foods: FoodRecord[]) => findNamedFood(foods, (n) => /\btofu\b/.test(n), ['tofu']);
const pts = (foods: FoodRecord[]) => findNamedFood(foods, (n) => /\bpts\b|proteina de soja|proteina texturizada/.test(n), ['proteina de soja texturizada', 'pts', 'proteina de soja isolada']);

const unique = (values: number[]): number[] => [...new Set(values.filter((v) => Number.isFinite(v) && v > 0).map((v) => Math.round(v * 10) / 10))];
const perGram = (food: FoodRecord, field: 'protein' | 'calories'): number =>
  Math.max(0, Number(food[field]) || 0) / (Number(food.portion_size) > 0 ? Number(food.portion_size) : 100);

/**
 * Combinações prontas, calculadas item a item no motor. Não há teto rígido:
 * se bater a proteína passar de +10% kcal, o aviso continua visível e a escolha
 * segue permitida. Retorna no máximo as 3 mais próximas.
 */
export const buildProteinCombinations = (
  foods: FoodRecord[],
  target: EngineMacros,
  index?: FoodIndex,
  unitWeights: FoodUnitWeight[] = [],
  limit = 3,
  originalName?: string,
): SubstitutionCombination[] => {
  const idx = index ?? buildFoodIndex(foods ?? []);
  const egg = wholeEgg(foods);
  const white = eggWhite(foods);
  const wheyFood = whey(foods);
  const recipes: Array<[FoodRecord, FoodRecord] | null> = [
    egg && white ? [egg, white] : null,
    egg && wheyFood ? [egg, wheyFood] : null,
    tuna(foods) && egg ? [tuna(foods)!, egg] : null,
    chicken(foods) && egg ? [chicken(foods)!, egg] : null,
    proteinYogurt(foods) && wheyFood ? [proteinYogurt(foods)!, wheyFood] : null,
    tofu(foods) && pts(foods) ? [tofu(foods)!, pts(foods)!] : null,
  ];
  const bestByRecipe: SubstitutionCombination[] = [];

  for (const recipe of recipes) {
    if (!recipe) continue;
    const [first, second] = recipe;
    const firstUnit = unitGramsForFood(first, unitWeights);
    const firstAmounts = firstUnit
      ? [1, 2, 3].map((count) => count * firstUnit)
      : unique(Array.from({ length: 19 }, (_, i) => 20 + i * 10));
    const secondUnit = unitGramsForFood(second, unitWeights);
    let bestForRecipe: SubstitutionCombination | null = null;

    for (const firstGrams of firstAmounts) {
      const firstMacros = macrosForFoodQty(first.id, firstGrams, idx);
      const remainingP = target.p - firstMacros.p;
      let secondAmounts: number[];
      if (secondUnit) {
        const perUnitP = perGram(second, 'protein') * secondUnit;
        const ideal = remainingP / Math.max(perUnitP, 0.01);
        secondAmounts = unique([Math.floor(ideal), Math.round(ideal), Math.ceil(ideal), Math.round(ideal) - 1, Math.round(ideal) + 1]
          .filter((n) => n >= 1 && n <= 20).map((n) => n * secondUnit));
      } else {
        const ideal = remainingP / Math.max(perGram(second, 'protein'), 0.01);
        const base = quantizeGrams(ideal);
        const step = base <= 20 ? 1 : base <= 100 ? 5 : 10;
        secondAmounts = unique([base - step, base, base + step]);
      }
      for (const secondGrams of secondAmounts) {
        const secondMacros = macrosForFoodQty(second.id, secondGrams, idx);
        const macros = addMacros(firstMacros, secondMacros);
        const score = proteinSubstitutionScore(macros, target);
        const items = [
          { food: first, qtyGrams: firstGrams, macros: firstMacros },
          { food: second, qtyGrams: secondGrams, macros: secondMacros },
        ];
        const combo: SubstitutionCombination = {
          id: items.map((it) => `${it.food.id}:${it.qtyGrams}`).join('|'),
          name: `${first.name} + ${second.name}`,
          items,
          macros,
          diff: subMacros(macros, target),
          score,
          level: isProteinEquivalent(macros, target) ? 'equivalent' : 'different',
        };
        if (!bestForRecipe || combo.score < bestForRecipe.score) bestForRecipe = combo;
      }
    }
    // Uma melhor porção por receita: várias quantidades da mesma combinação
    // não podem ocupar as três vagas e esconder ovo + claras.
    if (bestForRecipe && (!originalName || !bestForRecipe.items.some((item) => normalizeFoodName(item.food.name) === normalizeFoodName(originalName)))) {
      bestByRecipe.push(bestForRecipe);
    }
  }

  const seen = new Set<string>();
  return bestByRecipe
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'))
    .filter((combo) => {
      if (seen.has(combo.id)) return false;
      seen.add(combo.id);
      return true;
    })
    .slice(0, Math.max(0, limit));
};

/** Avisos não bloqueiam a escolha; a opção "Mesma proteína" fica destacada. */
export const substitutionWarnings = (candidate: EngineMacros, target: EngineMacros): string[] => {
  const diff = subMacros(candidate, target);
  const warnings: string[] = [];
  if (diff.p < -PROTEIN_WARNING_GRAMS) {
    warnings.push(`Essa troca tira ${cleanNumber(Math.abs(diff.p))} g de proteína da refeição.`);
  }
  if (target.kcal > 0 && diff.kcal > target.kcal * PROTEIN_KCAL_TOLERANCE + 1e-8) {
    warnings.push(`Essa troca aumenta as calorias em ${Math.round((diff.kcal / target.kcal) * 100)}%.`);
  }
  return warnings;
};
