/**
 * Banco de refeições ⇄ planilha (puro, sem IA e sem rede).
 *
 * Formato (o mesmo da planilha original do banco):
 * - "Refeições":   ID | Horário | Refeição | Origem | Tags | Alimentos (g) | kcal | Proteína (g) | Carbo (g) | Gordura (g) | Preparo
 * - "Ingredientes": ID | Horário | Refeição | Alimento | Gramas | kcal | Proteína (g) | Carbo (g) | Gordura (g)
 * - "Alimentos" (opcional): Alimento | kcal/100g | Proteína/100g | Carbo/100g | Gordura/100g
 *
 * kcal/macros da planilha são ignorados na importação: tudo é recalculado
 * pela tabela de alimentos.
 */
import { buildFoodIndex, type FoodIndex, type FoodRecord } from '@/lib/nutritionEngine';
import {
  computeOptionItems,
  MEAL_SLOTS,
  normText,
  sumOptionItems,
  type BankMeal,
  type MealOrigin,
  type MealSlot,
} from './index';

export type SheetRows = unknown[][];
export interface SheetInput { name: string; rows: SheetRows }

/* ------------------------------------------------------------ códigos */

const SLOT_PREFIX: Record<MealSlot, string> = {
  cafe_manha: 'CM', lanche_tarde: 'LT', pre_treino: 'PRE', pos_treino: 'POS', almoco: 'AL', jantar: 'JA', ceia: 'CE',
};

/** Próximo código livre do horário (ex.: CM16). */
export const nextBankCode = (bank: Array<{ code: string }>, slot: MealSlot): string => {
  const prefix = SLOT_PREFIX[slot];
  const max = bank.reduce((acc, m) => {
    const match = String(m.code ?? '').match(new RegExp(`^${prefix}(\\d+)$`));
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
};

/* ------------------------------------------------------ horário/origem */

export const SPREADSHEET_SLOT_LABEL: Record<MealSlot, string> = {
  cafe_manha: 'Café da manhã',
  lanche_tarde: 'Lanche da tarde',
  pre_treino: 'Pré-treino',
  pos_treino: 'Pós-treino',
  almoco: 'Almoço',
  jantar: 'Jantar',
  ceia: 'Ceia',
};

const SLOT_WORDS: Record<string, MealSlot> = {
  'cafe da manha': 'cafe_manha', 'cafe manha': 'cafe_manha', cafe: 'cafe_manha', 'pequeno almoco': 'cafe_manha',
  'lanche da tarde': 'lanche_tarde', 'lanche da manha': 'lanche_tarde', 'lanche tarde': 'lanche_tarde', lanche: 'lanche_tarde', merenda: 'lanche_tarde',
  'pre treino': 'pre_treino', 'pos treino': 'pos_treino',
  almoco: 'almoco', jantar: 'jantar', ceia: 'ceia',
};

export const parseSlotLabel = (value: unknown): MealSlot | null => SLOT_WORDS[normText(value)] ?? null;

export const parseOriginLabel = (value: unknown): MealOrigin | null => {
  const v = String(value ?? '').toUpperCase().replace(/\s+/g, '').replace(/[-–|]/g, '/');
  if (v === 'BR') return 'BR';
  if (v === 'PT') return 'PT';
  if (v === 'BR/PT' || v === 'PT/BR') return 'BR/PT';
  return null;
};

/* ------------------------------------------------------------- números */

export const parseNumberCell = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value ?? '').trim().replace(/\s/g, '').replace(/(g|gr|gramas|ml)\.?$/i, '').replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

export interface TextIngredient { name: string; grams: number | null; raw: string }

/** "Pão francês 50g; Ovo inteiro 100g" → [{name, grams}] (gramas null = inválidas). */
export const parseIngredientsText = (value: unknown): TextIngredient[] =>
  String(value ?? '')
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((raw) => {
      const m = raw.match(/^(.*?)[\s:–-]*(\d+(?:[.,]\d+)?)\s*(g|gr|gramas|ml)?\.?$/i);
      if (!m || !m[1].trim()) return { name: raw.replace(/[\s:–-]+$/, ''), grams: null, raw };
      return { name: m[1].trim(), grams: Number(m[2].replace(',', '.')), raw };
    });

/* ---------------------------------------------------- casar alimentos */

const singular = (w: string): string => {
  if (w.length <= 3) return w;
  if (/(oes|aes)$/.test(w)) return `${w.slice(0, -3)}ao`;
  if (/ais$/.test(w)) return `${w.slice(0, -2)}l`;
  if (/(res|zes|les)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
};

/** Nome normalizado: sem acento/maiúsculas/pontuação e plural simples. */
export const foodMatchKey = (name: unknown): string => normText(name).split(' ').filter(Boolean).map(singular).join(' ');

const LINKING_WORDS = new Set(['de', 'da', 'do', 'das', 'dos']);
/** Como foodMatchKey, ignorando "de/da/do" ("Grão-de-bico" = "Grão bico"). */
export const foodLooseKey = (name: unknown): string => foodMatchKey(name).split(' ').filter((t) => t && !LINKING_WORDS.has(t)).join(' ');

/**
 * Sinónimos BR/PT embutidos: nome da planilha → nome do alimento no banco.
 * Só ligam quando o alimento de destino existe na tabela.
 */
export const BUILTIN_FOOD_SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ['Abóbora cozida', 'Abóbora cabotiá / menina cozida'],
  ['Arroz integral cozido', 'Arroz integral'],
  ['Atum ao natural', 'Atum em água'],
  ['Biscoito de arroz', 'Biscoito de arroz integral'],
  ['Chocolate 70%', 'Chocolate 74%'],
  ['Coxa de frango sem pele assada', 'Coxa de frango sem pele cozida'],
  ['Cuscuz de milho hidratado', 'Cuscuz de milho cozido'],
  ['Edamame', 'Edamame cozido'],
  ['Feijão-branco cozido', 'Feijão branco cozido'],
  ['Goma de tapioca', 'Tapioca (goma pronta)'],
  ['Grão-de-bico cozido', 'Grão de bico cozido'],
  ['Hambúrguer caseiro de patinho', 'Hambúrguer bovino caseiro grelhado'],
  ['Iogurte grego natural light', 'Iogurte tipo Grego Natural Light'],
  ['Legumes salteados', 'Legumes cozidos variados'],
  ['Leite semidesnatado', 'Leite meio-gordo'],
  ['Macarrão cozido', 'Massa cozida'],
  ['Moela cozida', 'Moela de frango'],
  ['Muçarela', 'Mussarela'],
  ['Ovo inteiro', 'Ovo'],
  ['Pão de forma integral', 'Pão integral'],
  ['Pão de forma tradicional', 'Pão de forma'],
  ['Peito de peru fatiado', 'Fiambre de peru'],
  ['Pimentão', 'Pimento (pimentão)'],
  ['Repolho refogado', 'Repolho'],
  ['Skyr natural', 'Iogurte Skyr Natural'],
  ['Tofu firme', 'Tofu'],
  ['Tortilha/Rap10 integral', 'Tortilha integral'],
  ['Mamão papaia', 'Mamão'],
  ['Lentilha cozida', 'Lentilhas cozidas'],
  ['Patinho moído refogado', 'Carne moída magra cozida'],
  ['Pasta de amendoim integral', 'Pasta de amendoim'],
  ['Pão sírio integral', 'Pão sírio'],
  ['Ricota', 'Queijo Ricota'],
  ['Sardinha em lata', 'Sardinha em lata (óleo, escorrida)'],
  ['Sobrecoxa sem pele assada', 'Sobrecoxa de frango assada sem pele'],
  ['Uva', 'Uvas'],
  ['Whey protein concentrado', 'Whey Protein Concentrado'],
  ['Camarão cozido', 'Camarão grelhado'],
  ['Cogumelos salteados', 'Cogumelos'],
  ['Doce de leite', 'Dulce de Leche'],
  ['Bacalhau demolhado cozido', 'Bacalhau demolhado cozido'],
];

/** Palavras BR ↔ PT trocadas uma a uma (o nome trocado ainda tem de bater inteiro). */
const WORD_SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ['curgete', 'abobrinha'], ['abobrinha', 'curgete'],
  ['ananas', 'abacaxi'], ['abacaxi', 'ananas'],
  ['pimento', 'pimentao'], ['pimentao', 'pimento'],
  ['mucarela', 'mussarela'], ['mozzarella', 'mussarela'], ['mussarela', 'mozzarella'],
  ['semidesnatado', 'meio gordo'], ['meio gordo', 'semidesnatado'],
  ['macarrao', 'massa'], ['massa', 'macarrao'],
  ['fiambre', 'presunto'], ['presunto', 'fiambre'],
  ['natas', 'creme leite'], ['creme leite', 'natas'],
];

export interface FoodAliasRow { alias: string; food_id: string }

export interface FoodMatcher {
  foods: FoodRecord[];
  exact: Map<string, FoodRecord>;
  normalized: Map<string, FoodRecord>;
  loose: Map<string, FoodRecord>;
  alias: Map<string, FoodRecord>;
  synonym: Map<string, FoodRecord>;
}

export const buildFoodMatcher = (foods: FoodRecord[], aliases: FoodAliasRow[] = []): FoodMatcher => {
  const exact = new Map<string, FoodRecord>();
  const normalized = new Map<string, FoodRecord>();
  const loose = new Map<string, FoodRecord>();
  const byId = new Map<string, FoodRecord>();
  for (const f of foods) {
    byId.set(f.id, f);
    const name = String(f.name ?? '').trim();
    if (name && !exact.has(name)) exact.set(name, f);
    const key = foodMatchKey(name);
    if (key && !normalized.has(key)) normalized.set(key, f);
    const lk = foodLooseKey(name);
    if (lk && !loose.has(lk)) loose.set(lk, f);
  }
  const alias = new Map<string, FoodRecord>();
  for (const a of aliases) {
    const food = byId.get(a.food_id);
    if (!food) continue;
    const key = foodMatchKey(a.alias);
    if (key) alias.set(key, food);
    const lk = foodLooseKey(a.alias);
    if (lk && !alias.has(lk)) alias.set(lk, food);
  }
  const synonym = new Map<string, FoodRecord>();
  for (const [from, to] of BUILTIN_FOOD_SYNONYMS) {
    const food = exact.get(to) ?? normalized.get(foodMatchKey(to)) ?? loose.get(foodLooseKey(to));
    if (!food) continue;
    synonym.set(foodMatchKey(from), food);
    synonym.set(foodLooseKey(from), food);
  }
  return { foods, exact, normalized, loose, alias, synonym };
};

/** exato → apelido salvo → nome normalizado → sinónimo BR/PT → nome parecido com macros iguais. */
export type FoodMatchVia = 'exato' | 'apelido' | 'normalizado' | 'sinonimo' | 'parecido';

export const FOOD_MATCH_VIA_LABEL: Record<FoodMatchVia, string> = {
  exato: 'mesmo nome',
  apelido: 'ligado antes',
  normalizado: 'mesmo nome',
  sinonimo: 'sinónimo',
  parecido: 'nome e macros parecidos',
};

const swapWords = (key: string): string[] => {
  const out: string[] = [];
  for (const [a, b] of WORD_SYNONYMS) {
    if (` ${key} `.includes(` ${a} `)) out.push(` ${key} `.replace(` ${a} `, ` ${b} `).trim());
  }
  return out;
};

/** Camadas (a)–(d): só ligações seguras, sem olhar para macros. */
export const matchFoodName = (name: string, m: FoodMatcher): { food: FoodRecord; via: FoodMatchVia } | null => {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  const exact = m.exact.get(trimmed);
  if (exact) return { food: exact, via: 'exato' };
  const key = foodMatchKey(trimmed);
  const lk = foodLooseKey(trimmed);
  const alias = m.alias.get(key) ?? m.alias.get(lk);
  if (alias) return { food: alias, via: 'apelido' };
  const norm = m.normalized.get(key) ?? m.loose.get(lk);
  if (norm) return { food: norm, via: 'normalizado' };
  const syn = m.synonym.get(key) ?? m.synonym.get(lk);
  if (syn) return { food: syn, via: 'sinonimo' };
  for (const alt of swapWords(key)) {
    const f = m.normalized.get(alt) ?? m.loose.get(foodLooseKey(alt)) ?? m.synonym.get(alt);
    if (f) return { food: f, via: 'sinonimo' };
  }
  return null;
};

/* ------------------------------------- (e) nome parecido + macros iguais */

/** Palavras de preparo/descrição que não mudam o alimento para a comparação de nomes. */
const DESCRIPTOR_WORDS = new Set([
  'cozido', 'cozida', 'grelhado', 'grelhada', 'assado', 'assada', 'refogado', 'refogada', 'cru', 'crua',
  'natural', 'fatiado', 'fatiada', 'picado', 'picada', 'salteado', 'salteada', 'hidratado', 'hidratada',
  'pronto', 'pronta', 'caseiro', 'caseira', 'escorrido', 'escorrida', 'fresco', 'fresca', 'tipo', 'em', 'com', 'e', 'a', 'o', 'ao', 'na', 'no',
]);
const contentTokens = (name: string): string[] => foodLooseKey(name).split(' ').filter((t) => t && !DESCRIPTOR_WORDS.has(t));

/** Similaridade de nomes 0–1 (Dice nas palavras que importam); 0 se a primeira palavra for outra. */
export const foodNameSimilarity = (a: string, b: string): number => {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.length === 0 || tb.length === 0 || ta[0] !== tb[0]) return 0;
  const setB = new Set(tb);
  const common = new Set(ta.filter((t) => setB.has(t))).size;
  return (2 * common) / (new Set(ta).size + setB.size);
};

export const SIMILAR_NAME_MIN = 0.8;
export const SIMILAR_KCAL_PCT = 0.15;
export const SIMILAR_MACRO_G = 5;

const per100 = (f: FoodRecord) => {
  const portion = Number(f.portion_size) > 0 ? Number(f.portion_size) : 100;
  const k = 100 / portion;
  return { kcal: Number(f.calories ?? 0) * k, p: Number(f.protein ?? 0) * k, c: Number(f.carbs ?? 0) * k, g: Number(f.fats ?? 0) * k };
};

/** Macros por 100 g batem: kcal ±15%, P/C/G ±5 g. */
export const macrosMatch = (def: { kcal: number; p: number; c: number; g: number }, food: FoodRecord): boolean => {
  const f = per100(food);
  const kcalTol = Math.max(f.kcal * SIMILAR_KCAL_PCT, 5);
  return Math.abs(def.kcal - f.kcal) <= kcalTol
    && Math.abs(def.p - f.p) <= SIMILAR_MACRO_G
    && Math.abs(def.c - f.c) <= SIMILAR_MACRO_G
    && Math.abs(def.g - f.g) <= SIMILAR_MACRO_G;
};

const completeDef = (def: ParsedFoodDef | null | undefined): { kcal: number; p: number; c: number; g: number } | null =>
  def && [def.kcal, def.p, def.c, def.g].every((v) => v !== null && Number.isFinite(v) && v >= 0)
    ? { kcal: def.kcal!, p: def.p!, c: def.c!, g: def.g! }
    : null;

/** Camada (e): só liga com nome muito parecido E macros da aba Alimentos iguais aos do banco. */
export const similarFoodMatch = (name: string, def: ParsedFoodDef | null | undefined, foods: FoodRecord[]): FoodRecord | null => {
  const d = completeDef(def);
  if (!d) return null;
  let best: { f: FoodRecord; s: number } | null = null;
  for (const f of foods) {
    const s = foodNameSimilarity(name, f.name);
    if (s < SIMILAR_NAME_MIN || !macrosMatch(d, f)) continue;
    if (!best || s > best.s) best = { f, s };
  }
  return best?.f ?? null;
};

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'com', 'ao', 'a', 'o', 'e', 'na', 'no', 'para', 'tipo']);
/** Sinónimos para as sugestões do "Mudar" (nunca ligam sozinhos). */
const SUGGEST_SYNONYMS: Array<[string, string]> = [
  ['ao natural', 'em agua'],
  ['natural', 'agua'],
  ['curgete', 'abobrinha'],
  ['abobrinha', 'curgete'],
  ['fiambre', 'presunto'],
  ['presunto', 'fiambre'],
  ['natas', 'creme de leite'],
  ['ananas', 'abacaxi'],
  ['abacaxi', 'ananas'],
  ['pequeno almoco', 'cafe da manha'],
];
const tokens = (key: string): string[] => key.split(' ').filter((t) => t && !STOP.has(t));
const expandedTokens = (key: string): string[] => {
  const out = new Set(tokens(key));
  for (const [a, b] of SUGGEST_SYNONYMS) {
    if (` ${key} `.includes(` ${a} `)) for (const t of tokens(foodMatchKey(b))) out.add(t);
  }
  return [...out];
};

/** Sugestões parecidas da tabela de alimentos (ex.: "Atum ao natural" → "Atum em água"). */
export const suggestFoods = (name: string, foods: FoodRecord[], limit = 5): FoodRecord[] => {
  const key = foodMatchKey(name);
  const base = tokens(key);
  if (base.length === 0) return [];
  const wanted = expandedTokens(key);
  const scored = foods.map((f) => {
    const ft = tokens(foodMatchKey(f.name));
    if (ft.length === 0) return { f, score: 0 };
    let score = 0;
    if (ft[0] === base[0]) score += 3;
    else if (ft[0].slice(0, 4) === base[0].slice(0, 4) && base[0].length >= 4) score += 1.5;
    for (const t of wanted) {
      if (ft.includes(t)) score += 2;
      else if (t.length >= 5 && ft.some((x) => x.length >= 5 && (x.startsWith(t.slice(0, 5)) || t.startsWith(x.slice(0, 5))))) score += 1;
    }
    if (score > 0) score -= Math.max(0, ft.length - wanted.length) * 0.3;
    return { f, score };
  });
  return scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name))
    .slice(0, limit)
    .map((s) => s.f);
};

/* --------------------------------------------------------------- leitura */

type ColKey = 'id' | 'horario' | 'refeicao' | 'origem' | 'tags' | 'alimentos' | 'preparo' | 'alimento' | 'gramas' | 'kcal' | 'proteina' | 'carbo' | 'gordura';

const colKeyOf = (header: unknown): ColKey | null => {
  const h = normText(header);
  if (!h) return null;
  if (h === 'id' || h === 'codigo' || h === 'code') return 'id';
  if (h.startsWith('horario')) return 'horario';
  if (h === 'refeicao' || h === 'nome' || h === 'nome da refeicao') return 'refeicao';
  if (h.startsWith('origem')) return 'origem';
  if (h === 'tags' || h.startsWith('etiqueta')) return 'tags';
  if (h.startsWith('alimentos')) return 'alimentos';
  if (h === 'alimento') return 'alimento';
  if (h.startsWith('preparo') || h.startsWith('como preparar')) return 'preparo';
  if (h.startsWith('gramas') || h === 'g' || h === 'quantidade g') return 'gramas';
  if (h.startsWith('kcal') || h.startsWith('calorias')) return 'kcal';
  if (h.startsWith('proteina')) return 'proteina';
  if (h.startsWith('carbo')) return 'carbo';
  if (h.startsWith('gordura')) return 'gordura';
  return null;
};

interface Table { columns: Partial<Record<ColKey, number>>; rows: Array<{ rowNumber: number; cells: unknown[] }> }

const readTable = (rows: SheetRows, required: ColKey[]): Table | null => {
  for (let h = 0; h < Math.min(rows.length, 6); h += 1) {
    const columns: Partial<Record<ColKey, number>> = {};
    (rows[h] ?? []).forEach((cell, i) => {
      const k = colKeyOf(cell);
      if (k && columns[k] === undefined) columns[k] = i;
    });
    if (required.every((k) => columns[k] !== undefined)) {
      const body = rows.slice(h + 1)
        .map((cells, i) => ({ rowNumber: h + 2 + i, cells: cells ?? [] }))
        .filter((r) => r.cells.some((c) => String(c ?? '').trim() !== ''));
      return { columns, rows: body };
    }
  }
  return null;
};

const cell = (t: Table, r: { cells: unknown[] }, k: ColKey): unknown => {
  const i = t.columns[k];
  return i === undefined ? '' : r.cells[i];
};
const text = (v: unknown): string => String(v ?? '').trim();

export interface ParsedIngredient { name: string; grams: number | null; raw: string }

export interface ParsedBankRow {
  rowNumber: number;
  code: string;
  slot: MealSlot | null;
  slotLabel: string;
  name: string;
  origin: MealOrigin | null;
  tags: string[];
  prep: string | null;
  items: ParsedIngredient[];
  itemsSource: 'ingredientes' | 'coluna';
  errors: string[];
  warnings: string[];
}

export interface ParsedFoodDef { name: string; kcal: number | null; p: number | null; c: number | null; g: number | null }

export interface ParsedWorkbook {
  meals: ParsedBankRow[];
  /** Aba Alimentos, chave = foodMatchKey(nome). */
  foodDefs: Map<string, ParsedFoodDef>;
  fileErrors: string[];
  usedIngredientsSheet: boolean;
}

const sheetKind = (name: string): 'refeicoes' | 'ingredientes' | 'alimentos' | null => {
  const n = normText(name);
  if (n.includes('refeic')) return 'refeicoes';
  if (n.includes('ingred')) return 'ingredientes';
  if (n.includes('aliment')) return 'alimentos';
  return null;
};

const sameItems = (a: ParsedIngredient[], b: ParsedIngredient[]): boolean =>
  a.length === b.length && a.every((x, i) => foodMatchKey(x.name) === foodMatchKey(b[i].name) && x.grams === b[i].grams);

export const parseBankWorkbook = (sheets: SheetInput[]): ParsedWorkbook => {
  const fileErrors: string[] = [];
  const byKind = (k: ReturnType<typeof sheetKind>) => sheets.find((s) => sheetKind(s.name) === k);
  // CSV (ou aba com outro nome): a primeira aba com Horário + Refeição.
  const mealsSheet = byKind('refeicoes') ?? sheets.find((s) => readTable(s.rows, ['horario', 'refeicao']) && !readTable(s.rows, ['alimento', 'gramas']));
  const mealsTable = mealsSheet ? readTable(mealsSheet.rows, ['horario', 'refeicao']) : null;
  if (!mealsTable) {
    fileErrors.push('Não encontrei a aba "Refeições" com as colunas ID, Horário e Refeição.');
    return { meals: [], foodDefs: new Map(), fileErrors, usedIngredientsSheet: false };
  }

  const ingSheet = byKind('ingredientes');
  const ingTable = ingSheet ? readTable(ingSheet.rows, ['id', 'alimento', 'gramas']) : null;
  if (ingSheet && !ingTable) fileErrors.push('A aba "Ingredientes" não tem as colunas ID, Alimento e Gramas — usei a coluna "Alimentos (g)".');
  const ingByCode = new Map<string, ParsedIngredient[]>();
  if (ingTable) {
    for (const r of ingTable.rows) {
      const code = text(cell(ingTable, r, 'id')).toUpperCase();
      const name = text(cell(ingTable, r, 'alimento'));
      if (!code || !name) continue;
      const rawGrams = cell(ingTable, r, 'gramas');
      const grams = parseNumberCell(rawGrams);
      const list = ingByCode.get(code) ?? [];
      list.push({ name, grams, raw: `${name} ${text(rawGrams)}`.trim() });
      ingByCode.set(code, list);
    }
  }

  const foodDefs = new Map<string, ParsedFoodDef>();
  const foodSheet = byKind('alimentos');
  const foodTable = foodSheet ? readTable(foodSheet.rows, ['alimento', 'kcal']) : null;
  if (foodTable) {
    for (const r of foodTable.rows) {
      const name = text(cell(foodTable, r, 'alimento'));
      if (!name) continue;
      foodDefs.set(foodMatchKey(name), {
        name,
        kcal: parseNumberCell(cell(foodTable, r, 'kcal')),
        p: parseNumberCell(cell(foodTable, r, 'proteina')),
        c: parseNumberCell(cell(foodTable, r, 'carbo')),
        g: parseNumberCell(cell(foodTable, r, 'gordura')),
      });
    }
  }

  const seen = new Set<string>();
  const meals: ParsedBankRow[] = mealsTable.rows.map((r) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const code = text(cell(mealsTable, r, 'id')).toUpperCase();
    const slotLabel = text(cell(mealsTable, r, 'horario'));
    const slot = parseSlotLabel(slotLabel);
    const name = text(cell(mealsTable, r, 'refeicao'));
    const originRaw = text(cell(mealsTable, r, 'origem'));
    const origin = parseOriginLabel(originRaw);
    const tags = text(cell(mealsTable, r, 'tags')).split(',').map((t) => t.trim()).filter(Boolean);
    const prep = text(cell(mealsTable, r, 'preparo')) || null;
    const columnItems = parseIngredientsText(cell(mealsTable, r, 'alimentos'));
    const sheetItems = code ? ingByCode.get(code) : undefined;
    const items = sheetItems && sheetItems.length > 0 ? sheetItems : columnItems;
    const itemsSource = sheetItems && sheetItems.length > 0 ? 'ingredientes' : 'coluna';

    if (!name) errors.push('Refeição sem nome.');
    if (!slot) errors.push(slotLabel ? `Horário inválido: "${slotLabel}".` : 'Horário vazio.');
    if (!origin) errors.push(originRaw ? `Origem inválida: "${originRaw}" (use BR, PT ou BR/PT).` : 'Origem vazia (use BR, PT ou BR/PT).');
    if (items.length === 0) errors.push('Refeição sem alimentos.');
    for (const it of items) {
      if (it.grams === null || !(it.grams > 0)) errors.push(`Gramas inválidas em "${it.raw}".`);
    }
    if (code) {
      if (seen.has(code)) errors.push(`ID ${code} repetido no arquivo.`);
      seen.add(code);
    }
    if (itemsSource === 'ingredientes' && columnItems.length > 0 && !sameItems(columnItems, items)) {
      warnings.push('A aba Ingredientes e a coluna "Alimentos (g)" estão diferentes — usei a aba Ingredientes.');
    }
    return { rowNumber: r.rowNumber, code, slot, slotLabel, name, origin, tags, prep, items, itemsSource, errors, warnings };
  });

  return { meals, foodDefs, fileErrors, usedIngredientsSheet: !!ingTable };
};

/* ------------------------------------------- alimentos da planilha */

export interface UnmatchedFood {
  key: string;
  name: string;
  /** Códigos/nomes das refeições que usam este alimento. */
  usedIn: string[];
  def: ParsedFoodDef | null;
}

/** Cada alimento distinto da planilha com a decisão automática (liga, cria ou faltam valores). */
export interface ImportFoodEntry extends UnmatchedFood {
  auto:
    | { kind: 'link'; food: FoodRecord; via: FoodMatchVia }
    | { kind: 'create' }
    | { kind: 'pending' };
}

export const classifyImportFoods = (parsed: ParsedWorkbook, matcher: FoodMatcher): ImportFoodEntry[] => {
  const out = new Map<string, ImportFoodEntry>();
  for (const meal of parsed.meals) {
    for (const it of meal.items) {
      if (!it.name) continue;
      const key = foodMatchKey(it.name);
      let entry = out.get(key);
      if (!entry) {
        const def = parsed.foodDefs.get(key) ?? null;
        const m = matchFoodName(it.name, matcher);
        let auto: ImportFoodEntry['auto'];
        if (m) auto = { kind: 'link', food: m.food, via: m.via };
        else {
          const similar = similarFoodMatch(it.name, def, matcher.foods);
          auto = similar ? { kind: 'link', food: similar, via: 'parecido' } : completeDef(def) ? { kind: 'create' } : { kind: 'pending' };
        }
        entry = { key, name: it.name, usedIn: [], def, auto };
        out.set(key, entry);
      }
      const label = meal.code || meal.name;
      if (!entry.usedIn.includes(label)) entry.usedIn.push(label);
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** Alimentos sem ligação segura (camadas a–d). */
export const unmatchedFoods = (parsed: ParsedWorkbook, matcher: FoodMatcher): UnmatchedFood[] =>
  classifyImportFoods(parsed, matcher)
    .filter((e) => !(e.auto.kind === 'link' && e.auto.via !== 'parecido'))
    .map(({ auto: _a, ...u }) => u);

export type FoodResolution =
  | { kind: 'link'; foodId: string }
  | { kind: 'create'; name: string; kcal: number | null; p: number | null; c: number | null; g: number | null };

export const isResolutionComplete = (r: FoodResolution | undefined): boolean => {
  if (!r) return false;
  if (r.kind === 'link') return !!r.foodId;
  return !!r.name.trim() && [r.kcal, r.p, r.c, r.g].every((v) => v !== null && Number.isFinite(v) && v >= 0);
};

/** Resolução inicial: cria com os valores da aba Alimentos quando ela os tem completos. */
export const defaultResolution = (u: UnmatchedFood): FoodResolution | undefined =>
  u.def && [u.def.kcal, u.def.p, u.def.c, u.def.g].every((v) => v !== null && v >= 0)
    ? { kind: 'create', name: u.name, kcal: u.def.kcal, p: u.def.p, c: u.def.c, g: u.def.g }
    : undefined;

/** O que vale para o alimento: a mudança do admin, senão a decisão automática. */
export const effectiveResolution = (entry: ImportFoodEntry, override: FoodResolution | undefined): FoodResolution | undefined => {
  if (override) return override;
  if (entry.auto.kind === 'link') return { kind: 'link', foodId: entry.auto.food.id };
  return defaultResolution(entry);
};

export const NEW_FOOD_PREFIX = 'novo:';
export const newFoodTempId = (key: string) => `${NEW_FOOD_PREFIX}${key}`;

/* ---------------------------------------------------- plano de importação */

export type ImportStatus = 'nova' | 'atualizada' | 'sem_mudanca' | 'erro';

export interface ImportMealPlan {
  row: ParsedBankRow;
  code: string;
  codeAssigned: boolean;
  status: ImportStatus;
  existing: BankMeal | null;
  /** foodId pode ser temporário (novo:<chave>) para alimentos a criar; null = pendente. */
  items: Array<{ foodId: string | null; name: string; grams: number }>;
  totals: { kcal: number; p: number; c: number; g: number };
  changes: string[];
  pendingFoods: string[];
}

export interface ImportPlan {
  meals: ImportMealPlan[];
  toDeactivate: BankMeal[];
  counts: Record<ImportStatus, number>;
  pendingCount: number;
  foodsToCreate: Array<{ key: string; tempId: string; name: string; kcal: number; p: number; c: number; g: number }>;
  aliasesToSave: Array<{ alias: string; food_id: string }>;
  /** Todos os alimentos distintos da planilha com a decisão automática. */
  foods: ImportFoodEntry[];
}

const sameArr = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const buildImportPlan = (args: {
  parsed: ParsedWorkbook;
  bank: BankMeal[];
  matcher: FoodMatcher;
  resolutions: Record<string, FoodResolution | undefined>;
  deactivateMissing?: boolean;
}): ImportPlan => {
  const { parsed, bank, matcher, resolutions } = args;
  const entries = classifyImportFoods(parsed, matcher);

  const foodsToCreate: ImportPlan['foodsToCreate'] = [];
  const aliasesToSave: ImportPlan['aliasesToSave'] = [];
  const tempFoods: FoodRecord[] = [];
  const idByKey = new Map<string, string>();
  let pendingCount = 0;
  for (const e of entries) {
    const r = effectiveResolution(e, resolutions[e.key]);
    if (!isResolutionComplete(r)) { pendingCount += 1; continue; }
    if (r!.kind === 'link') {
      idByKey.set(e.key, r!.foodId);
      const sameAsAuto = e.auto.kind === 'link' && e.auto.food.id === r!.foodId;
      // Toda ligação nova fica guardada para as próximas importações (exato/apelido já estão).
      if (!(sameAsAuto && (e.auto as { via: FoodMatchVia }).via === 'exato') && !(sameAsAuto && (e.auto as { via: FoodMatchVia }).via === 'apelido')) {
        aliasesToSave.push({ alias: e.key, food_id: r!.foodId });
      }
    } else {
      const tempId = newFoodTempId(e.key);
      idByKey.set(e.key, tempId);
      const created = { key: e.key, tempId, name: r!.name.trim(), kcal: r!.kcal!, p: r!.p!, c: r!.c!, g: r!.g! };
      foodsToCreate.push(created);
      tempFoods.push({ id: tempId, name: created.name, portion_size: 100, calories: created.kcal, protein: created.p, carbs: created.c, fats: created.g } as FoodRecord);
    }
  }
  const index: FoodIndex = buildFoodIndex([...matcher.foods, ...tempFoods]);
  const resolveId = (name: string): string | null => idByKey.get(foodMatchKey(name)) ?? null;

  const byCode = new Map(bank.map((m) => [m.code.toUpperCase(), m]));
  const assigned: Array<{ code: string }> = [...bank];
  const counts: Record<ImportStatus, number> = { nova: 0, atualizada: 0, sem_mudanca: 0, erro: 0 };

  const meals: ImportMealPlan[] = parsed.meals.map((row) => {
    const items = row.items.map((it) => ({ foodId: it.name ? resolveId(it.name) : null, name: it.name, grams: it.grams ?? 0 }));
    const pendingFoods = items.filter((i) => !i.foodId).map((i) => i.name);
    const computed = computeOptionItems(items.filter((i) => i.foodId).map((i) => ({ foodId: i.foodId, grams: i.grams })), index);
    const totals = sumOptionItems(computed);
    let code = row.code;
    let codeAssigned = false;
    if (!code && row.slot && row.errors.length === 0) {
      code = nextBankCode(assigned, row.slot);
      codeAssigned = true;
    }
    if (code) assigned.push({ code });
    const existing = code ? byCode.get(code) ?? null : null;
    const changes: string[] = [];
    let status: ImportStatus;
    if (row.errors.length > 0) status = 'erro';
    else if (!existing) status = 'nova';
    else {
      if (existing.name !== row.name) changes.push('nome');
      if (existing.slot !== row.slot) changes.push('horário');
      if (existing.origin !== row.origin) changes.push('origem');
      if (!sameArr(existing.tags, row.tags)) changes.push('tags');
      if ((existing.prep ?? '').trim() !== (row.prep ?? '')) changes.push('preparo');
      const sameItemsList = pendingFoods.length === 0
        && existing.items.length === items.length
        && existing.items.every((e, i) => e.foodId === items[i].foodId && Number(e.grams) === items[i].grams);
      if (!sameItemsList) changes.push('alimentos');
      status = changes.length ? 'atualizada' : 'sem_mudanca';
    }
    counts[status] += 1;
    return { row, code, codeAssigned, status, existing, items, totals, changes, pendingFoods };
  });

  const inFile = new Set(meals.map((m) => m.code).filter(Boolean));
  const toDeactivate = args.deactivateMissing ? bank.filter((m) => m.active && !inFile.has(m.code.toUpperCase())) : [];

  return { meals, toDeactivate, counts, pendingCount, foodsToCreate, aliasesToSave, foods: entries };
};

export const importSummaryText = (r: { novas: number; atualizadas: number; alimentosCriados: number; desativadas?: number }): string => {
  const parts = [
    `${r.novas} ${r.novas === 1 ? 'nova' : 'novas'}`,
    `${r.atualizadas} ${r.atualizadas === 1 ? 'atualizada' : 'atualizadas'}`,
    `${r.alimentosCriados} ${r.alimentosCriados === 1 ? 'alimento criado' : 'alimentos criados'}`,
  ];
  if (r.desativadas) parts.push(`${r.desativadas} ${r.desativadas === 1 ? 'desativada' : 'desativadas'}`);
  return parts.join(', ');
};

/* ---------------------------------------------------------------- exportar */

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

export const formatGrams = (grams: number, unit: string) => `${r1(grams)}${unit}`;

export const buildBankExportSheets = (bank: BankMeal[], foods: FoodRecord[]): SheetInput[] => {
  const index = buildFoodIndex(foods);
  // Mesma ordem da planilha original: por horário (CM, LT, PRE, POS, AL, JA, CE) e código.
  const sorted = [...bank].sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot) || a.code.localeCompare(b.code, 'pt', { numeric: true }));
  const meals: SheetRows = [['ID', 'Horário', 'Refeição', 'Origem', 'Tags', 'Alimentos (g)', 'kcal', 'Proteína (g)', 'Carbo (g)', 'Gordura (g)', 'Preparo']];
  const ingredients: SheetRows = [['ID', 'Horário', 'Refeição', 'Alimento', 'Gramas', 'kcal', 'Proteína (g)', 'Carbo (g)', 'Gordura (g)']];
  const used = new Map<string, FoodRecord>();
  for (const m of sorted) {
    const items = computeOptionItems(m.items.map((i) => ({ foodId: i.foodId, grams: i.grams })), index);
    const t = sumOptionItems(items);
    const unitOf = (foodId: string | null) => (foodId && index.byId.get(foodId)?.portion === 'ml' ? 'ml' : 'g');
    const label = SPREADSHEET_SLOT_LABEL[m.slot];
    meals.push([
      m.code, label, m.name, m.origin, m.tags.join(', '),
      items.map((i) => `${i.name} ${formatGrams(i.qtyGrams, unitOf(i.foodId))}`).join('; '),
      r0(t.kcal), r1(t.p), r1(t.c), r1(t.g), m.prep ?? '',
    ]);
    for (const it of items) {
      ingredients.push([m.code, label, m.name, it.name, r1(it.qtyGrams), r0(it.macros?.kcal ?? 0), r1(it.macros?.p ?? 0), r1(it.macros?.c ?? 0), r1(it.macros?.g ?? 0)]);
      const food = it.foodId ? index.byId.get(it.foodId) : null;
      if (food) used.set(food.id, food);
    }
  }
  const foodRows: SheetRows = [['Alimento', 'kcal/100g', 'Proteína/100g', 'Carbo/100g', 'Gordura/100g']];
  for (const f of [...used.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt'))) {
    const [per100] = computeOptionItems([{ foodId: f.id, grams: 100 }], index);
    foodRows.push([f.name, r0(per100.macros?.kcal ?? 0), r1(per100.macros?.p ?? 0), r1(per100.macros?.c ?? 0), r1(per100.macros?.g ?? 0)]);
  }
  return [
    { name: 'Refeições', rows: meals },
    { name: 'Ingredientes', rows: ingredients },
    { name: 'Alimentos usados', rows: foodRows },
  ];
};
