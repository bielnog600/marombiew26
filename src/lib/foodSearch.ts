/**
 * HOTFIX UX — busca de alimentos insensível a acentos.
 *
 * ATENÇÃO: isto é APENAS normalização para PESQUISA VISUAL.
 * A identidade do alimento continua sendo o `foodId` real da base; nada aqui
 * participa de resolução canônica, relink, publicação ou regras de unresolved.
 */

/** "Pão Integral" → "pao integral" */
export const normalizeFoodSearch = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

export interface SearchableFood {
  name?: string | null;
  brand?: string | null;
  source?: string | null;
}

/** 0 = não corresponde; maior = melhor (nome começa com > nome contém > marca/fonte). */
export const foodSearchRank = (food: SearchableFood, term: string): number => {
  const q = normalizeFoodSearch(term);
  if (!q) return 1;
  const name = normalizeFoodSearch(food?.name);
  if (name.startsWith(q)) return 3;
  if (name.includes(q)) return 2;
  const origin = normalizeFoodSearch([food?.brand, food?.source].filter(Boolean).join(' '));
  if (origin && origin.includes(q)) return 1;
  return 0;
};

export const foodMatchesSearch = (food: SearchableFood, term: string): boolean =>
  foodSearchRank(food, term) > 0;

/**
 * Filtra mantendo a ordem original entre itens de mesma relevância.
 * Sem termo, devolve a lista intacta.
 */
export const filterFoodsBySearch = <T extends SearchableFood>(foods: T[], term: string): T[] => {
  const q = normalizeFoodSearch(term);
  if (!q) return foods ?? [];
  return (foods ?? [])
    .map((food, idx) => ({ food, idx, rank: foodSearchRank(food, q) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => (b.rank - a.rank) || (a.idx - b.idx))
    .map((entry) => entry.food);
};
