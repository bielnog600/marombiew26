/**
 * Validação do plano HIDRATADO contra o target determinístico global do app
 * (carb cycling OFF). Com metas diárias, quem valida é validateDayTargets().
 *
 * Nunca usa `plan.targets` devolvido pela IA — o target vem do app.
 */
import { OFFICIAL_MACRO_TOLERANCE } from "./macroTolerances.ts";

export interface GlobalDietTarget {
  kcal?: number | null;
  p?: number | null;
  c?: number | null;
  g?: number | null;
}

/** Fonte única das tolerâncias oficiais (Fase 4.2). */
export const GLOBAL_TARGET_TOLERANCE = OFFICIAL_MACRO_TOLERANCE;

export interface GlobalTargetDayDiff {
  weekday: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
  /** Totais hidratados do dia (gerado). */
  generated?: { kcal: number; p: number; c: number; g: number };
}

export interface GlobalTargetReport {
  ok: boolean;
  checkedDays: number;
  issues: string[];
  diffs: GlobalTargetDayDiff[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const hasTarget = (v: unknown): boolean => v !== null && v !== undefined && Number.isFinite(Number(v));

export function validateGlobalDietTarget(
  hydratedPlan: any,
  target: GlobalDietTarget | null | undefined,
): GlobalTargetReport {
  const issues: string[] = [];
  const diffs: GlobalTargetDayDiff[] = [];
  const days = Array.isArray(hydratedPlan?.days) ? hydratedPlan.days : [];

  if (!target || !hasTarget(target.kcal)) {
    // Sem target autoritativo do app não há o que validar aqui.
    return { ok: true, checkedDays: 0, issues: [], diffs: [] };
  }
  if (!days.length) {
    return { ok: false, checkedDays: 0, issues: ["Plano sem dias."], diffs: [] };
  }

  days.forEach((day: any, i: number) => {
    const weekday = String(day?.weekday ?? day?.label ?? `dia ${i + 1}`);
    const totals = day?.totals ?? {};
    const diff: GlobalTargetDayDiff = {
      weekday,
      kcal: num(totals.kcal) - num(target.kcal),
      p: hasTarget(target.p) ? num(totals.p) - num(target.p) : 0,
      c: hasTarget(target.c) ? num(totals.c) - num(target.c) : 0,
      g: hasTarget(target.g) ? num(totals.g) - num(target.g) : 0,
      generated: { kcal: num(totals.kcal), p: num(totals.p), c: num(totals.c), g: num(totals.g) },
    };
    diffs.push(diff);

    if (Math.abs(diff.kcal) > GLOBAL_TARGET_TOLERANCE.kcal) {
      issues.push(`${weekday}: kcal ${Math.round(num(totals.kcal))} vs meta ${Math.round(num(target.kcal))} (${diff.kcal > 0 ? "+" : ""}${Math.round(diff.kcal)}).`);
    }
    if (hasTarget(target.p) && Math.abs(diff.p) > GLOBAL_TARGET_TOLERANCE.p) {
      issues.push(`${weekday}: proteína ${Math.round(num(totals.p))}g vs meta ${Math.round(num(target.p))}g.`);
    }
    if (hasTarget(target.c) && Math.abs(diff.c) > GLOBAL_TARGET_TOLERANCE.c) {
      issues.push(`${weekday}: carboidrato ${Math.round(num(totals.c))}g vs meta ${Math.round(num(target.c))}g.`);
    }
    if (hasTarget(target.g) && Math.abs(diff.g) > GLOBAL_TARGET_TOLERANCE.g) {
      issues.push(`${weekday}: gordura ${Math.round(num(totals.g))}g vs meta ${Math.round(num(target.g))}g.`);
    }
  });

  return { ok: issues.length === 0, checkedDays: days.length, issues, diffs };
}

/** Fase 4.1: geração fresh linear exige metas determinísticas completas. */
export function isCanonicalTargetValid(target: GlobalDietTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const kcal = Number((target as any).kcal);
  if (!Number.isFinite(kcal) || kcal <= 0) return false;
  for (const key of ["p", "c", "g"] as const) {
    const v = Number((target as any)[key]);
    if (!Number.isFinite(v) || v < 0) return false;
  }
  return true;
}

const r = (v: unknown) => Math.round(num(v));

/**
 * Linhas legíveis para o card de erro: um dia por linha, gerado × meta,
 * marcando com "!" cada macro fora da tolerância oficial.
 */
export function formatGlobalTargetDetails(
  report: GlobalTargetReport,
  target: GlobalDietTarget | null | undefined,
): string[] {
  if (report.ok) return [];
  if (!report.checkedDays) {
    return report.issues.length
      ? ["Plano sem dias: a resposta da IA veio sem a lista de dias/refeições"]
      : [];
  }
  const t = target ?? {};
  const mark = (diff: number, tol: number) => (Math.abs(diff) > tol ? "!" : "");
  return report.diffs
    .filter((d) =>
      Math.abs(d.kcal) > GLOBAL_TARGET_TOLERANCE.kcal ||
      Math.abs(d.p) > GLOBAL_TARGET_TOLERANCE.p ||
      Math.abs(d.c) > GLOBAL_TARGET_TOLERANCE.c ||
      Math.abs(d.g) > GLOBAL_TARGET_TOLERANCE.g,
    )
    .map((d) => {
      const g = d.generated ?? { kcal: 0, p: 0, c: 0, g: 0 };
      return `${d.weekday}: ${r(g.kcal)}${mark(d.kcal, GLOBAL_TARGET_TOLERANCE.kcal)} × ${r(t.kcal)} kcal · ` +
        `P ${r(g.p)}${mark(d.p, GLOBAL_TARGET_TOLERANCE.p)} × ${r(t.p)} g · ` +
        `C ${r(g.c)}${mark(d.c, GLOBAL_TARGET_TOLERANCE.c)} × ${r(t.c)} g · ` +
        `G ${r(g.g)}${mark(d.g, GLOBAL_TARGET_TOLERANCE.g)} × ${r(t.g)} g (gerado × meta)`;
    });
}
