/**
 * Validação do plano HIDRATADO contra o target determinístico global do app
 * (carb cycling OFF). Com metas diárias, quem valida é validateDayTargets().
 *
 * Nunca usa `plan.targets` devolvido pela IA — o target vem do app.
 */
export interface GlobalDietTarget {
  kcal?: number | null;
  p?: number | null;
  c?: number | null;
  g?: number | null;
}

export const GLOBAL_TARGET_TOLERANCE = { kcal: 50, p: 10, c: 15, g: 8 };

export interface GlobalTargetDayDiff {
  weekday: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
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
