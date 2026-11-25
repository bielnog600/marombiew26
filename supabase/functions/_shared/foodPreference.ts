/**
 * Preferência alimentar determinística, compartilhada pelo app e pelo gerador.
 * Não chama IA e não altera porções/metas: apenas ordena alimentos da MESMA
 * família conforme objetivo e contexto da refeição.
 */
import { normalizeFoodName, type FoodRecord } from './nutritionCore.ts';

export const FOOD_CATEGORIES = [
  { value: 'massa', label: 'Massa' },
  { value: 'arroz', label: 'Arroz' },
  { value: 'tuberculo', label: 'Tubérculo' },
  { value: 'pao', label: 'Pão' },
  { value: 'tapioca', label: 'Tapioca' },
  { value: 'aveia', label: 'Aveia' },
  { value: 'carne_branca', label: 'Carne branca' },
  { value: 'carne_vermelha', label: 'Carne vermelha' },
  { value: 'peixe', label: 'Peixe' },
  { value: 'ovo', label: 'Ovo' },
  { value: 'laticinio', label: 'Laticínio' },
  { value: 'whey', label: 'Whey' },
  { value: 'proteina_vegetal', label: 'Proteína vegetal' },
  { value: 'leguminosa', label: 'Leguminosa' },
  { value: 'fruta', label: 'Fruta' },
  { value: 'gordura_boa', label: 'Gordura boa' },
  { value: 'outros', label: 'Outros' },
] as const;

export type DietPreferenceGoal = 'cutting' | 'bulking' | 'health';

export interface FoodPreferenceContext {
  objective?: unknown;
  dietPhase?: unknown;
  mealName?: unknown;
  mealTime?: unknown;
  workoutTime?: unknown;
  trainingContext?: unknown;
}

export interface RankedFoodChoice {
  food: FoodRecord;
  category: string;
  score: number;
  reasons: string[];
}

const text = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => normalizeFoodName(text(value));
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Inferência também serve de fallback para registros antigos/sem categoria. */
export function inferFoodCategory(name: unknown): string | null {
  const n = normalized(name);
  if (!n) return null;
  if (/(massa|macarr|espaguete|talharim|penne|fusilli|noodle|lasanha|nhoque)/.test(n)) return 'massa';
  if (/(tapioca|crepioca)/.test(n)) return 'tapioca';
  if (/(pao|torrada|bisnaguinha|croissant)/.test(n)) return 'pao';
  if (/(aveia|granola)/.test(n)) return 'aveia';
  if (/arroz/.test(n) && !/(proteina|bolacha|biscoito|papa)/.test(n)) return 'arroz';
  if (/(batata|mandioca|aipim|inhame|cara|mandioquinha|baroa)/.test(n)) return 'tuberculo';
  if (/(atum|salmao|tilapia|sardinha|bacalhau|peixe|merluza|pescada|robalo|linguado|camarao)/.test(n)) return 'peixe';
  if (/(frango|peru|chester|sobrecoxa)/.test(n)) return 'carne_branca';
  if (/(patinho|alcatra|picanha|maminha|acem|contra[ -]?file|carne moida|carne bovina|file mignon|coxao|musculo)/.test(n)) return 'carne_vermelha';
  if (/(ovo|clara)/.test(n)) return 'ovo';
  if (/(whey|caseina|albumina)/.test(n)) return 'whey';
  if (/(tofu|tempeh|seitan|\bpts\b|proteina de soja)/.test(n)) return 'proteina_vegetal';
  if (/(iogurte|queijo|leite|requeijao|cottage|ricota|skyr|kefir)/.test(n)) return 'laticinio';
  if (/(feijao|lentilha|grao de bico|ervilha)/.test(n)) return 'leguminosa';
  if (/(banana|maca|mamao|morango|uva|pera|abacaxi|melancia|melao|laranja|manga|kiwi|pessego|ameixa|fruta)/.test(n)) return 'fruta';
  if (/(azeite|castanha|nozes|amendoa|amendoim|abacate|chia|linhaca|noz|avela|pistache)/.test(n)) return 'gordura_boa';
  return null;
}

export const foodCategoryOf = (food: Pick<FoodRecord, 'name'> & { categoria?: string | null }): string | null =>
  text(food.categoria) || inferFoodCategory(food.name);

export const foodCategoryLabel = (category: string | null): string =>
  FOOD_CATEGORIES.find((item) => item.value === category)?.label ?? 'Outros';

const FAMILY_GROUPS: Record<string, string[]> = {
  massa: ['massa'],
  arroz: ['arroz', 'tuberculo'],
  tuberculo: ['arroz', 'tuberculo'],
  pao: ['pao', 'tapioca'],
  tapioca: ['pao', 'tapioca'],
  carne_branca: ['carne_branca', 'carne_vermelha', 'peixe', 'ovo'],
  carne_vermelha: ['carne_branca', 'carne_vermelha', 'peixe', 'ovo'],
  peixe: ['carne_branca', 'carne_vermelha', 'peixe', 'ovo'],
  ovo: ['carne_branca', 'carne_vermelha', 'peixe', 'ovo'],
};

export function sameFoodFamily(
  original: Pick<FoodRecord, 'name'> & { categoria?: string | null },
  candidate: Pick<FoodRecord, 'name'> & { categoria?: string | null },
): boolean {
  const a = foodCategoryOf(original);
  const b = foodCategoryOf(candidate);
  if (!a || !b || a === 'outros' || b === 'outros') return false;
  if (a === 'laticinio' && b === 'laticinio') {
    const dairy = (food: Pick<FoodRecord, 'name'>) => {
      const name = normalized(food.name);
      if (/(iogurte|skyr)/.test(name)) return 'iogurte';
      if (/queijo|cottage|ricota|requeijao/.test(name)) return 'queijo';
      if (/leite/.test(name)) return 'leite';
      return 'outro_laticinio';
    };
    return dairy(original) === dairy(candidate);
  }
  return (FAMILY_GROUPS[a] ?? [a]).includes(b);
}

export function resolveDietPreferenceGoal(objective?: unknown, dietPhase?: unknown): DietPreferenceGoal | null {
  const match = (value: unknown): DietPreferenceGoal | null => {
    const goal = normalized(value);
    if (/(cutting|emagrecimento|definicao|recomposicao|carbo controlado|pre contest)/.test(goal)) return 'cutting';
    if (/(hipertrofia|bulking|performance|ganho de massa)/.test(goal)) return 'bulking';
    if (/(saude|manutencao|qualidade de vida)/.test(goal)) return 'health';
    return null;
  };
  return match(dietPhase) ?? match(objective);
}

const minutesOf = (value: unknown): number | null => {
  const match = text(value).match(/(?:[01]?\d|2[0-3]):[0-5]\d/);
  if (!match) return null;
  const [h, m] = match[0].split(':').map(Number);
  return h * 60 + m;
};

export function isWorkoutAdjacentMeal(context: FoodPreferenceContext): boolean {
  if (/(?:^|\s)(pre|pos)[ -]?treino(?:\s|$)/.test(normalized(context.mealName))) return true;
  const meal = minutesOf(context.mealTime);
  const workout = minutesOf(context.workoutTime) ?? minutesOf(context.trainingContext);
  return meal !== null && workout !== null && Math.abs(meal - workout) <= 120;
}

interface Per100 { kcal: number; p: number; c: number; g: number }
const per100 = (food: FoodRecord): Per100 => {
  const base = num(food.portion_size) > 0 ? num(food.portion_size) : 100;
  const factor = 100 / base;
  return { kcal: num(food.calories) * factor, p: num(food.protein) * factor, c: num(food.carbs) * factor, g: num(food.fats) * factor };
};
const isWhole = (food: Pick<FoodRecord, 'name'>) => /(integral|centeio|multigraos|grao inteiro|biologico|organico)/.test(normalized(food.name));
const isRaw = (food: Pick<FoodRecord, 'name'>) => /(?:\s|\()(cru|crua)(?:\s|\)|$)/.test(normalized(food.name));
const isCooked = (food: Pick<FoodRecord, 'name'>) => /(cozid[ao]|assado|grelhad[ao])/.test(normalized(food.name));
const easyDigestion = (food: FoodRecord) => {
  const n = normalized(food.name);
  const category = foodCategoryOf(food);
  if (/(integral|high protein|proteina|centeio|multigraos)/.test(n)) return false;
  return category === 'massa' || category === 'tapioca' || category === 'pao' || (category === 'arroz' && /(branco|basmati|jasmine|agulhinha)/.test(n));
};

const compatiblePreparation = (original: FoodRecord | null, candidate: FoodRecord) => {
  if (!original) return !isRaw(candidate);
  if (isCooked(original)) return !isRaw(candidate);
  if (isRaw(original)) return !isCooked(candidate) || isRaw(candidate);
  return true;
};

function reasonsFor(food: FoodRecord, originalPer100: Per100 | null, originalWhole: boolean, goal: DietPreferenceGoal, workoutMeal: boolean): string[] {
  const current = per100(food);
  const reasons: string[] = [];
  if (goal === 'health' && isWhole(food) && (!originalPer100 || !originalWhole)) reasons.push('Mais fibra');
  if (goal === 'cutting') {
    if (!originalPer100 || current.p > originalPer100.p + 0.5) reasons.push('Mais proteína');
    if (!originalPer100 || current.c < originalPer100.c - 1) reasons.push('Menos carbo');
    if (originalPer100 && current.kcal < originalPer100.kcal - 5) reasons.push('Menos calorias');
  } else if (goal === 'bulking') {
    if (workoutMeal && easyDigestion(food)) reasons.push('Mais carbo p/ treino');
    else if (!originalPer100 || current.c > originalPer100.c + 1) reasons.push('Mais carbo');
    if (originalPer100 && current.kcal > originalPer100.kcal + 5) reasons.push('Mais calorias');
    if (originalPer100 && current.p > originalPer100.p + 0.5) reasons.push('Mais proteína');
  } else if (goal === 'health' && originalPer100 && current.kcal < originalPer100.kcal - 5) reasons.push('Menos calorias');
  return reasons.slice(0, 3);
}

/** Ordenação por 100 g; a porção final continua sendo calculada pela troca. */
export function rankFoodsForGoal(
  foods: FoodRecord[],
  original: FoodRecord | null,
  context: FoodPreferenceContext,
  limit = 3,
): RankedFoodChoice[] {
  const goal = resolveDietPreferenceGoal(context.objective, context.dietPhase);
  if (!goal || limit <= 0) return [];
  const genericFamily = original?.id.startsWith('family-') ?? false;
  const originalPer100 = original ? per100(original) : null;
  const originalName = original ? normalized(original.name) : '';
  const originalWhole = original ? isWhole(original) : false;
  const workoutMeal = isWorkoutAdjacentMeal(context);
  const list = (foods ?? []).filter((food) => {
    if (!food?.id) return false;
    if (original && (food.id === original.id || normalized(food.name) === originalName)) return false;
    if (original && !sameFoodFamily(original, food)) return false;
    return compatiblePreparation(genericFamily ? null : original, food);
  });

  return list.map((food): RankedFoodChoice => {
    const value = per100(food);
    const proteinDensity = value.kcal > 0 ? value.p / value.kcal * 100 : 0;
    let score = 0;
    if (goal === 'cutting') score = proteinDensity * 10 - value.c * 0.35 - value.kcal * 0.01;
    else if (goal === 'bulking') score = value.c * 2 + value.kcal * 0.15 + (workoutMeal && easyDigestion(food) ? 50 : 0);
    else score = (isWhole(food) ? 100 : 0) + proteinDensity * 2 - value.kcal * 0.005;
    if ((!original || genericFamily) && isRaw(food)) score -= 200;
    const reasons = reasonsFor(food, originalPer100, originalWhole, goal, workoutMeal);
    if (goal === 'health' && originalWhole && isWhole(food) && !reasons.includes('Mais fibra')) reasons.unshift('Mais fibra');
    return { food, category: foodCategoryOf(food) ?? 'outros', score, reasons: reasons.slice(0, 3) };
  }).sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'pt-BR')).slice(0, limit);
}

/** Guia compacto para gerador/variações: mesma regra, sem gerar ou chamar IA aqui. */
export function buildFoodPreferencePrompt(foods: FoodRecord[], context: FoodPreferenceContext): string {
  const goal = resolveDietPreferenceGoal(context.objective, context.dietPhase);
  if (!goal || !(foods ?? []).length) return '';
  const categories = Array.from(new Set(foods.map(foodCategoryOf).filter((category): category is string => !!category && category !== 'outros')));
  const lines: string[] = [];
  for (const category of categories) {
    const representative: FoodRecord = { id: `family-${category}`, name: foodCategoryLabel(category), categoria: category, calories: 0, protein: 0, carbs: 0, fats: 0 };
    const ranked = rankFoodsForGoal(foods, representative, { ...context, mealName: '', mealTime: '', workoutTime: '', trainingContext: '' }, 3);
    if (ranked.length) lines.push(`- ${foodCategoryLabel(category)}: ${ranked.map((item) => `${item.food.name} [${item.food.id}]`).join(' > ')}`);
  }
  if (!lines.length) return '';
  const rule = goal === 'cutting'
    ? 'Dentro de cada família, prefira mais proteína por kcal e menos carboidrato.'
    : goal === 'bulking'
      ? 'Dentro de cada família, prefira mais carboidrato e kcal; em pré/pós-treino, priorize digestão fácil (massa comum/de ovo, arroz branco).'
      : 'Dentro de cada família, prefira integrais, mais fibras e opções menos processadas.';
  return `\n=== PREFERÊNCIA POR OBJETIVO (REGRA DETERMINÍSTICA) ===\n${rule}\nNunca misture famílias (massa não vira frango). Respeite restrições e metas.\n${lines.join('\n')}\n`;
}
