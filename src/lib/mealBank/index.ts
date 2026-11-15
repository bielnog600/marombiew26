/**
 * Banco de refeições — regras puras das opções 2 e 3 de cada refeição.
 *
 * - horário da refeição → slot do banco;
 * - país do aluno (telefone) → origens permitidas;
 * - restrições e "não gosto" da ficha → refeições excluídas;
 * - alimentos da ficha → prioridade;
 * - variedade: sem repetir refeição do banco no mesmo dia e evitando a mesma
 *   proteína principal da opção 1;
 * - gramas escaladas para a kcal da opção 1 (±10 %) em porções reais.
 *
 * Macros sempre pela tabela `foods` (nutritionEngine), nunca fixos.
 */
import {
  buildFoodIndex,
  computeItemMacros,
  roundForDisplay,
  type EngineMacros,
  type FoodIndex,
  type FoodRecord,
} from '@/lib/nutritionEngine';
import {
  planItemToOptionItem,
  planOptionName,
  sumOptionItems,
  syncMealOptions,
  type MealOption,
  type MealOptionItem,
} from '../../../supabase/functions/_shared/mealOptionsCore';
import { normalizeWhatsAppPhone } from '@/lib/phone';

export * from '../../../supabase/functions/_shared/mealOptionsCore';

export type MealSlot = 'cafe_manha' | 'lanche_tarde' | 'pre_treino' | 'pos_treino' | 'almoco' | 'jantar' | 'ceia';
export type MealOrigin = 'BR' | 'PT' | 'BR/PT';

export const MEAL_SLOTS: MealSlot[] = ['cafe_manha', 'lanche_tarde', 'pre_treino', 'pos_treino', 'almoco', 'jantar', 'ceia'];
export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  cafe_manha: 'Café da manhã',
  lanche_tarde: 'Lanche',
  pre_treino: 'Pré-treino',
  pos_treino: 'Pós-treino',
  almoco: 'Almoço',
  jantar: 'Jantar',
  ceia: 'Ceia',
};
export const MEAL_ORIGINS: MealOrigin[] = ['BR', 'PT', 'BR/PT'];

export interface BankMealItem {
  foodId: string;
  grams: number;
  ordem: number;
}

export interface BankMeal {
  id: string;
  code: string;
  slot: MealSlot;
  name: string;
  origin: MealOrigin;
  tags: string[];
  prep: string | null;
  active: boolean;
  items: BankMealItem[];
}

export const KCAL_OPTION_TOLERANCE = 0.1;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normText = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/* ------------------------------------------------------------------ slots */

const timeMinutes = (time?: string | null): number | null => {
  const m = String(time ?? '').match(/(\d{1,2})\s*[:h]\s*(\d{2})?/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
};

/** Slots do banco aceitos para uma refeição do plano (o primeiro é o principal). */
export const mealSlotsFor = (name: string, time?: string | null): MealSlot[] => {
  const n = normText(name);
  if (/\bpre\b.*treino|pre treino|pretreino/.test(n)) return ['pre_treino'];
  if (/\bpos\b.*treino|pos treino|postreino/.test(n)) return ['pos_treino'];
  if (/pequeno almoco|cafe|desjejum|breakfast/.test(n)) return ['cafe_manha'];
  if (/lanche|merenda|snack/.test(n)) return ['lanche_tarde', 'cafe_manha'];
  if (/almoco|lunch/.test(n)) return ['almoco'];
  if (/jantar|janta|dinner/.test(n)) return ['jantar'];
  if (/ceia|supper/.test(n)) return ['ceia'];
  const t = timeMinutes(time);
  if (t == null) return [];
  if (t < 10 * 60) return ['cafe_manha'];
  if (t < 12 * 60) return ['lanche_tarde', 'cafe_manha'];
  if (t < 15 * 60) return ['almoco'];
  if (t < 18 * 60 + 30) return ['lanche_tarde', 'cafe_manha'];
  if (t < 21 * 60 + 30) return ['jantar'];
  return ['ceia'];
};

/* ---------------------------------------------------------------- country */

export type StudentCountry = 'PT' | 'BR';

export const countryFromPhone = (phone: string | null | undefined): StudentCountry | null => {
  const digits = normalizeWhatsAppPhone(phone ?? '');
  if (!digits) return null;
  if (digits.startsWith('351')) return 'PT';
  if (digits.startsWith('55')) return 'BR';
  return null;
};

export const originsForCountry = (country: StudentCountry | null): MealOrigin[] =>
  country === 'PT' ? ['PT', 'BR/PT'] : country === 'BR' ? ['BR', 'BR/PT'] : ['BR', 'PT', 'BR/PT'];

/* ------------------------------------------------------------ restrictions */

export type RestrictionFlag =
  | 'lactose' | 'gluten' | 'soja' | 'ovo' | 'peixe' | 'frutos_mar' | 'amendoim' | 'oleaginosas'
  | 'porco' | 'vegetariano' | 'vegano';

/** Palavras do NOME do alimento que cada restrição exclui. */
const FOOD_KEYWORDS: Record<RestrictionFlag, string[]> = {
  lactose: ['iogurte', 'skyr', 'queijo', 'cottage', 'requeijao', 'mussarela', 'mozzarella', 'leite', 'whey', 'dulce de leche', 'doce de leite', 'nata', 'manteiga'],
  gluten: ['pao', 'broa', 'tortilha', 'massa', 'macarrao', 'aveia', 'granola', 'trigo', 'bolacha', 'biscoito de trigo'],
  soja: ['soja', 'tofu', 'edamame'],
  ovo: ['ovo', 'clara', 'omelete'],
  peixe: ['atum', 'salmao', 'tilapia', 'pescada', 'bacalhau', 'sardinha', 'peixe', 'merluza', 'dourada', 'robalo'],
  frutos_mar: ['camarao', 'lula', 'polvo', 'marisco', 'mexilhao'],
  amendoim: ['amendoim'],
  oleaginosas: ['nozes', 'noz', 'amendoa', 'castanha', 'avela', 'pistache'],
  porco: ['porco', 'lombo', 'bacon', 'presunto', 'pernil', 'linguica'],
  vegetariano: ['frango', 'carne', 'alcatra', 'patinho', 'picanha', 'bife', 'porco', 'lombo', 'peru', 'fiambre', 'atum', 'salmao', 'tilapia', 'pescada', 'bacalhau', 'sardinha', 'camarao', 'peixe', 'sobrecoxa', 'coxa', 'bacon', 'presunto'],
  vegano: [],
};
FOOD_KEYWORDS.vegano = [...FOOD_KEYWORDS.vegetariano, ...FOOD_KEYWORDS.lactose, ...FOOD_KEYWORDS.ovo, 'mel'];

/** Palavras do TEXTO da ficha que ativam cada restrição. */
const RESTRICTION_TRIGGERS: Array<[RestrictionFlag, RegExp]> = [
  ['lactose', /lactose|laticinio|lacteo|leite/],
  ['gluten', /gluten|celiac|trigo/],
  ['soja', /soja/],
  ['ovo', /\bovos?\b/],
  ['peixe', /peixe|pescado/],
  ['frutos_mar', /camarao|frutos do mar|marisco|crustace/],
  ['amendoim', /amendoim/],
  ['oleaginosas', /oleaginosa|castanha|nozes|amendoa|frutos secos/],
  ['porco', /porco|suino/],
  ['vegano', /vegan/],
  ['vegetariano', /vegetarian/],
];

const NO_RESTRICTION = /^(nao|nenhum|nenhuma|sem restri|nada|n a|nao tenho|-)*$|^(nao tenho|nenhuma|nenhum|nada)\b/;

export const parseRestrictionFlags = (...texts: Array<string | null | undefined>): Set<RestrictionFlag> => {
  const flags = new Set<RestrictionFlag>();
  for (const raw of texts) {
    const t = normText(raw);
    if (!t || NO_RESTRICTION.test(t)) continue;
    for (const [flag, re] of RESTRICTION_TRIGGERS) if (re.test(t)) flags.add(flag);
  }
  if (flags.has('vegano')) flags.add('vegetariano');
  return flags;
};

/** "Não gosto de X, Y" / "não como X" / "evito X" → palavras a evitar. */
export const parseDislikes = (...texts: Array<string | null | undefined>): string[] => {
  const out = new Set<string>();
  for (const raw of texts) {
    const t = normText(raw);
    const re = /(?:nao gosto de|nao gosto|nao como|evito|odeio|detesto)\s+([a-z0-9 ]+?)(?=\s+(?:nao gosto|nao como|evito|odeio|detesto)\b|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      for (const part of m[1].split(/\s+e\s+|\s+ou\s+|\s{2,}/)) {
        const w = part.trim().split(' ')[0];
        if (w && w.length > 2) out.add(w.replace(/s$/, ''));
      }
    }
  }
  return [...out];
};

const nameHasKeyword = (foodName: string, keyword: string): boolean => {
  const n = ` ${normText(foodName)} `;
  const k = normText(keyword);
  return n.includes(` ${k} `) || n.includes(` ${k}s `) || (k.length > 4 && n.includes(` ${k}`));
};

export const foodViolates = (foodName: string, flags: Set<RestrictionFlag>, dislikes: string[] = []): boolean => {
  for (const flag of flags) if (FOOD_KEYWORDS[flag].some((k) => nameHasKeyword(foodName, k))) return true;
  return dislikes.some((d) => nameHasKeyword(foodName, d));
};

/* ------------------------------------------------------------------ ficha */

/** Lista plana dos alimentos marcados na ficha (`alimentos_por_refeicao`). */
export const fichaFoodNames = (alimentos: unknown): string[] => {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') v.split(/[,;\n]/).forEach((s) => s.trim() && out.push(s.trim()));
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(push);
  };
  push(alimentos);
  return Array.from(new Set(out));
};

const STOP = new Set(['de', 'da', 'do', 'com', 'sem', 'em', 'e', 'a', 'o']);
const headWord = (name: string): string => {
  const w = normText(name).split(' ').filter((t) => !STOP.has(t))[0] ?? '';
  return w.length > 3 ? w.replace(/s$/, '') : w;
};

export interface FichaIndex {
  exact: Set<string>;
  heads: Set<string>;
}

export const buildFichaIndex = (names: string[]): FichaIndex => ({
  exact: new Set(names.map(normText)),
  heads: new Set(names.map(headWord).filter(Boolean)),
});

/** Pontos de afinidade com a ficha: nome exato = 2, mesmo alimento-base = 1. */
export const fichaMatchScore = (foodNames: string[], ficha: FichaIndex): number =>
  foodNames.reduce((acc, n) => acc + (ficha.exact.has(normText(n)) ? 2 : ficha.heads.has(headWord(n)) ? 1 : 0), 0);

/* --------------------------------------------------------------- protein */

const PROTEIN_GROUPS: Array<[string, RegExp]> = [
  ['whey', /whey/],
  ['peru', /\bperu\b/],
  ['frango', /frango|sobrecoxa/],
  ['porco', /porco|lombo/],
  ['marisco', /camarao/],
  ['peixe', /atum|salmao|tilapia|pescada|bacalhau|sardinha|peixe/],
  ['carne', /carne|alcatra|patinho|picanha|bife|fraldinha|contra file|coxao|hamburguer/],
  ['ovo', /\bovos?\b|clara|omelete/],
  ['laticinio', /iogurte|skyr|queijo|cottage|requeijao|mussarela|leite/],
  ['leguminosa', /feijao|lentilha|grao/],
];

export const proteinGroupOf = (foodName: string): string => {
  const n = normText(foodName);
  for (const [g, re] of PROTEIN_GROUPS) if (re.test(n)) return g;
  return headWord(foodName);
};

/** Proteína principal = alimento com mais proteína na refeição. */
export const mainProteinGroup = (items: Array<{ name: string; macros?: Partial<EngineMacros> | null }>): string | null => {
  let best: { name: string; p: number } | null = null;
  for (const it of items ?? []) {
    const p = num(it?.macros?.p);
    if (p > 0 && (!best || p > best.p)) best = { name: it.name, p };
  }
  return best ? proteinGroupOf(best.name) : null;
};

/* ---------------------------------------------------------------- portions */

export type PortionKind =
  | 'whey' | 'egg' | 'eggWhite' | 'yogurt' | 'milk' | 'bread' | 'tortilla' | 'fruit' | 'driedFruit'
  | 'avocado' | 'nut' | 'oil' | 'coldCut' | 'meat' | 'veg' | 'carb' | 'oat' | 'legume' | 'cheese'
  | 'sweet' | 'other';

export interface PortionRule {
  kind: PortionKind;
  step: number;
  min: number;
  /** Limite de porção: nunca passar. */
  max: number;
  /** Mínimo obrigatório (ovo, fruta, carne/peixe). Nos outros a receita pode ter menos. */
  hardMin?: boolean;
  /** Valores permitidos (ex.: whey 15/20/30/40). */
  allowed?: number[];
}

/** Fontes de carboidrato: as únicas que crescem além do fator da receita. */
export const CARB_KINDS: PortionKind[] = ['carb', 'bread', 'oat', 'fruit', 'tortilla'];

const FRUIT_RE = /^(banana|maca|pera|mamao|papaia|manga|morango|uvas?\b|kiwi|laranja|tangerina|mexerica|abacaxi|ananas|melancia|melao|mirtilo|frutas? vermelhas|ameixa|pessego|figo|framboesa|amora|goiaba|caqui|nectarina|cereja)\b/;
const MEAT_RE = /frango|sobrecoxa|\bperu\b|porco|lombo|camarao|atum|salmao|tilapia|pescada|bacalhau|sardinha|peixe|carne|alcatra|patinho|picanha|bife|fraldinha|coxao|hamburguer|polvo|lula|merluza|dourada|robalo/;
const VEG_RE = /abobrinha|abobora|curgete|brocolis|cenoura|espinafre|alface|tomate|pepino|couve|pimentao|cebola|cogumelo|salada|legumes|vagem|feijao verde|beringela|rucula|agriao|repolho|chuchu|quiabo|beterraba|\balho\b/;
const CARB_RE = /^(arroz|massa|macarrao|esparguete|batata|cuscuz|mandioca|aipim|inhame|quinoa|milho|polenta|nhoque)\b/;

/**
 * Porção real e limites por alimento: múltiplos de 5 g; ovo em unidades de 50 g
 * (50–200 g); whey 15/20/30/40; fruta inteira/meia (60–200 g); pão em fatia/unidade
 * (≤ 100 g); carne/peixe 80–250 g; legumes ≤ 200 g; arroz/massa/batata ≤ 400 g…
 */
export const portionRuleFor = (foodName: string): PortionRule => {
  const n = normText(foodName);
  if (/whey/.test(n)) return { kind: 'whey', step: 5, min: 15, max: 40, allowed: [15, 20, 30, 40] };
  if (/^clara/.test(n)) return { kind: 'eggWhite', step: 33, min: 33, max: 198 };
  if (/^ovos?\b|^omelete/.test(n)) return { kind: 'egg', step: 50, min: 50, max: 200, hardMin: true };
  if (/iogurte|skyr|kefir/.test(n)) return { kind: 'yogurt', step: 5, min: 60, max: 340 };
  if (/leite em po/.test(n)) return { kind: 'other', step: 5, min: 5, max: 30 };
  if (/^(leite|bebida|agua de coco)/.test(n)) return { kind: 'milk', step: 50, min: 100, max: 400 };
  if (/^pao frances/.test(n)) return { kind: 'bread', step: 50, min: 50, max: 100 };
  if (/^pao|^broa|caco|^tosta|^torrada/.test(n)) return { kind: 'bread', step: 25, min: 25, max: 100 };
  if (/^tortilha|^wrap/.test(n)) return { kind: 'tortilla', step: 40, min: 40, max: 80 };
  if (/^tamara|passa|\bseca\b|desidratad/.test(n)) return { kind: 'driedFruit', step: 10, min: 10, max: 40 };
  if (/^abacate/.test(n)) return { kind: 'avocado', step: 5, min: 20, max: 100 };
  if (/^banana/.test(n)) return { kind: 'fruit', step: 60, min: 60, max: 180, hardMin: true };
  if (/^(maca|pera)\b/.test(n)) return { kind: 'fruit', step: 65, min: 65, max: 195, hardMin: true };
  if (/^mamao|^papaia/.test(n)) return { kind: 'fruit', step: 75, min: 75, max: 150, hardMin: true };
  if (/^manga/.test(n)) return { kind: 'fruit', step: 60, min: 60, max: 180, hardMin: true };
  if (FRUIT_RE.test(n)) return { kind: 'fruit', step: 5, min: 60, max: 200, hardMin: true };
  if (/amendoim|amendoa|castanha|nozes|\bnoz\b|avela|caju|pistach|semente|chia|linhaca/.test(n)) return { kind: 'nut', step: 5, min: 5, max: 30 };
  if (/azeite|\boleo\b|manteiga/.test(n)) return { kind: 'oil', step: 5, min: 5, max: 15 };
  if (/fiambre|presunto|salpicao|peito de peru (fatiado|defumado)/.test(n)) return { kind: 'coldCut', step: 10, min: 20, max: 80 };
  if (/^aveia|farelo de aveia/.test(n)) return { kind: 'oat', step: 5, min: 10, max: 100 };
  if (/granola/.test(n)) return { kind: 'oat', step: 5, min: 10, max: 60 };
  if (/tapioca/.test(n)) return { kind: 'carb', step: 10, min: 20, max: 120 };
  if (/biscoito de arroz|bolacha de arroz/.test(n)) return { kind: 'carb', step: 5, min: 10, max: 40 };
  if (/feijao|grao|lentilha|ervilha/.test(n) && !/feijao verde/.test(n)) return { kind: 'legume', step: 5, min: 40, max: 250 };
  if (/^mel\b|geleia|doce de leite|dulce|cacau|acucar/.test(n)) return { kind: 'sweet', step: 5, min: 5, max: 30 };
  if (/cottage|ricota/.test(n)) return { kind: 'cheese', step: 5, min: 30, max: 200 };
  if (/requeijao|cream cheese/.test(n)) return { kind: 'cheese', step: 5, min: 10, max: 40 };
  if (/queijo|mussarela|mozzarella/.test(n)) return { kind: 'cheese', step: 5, min: 10, max: 60 };
  if (MEAT_RE.test(n)) return { kind: 'meat', step: 5, min: 80, max: 250, hardMin: true };
  if (VEG_RE.test(n) || /^molho de tomate/.test(n)) return { kind: 'veg', step: 5, min: 10, max: 200 };
  if (CARB_RE.test(n)) return { kind: 'carb', step: 5, min: 50, max: 400 };
  return { kind: 'other', step: 5, min: 5, max: 300 };
};

/** Arredonda para a porção real dentro dos limites. */
export const snapPortion = (grams: number, rule: PortionRule): number => {
  if (rule.allowed?.length) {
    const allowed = rule.allowed.filter((v) => v >= rule.min && v <= rule.max);
    return allowed.reduce((best, v) => (Math.abs(v - grams) < Math.abs(best - grams) ? v : best), allowed[0]);
  }
  const snapped = Math.round(grams / rule.step) * rule.step;
  const maxOnStep = Math.floor(rule.max / rule.step) * rule.step;
  return Math.min(Math.max(rule.min, snapped), Math.max(rule.min, maxOnStep));
};

const nextPortion = (grams: number, rule: PortionRule, dir: 1 | -1): number | null => {
  if (rule.allowed?.length) {
    const sorted = rule.allowed.filter((v) => v >= rule.min && v <= rule.max).sort((a, b) => a - b);
    const i = sorted.indexOf(grams);
    const j = i + dir;
    return i >= 0 && j >= 0 && j < sorted.length ? sorted[j] : null;
  }
  const v = grams + dir * rule.step;
  return v < rule.min || v > rule.max ? null : v;
};

/**
 * Regra efetiva de um alimento numa receita: quando a receita usa menos que o
 * mínimo de porção (ex.: leite 30 ml num omelete) e o mínimo não é obrigatório,
 * a porção desce em passos de 5 g em vez de ser empurrada para cima.
 */
const recipeRule = (rule: PortionRule, base: number): PortionRule => {
  if (rule.hardMin || rule.allowed?.length || base >= rule.min) return rule;
  const min = Math.max(5, Math.floor((base * 0.7) / 5) * 5);
  return { ...rule, step: 5, min };
};

/* ----------------------------------------------------------------- scaling */

export const computeOptionItems = (
  rows: Array<{ foodId: string | null; name?: string; grams: number }>,
  index: FoodIndex,
): MealOptionItem[] =>
  rows.map((r) => {
    const food = r.foodId ? index.byId.get(r.foodId) : null;
    const name = food?.name ?? r.name ?? '';
    const computed = computeItemMacros({ foodId: r.foodId, name, qtyGrams: r.grams }, index, 'draft', r.foodId ? 'strict_id' : 'legacy');
    return { foodId: food?.id ?? r.foodId, name, qtyGrams: r.grams, macros: roundForDisplay(computed.macros) };
  });

export interface MacroTarget {
  kcal: number;
  p?: number;
  c?: number;
  g?: number;
}

/** Macros parecidos com a Opção 1: proteína ±25 %, carboidrato ±30 %, gordura ±40 %. */
export const MACRO_OPTION_TOLERANCE = { p: 0.25, c: 0.3, g: 0.4 } as const;
/** Folga mínima em gramas, para refeições com muito pouco de um macro (ex.: gordura 2 g). */
export const MACRO_OPTION_FLOOR = { p: 8, c: 10, g: 6 } as const;
/** Fator da receita inteira antes de mexer só nos carboidratos. */
export const RECIPE_FACTOR_RANGE = [0.7, 1.5] as const;

const MACRO_KEYS = ['p', 'c', 'g'] as const;
type MacroKey = (typeof MACRO_KEYS)[number];

const macrosOf = (rows: Array<{ foodId: string | null; grams: number }>, index: FoodIndex): EngineMacros =>
  rows.reduce(
    (acc, r) => {
      const food = r.foodId ? index.byId.get(r.foodId) : null;
      if (!food) return acc;
      const k = r.grams / (num(food.portion_size) || 100);
      acc.kcal += num(food.calories) * k;
      acc.p += num(food.protein) * k;
      acc.c += num(food.carbs) * k;
      acc.g += num(food.fats) * k;
      return acc;
    },
    { kcal: 0, p: 0, c: 0, g: 0 } as EngineMacros,
  );

const hasMacro = (t: MacroTarget, k: MacroKey) => typeof t[k] === 'number' && Number.isFinite(t[k]);

export const isWithinKcalTolerance = (kcal: number, target: number, tol = KCAL_OPTION_TOLERANCE): boolean =>
  target <= 0 || Math.abs(kcal - target) <= target * tol;

/** O que fica fora da faixa da Opção 1: 'kcal', 'p', 'c' ou 'g'. */
export const optionFitIssues = (m: EngineMacros, target: MacroTarget): string[] => {
  const out: string[] = [];
  if (!isWithinKcalTolerance(m.kcal, target.kcal)) out.push('kcal');
  for (const k of MACRO_KEYS) {
    if (!hasMacro(target, k)) continue;
    const t = target[k] as number;
    const tol = Math.max(t * MACRO_OPTION_TOLERANCE[k], MACRO_OPTION_FLOOR[k]);
    if (Math.abs(m[k] - t) > tol) out.push(k);
  }
  return out;
};

const fitError = (m: EngineMacros, target: MacroTarget): number => {
  let e = target.kcal > 0 ? Math.abs(m.kcal - target.kcal) / target.kcal : 0;
  for (const k of MACRO_KEYS) {
    if (!hasMacro(target, k)) continue;
    const t = target[k] as number;
    e += (0.35 * Math.abs(m[k] - t)) / Math.max(t, MACRO_OPTION_FLOOR[k] * 2);
  }
  return e;
};

interface FitRow {
  foodId: string;
  name: string;
  base: number;
  grams: number;
  rule: PortionRule;
  side?: boolean;
}

/** Arroz/massa/batata/cuscuz somados numa refeição: no máximo 400 g (não vale arroz 300 g + batata 400 g). */
export const STARCH_MEAL_MAX = 400;
const starchGrams = (rows: FitRow[]): number =>
  rows.reduce((acc, r) => acc + (r.rule.kind === 'carb' ? r.grams : 0), 0);

/** Uma porção por vez, no alimento que mais aproxima da Opção 1, só entre os que podem mexer. */
const greedyFit = (
  rows: FitRow[],
  index: FoodIndex,
  target: MacroTarget,
  bounds: (row: FitRow) => [number, number] | null,
) => {
  for (let iter = 0; iter < 120; iter++) {
    const cur = fitError(macrosOf(rows, index), target);
    let best: { i: number; g: number; e: number } | null = null;
    rows.forEach((r, i) => {
      const b = bounds(r);
      if (!b) return;
      const lo = Math.min(b[0], r.grams);
      const hi = Math.max(b[1], r.grams);
      for (const dir of [1, -1] as const) {
        const g = nextPortion(r.grams, r.rule, dir);
        if (g == null || g < lo - 1e-9 || g > hi + 1e-9) continue;
        const prev = r.grams;
        r.grams = g;
        const valid = dir < 0 || starchGrams(rows) <= STARCH_MEAL_MAX + 1e-9;
        const e = fitError(macrosOf(rows, index), target);
        r.grams = prev;
        if (!valid) continue;
        if (e < cur - 1e-6 && (!best || e < best.e)) best = { i, g, e };
      }
    });
    if (!best) break;
    const { i, g } = best as { i: number; g: number };
    rows[i].grams = g;
  }
};

const BREAKFAST_LIKE: MealSlot[] = ['cafe_manha', 'lanche_tarde', 'pre_treino', 'pos_treino', 'ceia'];

/** Acompanhamentos simples por horário (nomes exatos da tabela de alimentos). */
export const SIDE_FOODS = {
  carbBreakfast: ['Banana', 'Pão integral', 'Aveia em flocos', 'Maçã'],
  carbMain: ['Arroz branco cozido', 'Batata inglesa cozida', 'Batata-doce cozida'],
  fatBreakfast: ['Abacate', 'Pasta de amendoim'],
  fatMain: ['Azeite de oliva', 'Abacate'],
} as const;

const findFoodByName = (index: FoodIndex, name: string): FoodRecord | null =>
  index.byName.get(normText(name).replace(/\s+/g, ' '))?.[0] ??
  [...index.byId.values()].find((f) => normText(f.name) === normText(name)) ??
  null;

export interface BankFitOptions {
  slots?: MealSlot[];
  ctx?: StudentMealContext;
}

export interface BankFit {
  option: MealOption;
  /** Dentro de ±10 % kcal e dos macros da Opção 1, sem passar limites de porção. */
  ok: boolean;
  issues: string[];
  /** Acompanhamentos acrescentados para fechar as kcal. */
  sides: string[];
}

/**
 * Ajusta uma receita do banco à Opção 1, por componente:
 * 1. receita inteira num fator 0,7–1,5 (cada alimento dentro dos seus limites);
 * 2. se faltar/sobrar, só as fontes de carboidrato até o limite;
 * 3. se ainda faltar, um acompanhamento simples do horário (fruta/pão/aveia no
 *    café e lanches; arroz/batata no almoço/jantar; azeite/abacate se faltar gordura);
 * 4. se não fechar ±10 % kcal e macros parecidos, `ok = false` (a refeição fica de fora).
 */
export const fitBankItems = (
  items: Array<{ foodId: string; grams: number; name?: string }>,
  index: FoodIndex,
  target: MacroTarget,
  opts: BankFitOptions = {},
): { items: MealOptionItem[]; ok: boolean; issues: string[]; sides: string[] } => {
  const rows: FitRow[] = items.map((it) => {
    const name = index.byId.get(it.foodId)?.name ?? it.name ?? '';
    const base = num(it.grams);
    return { foodId: it.foodId, name, base, grams: base, rule: recipeRule(portionRuleFor(name), base) };
  });
  const base = macrosOf(rows, index);
  if (!(target.kcal > 0) || !(base.kcal > 0)) {
    return { items: computeOptionItems(rows, index), ok: false, issues: ['kcal'], sides: [] };
  }
  const [fLo, fHi] = RECIPE_FACTOR_RANGE;
  const factor = Math.min(fHi, Math.max(fLo, target.kcal / base.kcal));
  rows.forEach((r) => { r.grams = snapPortion(r.base * factor, r.rule); });

  // 1. Receita inteira, cada alimento entre 0,7× e 1,5× da receita.
  const recipeBounds = (r: FitRow): [number, number] => [
    Math.max(r.rule.min, r.base * fLo),
    Math.min(r.rule.max, r.base * fHi),
  ];
  greedyFit(rows, index, target, recipeBounds);
  const carbBounds = (r: FitRow): [number, number] | null =>
    CARB_KINDS.includes(r.rule.kind) || r.side ? [r.rule.min, r.rule.max] : null;
  const issues = () => optionFitIssues(macrosOf(rows, index), target);

  // 2. Só os carboidratos, até o limite de porção.
  if (issues().length) greedyFit(rows, index, target, carbBounds);

  // 3. Acompanhamento simples do horário.
  const sides: string[] = [];
  const mainMeal = (opts.slots ?? []).some((s) => s === 'almoco' || s === 'jantar') &&
    !(opts.slots ?? []).some((s) => BREAKFAST_LIKE.includes(s));
  for (let n = 0; n < 2; n++) {
    const m = macrosOf(rows, index);
    if (m.kcal >= target.kcal * (1 - KCAL_OPTION_TOLERANCE * 0.5) || !issues().length) break;
    const carbDef = hasMacro(target, 'c') ? ((target.c as number) - m.c) / Math.max(target.c as number, 20) : 1;
    const fatDef = hasMacro(target, 'g') ? ((target.g as number) - m.g) / Math.max(target.g as number, 10) : 0;
    const wantFat = fatDef > 0.2 && fatDef > carbDef;
    const list = wantFat
      ? (mainMeal ? SIDE_FOODS.fatMain : SIDE_FOODS.fatBreakfast)
      : (mainMeal ? SIDE_FOODS.carbMain : SIDE_FOODS.carbBreakfast);
    const ctx = opts.ctx;
    const candidates = [...list]
      .map((name) => findFoodByName(index, name))
      .filter((f): f is FoodRecord => !!f)
      .filter((f) => !rows.some((r) => r.foodId === f.id))
      .filter((f) => !ctx || !foodViolates(f.name, ctx.restrictions, ctx.dislikes))
      .sort((a, b) => (ctx ? fichaMatchScore([b.name], ctx.ficha) - fichaMatchScore([a.name], ctx.ficha) : 0));
    // Almoço/jantar que já tem arroz/batata/massa não ganha um segundo carboidrato.
    const hasStarch = rows.some((r) => r.rule.kind === 'carb');
    const side = candidates.find((f) => wantFat || !mainMeal || !hasStarch);
    if (!side) break;
    const rule = portionRuleFor(side.name);
    rows.push({ foodId: side.id, name: side.name, base: rule.min, grams: snapPortion(rule.min, rule), rule, side: true });
    sides.push(side.name);
    greedyFit(rows, index, target, carbBounds);
  }

  const finalIssues = issues();
  const overLimit =
    starchGrams(rows) > STARCH_MEAL_MAX + 1e-9 ||
    rows.some((r) => r.grams > r.rule.max + 1e-9 || (r.rule.hardMin && r.grams < r.rule.min - 1e-9));
  return {
    items: computeOptionItems(rows, index),
    ok: finalIssues.length === 0 && !overLimit,
    issues: overLimit ? [...finalIssues, 'limite'] : finalIssues,
    sides,
  };
};

/** Escala só por kcal (sem comparar macros), com os mesmos limites de porção. */
export const scaleBankItems = (
  items: Array<{ foodId: string; grams: number; name?: string }>,
  index: FoodIndex,
  targetKcal: number,
): MealOptionItem[] => fitBankItems(items, index, { kcal: targetKcal }).items;

const toTarget = (t: MacroTarget | number): MacroTarget => (typeof t === 'number' ? { kcal: t } : t);

export const fitBankMeal = (meal: BankMeal, index: FoodIndex, target: MacroTarget | number, opts: BankFitOptions = {}): BankFit => {
  const res = fitBankItems(
    [...meal.items].sort((a, b) => a.ordem - b.ordem).map((i) => ({ foodId: i.foodId, grams: i.grams })),
    index,
    toTarget(target),
    { slots: opts.slots ?? [meal.slot], ctx: opts.ctx },
  );
  const sideLabel = res.sides.map((s) => s.toLowerCase()).join(' e ');
  return {
    option: {
      source: 'bank',
      bankCode: meal.code,
      name: res.sides.length ? `${meal.name} + ${sideLabel}` : meal.name,
      ...(meal.prep ? { prep: meal.prep } : {}),
      items: res.items,
    },
    ok: res.ok,
    issues: res.issues,
    sides: res.sides,
  };
};

export const bankMealToOption = (meal: BankMeal, index: FoodIndex, target: MacroTarget | number, opts: BankFitOptions = {}): MealOption =>
  fitBankMeal(meal, index, target, opts).option;

/* --------------------------------------------------------------- selection */

export interface StudentMealContext {
  origins: MealOrigin[];
  restrictions: Set<RestrictionFlag>;
  dislikes: string[];
  ficha: FichaIndex;
}

export const buildStudentMealContext = (input: {
  phone?: string | null;
  restricoes?: Array<string | null | undefined>;
  preferencias?: Array<string | null | undefined>;
  alimentos?: unknown;
}): StudentMealContext => ({
  origins: originsForCountry(countryFromPhone(input.phone)),
  restrictions: parseRestrictionFlags(...(input.restricoes ?? [])),
  dislikes: parseDislikes(...(input.restricoes ?? []), ...(input.preferencias ?? [])),
  ficha: buildFichaIndex(fichaFoodNames(input.alimentos)),
});

const bankFoodNames = (meal: BankMeal, index: FoodIndex): string[] =>
  meal.items.map((i) => index.byId.get(i.foodId)?.name ?? '').filter(Boolean);

/** Refeições do banco permitidas para esse aluno nesse horário. */
export const eligibleBankMeals = (
  bank: BankMeal[],
  slots: MealSlot[],
  ctx: StudentMealContext,
  index: FoodIndex,
): BankMeal[] =>
  bank.filter((m) =>
    m.active &&
    slots.includes(m.slot) &&
    ctx.origins.includes(m.origin) &&
    m.items.length > 0 &&
    m.items.every((i) => index.byId.has(i.foodId)) &&
    !bankFoodNames(m, index).some((n) => foodViolates(n, ctx.restrictions, ctx.dislikes)),
  );

export interface RankInput {
  slots: MealSlot[];
  planProtein: string | null;
  usedToday: Set<string>;
  usedOtherDays: Set<string>;
  /** Refeições do banco usadas neste mesmo horário no dia anterior. */
  usedPrevDaySameMeal?: Set<string>;
  targetKcal: number;
}

/** Ordena candidatos: ficha, horário principal, proteína diferente da opção 1, variedade. */
export const rankBankMeals = (candidates: BankMeal[], input: RankInput, ctx: StudentMealContext, index: FoodIndex) =>
  candidates
    .filter((m) => !input.usedToday.has(m.code))
    .map((m) => {
      const names = bankFoodNames(m, index);
      const protein = mainProteinGroup(computeOptionItems(m.items.map((i) => ({ foodId: i.foodId, grams: i.grams })), index));
      let score = fichaMatchScore(names, ctx.ficha) * 3;
      if (m.slot === input.slots[0]) score += 5;
      if (protein && protein === input.planProtein) score -= 15;
      if (input.usedPrevDaySameMeal?.has(m.code)) score -= 30;
      if (input.usedOtherDays.has(m.code)) score -= 2;
      return { meal: m, protein, score };
    })
    .sort((a, b) => b.score - a.score || a.meal.code.localeCompare(b.meal.code));

/** Escolhe até 2 refeições do banco (proteínas diferentes entre si quando possível). */
export const pickTwoBankMeals = <T extends { protein: string | null }>(ranked: T[]): T[] => {
  const first = ranked[0];
  if (!first) return [];
  const second = ranked.find((r) => r !== first && r.protein !== first.protein) ?? ranked[1];
  return second ? [first, second] : [first];
};

const mealMacros = (meal: any): MacroTarget => {
  const fromItems = sumOptionItems(meal?.items ?? []);
  if (fromItems.kcal > 0) return fromItems;
  const t = meal?.totals ?? {};
  return { kcal: num(t.kcal), p: num(t.p), c: num(t.c), g: num(t.g) };
};

export interface MealOptionGap {
  dayIndex: number;
  mealIndex: number;
  dayLabel: string;
  mealName: string;
  /** Quantas opções do banco couberam (0 ou 1). */
  found: number;
}

/**
 * "Gerar opções": para cada refeição de cada dia, opção 1 = refeição do plano
 * e opções 2/3 = banco ajustado à Opção 1 (kcal ±10 % e macros parecidos, sem
 * passar limites de porção). Refeição do banco que não fecha fica de fora; se
 * nenhuma couber, a refeição fica só com a Opção 1. Nada muda em `items`.
 */
export const generatePlanMealOptions = (
  plan: any,
  bank: BankMeal[],
  foods: FoodRecord[],
  ctx: StudentMealContext,
): { plan: any; generated: number; skipped: string[]; gaps: MealOptionGap[] } => {
  const index = buildFoodIndex(foods);
  const usedOtherDays = new Set<string>();
  const skipped: string[] = [];
  const gaps: MealOptionGap[] = [];
  let generated = 0;
  let prevDay = new Map<string, Set<string>>();
  const days = (plan?.days ?? []).map((day: any, dayIndex: number) => {
    const usedToday = new Set<string>();
    const thisDay = new Map<string, Set<string>>();
    const meals = (day?.meals ?? []).map((meal: any, mealIndex: number) => {
      const slots = mealSlotsFor(meal?.name ?? '', meal?.time);
      const mealKey = `${slots[0] ?? ''}|${normText(meal?.name)}`;
      const target = mealMacros(meal);
      const candidates = slots.length ? eligibleBankMeals(bank, slots, ctx, index) : [];
      const ranked = rankBankMeals(candidates, {
        slots,
        planProtein: mainProteinGroup((meal?.items ?? []).map(planItemToOptionItem)),
        usedToday,
        usedOtherDays,
        usedPrevDaySameMeal: prevDay.get(mealKey),
        targetKcal: target.kcal,
      }, ctx, index);
      const fitted = ranked
        .map((r) => ({ ...r, fit: fitBankMeal(r.meal, index, target, { slots, ctx }) }))
        .filter((r) => r.fit.ok);
      const picks = pickTwoBankMeals(fitted);
      const { options: _old, ...rest } = meal ?? {};
      if (picks.length < 2) {
        gaps.push({ dayIndex, mealIndex, dayLabel: String(day?.label ?? ''), mealName: String(meal?.name ?? 'Refeição'), found: picks.length });
      }
      if (picks.length === 0) {
        skipped.push(String(meal?.name ?? 'Refeição'));
        return rest;
      }
      picks.forEach((p) => { usedToday.add(p.meal.code); usedOtherDays.add(p.meal.code); });
      thisDay.set(mealKey, new Set(picks.map((p) => p.meal.code)));
      generated += 1;
      return syncMealOptions({
        ...rest,
        options: [
          { source: 'plan', name: planOptionName(rest.items ?? []), items: [] },
          ...picks.map((p) => p.fit.option),
        ],
      }, index);
    });
    prevDay = thisDay;
    return { ...day, meals };
  });
  return { plan: { ...plan, days }, generated, skipped, gaps };
};

/** Diferença em kcal da opção vs. opção 1. */
export const optionKcalDiff = (option: MealOption, planKcal: number): number =>
  Math.round(sumOptionItems(option.items).kcal - planKcal);
