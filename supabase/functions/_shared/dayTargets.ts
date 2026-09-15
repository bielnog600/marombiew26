/**
 * Validação determinística dos totais por dia (Fase 3).
 *
 * O app envia, no `weeklyEnergySchedule`, a meta final de cada weekday
 * (target_kcal / protein_g / carbs_g / fat_g). A IA NÃO pode redefinir esses
 * valores: aqui comparamos o que o modelo devolveu em `days[].totals` com o
 * target determinístico daquele weekday.
 *
 * Regras:
 *  - todo weekday com target completo precisa ter exatamente um `days[]`;
 *  - weekday ausente, duplicado ou inválido reprova;
 *  - 0 é meta válida: só ignoramos o macro quando o campo está ausente/null.
 */

import { OFFICIAL_MACRO_TOLERANCE } from "./macroTolerances.ts";

/** Fonte única das tolerâncias oficiais (Fase 4.2). */
export const DAY_TARGET_TOLERANCES = OFFICIAL_MACRO_TOLERANCE;

export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
export type WeekdayKey = (typeof WEEKDAYS)[number];

export type DayTargetIssue = {
  weekday: string;
  target: { kcal: number; p: number | null; c: number | null; g: number | null };
  generated: { kcal: number; p: number; c: number; g: number };
  reasons: string[];
};

export type DayTargetValidation = {
  ok: boolean;
  checkedDays: number;
  issues: DayTargetIssue[];
  /** Weekdays esperados pelo schedule que não vieram no plano. */
  missingDays: string[];
  /** Weekdays que apareceram mais de uma vez no plano. */
  duplicateDays: string[];
  /** Weekdays presentes no plano que não existem na semana. */
  invalidDays: string[];
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** null quando o campo está ausente; número (inclusive 0) quando definido. */
const optNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Metas diárias com macros — só existem quando o carb cycling está ativo. */
export function scheduleHasDailyMacroTargets(schedule: any): boolean {
  if (!schedule || typeof schedule !== "object" || !schedule.days) return false;
  return WEEKDAYS.some((wd) => {
    const d = schedule.days?.[wd];
    if (!d) return false;
    return optNum(d.protein_g) !== null || optNum(d.carbs_g) !== null || optNum(d.fat_g) !== null;
  });
}

export function validateDayTargets(plan: any, schedule: any): DayTargetValidation {
  const issues: DayTargetIssue[] = [];
  const empty: DayTargetValidation = {
    ok: true,
    checkedDays: 0,
    issues,
    missingDays: [],
    duplicateDays: [],
    invalidDays: [],
  };
  if (!scheduleHasDailyMacroTargets(schedule)) return empty;

  // Weekdays esperados: têm meta calórica e ao menos um macro definido.
  const expected: string[] = WEEKDAYS.filter((wd) => {
    const d = schedule.days?.[wd];
    if (!d) return false;
    const kcal = num(d.target_kcal ?? d.base_kcal);
    const hasMacro =
      optNum(d.protein_g) !== null || optNum(d.carbs_g) !== null || optNum(d.fat_g) !== null;
    return kcal > 0 && hasMacro;
  });

  const days: any[] = Array.isArray(plan?.days) ? plan.days : [];
  const seen = new Map<string, number>();
  const invalidDays: string[] = [];
  for (const day of days) {
    const wd = String(day?.weekday || "").toLowerCase();
    if (!(WEEKDAYS as readonly string[]).includes(wd)) {
      if (wd) invalidDays.push(wd);
      continue;
    }
    seen.set(wd, (seen.get(wd) ?? 0) + 1);
  }

  const missingDays = expected.filter((wd) => !seen.has(wd));
  const duplicateDays = [...seen.entries()].filter(([, n]) => n > 1).map(([wd]) => wd);

  let checkedDays = 0;
  for (const day of days) {
    const wd = String(day?.weekday || "").toLowerCase();
    if (!expected.includes(wd)) continue;
    const scheduled = schedule.days?.[wd];
    const target = {
      kcal: num(scheduled.target_kcal ?? scheduled.base_kcal),
      p: optNum(scheduled.protein_g),
      c: optNum(scheduled.carbs_g),
      g: optNum(scheduled.fat_g),
    };
    const totals = day?.totals ?? {};
    const generated = {
      kcal: num(totals.kcal),
      p: num(totals.p),
      c: num(totals.c),
      g: num(totals.g),
    };
    checkedDays += 1;
    const reasons: string[] = [];
    const dKcal = Math.round(generated.kcal - target.kcal);
    if (Math.abs(dKcal) > DAY_TARGET_TOLERANCES.kcal) reasons.push(`kcal ${dKcal > 0 ? "+" : ""}${dKcal}`);
    const check = (label: string, t: number | null, gen: number, tol: number) => {
      if (t === null) return;
      const d = Math.round(gen - t);
      if (Math.abs(d) > tol) reasons.push(`${label} ${d > 0 ? "+" : ""}${d}g`);
    };
    check("P", target.p, generated.p, DAY_TARGET_TOLERANCES.p);
    check("C", target.c, generated.c, DAY_TARGET_TOLERANCES.c);
    check("G", target.g, generated.g, DAY_TARGET_TOLERANCES.g);
    if (reasons.length > 0) issues.push({ weekday: wd, target, generated, reasons });
  }

  const ok =
    issues.length === 0 &&
    missingDays.length === 0 &&
    duplicateDays.length === 0 &&
    invalidDays.length === 0;
  return { ok, checkedDays, issues, missingDays, duplicateDays, invalidDays };
}
