/**
 * Single source of truth for the per-day energy target of a diet plan.
 *
 * The daily target can come from three places (in priority order):
 *   1. the Weekly Energy Schedule (protocols.weekly_energy_schedule)
 *   2. the canonical plan target (conteudo_json.targets.kcal)
 *   3. the day's current total (legacy markdown-only plans)
 *
 * Every screen must use `resolveDayTarget` — spreading this rule across
 * multiple effects is what previously caused the editor to display the
 * plan-wide goal while the meals were scaled to the weekday goal.
 */

export const WEEKDAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface WeeklyScheduleDay {
  target_kcal?: number;
  adjustment_kcal?: number;
  fixed_kcal?: number | null;
}

export interface WeeklyEnergySchedule {
  base_daily_kcal?: number;
  days?: Record<string, WeeklyScheduleDay>;
  [key: string]: unknown;
}

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** Target defined by the weekly schedule for a weekday index (0 = Monday). */
export const scheduleDayTarget = (
  schedule: WeeklyEnergySchedule | null | undefined,
  dayIndex: number,
  planTargetKcal?: number | null,
): number | null => {
  const key = WEEKDAY_KEYS[dayIndex];
  if (!schedule?.days || !key) return null;
  const day = schedule.days[key];
  if (!day) return null;
  // 1. explicit manual override, 2. persisted target, 3. base + adjustment
  const fixed = positive(day.fixed_kcal);
  if (fixed) return fixed;
  const target = positive(day.target_kcal);
  if (target) return target;
  const base = positive(schedule.base_daily_kcal) ?? positive(planTargetKcal);
  if (base) return Math.round(base + (Number(day.adjustment_kcal) || 0));
  return null;
};

export interface DayTarget {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface ResolveDayTargetInput {
  schedule?: WeeklyEnergySchedule | null;
  dayIndex: number;
  planTargetKcal?: number | null;
  /** Current total of the day — only used for legacy plans without targets. */
  currentTotalKcal?: number | null;
  /** Plan-wide macro targets (conteudo_json.targets). */
  planTargetMacros?: { p?: number | null; c?: number | null; g?: number | null } | null;
  /**
   * Phase 3 — explicit, already-materialised target of THIS day (carb cycling
   * or a day saved with its own macros). It is absolute: no schedule
   * adjustment is applied on top of it, which is what prevents double scaling.
   */
  dayTarget?: Partial<DayTarget> | null;
}

const macro = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * THE single source of truth for a day's goal: {kcal, p, c, g}.
 * Consumers that only need calories read `.kcal` (or use resolveDayKcal).
 */
const defined = (v: number | null | undefined): boolean =>
  v != null && Number.isFinite(v);

export const resolveDayTarget = ({
  schedule,
  dayIndex,
  planTargetKcal,
  currentTotalKcal,
  planTargetMacros,
  dayTarget,
}: ResolveDayTargetInput): DayTarget => {
  // 1. Explicit/materialised target of the day (carb cycling) — absolute.
  const explicitKcal = positive(dayTarget?.kcal);
  if (explicitKcal) {
    return {
      kcal: explicitKcal,
      // Zero é valor válido: só cai no target geral quando é null/undefined.
      p: defined(dayTarget?.p) ? macro(dayTarget?.p) : macro(planTargetMacros?.p),
      c: defined(dayTarget?.c) ? macro(dayTarget?.c) : macro(planTargetMacros?.c),
      g: defined(dayTarget?.g) ? macro(dayTarget?.g) : macro(planTargetMacros?.g),
    };
  }
  const fromSchedule = scheduleDayTarget(schedule, dayIndex, planTargetKcal);
  const kcal = fromSchedule ?? positive(planTargetKcal) ?? positive(currentTotalKcal) ?? 0;
  return {
    kcal,
    p: macro(planTargetMacros?.p),
    c: macro(planTargetMacros?.c),
    g: macro(planTargetMacros?.g),
  };
};

/** Helper — no logic of its own, only delegates to resolveDayTarget. */
export const resolveDayKcal = (input: ResolveDayTargetInput): number =>
  resolveDayTarget(input).kcal;

/**
 * Manual edit of the "Meta diária" field: persists the new goal on the
 * weekly schedule for THAT day only (never touching the other weekdays).
 */
export const applyDayTargetToSchedule = (
  schedule: WeeklyEnergySchedule | null | undefined,
  dayIndex: number,
  kcal: number,
): WeeklyEnergySchedule | null => {
  const key = WEEKDAY_KEYS[dayIndex];
  if (!key) return schedule ?? null;
  const value = positive(kcal);
  if (!value) return schedule ?? null;
  const base = schedule ?? {};
  const days = { ...(base.days ?? {}) };
  const prev = days[key] ?? {};
  days[key] = { ...prev, fixed_kcal: value, target_kcal: value };
  return { ...base, days };
};
