/**
 * Pesar refeição — CALIBRAÇÃO das gramas estimadas ("Prato pronto" e qualquer
 * item com origem 'estimado'). O app aprende com as correções: cada estimativa
 * guarda as gramas ORIGINAIS da IA, e uma correção é a razão real/estimado.
 * Regras puras: nada aqui chama a IA, o banco ou o navegador.
 */
import { normalizeFoodName } from '@/lib/nutritionEngine';
import {
  compareWeighedMeal, isEstimatedItem, isPlanOnlyFoodId, mealConsumedTotals, round1,
  type PlannedMeal, type UnweighedEntry, type WeighFood, type WeighLogRecord, type WeighedItem,
} from './index';
import { rebuildWeighedItem, startFromWeighLog, upsertWeighedItem, weighFoodForItem } from './editItems';

export type CorrectionSource = 'aluno' | 'admin' | 'balanca';
export const CORRECTION_SOURCE_LABEL: Record<CorrectionSource, string> = { aluno: 'Aluno', admin: 'Admin', balanca: 'Balança' };

/** Correções fora disso (real/estimado) são absurdas e ficam de fora. */
export const MIN_RATIO = 0.3;
export const MAX_RATIO = 3;
/** Limites do fator aplicado. */
export const FACTOR_MIN = 0.6;
export const FACTOR_MAX = 1.6;
/** Só as últimas correções contam. */
export const MAX_SAMPLES = 20;
/** Mínimo de amostras por nível. */
export const MIN_STUDENT_FOOD = 2;
export const MIN_STUDENT_ALL = 3;
export const MIN_FOOD_ALL = 5;
/** Correções do aluno mandadas como exemplo para a IA. */
export const PROMPT_CORRECTIONS = 5;

export const CALIBRATION_SETTING_KEY = 'estimate_calibration_enabled';
export const PLATE_SCALE_DISPLAY_HINT = 'Deixa o visor da balança aparecendo — assim a soma fica exata';

/** Liga/desliga global (app_settings): ligado por padrão, inclusive sem registro. */
export function calibrationEnabledFrom(value: unknown): boolean {
  if (value === false || value === 'false' || value === 0) return false;
  if (value && typeof value === 'object' && (value as { enabled?: unknown }).enabled === false) return false;
  return true;
}

/** Identidade do alimento para agrupar correções: o id da base, ou o nome normalizado (alimento só do plano). */
export function foodKey(foodId: string | null | undefined, name: string): string {
  if (foodId && !isPlanOnlyFoodId(foodId)) return foodId;
  return `nm:${normalizeFoodName(name ?? '')}`;
}

export function isPlausibleCorrection(estimated: number, real: number): boolean {
  const e = Number(estimated);
  const r = Number(real);
  if (!(e > 0) || !(r > 0)) return false;
  const k = r / e;
  return k >= MIN_RATIO && k <= MAX_RATIO;
}

export function median(xs: number[]): number | null {
  const v = (xs ?? []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export const clampFactor = (f: number) => Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, f));

/** Razões real/estimado, da mais recente para a mais antiga. */
export interface CalibrationSamples {
  /** Do aluno, por alimento. */
  mineFood: Record<string, number[]>;
  /** Do aluno, todos os alimentos. */
  mine: number[];
  /** Do alimento, todos os alunos. */
  food: Record<string, number[]>;
}
export const EMPTY_SAMPLES: CalibrationSamples = { mineFood: {}, mine: [], food: {} };

export type FactorScope = 'aluno_alimento' | 'aluno' | 'alimento' | 'nenhum';
export interface CalibrationFactor { factor: number; scope: FactorScope; samples: number }
export const NO_CALIBRATION: CalibrationFactor = { factor: 1, scope: 'nenhum', samples: 0 };

const lastValid = (xs: number[] | undefined) =>
  (xs ?? []).filter((k) => Number.isFinite(k) && k >= MIN_RATIO && k <= MAX_RATIO).slice(0, MAX_SAMPLES);

/**
 * Fator = mediana de real/estimado: (aluno, alimento) com ≥ 2; senão (aluno,
 * todos) com ≥ 3; senão (alimento, todos os alunos) com ≥ 5; senão 1.
 * Sempre entre 0,6 e 1,6, com as últimas 20 correções de cada nível.
 */
export function calibrationFactor(key: string, samples: CalibrationSamples | null | undefined): CalibrationFactor {
  const s = samples ?? EMPTY_SAMPLES;
  const levels: [FactorScope, number[], number][] = [
    ['aluno_alimento', lastValid(s.mineFood?.[key]), MIN_STUDENT_FOOD],
    ['aluno', lastValid(s.mine), MIN_STUDENT_ALL],
    ['alimento', lastValid(s.food?.[key]), MIN_FOOD_ALL],
  ];
  for (const [scope, xs, min] of levels) {
    if (xs.length >= min) {
      const m = median(xs);
      if (m != null) return { factor: Math.round(clampFactor(m) * 1000) / 1000, scope, samples: xs.length };
    }
  }
  return NO_CALIBRATION;
}

/** Linhas da função estimate_calibration_samples → amostras. */
export function samplesFromRpc(rows: { scope: string; food_key: string; ratio: number | string }[] | null | undefined): CalibrationSamples {
  const out: CalibrationSamples = { mineFood: {}, mine: [], food: {} };
  for (const r of rows ?? []) {
    const k = Number(r?.ratio);
    if (!Number.isFinite(k)) continue;
    if (r.scope === 'aluno') out.mine.push(k);
    else if (r.scope === 'aluno_alimento') (out.mineFood[r.food_key] ??= []).push(k);
    else if (r.scope === 'alimento') (out.food[r.food_key] ??= []).push(k);
  }
  return out;
}

export interface CorrectionRecord {
  id?: string;
  student_id: string;
  food_key: string;
  food_name?: string;
  estimated_g: number;
  adjusted_g?: number | null;
  real_g: number;
  fonte?: CorrectionSource | string;
  created_at: string;
}

/** Correções completas (admin) → amostras; `studentId` null = só o nível "alimento, todos os alunos". */
export function samplesFromCorrections(rows: CorrectionRecord[], studentId: string | null): CalibrationSamples {
  const sorted = [...(rows ?? [])]
    .filter((r) => isPlausibleCorrection(r.estimated_g, r.real_g))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const out: CalibrationSamples = { mineFood: {}, mine: [], food: {} };
  for (const r of sorted) {
    const k = Number(r.real_g) / Number(r.estimated_g);
    (out.food[r.food_key] ??= []).push(k);
    if (studentId && r.student_id === studentId) {
      out.mine.push(k);
      (out.mineFood[r.food_key] ??= []).push(k);
    }
  }
  return out;
}

export const factorPercent = (factor: number) => Math.round((Number(factor) - 1) * 100);

/** "Ajustado pelo seu histórico (+40%)"; null sem ajuste. */
export function formatCalibrationLine(f: Pick<CalibrationFactor, 'factor' | 'scope'> | null | undefined): string | null {
  if (!f || f.scope === 'nenhum') return null;
  const pct = factorPercent(f.factor);
  if (pct === 0) return null;
  const sign = pct > 0 ? `+${pct}` : `${pct}`;
  return f.scope === 'alimento'
    ? `Ajustado pelo histórico dos alunos (${sign}%)`
    : `Ajustado pelo seu histórico (${sign}%)`;
}

/** Gramas e faixa da IA já ajustadas pelo fator. */
export function applyCalibration(grams: number, range: [number, number] | null, factor: number): { grams: number; range: [number, number] | null } {
  const f = Number(factor) > 0 ? Number(factor) : 1;
  return {
    grams: Math.max(0, Math.round((Number(grams) || 0) * f)),
    range: range ? [Math.round(range[0] * f), Math.round(range[1] * f)] : null,
  };
}

export const newEstimateId = (): string => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `est-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/* ---------- Gravar correções ---------- */

export interface EstimateCorrectionRow {
  student_id: string;
  estimate_id: string;
  food_id: string | null;
  food_key: string;
  food_name: string;
  estimated_g: number;
  adjusted_g: number | null;
  factor: number | null;
  real_g: number;
  fonte: CorrectionSource;
  meal_log_id: string | null;
}

const correctionRow = (item: WeighedItem, realG: number, ctx: { studentId: string; mealLogId: string | null; fonte: CorrectionSource }): EstimateCorrectionRow => ({
  student_id: ctx.studentId,
  estimate_id: String(item.estimativa_id),
  food_id: item.food_id && !isPlanOnlyFoodId(item.food_id) ? item.food_id : null,
  food_key: foodKey(item.food_id, item.alimento),
  food_name: item.alimento,
  estimated_g: round1(Number(item.gramas_estimadas)),
  adjusted_g: item.gramas_ajustadas != null && Number(item.gramas_ajustadas) > 0 ? round1(Number(item.gramas_ajustadas)) : null,
  factor: item.fator_calibracao != null && Number(item.fator_calibracao) > 0 ? Number(item.fator_calibracao) : null,
  real_g: round1(realG),
  fonte: ctx.fonte,
  meal_log_id: ctx.mealLogId,
});

/**
 * Correções a gravar ao salvar a refeição: cada item estimado cujas gramas o
 * aluno (ou o admin) mudou vira uma correção contra a estimativa ORIGINAL da
 * IA (uma por estimativa — editar de novo só atualiza). Alimento trocado ou
 * correção absurda não conta (e apaga a anterior daquela estimativa).
 */
export function correctionsFromItems(
  items: WeighedItem[],
  ctx: { studentId: string; mealLogId: string | null; fonte?: CorrectionSource },
): { upserts: EstimateCorrectionRow[]; removeIds: string[] } {
  const fonte = ctx.fonte ?? 'aluno';
  const upserts: EstimateCorrectionRow[] = [];
  const removeIds: string[] = [];
  for (const it of items ?? []) {
    if (!isEstimatedItem(it) || !it.estimativa_id || !(Number(it.gramas_estimadas) > 0)) continue;
    if (it.alimento_corrigido) { removeIds.push(it.estimativa_id); continue; }
    if (!it.gramas_corrigidas) continue;
    if (!isPlausibleCorrection(Number(it.gramas_estimadas), Number(it.gramas))) { removeIds.push(it.estimativa_id); continue; }
    upserts.push(correctionRow(it, Number(it.gramas), { studentId: ctx.studentId, mealLogId: ctx.mealLogId, fonte }));
  }
  return { upserts, removeIds };
}

/** Um alimento estimado depois pesado na balança na mesma refeição: correção 'balanca'. */
export function scaleCorrectionRow(estimated: WeighedItem, weighed: WeighedItem, studentId: string): EstimateCorrectionRow | null {
  if (!isEstimatedItem(estimated) || isEstimatedItem(weighed)) return null;
  if (!estimated.estimativa_id || !(Number(estimated.gramas_estimadas) > 0)) return null;
  if (estimated.alimento_corrigido) return null;
  if (!isPlausibleCorrection(Number(estimated.gramas_estimadas), Number(weighed.gramas))) return null;
  return correctionRow(estimated, Number(weighed.gramas), { studentId, mealLogId: null, fonte: 'balanca' });
}

/** Item estimado que o novo item pesado substitui: mesmo alimento do plano, mesmo id da base ou mesmo nome. */
export function findEstimatedMatch(items: WeighedItem[], item: WeighedItem): number {
  const list = items ?? [];
  const byPlan = typeof item.indice_plano === 'number'
    ? list.findIndex((it) => isEstimatedItem(it) && it.indice_plano === item.indice_plano) : -1;
  if (byPlan >= 0) return byPlan;
  const byId = item.food_id ? list.findIndex((it) => isEstimatedItem(it) && it.food_id === item.food_id) : -1;
  if (byId >= 0) return byId;
  const name = normalizeFoodName(item.alimento);
  return list.findIndex((it) => isEstimatedItem(it) && normalizeFoodName(it.alimento) === name);
}

/**
 * Entra um item pesado na balança: se o mesmo alimento estava estimado, o
 * pesado ocupa o lugar dele (e devolve o estimado para virar correção);
 * senão segue a regra normal (plano: só aquele item; escanear: soma).
 */
export function placeWeighedItem(
  items: WeighedItem[],
  photos: string[],
  item: WeighedItem,
  photo: string,
  fallback: 'upsert' | 'append',
): { items: WeighedItem[]; photos: string[]; replaced: WeighedItem | null } {
  const i = isEstimatedItem(item) ? -1 : findEstimatedMatch(items, item);
  if (i >= 0) {
    const nextItems = [...items];
    const nextPhotos = [...(photos ?? [])];
    const replaced = nextItems[i];
    nextItems[i] = item;
    nextPhotos[i] = photo;
    while (nextPhotos.length < nextItems.length) nextPhotos.push('');
    return { items: nextItems, photos: nextPhotos, replaced };
  }
  if (fallback === 'upsert') return { ...upsertWeighedItem(items, photos, item, photo), replaced: null };
  return { items: [...(items ?? []), item], photos: [...(photos ?? []), photo], replaced: null };
}

/* ---------- Exemplos para a IA ---------- */

export interface PromptCorrection { alimento: string; estimado: number; real: number }

/** Últimas 5 correções do aluno (mais recentes primeiro), prontas para o plate_estimate. */
export function recentPromptCorrections(
  rows: { food_name: string; estimated_g: number; real_g: number; created_at?: string }[] | null | undefined,
  limit = PROMPT_CORRECTIONS,
): PromptCorrection[] {
  return [...(rows ?? [])]
    .filter((r) => String(r?.food_name ?? '').trim() && isPlausibleCorrection(r.estimated_g, r.real_g))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, limit)
    .map((r) => ({ alimento: String(r.food_name).trim(), estimado: Math.round(Number(r.estimated_g)), real: Math.round(Number(r.real_g)) }));
}

/** "Iogurte natural integral: você estimou 150 g, era 161 g" */
export const formatPromptCorrection = (c: PromptCorrection) => `${c.alimento}: você estimou ${c.estimado} g, era ${c.real} g`;

/* ---------- Admin ---------- */

export interface AdminEstimateEdit {
  items: WeighedItem[];
  unweighed: UnweighedEntry[];
  planned: PlannedMeal & { comparacao: ReturnType<typeof compareWeighedMeal>['alimentos'] };
  totals: { kcal: number; p: number; c: number; g: number };
  correction: EstimateCorrectionRow | null;
}

/**
 * O admin corrige as gramas de um item estimado já salvo: macros do item,
 * totais e previsto × consumido recalculados, e a correção entra como 'admin'
 * (contra a estimativa original da IA; itens antigos sem ela usam as gramas salvas).
 */
export function adminCorrectEstimatedItem(
  log: WeighLogRecord,
  studentId: string,
  index: number,
  grams: number,
  foods: WeighFood[] = [],
): AdminEstimateEdit | null {
  const items = Array.isArray(log?.items) ? log.items : [];
  const item = items[index];
  const g = Number(grams);
  if (!item || !isEstimatedItem(item) || !(g > 0)) return null;
  const start = startFromWeighLog(log);
  const base: WeighedItem = {
    ...item,
    estimativa_id: item.estimativa_id || newEstimateId(),
    gramas_estimadas: Number(item.gramas_estimadas) > 0 ? Number(item.gramas_estimadas) : Number(item.gramas),
  };
  const food = weighFoodForItem(base, start.planned, foods);
  const next = rebuildWeighedItem(base, { food, grams: g, planIndex: base.indice_plano ?? null });
  next.gramas_corrigidas = true;
  next.corrigido_por_admin = true;
  const nextItems = items.map((it, i) => (i === index ? next : it));
  const unweighed = Array.isArray(log.unweighed) ? log.unweighed : [];
  const totals = mealConsumedTotals(nextItems, unweighed);
  const comparison = compareWeighedMeal(start.planned, nextItems, unweighed);
  const correction = !next.alimento_corrigido && isPlausibleCorrection(Number(base.gramas_estimadas), g)
    ? correctionRow(next, g, { studentId, mealLogId: null, fonte: 'admin' })
    : null;
  return {
    items: nextItems,
    unweighed,
    planned: { ...start.planned, comparacao: comparison.alimentos },
    totals: { kcal: totals.kcal, p: totals.p, c: totals.c, g: totals.g },
    correction,
  };
}

/* ---------- Erro médio ---------- */

export interface WeeklyEstimateError { weekStart: string; n: number; before: number; after: number }

const mondayOf = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
};

const pctError = (guess: number, real: number) => (Math.abs(guess - real) / real) * 100;

/**
 * Erro médio (%) das estimativas por semana: antes do ajuste (IA original) ×
 * depois do ajuste (o que o app sugeriu), nas últimas `weeks` semanas.
 */
export function estimateErrorByWeek(rows: CorrectionRecord[], now: Date = new Date(), weeks = 8): WeeklyEstimateError[] {
  const cutoff = mondayOf(new Date(now.getTime() - (weeks - 1) * 7 * 86400000).toISOString());
  const acc = new Map<string, { n: number; before: number; after: number }>();
  for (const r of rows ?? []) {
    const est = Number(r.estimated_g);
    const real = Number(r.real_g);
    if (!isPlausibleCorrection(est, real)) continue;
    const w = mondayOf(r.created_at);
    if (!w || w < cutoff) continue;
    const adj = Number(r.adjusted_g) > 0 ? Number(r.adjusted_g) : est;
    const a = acc.get(w) ?? { n: 0, before: 0, after: 0 };
    a.n += 1;
    a.before += pctError(est, real);
    a.after += pctError(adj, real);
    acc.set(w, a);
  }
  return [...acc.entries()]
    .sort((x, y) => y[0].localeCompare(x[0]))
    .map(([weekStart, a]) => ({ weekStart, n: a.n, before: round1(a.before / a.n), after: round1(a.after / a.n) }));
}

/** Diferença da correção em %: real contra a estimativa original (+7%). */
export const correctionDiffPercent = (estimated: number, real: number) =>
  Number(estimated) > 0 ? Math.round(((Number(real) - Number(estimated)) / Number(estimated)) * 100) : 0;
