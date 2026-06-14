// Token-based fuzzy matcher used by exercise/food pickers built on cmdk.
// Solves the case where typing "afundo dois steps" should match
// "Afundo com dois steps" — i.e. all typed tokens must appear in the
// target string, but not necessarily contiguously or in order.

const normalize = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Score in [0, 1]. 0 = no match (cmdk hides the item).
 * Use as the `filter` prop on a cmdk `<Command>`.
 */
export const tokenMatchScore = (value: string, search: string, keywords?: string[]): number => {
  const haystack = normalize([value, ...(keywords || [])].join(' '));
  const q = normalize(search).trim();
  if (!q) return 1;
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (!haystack.includes(t)) return 0;
  }
  // Contiguous full-query match ranks higher than scattered tokens.
  if (haystack.includes(q)) return 1;
  return 0.6;
};

/** Standalone boolean variant for places that filter manually (not via cmdk). */
export const tokenMatches = (value: string, search: string): boolean =>
  tokenMatchScore(value, search) > 0;