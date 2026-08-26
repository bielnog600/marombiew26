/**
 * Espelho servidor de `src/lib/weightCheckin.ts` + `src/lib/weightReview.ts`.
 * Mantenha os dois arquivos sincronizados. Puro: sem I/O e sem dependências.
 */

export const WEIGHT_CHECKIN_INTERVAL_DAYS = 15;

export const WEIGHT_REVIEW_CONFIG = {
  minIntervalDays: 12,
  maxIntervalDays: 18,
  meaningfulLossPercent: 0.5,
  minAdherencePercent: 0.6,
  minLoggedDays: 5,
  minDaysSinceLastAdjustment: WEIGHT_CHECKIN_INTERVAL_DAYS,
  minCalorieReductionPercent: 3,
  maxCalorieReductionPercent: 7,
} as const;

const MIN_KG = 20;
const MAX_KG = 400;

export type WeightReviewReason =
  | "not_due"
  | "not_cutting"
  | "insufficient_weights"
  | "invalid_interval"
  | "no_active_diet"
  | "low_adherence"
  | "recent_adjustment"
  | "progressing"
  | "eligible";

export interface WeightEntry {
  date: string;
  kg: number;
}

export interface AdherenceSummary {
  mealAdherence: number | null;
  daysLogged: number;
  workoutsCompleted: number;
}

export interface WeightReviewInput {
  goal: string | null | undefined;
  weights: WeightEntry[];
  hasActiveDiet: boolean;
  lastAutoAdjustmentDate?: string | null;
  adherence?: AdherenceSummary | null;
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

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toUtcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((toUtcDate(toIso).getTime() - toUtcDate(fromIso).getTime()) / 86_400_000);
}

export function isValidWeightKg(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > MIN_KG && n < MAX_KG;
}

const CUTTING_TOKENS = [
  "cutting",
  "cut",
  "perda de gordura",
  "perder gordura",
  "perda de peso",
  "perder peso",
  "emagrec",
  "definic",
  "secar",
  "deficit",
];

function deaccent(v: string): string {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isCuttingGoal(goal: string | null | undefined): boolean {
  if (!goal) return false;
  const normalized = deaccent(goal);
  return CUTTING_TOKENS.some((t) => normalized.includes(deaccent(t)));
}

export function normalizeWeights(entries: WeightEntry[]): WeightEntry[] {
  return (entries ?? [])
    .filter((e) => e && typeof e.date === "string" && isValidWeightKg(e.kg))
    .map((e) => ({ date: e.date.slice(0, 10), kg: Number(e.kg) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function base(result: Partial<WeightReviewResult>): WeightReviewResult {
  return {
    eligible: false,
    reason: "not_due",
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
      reason: "insufficient_weights",
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

  if (!isCuttingGoal(input.goal)) return base({ ...measured, reason: "not_cutting" });
  if (!input.hasActiveDiet) return base({ ...measured, reason: "no_active_diet" });

  if (
    daysBetween < WEIGHT_REVIEW_CONFIG.minIntervalDays ||
    daysBetween > WEIGHT_REVIEW_CONFIG.maxIntervalDays
  ) {
    return base({ ...measured, reason: "invalid_interval" });
  }

  if (input.lastAutoAdjustmentDate) {
    const since = daysBetweenIso(input.lastAutoAdjustmentDate.slice(0, 10), today);
    if (since < WEIGHT_REVIEW_CONFIG.minDaysSinceLastAdjustment) {
      return base({ ...measured, reason: "recent_adjustment" });
    }
  }

  if (deltaPercent <= -WEIGHT_REVIEW_CONFIG.meaningfulLossPercent) {
    return base({ ...measured, reason: "progressing" });
  }

  const adherenceOk = adherence != null &&
    adherence.daysLogged >= WEIGHT_REVIEW_CONFIG.minLoggedDays &&
    adherence.mealAdherence != null &&
    adherence.mealAdherence >= WEIGHT_REVIEW_CONFIG.minAdherencePercent;

  if (!adherenceOk) return base({ ...measured, reason: "low_adherence" });

  return base({ ...measured, eligible: true, reason: "eligible", dietReviewRequired: true });
}

export function clampCalorieReduction(
  currentKcal: number,
  proposedKcal: number,
): { newKcal: number; reductionPercent: number; clamped: boolean } {
  const min = WEIGHT_REVIEW_CONFIG.minCalorieReductionPercent;
  const max = WEIGHT_REVIEW_CONFIG.maxCalorieReductionPercent;
  const raw = ((currentKcal - proposedKcal) / currentKcal) * 100;
  const bounded = Math.min(Math.max(raw, min), max);
  return {
    newKcal: Math.round(currentKcal * (1 - bounded / 100)),
    reductionPercent: Number(bounded.toFixed(2)),
    clamped: Math.abs(bounded - raw) > 0.01,
  };
}
