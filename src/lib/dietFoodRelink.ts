/**
 * HOTFIX — religar alimentos não validados à base SEM regerar a dieta.
 *
 * Regras:
 * - só toca itens com `foodId == null` ou `resolutionStatus === 'unresolved'`;
 * - correspondência EXATA normalizada (normalizeFoodName do contrato nutricional);
 * - 0 ou 2+ correspondências → permanece unresolved (nunca adivinhar);
 * - nenhum fuzzy matching / similaridade;
 * - qtyGrams preservado; macros recalculados pelo nutritionCore (strict_id).
 */
import { normalizeFoodName, type FoodRecord } from './nutritionEngine';
import { recomputeDayFromFoods } from './dietFoodResolution';

export interface RelinkResult<T = any> {
  plan: T;
  /** Quantos itens passaram a ter foodId real. */
  resolvedCount: number;
  changed: boolean;
}

const isCandidate = (item: any): boolean =>
  !!item && (item.foodId == null || item.resolutionStatus === 'unresolved');

const applyFoodToItem = (item: any, food: FoodRecord) => {
  item.foodId = food.id;
  item.name = food.name;
  item.resolutionStatus = 'resolved_by_id';
  if ('nutritionSnapshot' in item) delete item.nutritionSnapshot;
};

/**
 * Religa automaticamente apenas os itens com correspondência exata ÚNICA na base.
 * Se nada muda, devolve o plano original (mesma referência) — evita loop no React.
 */
export function relinkResolvableUnresolvedFoods<T extends { days?: any[] }>(
  plan: T,
  foods: FoodRecord[],
): RelinkResult<T> {
  if (!plan || !Array.isArray((plan as any).days) || !(foods?.length)) {
    return { plan, resolvedCount: 0, changed: false };
  }
  // Detecção sem mutar.
  let pending = 0;
  for (const day of (plan as any).days ?? []) {
    for (const meal of day?.meals ?? []) {
      for (const item of meal?.items ?? []) {
        if (!isCandidate(item)) continue;
        const matches = findFoodCandidates(String(item?.name ?? ''), foods);
        if (matches.length === 1) pending += 1;
      }
    }
  }
  if (pending === 0) return { plan, resolvedCount: 0, changed: false };

  const next: any = JSON.parse(JSON.stringify(plan));
  let resolvedCount = 0;
  for (const day of next.days ?? []) {
    let dayChanged = false;
    for (const meal of day?.meals ?? []) {
      for (const item of meal?.items ?? []) {
        if (!isCandidate(item)) continue;
        const matches = findFoodCandidates(String(item?.name ?? ''), foods);
        if (matches.length !== 1) continue;
        applyFoodToItem(item, matches[0]);
        resolvedCount += 1;
        dayChanged = true;
      }
    }
    if (dayChanged) recomputeDayFromFoods(day, foods);
  }

  return { plan: next as T, resolvedCount, changed: resolvedCount > 0 };
}

/**
 * Vincula, por nome normalizado, todos os itens unresolved a um alimento
 * específico da base (usado logo após "Adicionar à base" / reuso de ID).
 */
export function linkPlanItemsToFood<T extends { days?: any[] }>(
  plan: T,
  candidateName: string,
  food: FoodRecord,
  foods: FoodRecord[],
): RelinkResult<T> {
  const target = normalizeFoodName(String(candidateName ?? ''));
  if (!plan || !target || !food?.id) return { plan, resolvedCount: 0, changed: false };

  const catalog = foods?.some((f) => f.id === food.id) ? foods : [...(foods ?? []), food];

  let pending = 0;
  for (const day of (plan as any).days ?? []) {
    for (const meal of day?.meals ?? []) {
      for (const item of meal?.items ?? []) {
        if (!isCandidate(item)) continue;
        if (normalizeFoodName(String(item?.name ?? '')) === target) pending += 1;
      }
    }
  }
  if (pending === 0) return { plan, resolvedCount: 0, changed: false };

  const next: any = JSON.parse(JSON.stringify(plan));
  let resolvedCount = 0;
  for (const day of next.days ?? []) {
    let dayChanged = false;
    for (const meal of day?.meals ?? []) {
      for (const item of meal?.items ?? []) {
        if (!isCandidate(item)) continue;
        if (normalizeFoodName(String(item?.name ?? '')) !== target) continue;
        applyFoodToItem(item, food);
        resolvedCount += 1;
        dayChanged = true;
      }
    }
    if (dayChanged) recomputeDayFromFoods(day, catalog);
  }

  return { plan: next as T, resolvedCount, changed: resolvedCount > 0 };
}

/**
 * Segunda normalização — remove APENAS qualificadores de preparo.
 * "Batata-doce cozida" → "batata-doce"; "Peito de frango grelhado" → "peito de frango".
 * Nunca é fuzzy: o resultado ainda precisa bater exatamente com a base.
 */
const PREPARATION_TERMS = [
  'cozido', 'cozida', 'cozidos', 'cozidas',
  'grelhado', 'grelhada', 'grelhados', 'grelhadas',
  'assado', 'assada', 'assados', 'assadas',
  'cru', 'crua', 'crus', 'cruas',
];

export function normalizeFoodForPreparationMatch(name: string): string {
  const base = normalizeFoodName(String(name ?? ''));
  if (!base) return '';
  const tokens = base.split(/\s+/).filter((t) => !PREPARATION_TERMS.includes(t));
  return tokens.join(' ').trim();
}

/**
 * Candidatos para um nome unresolved: primeiro match exato; se não houver
 * exatamente 1, tenta o match por preparo. Sempre exige unicidade.
 */
export function findFoodCandidates(name: string, foods: FoodRecord[]): FoodRecord[] {
  const list = foods ?? [];
  const exactKey = normalizeFoodName(String(name ?? ''));
  const exact = list.filter((f) => normalizeFoodName(f?.name ?? '') === exactKey);
  if (exact.length === 1) return exact;
  if (exact.length > 1) return exact;
  const prepKey = normalizeFoodForPreparationMatch(name);
  if (!prepKey || prepKey === exactKey) return exact;
  return list.filter((f) => normalizeFoodForPreparationMatch(f?.name ?? '') === prepKey);
}

/** Matches exatos normalizados na base (guard anti-duplicata). */
export function findExactFoodMatches(
  name: string,
  foods: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  const key = normalizeFoodName(String(name ?? ''));
  if (!key) return [];
  return (foods ?? []).filter((f) => normalizeFoodName(f?.name ?? '') === key);
}
