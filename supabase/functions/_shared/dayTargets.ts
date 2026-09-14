/**
 * Validação determinística dos totais por dia (Fase 3).
 *
 * O app envia, no `weeklyEnergySchedule`, a meta final de cada weekday
 * (target_kcal / protein_g / carbs_g / fat_g). A IA NÃO pode redefinir esses
 * valores: aqui comparamos o que o modelo devolveu em `days[].totals` com o
 * target determinístico daquele weekday.
 */

export const DAY_TARGET_TOLERANCES = { kcal: 50, p: 10, c: 15, g: 8 };

export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
export type WeekdayKey = (typeof WEEKDAYS)[number];

export type DayTargetIssue = {
  weekday: string;
  target: { kcal: number; p: number; c: number; g: number };
  generated: { kcal: number; p: number; c: number; g: number };
  reasons: string[];
};

export type DayTargetValidation = {
  /** false somente quando existe pelo menos um dia comparável fora da meta. */
  ok: boolean;
  checkedDays: number;
  issues: DayTargetIssue[];
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Metas diárias com macros — só existem quando o carb cycling está ativo. */
export function scheduleHasDailyMacroTargets(schedule: any): boolean {
  if (!schedule || typeof schedule !== "object" || !schedule.days) return false;
  return WEEKDAYS.some((wd) => {
    const d = schedule.days?.[wd];
    return d && (num(d.protein_g) > 0 || num(d.carbs_g) > 0 || num(d.fat_g) > 0);
  });
}

export function validateDayTargets(plan: any, schedule: any): DayTargetValidation {
  const issues: DayTargetIssue[] = [];
  let checkedDays = 0;
  if (!scheduleHasDailyMacroTargets(schedule)) return { ok: true, checkedDays, issues };

  const days: any[] = Array.isArray(plan?.days) ? plan.days : [];
  for (const day of days) {
    const wd = String(day?.weekday || "").toLowerCase();
    if (!(WEEKDAYS as readonly string[]).includes(wd)) continue;
    const scheduled = schedule.days?.[wd];
    if (!scheduled) continue;
    const target = {
      kcal: num(scheduled.target_kcal ?? scheduled.base_kcal),
      p: num(scheduled.protein_g),
      c: num(scheduled.carbs_g),
      g: num(scheduled.fat_g),
    };
    if (target.kcal <= 0) continue;
    const totals = day?.totals ?? {};
    const generated = {
      kcal: num(totals.kcal),
      p: num(totals.p),
      c: num(totals.c),
      g: num(totals.g),
    };
    checkedDays += 1;
    const reasons: string[] = [];
    const diff = {
      kcal: Math.round(generated.kcal - target.kcal),
      p: Math.round(generated.p - target.p),
      c: Math.round(generated.c - target.c),
      g: Math.round(generated.g - target.g),
    };
    if (Math.abs(diff.kcal) > DAY_TARGET_TOLERANCES.kcal) reasons.push(`kcal ${diff.kcal > 0 ? "+" : ""}${diff.kcal}`);
    if (target.p > 0 && Math.abs(diff.p) > DAY_TARGET_TOLERANCES.p) reasons.push(`P ${diff.p > 0 ? "+" : ""}${diff.p}g`);
    if (target.c > 0 && Math.abs(diff.c) > DAY_TARGET_TOLERANCES.c) reasons.push(`C ${diff.c > 0 ? "+" : ""}${diff.c}g`);
    if (target.g > 0 && Math.abs(diff.g) > DAY_TARGET_TOLERANCES.g) reasons.push(`G ${diff.g > 0 ? "+" : ""}${diff.g}g`);
    if (reasons.length > 0) issues.push({ weekday: wd, target, generated, reasons });
  }

  return { ok: issues.length === 0, checkedDays, issues };
}
