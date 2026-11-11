/**
 * Camada só de exibição para planos traduzidos. A lógica (refeições, macros,
 * pesagem, treino gravado) usa sempre o markdown original em português; o
 * servidor devolve pares [original, tradução] dos textos mostrados e aqui só
 * trocamos o texto exibido. Texto sem par continua em português.
 */

export type PlanTextPair = [string, string];
export type PlanTextDictionary = ReadonlyMap<string, string>;

const cleanText = (value: string) => value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const keyOf = (value: string) => cleanText(value).toLowerCase();

export const dictionaryFromPairs = (pairs: readonly PlanTextPair[] | null | undefined): PlanTextDictionary | null => {
  if (!pairs?.length) return null;
  const dict = new Map<string, string>();
  for (const [from, to] of pairs) {
    const source = cleanText(from ?? '');
    const target = cleanText(to ?? '');
    if (!source || !target || source === target) continue;
    const k = keyOf(source);
    if (!dict.has(k)) dict.set(k, target);
  }
  return dict.size > 0 ? dict : null;
};

/** Texto para exibir: tradução do servidor, ou o próprio texto original. */
export const translateDisplayText = (dict: PlanTextDictionary | null | undefined, text: string): string => {
  if (!dict || !text) return text;
  const found = dict.get(keyOf(text));
  if (!found) return text;
  const isUpper = text === text.toUpperCase() && text !== text.toLowerCase();
  return isUpper ? found.toUpperCase() : found;
};
