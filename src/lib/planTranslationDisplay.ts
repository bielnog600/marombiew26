/**
 * Camada só de exibição para planos traduzidos. A lógica (refeições, macros,
 * pesagem, treino gravado) usa sempre o markdown original em português; aqui
 * apenas pareamos célula a célula as tabelas do original e da tradução para
 * trocar o texto mostrado. Se a tradução mudou a estrutura (linhas/colunas
 * diferentes), não usamos nada dela e o aluno vê o original.
 */

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;

const tableRows = (markdown: string): string[][] =>
  markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !SEPARATOR_ROW.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

const cleanCell = (value: string) => value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const keyOf = (value: string) => cleanCell(value).toLowerCase();
/** Células só com números/unidades não precisam de tradução. */
const NUMERIC_ONLY = /^[\d\s.,/x×%:+\-–—()~≈]*(g|kg|ml|l|kcal|min|s|h)?[\d\s.,/x×%:+\-–—()]*$/i;

export type PlanTextDictionary = ReadonlyMap<string, string>;

export const buildPlanTextDictionary = (
  original: string,
  translated: string | null | undefined,
): PlanTextDictionary | null => {
  if (!original?.trim() || !translated?.trim() || translated === original) return null;
  const a = tableRows(original);
  const b = tableRows(translated);
  if (a.length === 0 || a.length !== b.length) return null;
  const dict = new Map<string, string>();
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return null;
    for (let j = 0; j < a[i].length; j++) {
      const from = cleanCell(a[i][j]);
      const to = cleanCell(b[i][j]);
      if (!from || !to || from === to || NUMERIC_ONLY.test(from)) continue;
      const k = keyOf(from);
      if (!dict.has(k)) dict.set(k, to);
    }
  }
  return dict.size > 0 ? dict : null;
};

/** Texto para exibir: tradução pareada, ou o próprio texto original. */
export const translateDisplayText = (dict: PlanTextDictionary | null | undefined, text: string): string => {
  if (!dict || !text) return text;
  const found = dict.get(keyOf(text));
  if (!found) return text;
  const isUpper = text === text.toUpperCase() && text !== text.toLowerCase();
  return isUpper ? found.toUpperCase() : found;
};
