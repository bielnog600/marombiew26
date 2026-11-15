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

export interface PortionRule {
  step: number;
  min: number;
  /** Valores permitidos (ex.: whey 15/20/30). */
  allowed?: number[];
}

/** Porções reais: múltiplos de 5 g; ovo em unidades; whey em doses; fruta inteira/meia; pão em fatia/unidade. */
export const portionRuleFor = (foodName: string): PortionRule => {
  const n = normText(foodName);
  if (/whey/.test(n)) return { step: 5, min: 15, allowed: [15, 20, 30] };
  if (/^ovos?$|^ovo (cozido|inteiro|mexido)/.test(n)) return { step: 50, min: 50 };
  if (/^clara/.test(n)) return { step: 33, min: 33 };
  if (/^pao frances/.test(n)) return { step: 50, min: 50 };
  if (/^pao/.test(n)) return { step: 25, min: 25 };
  if (/^tortilha/.test(n)) return { step: 40, min: 40 };
  if (/^banana/.test(n)) return { step: 50, min: 50 };
  if (/^(maca|pera)\b/.test(n)) return { step: 65, min: 65 };
  if (/^mamao|^papaia/.test(n)) return { step: 75, min: 75 };
  if (/^manga/.test(n)) return { step: 60, min: 60 };
  if (/^tamara/.test(n)) return { step: 10, min: 10 };
  if (/^(leite|agua de coco|bebida)/.test(n)) return { step: 50, min: 100 };
  return { step: 5, min: 5 };
};

export const snapPortion = (grams: number, rule: PortionRule): number => {
  if (rule.allowed?.length) {
    return rule.allowed.reduce((best, v) => (Math.abs(v - grams) < Math.abs(best - grams) ? v : best), rule.allowed[0]);
  }
  const snapped = Math.round(grams / rule.step) * rule.step;
  return Math.max(rule.min, snapped);
};

const nextPortion = (grams: number, rule: PortionRule, dir: 1 | -1): number | null => {
  if (rule.allowed?.length) {
    const sorted = [...rule.allowed].sort((a, b) => a - b);
    const i = sorted.indexOf(grams);
    const j = i + dir;
    return i >= 0 && j >= 0 && j < sorted.length ? sorted[j] : null;
  }
  const v = grams + dir * rule.step;
  return v < rule.min ? null : v;
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

const kcalOf = (rows: Array<{ foodId: string | null; grams: number }>, index: FoodIndex): number =>
  rows.reduce((acc, r) => {
    const food = r.foodId ? index.byId.get(r.foodId) : null;
    if (!food) return acc;
    return acc + (num(food.calories) * r.grams) / (num(food.portion_size) || 100);
  }, 0);

/**
 * Escala as gramas para `targetKcal` (±10 %), arredondando para porções reais.
 * Primeiro proporcional; depois pequenos ajustes de uma porção por vez até
 * entrar na faixa (para quando chega a ±5 % ou não há ajuste que melhore).
 */
export const scaleBankItems = (
  items: Array<{ foodId: string; grams: number; name?: string }>,
  index: FoodIndex,
  targetKcal: number,
): MealOptionItem[] => {
  const named = items.map((it) => ({
    foodId: it.foodId,
    name: index.byId.get(it.foodId)?.name ?? it.name ?? '',
    grams: num(it.grams),
  }));
  const base = kcalOf(named, index);
  if (!(targetKcal > 0) || !(base > 0)) {
    return computeOptionItems(named, index);
  }
  const factor = targetKcal / base;
  const rows = named.map((r) => ({ ...r, rule: portionRuleFor(r.name) }));
  rows.forEach((r) => { r.grams = snapPortion(r.grams * factor, r.rule); });

  const dist = () => Math.abs(kcalOf(rows, index) - targetKcal);
  for (let iter = 0; iter < 40; iter++) {
    const d = dist();
    if (d <= targetKcal * 0.05) break;
    let best: { i: number; g: number; d: number } | null = null;
    rows.forEach((r, i) => {
      for (const dir of [1, -1] as const) {
        const g = nextPortion(r.grams, r.rule, dir);
        if (g == null) continue;
        const prev = r.grams;
        r.grams = g;
        const nd = dist();
        r.grams = prev;
        if (nd < d && (!best || nd < best.d)) best = { i, g, d: nd };
      }
    });
    if (!best) break;
    rows[(best as { i: number }).i].grams = (best as { g: number }).g;
  }
  return computeOptionItems(rows, index);
};

export const isWithinKcalTolerance = (kcal: number, target: number, tol = KCAL_OPTION_TOLERANCE): boolean =>
  target <= 0 || Math.abs(kcal - target) <= target * tol;

export const bankMealToOption = (meal: BankMeal, index: FoodIndex, targetKcal: number): MealOption => ({
  source: 'bank',
  bankCode: meal.code,
  name: meal.name,
  ...(meal.prep ? { prep: meal.prep } : {}),
  items: scaleBankItems(
    [...meal.items].sort((a, b) => a.ordem - b.ordem).map((i) => ({ foodId: i.foodId, grams: i.grams })),
    index,
    targetKcal,
  ),
});

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
  targetKcal: number;
}

/** Ordena candidatos: ficha, horário principal, proteína diferente da opção 1, variedade. */
export const rankBankMeals = (candidates: BankMeal[], input: RankInput, ctx: StudentMealContext, index: FoodIndex) =>
  candidates
    .filter((m) => !input.usedToday.has(m.code))
    .map((m) => {
      const names = bankFoodNames(m, index);
      const protein = mainProteinGroup(computeOptionItems(m.items.map((i) => ({ foodId: i.foodId, grams: i.grams })), index));
      const baseKcal = kcalOf(m.items.map((i) => ({ foodId: i.foodId, grams: i.grams })), index);
      const ratio = input.targetKcal > 0 && baseKcal > 0 ? input.targetKcal / baseKcal : 1;
      let score = fichaMatchScore(names, ctx.ficha) * 3;
      if (m.slot === input.slots[0]) score += 5;
      if (protein && protein === input.planProtein) score -= 15;
      if (input.usedOtherDays.has(m.code)) score -= 2;
      if (ratio < 0.5 || ratio > 2) score -= 4;
      return { meal: m, protein, score };
    })
    .sort((a, b) => b.score - a.score || a.meal.code.localeCompare(b.meal.code));

/** Escolhe até 2 refeições do banco (proteínas diferentes entre si quando possível). */
export const pickTwoBankMeals = (ranked: Array<{ meal: BankMeal; protein: string | null }>): BankMeal[] => {
  const first = ranked[0];
  if (!first) return [];
  const second = ranked.find((r) => r !== first && r.protein !== first.protein) ?? ranked[1];
  return second ? [first.meal, second.meal] : [first.meal];
};

const mealKcal = (meal: any): number => {
  const fromItems = sumOptionItems(meal?.items ?? []).kcal;
  return fromItems > 0 ? fromItems : num(meal?.totals?.kcal);
};

/**
 * "Gerar opções": para cada refeição de cada dia, opção 1 = refeição do plano
 * e opções 2/3 = banco escalado para a kcal da opção 1. Nada muda em `items`.
 */
export const generatePlanMealOptions = (
  plan: any,
  bank: BankMeal[],
  foods: FoodRecord[],
  ctx: StudentMealContext,
): { plan: any; generated: number; skipped: string[] } => {
  const index = buildFoodIndex(foods);
  const usedOtherDays = new Set<string>();
  const skipped: string[] = [];
  let generated = 0;
  const days = (plan?.days ?? []).map((day: any) => {
    const usedToday = new Set<string>();
    const meals = (day?.meals ?? []).map((meal: any) => {
      const slots = mealSlotsFor(meal?.name ?? '', meal?.time);
      const target = mealKcal(meal);
      const candidates = slots.length ? eligibleBankMeals(bank, slots, ctx, index) : [];
      const ranked = rankBankMeals(candidates, {
        slots,
        planProtein: mainProteinGroup((meal?.items ?? []).map(planItemToOptionItem)),
        usedToday,
        usedOtherDays,
        targetKcal: target,
      }, ctx, index);
      const picks = pickTwoBankMeals(ranked);
      const { options: _old, ...rest } = meal ?? {};
      if (picks.length === 0) {
        skipped.push(String(meal?.name ?? 'Refeição'));
        return rest;
      }
      picks.forEach((p) => { usedToday.add(p.code); usedOtherDays.add(p.code); });
      generated += 1;
      return syncMealOptions({
        ...rest,
        options: [
          { source: 'plan', name: planOptionName(rest.items ?? []), items: [] },
          ...picks.map((p) => bankMealToOption(p, index, target)),
        ],
      });
    });
    return { ...day, meals };
  });
  return { plan: { ...plan, days }, generated, skipped };
};

/** Diferença em kcal da opção vs. opção 1. */
export const optionKcalDiff = (option: MealOption, planKcal: number): number =>
  Math.round(sumOptionItems(option.items).kcal - planKcal);
