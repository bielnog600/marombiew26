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

export interface ResolveDayTargetInput {
  schedule?: WeeklyEnergySchedule | null;
  dayIndex: number;
  planTargetKcal?: number | null;
  /** Current total of the day — only used for legacy plans without targets. */
  currentTotalKcal?: number | null;
}

export const resolveDayTarget = ({
  schedule,
  dayIndex,
  planTargetKcal,
  currentTotalKcal,
}: ResolveDayTargetInput): number => {
  const fromSchedule = scheduleDayTarget(schedule, dayIndex, planTargetKcal);
  if (fromSchedule) return fromSchedule;
  const fromPlan = positive(planTargetKcal);
  if (fromPlan) return fromPlan;
  return positive(currentTotalKcal) ?? 0;
};

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
