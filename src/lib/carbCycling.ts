/**
 * Build a structured carb-cycling plan from a base macro target and the
 * student's training schedule. Keeps weekly kcal close to base average while
 * shifting carbs and fats between training and rest days.
 */

export type Weekday = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export type CarbCycleDay = {
  weekday: Weekday;
  label: string;
  carbBias: "low" | "normal" | "high";
  trainingDay: boolean;
  kcal: number;
  p: number;
  c: number;
  g: number;
};

export type CarbCyclePlan = {
  baseKcal: number;
  baseP: number;
  baseC: number;
  baseG: number;
  days: CarbCycleDay[];
  refeed?: { weekday: Weekday; extraCarbsG: number } | null;
};

const WEEK: Weekday[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

const LABEL: Record<"low" | "normal" | "high", string> = {
  low: "Low Carb",
  normal: "Moderado",
  high: "High Carb",
};

/**
 * Allocate carb bias across the week:
 *  - training days  → HIGH (carbs +30%)
 *  - off days       → LOW (carbs -35%)
 *  - if only 3 training days/week, alternate HIGH/NORMAL on training days
 *  - protein constant; fat adjusted so daily kcal == base kcal
 */
export function buildCarbCyclePlan(opts: {
  baseKcal: number;
  baseP: number;
  baseC: number;
  baseG: number;
  trainingDaysCount?: number | null;
  daysOfWeek?: Partial<Record<Weekday, { type?: string; intensity?: string }>> | null;
  enableRefeed?: boolean;
}): CarbCyclePlan {
  const { baseKcal, baseP, baseC, baseG } = opts;
  // Decide which weekdays are training.
  let trainingMap: Record<Weekday, boolean>;
  if (opts.daysOfWeek && Object.keys(opts.daysOfWeek).length > 0) {
    trainingMap = WEEK.reduce((acc, w) => {
      const entry = opts.daysOfWeek?.[w];
      const t = String(entry?.type || "").toLowerCase();
      acc[w] = !!entry && t !== "" && !/off|descanso|rest|folga/.test(t);
      return acc;
    }, {} as Record<Weekday, boolean>);
  } else {
    // Spread N training days, starting Monday.
    const n = Math.max(0, Math.min(7, Math.round(opts.trainingDaysCount ?? 4)));
    const pattern: Weekday[] =
      n === 7 ? [...WEEK] :
      n === 6 ? ["seg", "ter", "qua", "qui", "sex", "sab"] :
      n === 5 ? ["seg", "ter", "qua", "qui", "sex"] :
      n === 4 ? ["seg", "ter", "qui", "sex"] :
      n === 3 ? ["seg", "qua", "sex"] :
      n === 2 ? ["seg", "qui"] :
      n === 1 ? ["seg"] : [];
    trainingMap = WEEK.reduce((acc, w) => {
      acc[w] = pattern.includes(w);
      return acc;
    }, {} as Record<Weekday, boolean>);
  }

  const trainingCount = WEEK.filter((w) => trainingMap[w]).length;
  const alternateHighOnTraining = trainingCount <= 3; // small split → only HIGH on training, NORMAL on alternate weeks

  const days: CarbCycleDay[] = WEEK.map((w, idx) => {
    let bias: "low" | "normal" | "high";
    if (!trainingMap[w]) bias = "low";
    else if (alternateHighOnTraining) bias = idx % 2 === 0 ? "high" : "normal";
    else bias = "high";

    const carbMul = bias === "high" ? 1.3 : bias === "low" ? 0.65 : 1.0;
    const newC = Math.round(baseC * carbMul);
    // Keep total kcal == baseKcal: adjust fat to absorb the carb delta.
    const newKcalCarbProt = newC * 4 + baseP * 4;
    const newGRaw = (baseKcal - newKcalCarbProt) / 9;
    // Floor fat at 0.4 * baseG to keep physiological minimum on high-carb days.
    const minG = Math.max(20, Math.round(baseG * 0.4));
    const newG = Math.max(minG, Math.round(newGRaw));
    const finalKcal = baseP * 4 + newC * 4 + newG * 9;
    return {
      weekday: w,
      label: LABEL[bias],
      carbBias: bias,
      trainingDay: trainingMap[w],
      kcal: finalKcal,
      p: baseP,
      c: newC,
      g: newG,
    };
  });

  const refeed = opts.enableRefeed
    ? {
        weekday: (WEEK.find((w) => trainingMap[w]) ?? "sab") as Weekday,
        extraCarbsG: Math.round(baseC * 0.5),
      }
    : null;

  return { baseKcal, baseP, baseC, baseG, days, refeed };
}

export function summarizeCyclePlanShort(plan: CarbCyclePlan): string {
  const counts = plan.days.reduce(
    (acc, d) => {
      acc[d.carbBias] = (acc[d.carbBias] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const parts = [
    counts.high ? `${counts.high} HIGH` : null,
    counts.normal ? `${counts.normal} MOD` : null,
    counts.low ? `${counts.low} LOW` : null,
  ].filter(Boolean);
  return `Ciclo de carbo: ${parts.join(" / ")}${plan.refeed ? ` + refeed ${plan.refeed.weekday.toUpperCase()}` : ""}`;
}