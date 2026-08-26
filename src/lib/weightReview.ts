/**
 * WEIGHT REVIEW ENGINE (determinístico).
 *
 * Decide se uma revisão automática da dieta pode sequer ser considerada.
 * A IA NUNCA decide elegibilidade — apenas propõe o menor ajuste possível
 * DEPOIS que este motor autorizar.
 *
 * Espelhado em `supabase/functions/_shared/weightReviewPolicy.ts`.
 * Qualquer alteração aqui deve ser replicada lá.
 */

import {
  WEIGHT_CHECKIN_INTERVAL_DAYS,
  daysBetweenIso,
  isValidWeightKg,
  todayIso,
} from './weightCheckin';

/** Thresholds configuráveis — nada de magic numbers espalhados. */
export const WEIGHT_REVIEW_CONFIG = {
  /** Intervalo aceito entre os dois pesos comparados (aprox. 15 dias). */
  minIntervalDays: 12,
  maxIntervalDays: 18,
  /**
   * Redução considerada relevante no período (% do peso corporal).
   * Abaixo disso em cutting = estagnação.
   */
  meaningfulLossPercent: 0.5,
  /** Aderência mínima (0..1) para justificar corte calórico. */
  minAdherencePercent: 0.6,
  /** Dias mínimos de registro no período para confiar na aderência. */
  minLoggedDays: 5,
  /** Bloqueio de novo autoajuste antes de um novo ciclo válido. */
  minDaysSinceLastAdjustment: WEIGHT_CHECKIN_INTERVAL_DAYS,
  /** Faixa de redução calórica permitida no primeiro ajuste. */
  minCalorieReductionPercent: 3,
  maxCalorieReductionPercent: 7,
} as const;

export type WeightReviewReason =
  | 'not_due'
  | 'not_cutting'
  | 'insufficient_weights'
  | 'invalid_interval'
  | 'no_active_diet'
  | 'low_adherence'
  | 'recent_adjustment'
  | 'progressing'
  | 'eligible';

export interface WeightEntry {
  /** YYYY-MM-DD */
  date: string;
  kg: number;
}

export interface AdherenceSummary {
  /** 0..1 — proporção de refeições concluídas no período, ou null se indisponível. */
  mealAdherence: number | null;
  /** Dias com qualquer registro no período. */
  daysLogged: number;
  /** Treinos concluídos no período. */
  workoutsCompleted: number;
}

export interface WeightReviewInput {
  goal: string | null | undefined;
  /** Registros válidos, qualquer ordem. */
  weights: WeightEntry[];
  hasActiveDiet: boolean;
  /** Data (YYYY-MM-DD) do último autoajuste por peso, se houver. */
  lastAutoAdjustmentDate?: string | null;
  adherence?: AdherenceSummary;
  today?: string;
}

export interface WeightReviewResult {
  eligible: boolean;
  reason: WeightReviewReason;
  dietReviewRequired: boolean;
  currentWeightKg: number | null;
  previousWeightKg: number | null;
  deltaKg: number | null;
  deltaPercent: number | null;
  daysBetween: number | null;
  adherenceSummary: AdherenceSummary | null;
}

const CUTTING_TOKENS = [
  'cutting',
  'cut',
  'perda de gordura',
  'perder gordura',
  'perda de peso',
  'perder peso',
  'emagrec',
  'definic',
  'definiç',
  'secar',
  'deficit',
  'défic',
];

export function isCuttingGoal(goal: string | null | undefined): boolean {
  if (!goal) return false;
  const normalized = goal
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return CUTTING_TOKENS.some((t) =>
    normalized.includes(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
  );
}

/** Ordena e higieniza registros: mais recente primeiro. */
export function normalizeWeights(entries: WeightEntry[]): WeightEntry[] {
  return entries
    .filter((e) => e && typeof e.date === 'string' && isValidWeightKg(e.kg))
    .map((e) => ({ date: e.date.slice(0, 10), kg: Number(e.kg) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function base(result: Partial<WeightReviewResult>): WeightReviewResult {
  return {
    eligible: false,
    reason: 'not_due',
    dietReviewRequired: false,
    currentWeightKg: null,
    previousWeightKg: null,
    deltaKg: null,
    deltaPercent: null,
    daysBetween: null,
    adherenceSummary: null,
    ...result,
  };
}

export function evaluateWeightReview(input: WeightReviewInput): WeightReviewResult {
  const today = input.today ?? todayIso();
  const adherence = input.adherence ?? null;
  const weights = normalizeWeights(input.weights ?? []);

  if (weights.length < 2) {
    return base({
      reason: 'insufficient_weights',
      currentWeightKg: weights[0]?.kg ?? null,
      adherenceSummary: adherence,
    });
  }

  const current = weights[0];
  const previous = weights[1];
  const deltaKg = Number((current.kg - previous.kg).toFixed(2));
  const deltaPercent = Number(((deltaKg / previous.kg) * 100).toFixed(2));
  const daysBetween = daysBetweenIso(previous.date, current.date);

  const measured = {
    currentWeightKg: current.kg,
    previousWeightKg: previous.kg,
    deltaKg,
    deltaPercent,
    daysBetween,
    adherenceSummary: adherence,
  };

  if (!isCuttingGoal(input.goal)) {
    return base({ ...measured, reason: 'not_cutting' });
  }

  if (!input.hasActiveDiet) {
    return base({ ...measured, reason: 'no_active_diet' });
  }

  if (
    daysBetween < WEIGHT_REVIEW_CONFIG.minIntervalDays ||
    daysBetween > WEIGHT_REVIEW_CONFIG.maxIntervalDays
  ) {
    return base({ ...measured, reason: 'invalid_interval' });
  }

  if (input.lastAutoAdjustmentDate) {
    const since = daysBetweenIso(input.lastAutoAdjustmentDate.slice(0, 10), today);
    if (since < WEIGHT_REVIEW_CONFIG.minDaysSinceLastAdjustment) {
      return base({ ...measured, reason: 'recent_adjustment' });
    }
  }

  // Perdeu peso de forma relevante => nada a ajustar.
  if (deltaPercent <= -WEIGHT_REVIEW_CONFIG.meaningfulLossPercent) {
    return base({ ...measured, reason: 'progressing' });
  }

  // Estagnou/subiu: só cortar calorias se a adesão suportar.
  const adherenceOk =
    adherence != null &&
    adherence.daysLogged >= WEIGHT_REVIEW_CONFIG.minLoggedDays &&
    adherence.mealAdherence != null &&
    adherence.mealAdherence >= WEIGHT_REVIEW_CONFIG.minAdherencePercent;

  if (!adherenceOk) {
    return base({ ...measured, reason: 'low_adherence' });
  }

  return base({
    ...measured,
    eligible: true,
    reason: 'eligible',
    dietReviewRequired: true,
  });
}

/**
 * Limite determinístico do ajuste calórico (primeiro corte conservador).
 * Retorna as novas calorias já limitadas à faixa configurada.
 */
export function clampCalorieReduction(
  currentKcal: number,
  proposedKcal: number,
): { newKcal: number; reductionPercent: number; clamped: boolean } {
  const min = WEIGHT_REVIEW_CONFIG.minCalorieReductionPercent;
  const max = WEIGHT_REVIEW_CONFIG.maxCalorieReductionPercent;
  const rawReduction = ((currentKcal - proposedKcal) / currentKcal) * 100;
  const bounded = Math.min(Math.max(rawReduction, min), max);
  const newKcal = Math.round(currentKcal * (1 - bounded / 100));
  return {
    newKcal,
    reductionPercent: Number(bounded.toFixed(2)),
    clamped: Math.abs(bounded - rawReduction) > 0.01,
  };
}

export function describeReviewReason(reason: WeightReviewReason): string {
  switch (reason) {
    case 'insufficient_weights':
      return 'Registros de peso insuficientes para análise.';
    case 'not_cutting':
      return 'Objetivo atual não é perda de gordura — sem ajuste automático.';
    case 'invalid_interval':
      return 'Intervalo entre pesagens fora da janela de 15 dias.';
    case 'no_active_diet':
      return 'Nenhuma dieta ativa para revisar.';
    case 'low_adherence':
      return 'Peso sem redução, mas adesão insuficiente para justificar corte calórico.';
    case 'recent_adjustment':
      return 'Ajuste automático recente — aguardando novo ciclo.';
    case 'progressing':
      return 'Progressão dentro do esperado.';
    case 'eligible':
      return 'Elegível para revisão automática da dieta.';
    default:
      return 'Sem check-in pendente.';
  }
}
