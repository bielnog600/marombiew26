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

/** Só linhas com forma de alimento: bullet, linha de tabela ou "alimento: quantidade". */
const BULLET_LINE = /^\s*(?:[-*•]|\d+[\).])\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const NAME_QTY_LINE = /^[^:|]{3,60}:\s*\S+/;
const NARRATIVE = /^(observa|nota|aten[çc]|dica|coment|importante|resumo|estimativa)/i;
/** "Iogurte skyr natural — 170 g" (travessão, en dash ou hífen), mesmo sem bullet. */
const DASH_QTY_LINE = /^[^|]{3,80}\s[—–-]\s*\d+(?:[.,]\d+)?\s*\S/;
/** Linhas de substituição da dieta modelo: nunca são alimentos principais. */
const SUBSTITUTION_LINE = /^\s*(?:→|->|=>)/;
/** Rótulos de relatório que nunca são alimentos. */
const REPORT_LABEL = /^(macros?|meta|gerado|diferen[çc]a|status|observa[çc][õo]es|substitui[çc][õo]es)\b/i;
/** Linha separadora de tabela: |---|---| */
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
/** Cabeçalho de tabela: sem números e com rótulos genéricos. */
const TABLE_HEADER_CELL = /^(alimento|quantidade|qtd|medida|porç[ãa]o|kcal|calorias|prote[íi]na|carbo\w*|gordura|macros?|refei[çc][ãa]o|hor[áa]rio|substitui\w*)$/i;

const isTableHeaderRow = (line: string): boolean => {
  const cells = line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
  if (cells.length === 0) return true;
  return cells.every((c) => TABLE_HEADER_CELL.test(c));
};

/** Alimento plausível: nome com letras + quantidade numérica na linha. */
const hasPlausibleQuantity = (line: string): boolean => {
  QTY_TOKEN.lastIndex = 0;
  if (QTY_TOKEN.test(line)) return true;
  return /[:\-—–]\s*\d/.test(line) || /\b\d+(?:[.,]\d+)?\s*\S/.test(line);
};

const looksLikeFoodLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (NARRATIVE.test(trimmed)) return false;
  if (trimmed.startsWith('#')) return false;
  if (TABLE_ROW.test(trimmed)) {
    if (TABLE_SEPARATOR.test(trimmed)) return false;
    if (isTableHeaderRow(trimmed)) return false;
    return /\d/.test(trimmed) && /[A-Za-zÀ-ÿ]{3,}/.test(trimmed);
  }
  if (BULLET_LINE.test(trimmed)) {
    const body = trimmed.replace(BULLET_LINE, '').trim();
    if (!body || NARRATIVE.test(body)) return false;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(body)) return false;
    return hasPlausibleQuantity(body);
  }
  return NAME_QTY_LINE.test(trimmed) && /\d/.test(trimmed);
};

/** Nomes de alimentos citados no texto, na ordem, sem duplicar. */
export function extractModelDietFoodNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of String(text ?? '').split('\n')) {
    if (!looksLikeFoodLine(rawLine)) continue;
    let line = rawLine.replace(/^\s*\|/, '').replace(QTY_PREFIX, '').trim();
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
