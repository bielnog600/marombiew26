/**
 * Extração determinística dos alimentos citados numa "dieta modelo" colada pelo
 * treinador. Serve APENAS para autorizar, ANTES da geração, alimentos que não
 * possuem correspondência única na base (source = "model_diet").
 *
 * Nunca autoriza alimentos sugeridos espontaneamente pela IA.
 */
import { normalizeFoodName } from './nutritionEngine';

export interface AllowedUnresolvedFood {
  name: string;
  source: 'model_diet' | 'trainer_required';
}

const QTY_PREFIX = /^\s*(?:[-*•>]|\d+[\).])\s*/;
const QTY_TOKEN =
  /\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|un|und|unid|unidade|unidades|colher(?:es)?|fatia[s]?|xícara[s]?|scoop[s]?|ovo[s]?)\b/gi;
const MEAL_HEADER = /^(refei[çc][ãa]o|caf[ée]|almo[çc]o|jantar|lanche|ceia|pr[ée]|p[óo]s|total|macros?|obs)/i;

/** Nomes de alimentos citados no texto, na ordem, sem duplicar. */
export function extractModelDietFoodNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of String(text ?? '').split('\n')) {
    let line = rawLine.replace(QTY_PREFIX, '').trim();
    if (!line || MEAL_HEADER.test(line)) continue;
    // "120g de frango" / "Frango — 120 g" → fica só o nome
    line = line.split(/[—–|:]/)[0];
    line = line.replace(QTY_TOKEN, ' ');
    line = line.replace(/\b\d+(?:[.,]\d+)?\b/g, ' ');
    line = line.replace(/\(.*?\)/g, ' ');
    line = line.replace(/^\s*(?:de|da|do)\s+/i, '');
    const name = line.replace(/\s{2,}/g, ' ').replace(/[.,;]+$/, '').trim();
    if (name.length < 3) continue;
    const key = normalizeFoodName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Dos nomes citados, apenas os que NÃO possuem correspondência única na base
 * viram autorização de `foodId: null`.
 */
export function buildAllowedUnresolvedFromModelDiet(
  modelDietText: string,
  foods: Array<{ name: string }>,
): AllowedUnresolvedFood[] {
  const byName = new Map<string, number>();
  for (const f of foods ?? []) {
    const key = normalizeFoodName(f?.name ?? '');
    if (!key) continue;
    byName.set(key, (byName.get(key) ?? 0) + 1);
  }
  return extractModelDietFoodNames(modelDietText)
    .filter((name) => (byName.get(normalizeFoodName(name)) ?? 0) !== 1)
    .map((name) => ({ name, source: 'model_diet' as const }));
}
