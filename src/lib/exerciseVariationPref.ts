const norm = (v: string | undefined) => (v || '').toUpperCase().trim();

/**
 * Chave da preferência de variação: exercício + variação. Uma escolha só vale
 * para aquele mesmo par; se o plano trocar a variação (ou a preferência for de
 * outro exercício), o topo volta a mostrar o exercício original.
 */
export const variationPrefKey = (ex: { exercise?: string; variation?: string } | undefined) =>
  ex ? `${norm(ex.exercise)}=>${norm(ex.variation)}` : '';

/** Preferência salva no backend vale só se foi gravada para a mesma variação. */
export const backendVariationPref = (
  stored: Record<string, unknown> | null | undefined,
  variation: string | undefined,
): boolean | undefined => {
  if (!stored || !norm(variation)) return undefined;
  if (stored.__preferred_variation_name !== norm(variation)) return undefined;
  return typeof stored.__preferred_variation === 'boolean' ? stored.__preferred_variation : undefined;
};
