/**
 * Pure helpers for translate-plan (no Deno/npm imports, so vitest can load them).
 * Only the strings the student app actually shows are sent to the AI:
 * - diet: table cells with letters (meal and food names), never prose/messages;
 * - training: first table cell of each row and headings (day labels).
 */

export type TranslationPair = [string, string];
export type PlanKind = 'dieta' | 'treino';

export const TRANSLATABLE_TIPOS: readonly string[] = ['dieta', 'treino'];
export const SUPPORTED_LANGUAGES: readonly string[] = ['en'];
export const TRANSLATION_CACHE_VERSION = 1;
export const MAX_TEXTS = 600;
export const MAX_TEXT_CHARS = 200;

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;
const NUMERIC_ONLY = /^[\d\s.,/x×%:+\-–—()~≈]*(g|kg|ml|l|kcal|min|s|h)?[\d\s.,/x×%:+\-–—()]*$/i;
const HAS_LETTER = /\p{L}/u;

const clean = (value: string) => value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

export const isTranslatableTipo = (tipo: unknown): tipo is PlanKind =>
  typeof tipo === 'string' && TRANSLATABLE_TIPOS.includes(tipo);

export function extractPlanTexts(tipo: string, markdown: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    const text = clean(raw ?? '');
    if (!text || text.length > MAX_TEXT_CHARS || !HAS_LETTER.test(text) || NUMERIC_ONLY.test(text)) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  for (const raw of String(markdown ?? '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('|')) {
      if (SEPARATOR_ROW.test(line)) continue;
      const cells = line.split('|').slice(1, -1);
      if (tipo === 'treino') add(cells[0]);
      else cells.forEach(add);
    } else if (tipo === 'treino' && /^#{1,6}\s/.test(line)) {
      add(line.replace(/^#+\s*/, ''));
    }
    if (out.length >= MAX_TEXTS) break;
  }
  return out;
}

/** Cache key input: same texts → same translation, across plans and devices. */
export const cacheKeyInput = (texts: string[]) =>
  JSON.stringify({ v: TRANSLATION_CACHE_VERSION, texts });

export const translationSystemPrompt = (language: string) => [
  `You translate short labels from a Brazilian Portuguese fitness and nutrition app into ${language === 'en' ? 'English' : language}.`,
  'Input: a JSON array of strings (meal names, food names, workout day labels).',
  'Output: ONLY a JSON array with exactly the same number of strings, in the same order, each one the translation of the input at the same position.',
  'Keep numbers, units (g, kg, ml, kcal, min, s), times and brand names unchanged.',
  'Keep abbreviations (RIR, RPE, HIIT, TABATA, AMRAP) as they are. Keep uppercase strings in uppercase.',
  'No commentary, no code fences.',
].join('\n');

export const translationMaxTokens = (texts: string[]) => {
  const chars = texts.reduce((sum, t) => sum + t.length + 4, 0);
  return Math.min(8192, Math.max(256, Math.ceil(chars / 2) + 256));
};

/** Parses the AI answer; null when it is not an array aligned with the input. */
export function parseTranslatedTexts(raw: string, texts: string[]): TranslationPair[] | null {
  const text = String(raw ?? '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== texts.length) return null;
  const pairs: TranslationPair[] = [];
  for (let i = 0; i < texts.length; i++) {
    const value = parsed[i];
    if (typeof value !== 'string' || !value.trim()) return null;
    pairs.push([texts[i], value.trim()]);
  }
  return pairs;
}

export const isValidPairs = (value: unknown): value is TranslationPair[] =>
  Array.isArray(value) && value.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string');
