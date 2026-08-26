/**
 * Regra determinística de check-in de peso (a cada 15 dias).
 * Pura: sem I/O, sem dependências. Espelhada em
 * `supabase/functions/_shared/weightReviewPolicy.ts`.
 */

export const WEIGHT_CHECKIN_INTERVAL_DAYS = 15;
/** Faltando 1..3 dias => DUE_SOON */
export const WEIGHT_CHECKIN_DUE_SOON_DAYS = 3;

export const MIN_VALID_WEIGHT_KG = 20;
export const MAX_VALID_WEIGHT_KG = 400;

export type WeightCheckinState = 'no_data' | 'not_due' | 'due_soon' | 'due' | 'overdue';

export interface WeightCheckinStatus {
  state: WeightCheckinState;
  /** Data prevista do próximo registro (YYYY-MM-DD) ou null se ainda não há peso. */
  nextCheckinDate: string | null;
  /** Dias restantes até o próximo check-in (negativo quando atrasado). */
  daysUntil: number | null;
  /** Dias de atraso (0 quando não atrasado). */
  daysOverdue: number;
  message: string;
}

function toUtcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
}

export function addDaysIso(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = toUtcDate(fromIso).getTime();
  const b = toUtcDate(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function isValidWeightKg(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > MIN_VALID_WEIGHT_KG && n < MAX_VALID_WEIGHT_KG;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A contagem de 15 dias só começa quando existe um primeiro registro válido.
 */
export function resolveWeightCheckin(
  latestWeightDate: string | null,
  today: string = todayIso(),
): WeightCheckinStatus {
  if (!latestWeightDate) {
    return {
      state: 'no_data',
      nextCheckinDate: null,
      daysUntil: null,
      daysOverdue: 0,
      message: 'Comece a acompanhar sua evolução',
    };
  }

  const nextCheckinDate = addDaysIso(latestWeightDate, WEIGHT_CHECKIN_INTERVAL_DAYS);
  const daysUntil = daysBetweenIso(today, nextCheckinDate);

  if (daysUntil > WEIGHT_CHECKIN_DUE_SOON_DAYS) {
    return {
      state: 'not_due',
      nextCheckinDate,
      daysUntil,
      daysOverdue: 0,
      message: `Próximo registro em ${daysUntil} dias`,
    };
  }

  if (daysUntil > 0) {
    return {
      state: 'due_soon',
      nextCheckinDate,
      daysUntil,
      daysOverdue: 0,
      message: 'Seu próximo check-in está chegando',
    };
  }

  if (daysUntil === 0) {
    return {
      state: 'due',
      nextCheckinDate,
      daysUntil,
      daysOverdue: 0,
      message: 'Hora de atualizar seu peso',
    };
  }

  const daysOverdue = Math.abs(daysUntil);
  return {
    state: 'overdue',
    nextCheckinDate,
    daysUntil,
    daysOverdue,
    message: `Registro de peso pendente há ${daysOverdue} dia${daysOverdue === 1 ? '' : 's'}`,
  };
}

export function isCheckinActionable(state: WeightCheckinState): boolean {
  return state === 'due' || state === 'overdue';
}
