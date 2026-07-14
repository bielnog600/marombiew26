/**
 * Weekly Energy Schedule — MVP
 *
 * Small, deterministic engine that stores a per-weekday calorie target
 * built from a base daily kcal + optional signed adjustment (or a fixed
 * override). No automatic rebalancing, no percentage math, no locks.
 *
 * Persisted at protocols.weekly_energy_schedule (jsonb). Compatible with
 * the Supabase `Json` type via `scheduleToJson()`.
 */
import type { Json } from '@/integrations/supabase/types';

export type EnergyWeekday = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';

export const ENERGY_WEEKDAYS: EnergyWeekday[] = [
  'seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom',
];

export const WEEKDAY_LABELS: Record<EnergyWeekday, string> = {
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
  dom: 'Domingo',
};

/** Workout summary for a given weekday, as read from the active plan. */
export interface DayWorkoutRef {
  /** Human-friendly label — e.g. "Peito + Tríceps" or "Descanso". */
  label: string | null;
  /** Rough day type from the training extractor (upper/lower/full/legs/rest/…). */
  type: string | null;
  /** Best-effort muscle group list (may be empty for rest/cardio). */
  muscles: string[];
}

export interface DayEnergyEntry {
  /** Meta calórica base do dia (default = daily target da dieta). */
  base_kcal: number;
  /** Ajuste signed em kcal aplicado sobre a base. */
  adjustment_kcal: number;
  /** Meta fixa opcional: quando definida (> 0), substitui base + adjustment. */
  fixed_kcal: number | null;
  /** Referência ao treino do dia — null se sem treino associado. */
  workout: DayWorkoutRef | null;
}

export type BaseKcalSource = 'automatic' | 'manual';

export interface BaseKcalCalculationSnapshot {
  bmr: number | null;
  activity_factor: number | null;
  tdee: number | null;
  strategy_percent: number | null;
  formula?: string | null;
}

export interface WeeklyEnergySchedule {
  version: 1;
  base_daily_kcal: number;
  base_source?: BaseKcalSource;
  calculation_snapshot?: BaseKcalCalculationSnapshot;
  days: Record<EnergyWeekday, DayEnergyEntry>;
}

/** Meta final do dia (fixed_kcal quando presente, senão base + adjustment). */
export function computeDayTarget(entry: DayEnergyEntry): number {
  if (entry.fixed_kcal != null && entry.fixed_kcal > 0) {
    return Math.round(entry.fixed_kcal);
  }
  return Math.round(entry.base_kcal + entry.adjustment_kcal);
}

/** Constrói o schedule default: base repetida nos 7 dias, ajustes zerados. */
export function buildDefaultSchedule(params: {
  baseDailyKcal: number;
  workoutByWeekday: Partial<Record<EnergyWeekday, DayWorkoutRef>>;
  baseSource?: BaseKcalSource;
  calculationSnapshot?: BaseKcalCalculationSnapshot;
}): WeeklyEnergySchedule {
  const base = Math.round(params.baseDailyKcal);
  const days = {} as Record<EnergyWeekday, DayEnergyEntry>;
  for (const wd of ENERGY_WEEKDAYS) {
    days[wd] = {
      base_kcal: base,
      adjustment_kcal: 0,
      fixed_kcal: null,
      workout: params.workoutByWeekday[wd] ?? null,
    };
  }
  return {
    version: 1,
    base_daily_kcal: base,
    ...(params.baseSource ? { base_source: params.baseSource } : {}),
    ...(params.calculationSnapshot ? { calculation_snapshot: params.calculationSnapshot } : {}),
    days,
  };
}

export interface ScheduleTotals {
  /** Meta semanal original = base × 7. */
  originalWeekly: number;
  /** Meta semanal com ajustes aplicados. */
  configuredWeekly: number;
  /** configured − original. */
  diff: number;
  /** Média diária configurada. */
  averageDaily: number;
}

export function computeTotals(s: WeeklyEnergySchedule): ScheduleTotals {
  const originalWeekly = s.base_daily_kcal * 7;
  let configuredWeekly = 0;
  for (const wd of ENERGY_WEEKDAYS) {
    configuredWeekly += computeDayTarget(s.days[wd]);
  }
  return {
    originalWeekly,
    configuredWeekly,
    diff: configuredWeekly - originalWeekly,
    averageDaily: Math.round(configuredWeekly / 7),
  };
}

/** Validação básica: metas positivas e não absurdamente baixas. */
export const MIN_DAILY_KCAL = 900;

export function validateSchedule(s: WeeklyEnergySchedule): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(s.base_daily_kcal) || s.base_daily_kcal <= 0) {
    issues.push('Meta calórica base inválida.');
  } else if (s.base_daily_kcal < MIN_DAILY_KCAL) {
    issues.push(`Meta calórica base muito baixa (${s.base_daily_kcal} kcal, mínimo ${MIN_DAILY_KCAL}).`);
  }
  if (s.base_source != null && s.base_source !== 'automatic' && s.base_source !== 'manual') {
    issues.push('Origem da meta calórica base inválida.');
  }
  for (const wd of ENERGY_WEEKDAYS) {
    const target = computeDayTarget(s.days[wd]);
    if (!Number.isFinite(target) || target <= 0) {
      issues.push(`${WEEKDAY_LABELS[wd]}: meta inválida.`);
    } else if (target < MIN_DAILY_KCAL) {
      issues.push(
        `${WEEKDAY_LABELS[wd]}: meta muito baixa (${target} kcal, mínimo ${MIN_DAILY_KCAL}).`,
      );
    }
  }
  return issues;
}

/**
 * Conversão explícita para o tipo `Json` do Supabase — evita `as any` na
 * persistência. `JSON.parse(JSON.stringify(...))` retira símbolos e mantém
 * apenas primitivos/objetos/arrays serializáveis.
 */
export function scheduleToJson(s: WeeklyEnergySchedule): Json {
  return JSON.parse(JSON.stringify(s)) as Json;
}