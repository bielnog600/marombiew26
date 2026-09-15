/**
 * FASE 6 — política ÚNICA de metas para publicação.
 *
 * Regras (herdadas das Fases 5.2/5.2.1):
 *  - se existe camada `protocols.weekly_day_targets` com QUALQUER weekday
 *    reconhecido, a camada diária existe: nunca cair no target global;
 *  - meta só é válida com kcal > 0 e p/c/g explícitos e >= 0;
 *  - null/undefined/vazio NUNCA viram zero; zero explícito é válido.
 */
import { WEEKDAYS, validateDayTargets, type DayTargetValidation } from "./dayTargets.ts";
import { validateGlobalDietTarget, type GlobalTargetReport } from "./globalDietTarget.ts";

export interface PublicationTarget {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const raw = typeof v === "string" ? v.trim().replace(",", ".") : v;
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export const toPublicationTarget = (raw: any): PublicationTarget | null => {
  if (!raw || typeof raw !== "object") return null;
  const kcal = num(raw.kcal ?? raw.target_kcal);
  const p = num(raw.p ?? raw.protein_g);
  const c = num(raw.c ?? raw.carbs_g);
  const g = num(raw.g ?? raw.fat_g);
  if (kcal === null || kcal <= 0) return null;
  if (p === null || c === null || g === null) return null;
  if (p < 0 || c < 0 || g < 0) return null;
  return { kcal, p, c, g };
};

export const hasWeeklyDayTargetsLayer = (protocols: any): boolean => {
  const weekly = protocols?.weekly_day_targets;
  if (!weekly || typeof weekly !== "object") return false;
  return WEEKDAYS.some((wd) => weekly[wd] !== undefined && weekly[wd] !== null);
};

export type PublicationTargetMode = "daily" | "global";

export interface PublicationTargetResolution {
  ok: boolean;
  mode: PublicationTargetMode;
  errorCode?: "publication_targets_invalid";
  issues: string[];
  byWeekday: Record<string, PublicationTarget>;
  global: PublicationTarget | null;
  /** Estrutura aceita por `validateDayTargets`. */
  schedule: any | null;
}

/** Converte a camada diária no schedule interno esperado pela validação. */
export const buildScheduleFromWeeklyTargets = (
  byWeekday: Record<string, PublicationTarget>,
): any => {
  const days: Record<string, any> = {};
  for (const [wd, t] of Object.entries(byWeekday)) {
    days[wd] = { target_kcal: t.kcal, protein_g: t.p, carbs_g: t.c, fat_g: t.g };
  }
  return { days };
};

/**
 * Resolve as metas finais contra as quais o plano publicado será validado.
 * O plano precisa ter TODOS os dias materializados cobertos por uma meta.
 */
export const resolvePublicationTargets = (
  plan: any,
  protocols: any,
): PublicationTargetResolution => {
  const issues: string[] = [];
  const days: any[] = Array.isArray(plan?.days) ? plan.days : [];
  const weeklyLayer = hasWeeklyDayTargetsLayer(protocols);
  const carbCyclingActive = !!protocols?.carb_cycling?.enabled;
  const weekly = protocols?.weekly_day_targets ?? null;

  if (!days.length) {
    return {
      ok: false,
      mode: weeklyLayer ? "daily" : "global",
      errorCode: "publication_targets_invalid",
      issues: ["Plano sem dias materializados."],
      byWeekday: {},
      global: null,
      schedule: null,
    };
  }

  if (weeklyLayer || carbCyclingActive) {
    // FASE 6.1 — a camada semanal é a AUTORIDADE: byWeekday sai dela, não do
    // plano. Carb cycling ativo exige a semana completa (seg–dom).
    const byWeekday: Record<string, PublicationTarget> = {};
    const required = carbCyclingActive
      ? [...WEEKDAYS]
      : WEEKDAYS.filter((wd) => weekly?.[wd] !== undefined && weekly?.[wd] !== null);

    for (const wd of required) {
      const target = toPublicationTarget(weekly?.[wd]);
      if (!target) {
        issues.push(`Sem meta válida para ${wd}.`);
        continue;
      }
      byWeekday[wd] = target;
    }

    // Dias materializados precisam estar cobertos pela camada autoritativa.
    // Sem fallback para day.targets / plan.targets.
    for (const day of days) {
      const wd = String(day?.weekday ?? "").toLowerCase();
      if (!(WEEKDAYS as readonly string[]).includes(wd)) {
        issues.push(`Dia sem weekday reconhecido: "${String(day?.weekday ?? day?.label ?? "")}".`);
        continue;
      }
      if (!byWeekday[wd] && !required.includes(wd as any)) {
        issues.push(`Sem meta válida para ${wd}.`);
      }
    }

    const ok = issues.length === 0;
    return {
      ok,
      mode: "daily",
      ...(ok ? {} : { errorCode: "publication_targets_invalid" as const }),
      issues,
      byWeekday,
      global: null,
      schedule: ok ? buildScheduleFromWeeklyTargets(byWeekday) : null,
    };
  }


  const global = toPublicationTarget(plan?.targets);
  if (!global) {
    return {
      ok: false,
      mode: "global",
      errorCode: "publication_targets_invalid",
      issues: ["Meta global incompleta (kcal, P, C e G são obrigatórios)."],
      byWeekday: {},
      global: null,
      schedule: null,
    };
  }
  return { ok: true, mode: "global", issues: [], byWeekday: {}, global, schedule: null };
};

export interface PublicationNutritionCheck {
  ok: boolean;
  mode: PublicationTargetMode;
  issues: string[];
  dayReport?: DayTargetValidation;
  globalReport?: GlobalTargetReport;
}

/**
 * Valida o plano JÁ REHIDRATADO contra as metas resolvidas.
 * LOW contra LOW, HIGH contra HIGH — jamais média semanal.
 */
export const validatePublicationNutrition = (
  hydratedPlan: any,
  resolution: PublicationTargetResolution,
): PublicationNutritionCheck => {
  if (resolution.mode === "daily") {
    const report = validateDayTargets(hydratedPlan, resolution.schedule);
    const issues: string[] = [];
    for (const issue of report.issues) issues.push(`${issue.weekday}: ${issue.reasons.join(", ")}`);
    for (const wd of report.missingDays) issues.push(`Dia ausente no plano: ${wd}.`);
    for (const wd of report.duplicateDays) issues.push(`Dia duplicado no plano: ${wd}.`);
    for (const wd of report.invalidDays) issues.push(`Dia inválido no plano: ${wd}.`);
    return { ok: report.ok, mode: "daily", issues, dayReport: report };
  }
  const report = validateGlobalDietTarget(hydratedPlan, resolution.global);
  return { ok: report.ok, mode: "global", issues: report.issues, globalReport: report };
};
