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
  /** O aluno trocou o alimento que a IA identificou: o nome da IA deixa de valer para casar/repetir. */
  alimento_corrigido?: boolean;
  gramas_lidas?: number | null;
  /** Índice do alimento no plano da refeição, quando casado com ele. */
  indice_plano?: number | null;
  /** Fora do plano: alimento do plano que ele substituiu (o aluno não comeu esse). */
  substituiu?: { indice_plano: number; alimento: string } | null;
  /** Fora do plano e o aluno disse "Não, foi extra". */
  extra?: boolean;
  /** 'estimado' = gramas estimadas pela foto ("Prato pronto"); 'escaneado' = veio do scanner de alimentos; ausente = pesado na balança. */
  origem?: WeighItemOrigin;
  /** Faixa plausível das gramas estimadas pela IA. */
  faixa_gramas?: [number, number] | null;
}

export type WeighItemOrigin = 'pesado' | 'estimado' | 'escaneado';
export const isEstimatedItem = (it: Pick<WeighedItem, 'origem'> | null | undefined) => it?.origem === 'estimado';
export const isScannedItem = (it: Pick<WeighedItem, 'origem'> | null | undefined) => it?.origem === 'escaneado';

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
  /** Alguma parte veio de "Prato pronto" (gramas estimadas pela foto). */
  estimado?: boolean;
  /** Veio do scanner de alimentos. */
  escaneado?: boolean;
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
/**
 * Pareia cada item pesado com no máximo um alimento do plano: primeiro pelo
 * índice salvo, depois pelo nome mais parecido; vários itens do MESMO
 * alimento podem cair no mesmo alimento do plano.
 */
export function pairItemsToPlan(planned: PlannedMeal, items: WeighedItem[]): Map<number, number> {
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
    const taken = Array.from(itemToPlan.entries()).find(([, plan]) => plan === p.plan);
    if (taken && p.score < 2 && normalizeFoodName(items[taken[0]].alimento) !== normalizeFoodName(items[p.item].alimento)) continue;
    itemToPlan.set(p.item, p.plan);
  }
  return itemToPlan;
}

/**
 * Compara a refeição pesada com a prevista. Com `unweighed`, os alimentos
 * "comi sem pesar" contam a quantidade prevista no consumido e saem de
 * `naoPesados` (a escolha do aluno já responde por eles).
 */
export function compareWeighedMeal(
  planned: PlannedMeal,
  items: WeighedItem[],
  unweighed: UnweighedEntry[] = [],
): MealComparison {
  const consumido = mealConsumedTotals(items, unweighed);
  const previsto: EngineMacros = { kcal: planned.kcal, p: planned.p, c: planned.c, g: planned.g };
  const itemToPlan = pairItemsToPlan(planned, items);
  const grams = new Map<number, number>();
  const estimated = new Set<number>();
  const scanned = new Set<number>();
  itemToPlan.forEach((plan, item) => {
    grams.set(plan, (grams.get(plan) ?? 0) + (Number(items[item].gramas) || 0));
    if (isEstimatedItem(items[item])) estimated.add(plan);
    if (isScannedItem(items[item])) scanned.add(plan);
  });
  const answered = new Set(unweighed.map((u) => u.indice_plano));
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
        ...(estimated.has(pi) ? { estimado: true } : {}),
        ...(scanned.has(pi) ? { escaneado: true } : {}),
      };
    });
  return {
    previsto,
    consumido,
    diff: {
      kcal: Math.round(consumido.kcal - previsto.kcal),
      p: round1(consumido.p - previsto.p),
      c: round1(consumido.c - previsto.c),
      g: round1(consumido.g - previsto.g),
    },
    alimentos,
    foraDoPlano: items.filter((_, i) => !itemToPlan.has(i)),
    naoPesados: planned.alimentos.filter((_, pi) => !grams.has(pi) && !answered.has(pi)),
  };
}

const fmtG = (n: number) => `${Math.round(n)} g`;

/** "Arroz: previsto 150 g, pesou 180 g" */
export function formatFoodComparison(row: FoodComparison): string {
  const previsto = row.previstoGramas != null ? fmtG(row.previstoGramas) : row.previstoQty || '—';
  return `${row.alimento}: previsto ${previsto}, ${row.estimado ? 'estimado ~' : row.escaneado ? 'escaneado ' : 'pesou '}${fmtG(row.pesadoGramas)}`;
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

/* ------------------- Escanear prato: itens 2+ e repetidos ---------------- */

export const REPEATED_FOOD_MESSAGE = 'Esse alimento já foi pesado. O que você adicionou?';

export interface PendingPlanFood {
  index: number;
  food: PlannedFood;
}

const isSameAsWeighed = (name: string, item: WeighedItem) =>
  foodNameSimilarity(name, item.alimento) >= NAME_MATCH_MIN ||
  (!!item.alimento_ia && !item.alimento_corrigido && foodNameSimilarity(name, item.alimento_ia) >= NAME_MATCH_MIN);

/** Alimentos previstos da refeição que ainda não foram pesados (na ordem do plano). */
export function pendingPlanFoods(planned: PlannedMeal, items: WeighedItem[]): PendingPlanFood[] {
  const weighedIdx = new Set((items ?? []).map((it) => it.indice_plano).filter((i): i is number => typeof i === 'number'));
  return (planned?.alimentos ?? [])
    .map((food, index) => ({ index, food }))
    .filter(({ index, food }) =>
      food.alimento && !weighedIdx.has(index) &&
      !(items ?? []).some((it) => it.indice_plano == null && isSameAsWeighed(food.alimento, it)));
}

/** Item já pesado que corresponde ao candidato (mesmo índice do plano, mesmo id da base ou mesmo nome). */
export function findRepeatedFood(
  candidate: { name: string; foodId?: string | null; planIndex?: number | null },
  items: WeighedItem[],
): WeighedItem | null {
  if (!candidate?.name?.trim()) return null;
  for (const it of items ?? []) {
    if (candidate.planIndex != null && it.indice_plano === candidate.planIndex) return it;
    if (candidate.foodId && !isPlanOnlyFoodId(candidate.foodId) && it.food_id === candidate.foodId) return it;
    if (isSameAsWeighed(candidate.name, it)) return it;
  }
  return null;
}

export interface ScanWeighResolution extends WeighFoodResolution {
  /** Item já pesado que a IA devolveu de novo — não é aceito automaticamente. */
  repeated: WeighedItem | null;
  /** Alimentos previstos ainda não pesados (chips rápidos). */
  pending: PendingPlanFood[];
}

/**
 * Escanear prato: prioriza os alimentos previstos ainda não pesados; se a IA
 * devolver algo que já foi pesado nesta refeição, nada é escolhido sozinho e
 * o aluno escolhe entre os não pesados, as alternativas da IA ou a busca.
 */
export function resolveScanWeigh(
  ai: Pick<WeighAiResult, 'alimento' | 'alimento_alternativas' | 'confianca_alimento'>,
  foods: WeighFood[],
  planned: PlannedMeal,
  items: WeighedItem[],
): ScanWeighResolution {
  const pending = pendingPlanFoods(planned, items);
  const pendingFoods = pending.map((p) => p.food);
  const pendingHit = matchPlanFood(ai.alimento, pendingFoods);
  if (pendingHit != null) {
    const pf = pending[pendingHit];
    const base = resolveWeighFood(ai, foods, pendingFoods.map((f) => f.alimento), []);
    const food = planFoodToWeighFood(pf.food, foods);
    if (food) {
      return {
        ...base,
        food,
        alternatives: base.alternatives.filter((a) => a.id !== food.id && !findRepeatedFood({ name: a.name, foodId: a.id }, items)),
        needsChoice: (Number(ai.confianca_alimento) || 0) < LOW_CONFIDENCE,
        planIndex: pf.index,
        repeated: null,
        pending,
      };
    }
  }
  const base = resolveWeighFood(ai, foods, pendingFoods.map((f) => f.alimento), planned?.alimentos ?? []);
  const alternatives = base.alternatives.filter((a) => !findRepeatedFood({ name: a.name, foodId: a.id }, items));
  const repeated = items.length > 0
    ? findRepeatedFood({ name: ai.alimento, foodId: base.food?.id ?? null, planIndex: base.planIndex }, items)
    : null;
  if (repeated) {
    return { ...base, food: null, planIndex: null, alternatives, needsChoice: true, repeated, pending };
  }
  return { ...base, alternatives, repeated: null, pending };
}

/** "Iogurte 154 g · Whey 26 g" */
export const weighedChipsLabel = (items: WeighedItem[]) =>
  (items ?? []).map((it) => `${it.alimento} ${Math.round(it.gramas)} g`).join(' · ');

/** Corpo da chamada `weigh`: a partir do 1º item confirmado SEMPRE vai a foto anterior + itens pesados. */
export function buildScanWeighRequest(input: {
  photo: string;
  items: WeighedItem[];
  photos: string[];
  mealName: string;
  planned: PlannedMeal;
}) {
  const { photo, items, photos, mealName, planned } = input;
  const previousImage = items.length > 0 ? photos[photos.length - 1] || null : null;
  return {
    action: 'weigh' as const,
    image: photo,
    previousImage,
    mealName,
    planFoods: (planned?.alimentos ?? []).map((f) => f.alimento).filter(Boolean),
    pendingPlanFoods: pendingPlanFoods(planned, items).map((p) => p.food.alimento),
    addedFoods: items.map((i) => ({ alimento: i.alimento, gramas: i.gramas })),
  };
}

const TARE_REMARK = /\b(tara|zerad\w*|zerar|tigela|prato|recipiente|pote|vasilha|bowl|cumbuca)\b/i;

/** Observação da IA sobre tara/recipiente só aparece com suspeita real (peso acima do acumulado). */
export function visibleWeighObservation(observacao: string | null | undefined, opts: { tareSuspected: boolean }): string {
  const text = String(observacao ?? '').trim();
  if (!text) return '';
  if (TARE_REMARK.test(text) && !opts.tareSuspected) return '';
  return text;
}

/* ---------- Itens não pesados, substituições e registro do dia ---------- */

export type UnweighedChoice = 'comeu_sem_pesar' | 'nao_comeu';
/** Ao concluir, todo alimento do plano não pesado começa como "Comi sem pesar". */
export const DEFAULT_UNWEIGHED_CHOICE: UnweighedChoice = 'comeu_sem_pesar';

/** Alimento do plano não pesado + escolha do aluno (meal_weigh_logs.unweighed). */
export interface UnweighedEntry {
  indice_plano: number;
  alimento: string;
  gramas: number | null;
  qty: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
  escolha: UnweighedChoice;
}

export function buildUnweighedEntries(
  pending: PendingPlanFood[],
  choices: Record<number, UnweighedChoice | undefined> = {},
): UnweighedEntry[] {
  return (pending ?? []).map(({ index, food }) => ({
    indice_plano: index,
    alimento: food.alimento,
    gramas: food.gramas,
    qty: food.qty,
    kcal: food.kcal,
    p: food.p,
    c: food.c,
    g: food.g,
    escolha: choices[index] ?? DEFAULT_UNWEIGHED_CHOICE,
  }));
}

/** Consumido da refeição: itens pesados + previsto dos "comi sem pesar"; "não comi" conta zero. */
export function mealConsumedTotals(items: WeighedItem[], unweighed: UnweighedEntry[] = []): EngineMacros {
  const w = sumWeighedItems(items);
  const acc = { kcal: w.kcal, p: w.p, c: w.c, g: w.g };
  for (const u of unweighed ?? []) {
    if (u.escolha !== 'comeu_sem_pesar') continue;
    acc.kcal += Number(u.kcal) || 0;
    acc.p += Number(u.p) || 0;
    acc.c += Number(u.c) || 0;
    acc.g += Number(u.g) || 0;
  }
  return { kcal: Math.round(acc.kcal), p: round1(acc.p), c: round1(acc.c), g: round1(acc.g) };
}

const plannedAmount = (u: Pick<UnweighedEntry, 'gramas' | 'qty'>) =>
  u.gramas != null ? `${Math.round(u.gramas)} g` : u.qty || '—';

/** "Banana: comeu sem pesar (previsto 30 g)" / "Banana: não comeu" */
export function formatUnweighedLine(u: UnweighedEntry): string {
  return u.escolha === 'nao_comeu'
    ? `${u.alimento}: não comeu`
    : `${u.alimento}: comeu sem pesar (previsto ${plannedAmount(u)})`;
}

export const substitutionQuestion = (foodName: string) => `A ${foodName} substituiu algum item?`;

/** Itens fora do plano (índices em `items`) — só eles podem ter substituído algo. */
export function outOfPlanItemIndexes(planned: PlannedMeal, items: WeighedItem[]): number[] {
  const paired = pairItemsToPlan(planned, items);
  return items.map((_, i) => i).filter((i) => !paired.has(i));
}

/** Registra no item fora do plano qual alimento não comido ele substituiu (null = "Não, foi extra"). */
export function applySubstitution(
  items: WeighedItem[],
  itemIndex: number,
  replaced: Pick<UnweighedEntry, 'indice_plano' | 'alimento'> | null,
): WeighedItem[] {
  return items.map((it, i) => {
    if (i !== itemIndex) return it;
    return replaced
      ? { ...it, substituiu: { indice_plano: replaced.indice_plano, alimento: replaced.alimento }, extra: false }
      : { ...it, substituiu: null, extra: true };
  });
}

/** Ao mudar um "Não comi" para "Comi sem pesar", a troca que apontava para ele deixa de valer. */
export function dropStaleSubstitutions(items: WeighedItem[], unweighed: UnweighedEntry[]): WeighedItem[] {
  const notEaten = new Set(unweighed.filter((u) => u.escolha === 'nao_comeu').map((u) => u.indice_plano));
  return items.map((it) => (it.substituiu && !notEaten.has(it.substituiu.indice_plano) ? { ...it, substituiu: null } : it));
}

/** "Trocou Banana → Pasta de amendoim" / "Extra: Pasta de amendoim" (null = ainda sem resposta). */
export function formatSwapLine(item: WeighedItem): string | null {
  if (item.substituiu?.alimento) return `Trocou ${item.substituiu.alimento} → ${item.alimento}`;
  if (item.extra) return `Extra: ${item.alimento}`;
  return null;
}

/** Linha de meal_weigh_logs lida pela dieta do aluno. */
export interface WeighLogRecord {
  id: string;
  log_date: string;
  meal_index: number | null;
  items: WeighedItem[] | null;
  unweighed?: UnweighedEntry[] | null;
  planned?: (Partial<PlannedMeal> & { alimentos?: PlannedFood[] }) | null;
  created_at: string;
}

export const weighLogKey = (date: string, mealIndex: number) => `${date}|${mealIndex}`;

/** Registro do dia: para cada (data, refeição) vale a pesagem mais recente; as outras são histórico. */
export function latestWeighLogs<T extends WeighLogRecord>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows ?? []) {
    if (r.meal_index == null || !r.log_date) continue;
    const key = weighLogKey(r.log_date, r.meal_index);
    const prev = out.get(key);
    if (!prev || String(r.created_at) > String(prev.created_at)) out.set(key, r);
  }
  return out;
}

/** Ids das pesagens substituídas por uma mais recente da mesma refeição no mesmo dia. */
export function supersededWeighLogIds(rows: WeighLogRecord[]): Set<string> {
  const latest = latestWeighLogs(rows);
  const ids = new Set<string>();
  for (const r of rows ?? []) {
    if (r.meal_index == null) continue;
    const winner = latest.get(weighLogKey(r.log_date, r.meal_index));
    if (winner && winner.id !== r.id) ids.add(r.id);
  }
  return ids;
}

/** Selo do alimento no card da refeição do dia. */
export type DayFoodWeighStatus = 'pesado' | 'sem_pesar' | 'nao_comeu' | 'fora_do_plano';
export interface DayFoodWeigh {
  status: DayFoodWeighStatus;
  gramas?: number;
  previstoGramas?: number | null;
  previstoQty?: string;
  substituiu?: string | null;
  /** Gramas estimadas pela foto ("Prato pronto"), não pesadas. */
  estimado?: boolean;
  /** Veio do scanner de alimentos. */
  escaneado?: boolean;
}
export interface DayMealFood {
  food: string;
  qty: string;
  kcal: string;
  p: string;
  c: string;
  g: string;
  weigh: DayFoodWeigh;
}

const str = (n: number) => String(round1(Number(n) || 0));

/**
 * Alimentos da refeição como foram consumidos no dia, montados só a partir da
 * pesagem (o plano publicado não muda): pesados com as gramas reais, não
 * pesados conforme a escolha ("não comi" = zero) e fora do plano no fim.
 */
export function dayMealFoodsFromLog(log: WeighLogRecord): DayMealFood[] {
  const items = log.items ?? [];
  const alimentos = log.planned?.alimentos ?? [];
  const planned: PlannedMeal = {
    nome: '', horario: null, alimentos, kcal: 0, p: 0, c: 0, g: 0,
  };
  const paired = pairItemsToPlan(planned, items);
  const byPlan = new Map<number, WeighedItem[]>();
  paired.forEach((pi, ii) => byPlan.set(pi, [...(byPlan.get(pi) ?? []), items[ii]]));
  const choices = new Map((log.unweighed ?? []).map((u) => [u.indice_plano, u.escolha] as const));
  const out: DayMealFood[] = [];
  alimentos.forEach((pf, pi) => {
    const weighed = byPlan.get(pi);
    if (weighed?.length) {
      const sum = sumWeighedItems(weighed);
      out.push({
        food: pf.alimento, qty: `${Math.round(sum.gramas)} g`,
        kcal: String(Math.round(sum.kcal)), p: str(sum.p), c: str(sum.c), g: str(sum.g),
        weigh: {
          status: 'pesado', gramas: sum.gramas, previstoGramas: pf.gramas, previstoQty: pf.qty,
          ...(weighed.some(isEstimatedItem) ? { estimado: true } : {}),
          ...(weighed.some(isScannedItem) ? { escaneado: true } : {}),
        },
      });
      return;
    }
    const notEaten = choices.get(pi) === 'nao_comeu';
    out.push({
      food: pf.alimento, qty: pf.qty,
      kcal: notEaten ? '0' : String(Math.round(pf.kcal)),
      p: notEaten ? '0' : str(pf.p), c: notEaten ? '0' : str(pf.c), g: notEaten ? '0' : str(pf.g),
      weigh: { status: notEaten ? 'nao_comeu' : 'sem_pesar', previstoGramas: pf.gramas, previstoQty: pf.qty },
    });
  });
  items.forEach((it, ii) => {
    if (paired.has(ii)) return;
    out.push({
      food: it.alimento, qty: `${Math.round(Number(it.gramas) || 0)} g`,
      kcal: String(Math.round(Number(it.kcal) || 0)), p: str(it.p), c: str(it.c), g: str(it.g),
      weigh: {
        status: 'fora_do_plano', gramas: Number(it.gramas) || 0, substituiu: it.substituiu?.alimento ?? null,
        ...(isEstimatedItem(it) ? { estimado: true } : {}),
        ...(isScannedItem(it) ? { escaneado: true } : {}),
      },
    });
  });
  return out;
}

/** "pesou 182 g (previsto 150 g)" */
export function formatDayWeighLabel(w: DayFoodWeigh): string {
  if (w.status === 'pesado') {
    const prev = w.previstoGramas != null ? `${Math.round(w.previstoGramas)} g` : w.previstoQty || '—';
    return `${w.estimado ? 'estimado ~' : w.escaneado ? 'escaneado ' : 'pesou '}${Math.round(w.gramas ?? 0)} g (previsto ${prev})`;
  }
  if (w.status === 'sem_pesar') return 'comeu sem pesar';
  if (w.status === 'nao_comeu') return 'não comeu';
  if (w.substituiu) return `no lugar de ${w.substituiu}`;
  return `${w.estimado ? 'estimado ~' : w.escaneado ? 'escaneado ' : 'pesou '}${Math.round(w.gramas ?? 0)} g`;
}

/**
 * Refeições do dia com as pesagens salvas por cima: cada refeição pesada
 * troca os alimentos pelos consumidos; as demais ficam como estão.
 */
export function overlayDayWeighLogs<M extends { foods?: unknown[] }>(
  meals: M[],
  date: string,
  logs: Map<string, WeighLogRecord>,
): { meals: M[]; weighedIndexes: number[] } {
  const weighedIndexes: number[] = [];
  const next = meals.map((m, i) => {
    const log = logs.get(weighLogKey(date, i));
    if (!log) return m;
    weighedIndexes.push(i);
    return { ...m, foods: dayMealFoodsFromLog(log) } as M;
  });
  return { meals: next, weighedIndexes };
}
