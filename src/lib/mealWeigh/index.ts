/**
 * Pesar refeição (Premium) — regras puras: macros por grama a partir da base
 * `foods` (nutritionEngine), casamento do nome dado pela IA com a base,
 * leitura do visor, aviso de balança não zerada e comparação previsto × pesado.
 * Nada aqui chama a IA, o banco ou o navegador.
 */
import {
  buildFoodIndex,
  computeItemMacros,
  foodRecordFromRow,
  normalizeFoodName,
  type EngineMacros,
  type FoodRow,
} from '@/lib/nutritionEngine';
import { parseNumeric } from '@/lib/dailyDietRebalance';
import type { ParsedMeal } from '@/lib/dietResultParser';

export type WeighFood = FoodRow;

/** Resposta da IA já normalizada pela função do servidor. */
export interface WeighAiResult {
  alimento: string;
  alimento_alternativas: string[];
  gramas_lidas: number | null;
  confianca_alimento: number;
  confianca_leitura: number;
  visor_legivel: boolean;
  observacao: string;
}

/** Item salvo em meal_weigh_logs.items. */
export interface WeighedItem {
  alimento: string;
  food_id: string | null;
  gramas: number;
  kcal: number;
  p: number;
  c: number;
  g: number;
  foto_url: string | null;
  editado_pelo_aluno: boolean;
  /** O que a IA leu/identificou, para o treinador conferir. */
  alimento_ia?: string | null;
  gramas_lidas?: number | null;
  /** Índice do alimento no plano da refeição, quando casado com ele. */
  indice_plano?: number | null;
}

/** Abaixo disso a leitura do visor ou o alimento são tratados como incertos. */
export const LOW_CONFIDENCE = 0.5;
export const UNREADABLE_MESSAGE = 'Não consegui ler a balança, tira outra foto mais de frente para o visor';
/** Modo "Pesar alimentos da dieta" (só lê o peso). */
export const SCALE_ONLY_UNREADABLE_MESSAGE = 'Não consegui ler a balança, tira outra foto de frente pro visor';
export const scaleOnlyHint = (foodName: string) => `Coloca o ${foodName || 'alimento'} na balança e enquadra o visor`;
export const NEXT_PLAN_FOOD_HINT = 'Lembra de zerar a balança (tara) ou trocar o prato';
export const NOT_TARED_MESSAGE = 'Parece que a balança não foi zerada';
export const FIRST_ITEM_HINT = 'Enquadra o prato e o visor da balança';
export const NEXT_ITEM_HINT = 'Zera a balança (tara) e coloca o próximo alimento';
/** Lado maior da foto enviada à IA. */
export const WEIGH_IMAGE_MAX_SIDE = 1280;

export const round1 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;

/* ----------------------------- Macros ----------------------------------- */

/** Macros de `grams` gramas de um alimento da base (mesmo motor das dietas). */
export function macrosForGrams(food: WeighFood, grams: number): EngineMacros {
  const record = foodRecordFromRow(food);
  const out = computeItemMacros(
    { foodId: record.id, name: record.name, qtyGrams: Math.max(0, Number(grams) || 0) },
    buildFoodIndex([record]),
  );
  return out.macros;
}

export function buildWeighedItem(
  food: WeighFood,
  grams: number,
  opts: { edited?: boolean; fotoUrl?: string | null; aiName?: string | null; readGrams?: number | null; planIndex?: number | null } = {},
): WeighedItem {
  const g = round1(Math.max(0, Number(grams) || 0));
  const m = macrosForGrams(food, g);
  return {
    alimento: food.name,
    food_id: isPlanOnlyFoodId(food.id) ? null : food.id,
    gramas: g,
    kcal: Math.round(m.kcal),
    p: round1(m.p),
    c: round1(m.c),
    g: round1(m.g),
    foto_url: opts.fotoUrl ?? null,
    editado_pelo_aluno: !!opts.edited,
    alimento_ia: opts.aiName ?? null,
    gramas_lidas: opts.readGrams ?? null,
    indice_plano: opts.planIndex ?? null,
  };
}

export function sumWeighedItems(items: WeighedItem[]): EngineMacros & { gramas: number } {
  const acc = { kcal: 0, p: 0, c: 0, g: 0, gramas: 0 };
  for (const it of items ?? []) {
    acc.kcal += Number(it.kcal) || 0;
    acc.p += Number(it.p) || 0;
    acc.c += Number(it.c) || 0;
    acc.g += Number(it.g) || 0;
    acc.gramas += Number(it.gramas) || 0;
  }
  return { kcal: Math.round(acc.kcal), p: round1(acc.p), c: round1(acc.c), g: round1(acc.g), gramas: round1(acc.gramas) };
}

/* ----------------------------- Nomes ------------------------------------ */

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'em', 'a', 'o', 'ao', 'na', 'no', 'para']);
const stem = (t: string) => {
  const s = t.replace(/s$/, '');
  return s.length > 4 ? s.slice(0, -1) : s;
};
export const foodTokens = (value: string): string[] =>
  normalizeFoodName(value)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);

/** 0..1 — 1 = mesmo nome; palavras iguais (ignorando acento, plural e gênero) contam. */
export function foodNameSimilarity(a: string, b: string): number {
  const na = normalizeFoodName(a);
  const nb = normalizeFoodName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = Array.from(new Set(foodTokens(a)));
  const tb = new Set(foodTokens(b));
  if (ta.length === 0 || tb.size === 0) return 0;
  const common = ta.filter((t) => tb.has(t)).length;
  return (2 * common) / (ta.length + tb.size);
}

/** Similaridade mínima para considerar dois nomes o mesmo alimento. */
export const NAME_MATCH_MIN = 0.5;

/**
 * Melhor alimento da base para um nome dado pela IA. Prefere nome idêntico,
 * depois os alimentos do plano da refeição, depois o nome mais parecido.
 */
export function matchWeighFood(name: string, foods: WeighFood[], planNames: string[] = []): WeighFood | null {
  const key = normalizeFoodName(name ?? '');
  if (!key) return null;
  const exact = (foods ?? []).find((f) => normalizeFoodName(f.name) === key);
  if (exact) return exact;
  const planKeys = new Set(planNames.map((n) => normalizeFoodName(n)));
  let best: { food: WeighFood; score: number } | null = null;
  for (const food of foods ?? []) {
    const sim = foodNameSimilarity(name, food.name);
    if (sim < NAME_MATCH_MIN) continue;
    const n = normalizeFoodName(food.name);
    const score = sim + (planKeys.has(n) ? 0.3 : 0) + (n.startsWith(key) ? 0.05 : 0) - n.length / 10000;
    if (!best || score > best.score) best = { food, score };
  }
  return best?.food ?? null;
}

export interface WeighFoodResolution {
  /** Alimento escolhido automaticamente; null = o aluno precisa escolher. */
  food: WeighFood | null;
  /** Até 3 opções da base para o aluno escolher (vindas das alternativas da IA). */
  alternatives: WeighFood[];
  /** Nomes que a IA sugeriu e que não existem na base. */
  unmatchedNames: string[];
  /** true = mostrar as alternativas (não achou ou IA insegura). */
  needsChoice: boolean;
  /** Índice do alimento do plano casado automaticamente (escanear prato). */
  planIndex: number | null;
}

export function resolveWeighFood(
  ai: Pick<WeighAiResult, 'alimento' | 'alimento_alternativas' | 'confianca_alimento'>,
  foods: WeighFood[],
  planNames: string[] = [],
  plannedFoods: PlannedFood[] = [],
): WeighFoodResolution {
  // Escanear prato: alimento identificado que está no plano casa direto com ele.
  const planIndex = matchPlanFood(ai.alimento, plannedFoods);
  const planFood = planIndex != null ? planFoodToWeighFood(plannedFoods[planIndex], foods) : null;
  const food = planFood ?? matchWeighFood(ai.alimento, foods, planNames);
  const alternatives: WeighFood[] = [];
  const unmatchedNames: string[] = [];
  for (const name of (ai.alimento_alternativas ?? []).slice(0, 3)) {
    const m = matchWeighFood(name, foods, planNames);
    if (!m) { unmatchedNames.push(name); continue; }
    if (m.id === food?.id || alternatives.some((a) => a.id === m.id)) continue;
    alternatives.push(m);
  }
  return {
    food,
    alternatives: alternatives.slice(0, 3),
    unmatchedNames,
    needsChoice: !food || (Number(ai.confianca_alimento) || 0) < LOW_CONFIDENCE,
    planIndex: planFood ? planIndex : null,
  };
}

/* ----------------------------- Visor ------------------------------------ */

/** Visor ilegível, sem número ou com leitura insegura: o aluno digita as gramas. */
export function isReadingUnreliable(ai: Pick<WeighAiResult, 'visor_legivel' | 'gramas_lidas' | 'confianca_leitura'>): boolean {
  const g = Number(ai.gramas_lidas);
  return !ai.visor_legivel || !Number.isFinite(g) || g <= 0 || (Number(ai.confianca_leitura) || 0) < LOW_CONFIDENCE;
}

export interface TareCheck {
  notTared: boolean;
  /** Gramas do item se o visor ainda somar o que já foi pesado. */
  suggestedGrams: number | null;
}

/**
 * Depois da tara o visor mostra só o alimento novo. Se o peso lido for maior
 * que tudo o que já foi pesado nesta refeição, a balança pode não ter sido
 * zerada — o aluno confirma ou desconta o acumulado.
 */
export function checkTare(readGrams: number | null | undefined, accumulatedGrams: number): TareCheck {
  const read = Number(readGrams);
  const acc = Number(accumulatedGrams) || 0;
  if (!Number.isFinite(read) || read <= 0 || acc <= 0 || read <= acc) return { notTared: false, suggestedGrams: null };
  return { notTared: true, suggestedGrams: round1(read - acc) };
}

/* ----------------------- Previsto × consumido --------------------------- */

/** Gramas de uma quantidade do plano ("150 g", "1 unidade (50g)", "200ml"); null = sem gramas. */
export function parsePlanGrams(qty: string | null | undefined): number | null {
  const s = String(qty ?? '').toLowerCase().replace(',', '.');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|gramas?|ml)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2] === 'kg' ? n * 1000 : n;
}

export interface PlannedFood {
  alimento: string;
  gramas: number | null;
  qty: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface PlannedMeal extends EngineMacros {
  nome: string;
  horario: string | null;
  alimentos: PlannedFood[];
}

/** Previsto da refeição: totais somados dos alimentos (como a dieta do aluno mostra). */
export function plannedFromMeal(meal: ParsedMeal | null | undefined): PlannedMeal {
  const alimentos: PlannedFood[] = (meal?.foods ?? []).map((f) => ({
    alimento: String(f.food ?? ''),
    gramas: parsePlanGrams(f.qty),
    qty: String(f.qty ?? ''),
    kcal: parseNumeric(f.kcal),
    p: parseNumeric(f.p),
    c: parseNumeric(f.c),
    g: parseNumeric(f.g),
  }));
  const sum = alimentos.reduce((a, f) => ({ kcal: a.kcal + f.kcal, p: a.p + f.p, c: a.c + f.c, g: a.g + f.g }), { kcal: 0, p: 0, c: 0, g: 0 });
  return {
    nome: String(meal?.name ?? ''),
    horario: meal?.time ? String(meal.time) : null,
    alimentos,
    kcal: Math.round(sum.kcal),
    p: round1(sum.p),
    c: round1(sum.c),
    g: round1(sum.g),
  };
}

export interface FoodComparison {
  alimento: string;
  previstoGramas: number | null;
  previstoQty: string;
  pesadoGramas: number;
  diffGramas: number | null;
}

export interface MealComparison {
  previsto: EngineMacros;
  consumido: EngineMacros;
  /** consumido − previsto */
  diff: EngineMacros;
  alimentos: FoodComparison[];
  /** Pesados que não estavam no plano. */
  foraDoPlano: WeighedItem[];
  /** Do plano e não pesados. */
  naoPesados: PlannedFood[];
}

/**
 * Compara a refeição pesada com a prevista. Cada alimento pesado casa com no
 * máximo um alimento do plano (o de nome mais parecido); vários itens do mesmo
 * alimento somam as gramas.
 */
export function compareWeighedMeal(planned: PlannedMeal, items: WeighedItem[]): MealComparison {
  const consumido = sumWeighedItems(items);
  const previsto: EngineMacros = { kcal: planned.kcal, p: planned.p, c: planned.c, g: planned.g };
  const pairs: { item: number; plan: number; score: number }[] = [];
  items.forEach((it, ii) => {
    const idx = it.indice_plano;
    if (idx != null && idx >= 0 && idx < planned.alimentos.length) {
      pairs.push({ item: ii, plan: idx, score: 2 });
      return;
    }
    planned.alimentos.forEach((pf, pi) => {
      const score = foodNameSimilarity(it.alimento, pf.alimento);
      if (score >= NAME_MATCH_MIN) pairs.push({ item: ii, plan: pi, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const itemToPlan = new Map<number, number>();
  for (const p of pairs) {
    if (itemToPlan.has(p.item)) continue;
    // Um alimento do plano pode receber vários itens do MESMO alimento.
    const taken = Array.from(itemToPlan.entries()).find(([, plan]) => plan === p.plan);
    if (taken && p.score < 2 && normalizeFoodName(items[taken[0]].alimento) !== normalizeFoodName(items[p.item].alimento)) continue;
    itemToPlan.set(p.item, p.plan);
  }
  const grams = new Map<number, number>();
  itemToPlan.forEach((plan, item) => grams.set(plan, (grams.get(plan) ?? 0) + (Number(items[item].gramas) || 0)));
  const alimentos: FoodComparison[] = planned.alimentos
    .map((pf, pi) => ({ pf, pi }))
    .filter(({ pi }) => grams.has(pi))
    .map(({ pf, pi }) => {
      const pesado = round1(grams.get(pi) ?? 0);
      return {
        alimento: pf.alimento,
        previstoGramas: pf.gramas,
        previstoQty: pf.qty,
        pesadoGramas: pesado,
        diffGramas: pf.gramas != null ? round1(pesado - pf.gramas) : null,
      };
    });
  return {
    previsto,
    consumido: { kcal: consumido.kcal, p: consumido.p, c: consumido.c, g: consumido.g },
    diff: {
      kcal: Math.round(consumido.kcal - previsto.kcal),
      p: round1(consumido.p - previsto.p),
      c: round1(consumido.c - previsto.c),
      g: round1(consumido.g - previsto.g),
    },
    alimentos,
    foraDoPlano: items.filter((_, i) => !itemToPlan.has(i)),
    naoPesados: planned.alimentos.filter((_, pi) => !grams.has(pi)),
  };
}

const fmtG = (n: number) => `${Math.round(n)} g`;

/** "Arroz: previsto 150 g, pesou 180 g" */
export function formatFoodComparison(row: FoodComparison): string {
  const previsto = row.previstoGramas != null ? fmtG(row.previstoGramas) : row.previstoQty || '—';
  return `${row.alimento}: previsto ${previsto}, pesou ${fmtG(row.pesadoGramas)}`;
}

/* ----------------------------- Permissão -------------------------------- */

/** Só o admin liga `students_profile.premium_scale`; qualquer outro valor = sem acesso. */
export const canWeighMeals = (profile: { premium_scale?: boolean | null } | null | undefined): boolean =>
  profile?.premium_scale === true;

/* ----------------------------- Imagem ----------------------------------- */

/** Dimensões para caber em `max` no lado maior, sem ampliar. */
export function fitWithin(width: number, height: number, max = WEIGH_IMAGE_MAX_SIDE): { width: number; height: number } {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

/* ---------------- Pesar alimentos da dieta (só lê o peso) --------------- */

const PLAN_ONLY_PREFIX = 'plano:';
export const isPlanOnlyFoodId = (id: string | null | undefined) => String(id ?? '').startsWith(PLAN_ONLY_PREFIX);

/** Alimento do plano mais parecido com o nome; null quando nenhum passa do mínimo. */
export function matchPlanFood(name: string, plannedFoods: PlannedFood[]): number | null {
  let best: { idx: number; score: number } | null = null;
  (plannedFoods ?? []).forEach((pf, idx) => {
    const score = foodNameSimilarity(name, pf.alimento);
    if (score >= NAME_MATCH_MIN && (!best || score > best.score)) best = { idx, score };
  });
  return best ? (best as { idx: number }).idx : null;
}

/**
 * Alimento do plano como registro "por 100 g". Com gramas previstas, os macros
 * vêm do próprio plano (pesar o previsto dá exatamente o previsto); sem gramas,
 * usa o alimento da base com o mesmo nome. O nome é sempre o do plano.
 */
export function planFoodToWeighFood(pf: PlannedFood | null | undefined, foods: WeighFood[]): WeighFood | null {
  if (!pf) return null;
  const base = matchWeighFood(pf.alimento, foods);
  const grams = Number(pf.gramas) || 0;
  const hasMacros = pf.kcal > 0 || pf.p > 0 || pf.c > 0 || pf.g > 0;
  if (grams > 0 && hasMacros) {
    const per100 = 100 / grams;
    return {
      id: base?.id ?? `${PLAN_ONLY_PREFIX}${normalizeFoodName(pf.alimento)}`,
      name: pf.alimento,
      calories: pf.kcal * per100,
      protein: pf.p * per100,
      carbs: pf.c * per100,
      fats: pf.g * per100,
      portion_size: 100,
    };
  }
  return base ? { ...base, name: pf.alimento } : null;
}

/** Item pesado de um alimento do plano: macros recalculados para o peso lido. */
export function buildPlanWeighedItem(
  pf: PlannedFood,
  planIndex: number,
  grams: number,
  foods: WeighFood[],
  opts: { readGrams?: number | null; override?: WeighFood | null } = {},
): WeighedItem | null {
  const food = opts.override ?? planFoodToWeighFood(pf, foods);
  if (!food) return null;
  const readG = opts.readGrams ?? null;
  const edited = !!opts.override || readG == null || Math.abs((Number(grams) || 0) - readG) > 0.05;
  return buildWeighedItem(food, grams, { edited, readGrams: readG, planIndex });
}

/** "Arroz branco — pesou 182 g (previsto 150 g, +32 g)" */
export function formatPlanWeighLine(name: string, grams: number, planned: Pick<PlannedFood, 'gramas' | 'qty'>): string {
  const g = Math.round(Number(grams) || 0);
  if (planned.gramas == null) return `${name} — pesou ${g} g (previsto ${planned.qty || '—'})`;
  const prev = Math.round(planned.gramas);
  const diff = g - prev;
  return `${name} — pesou ${g} g (previsto ${prev} g, ${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff)} g)`;
}

/** Progresso "2 de 5" no modo alimentos da dieta. */
export const planProgressLabel = (index: number, total: number) => `${Math.min(index + 1, total)} de ${total}`;

/** Próximo alimento do plano ainda não pesado depois de `from` (na ordem da refeição); null = acabou. */
export function nextPlanFoodIndex(from: number, total: number, weighed: number[]): number | null {
  for (let i = from + 1; i < total; i++) if (!weighed.includes(i)) return i;
  return null;
}
