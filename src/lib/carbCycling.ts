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
 * @deprecated NÃO usar para novas dietas. Fonte oficial = API da Fase 3
 * (`buildCarbDayTypeTargets` / `buildWeeklyCarbTargets` / `resolveDayTarget`).
 * Mantido apenas por compatibilidade com dados antigos.
 *
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
/* ==========================================================================
 * FASE 3 — Carb cycling determinístico por g/kg
 *
 * Camada fina sobre `macroConfig`: NÃO recalcula TMB/GET/meta, NÃO duplica
 * conversão g/kg e NÃO cria uma segunda calculadora de macros. Apenas
 * transforma a configuração canônica em metas diárias {kcal,p,c,g}.
 * ========================================================================== */

import {
  MACRO_KCAL_PER_G,
  gramsFromPerKg,
  perKgFromGrams,
  basisWeight,
  resolveMacroConfig,
  closingMacroWarning,
  type BodyBasis,
  type MacroBasis,
  type MacroConfig,
  type MacroKey,
  type MacroResolution,
} from '@/lib/macroConfig';
import { WEEKDAY_KEYS, type WeekdayKey, type DayTarget } from '@/lib/dietDayTargets';

export type CarbCyclingMode = 'variable_calories' | 'fixed_calories';
export type CarbDayType = 'low' | 'medium' | 'high';

export const CARB_DAY_TYPES: CarbDayType[] = ['low', 'medium', 'high'];

export const CARB_DAY_TYPE_LABEL: Record<CarbDayType, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
};

export interface CarbDayTypeConfig {
  carbsPerKg: number | null;
  carbGrams: number | null;
  carbBasis: MacroBasis;
  /** Somente no modo `fixed_calories`; null usa a meta base. */
  targetKcal?: number | null;
}

/**
 * No modo `fixed_calories` o carboidrato já é a restrição do tipo de dia
 * (LOW/MEDIUM/HIGH definidos em g/kg), portanto nunca pode fechar as calorias.
 */
export type FixedClosingMacro = 'protein' | 'fat';

export const FIXED_CLOSING_MACRO_OPTIONS: FixedClosingMacro[] = ['protein', 'fat'];

export interface CarbCyclingConfig {
  enabled: boolean;
  mode: CarbCyclingMode;
  types: Record<CarbDayType, CarbDayTypeConfig>;
  /** Tipo escolhido por dia (manual ou sugerido). */
  assignments: Record<WeekdayKey, CarbDayType>;
  /** Dias em que o treinador escolheu manualmente — sugestão não sobrescreve. */
  manual: Record<WeekdayKey, boolean>;
  /** Modo `fixed_calories`: macro que fecha as calorias nos dias do ciclo. */
  fixedClosingMacro: FixedClosingMacro | null;
}

export const defaultCarbCyclingConfig = (): CarbCyclingConfig => ({
  enabled: false,
  mode: 'variable_calories',
  types: {
    low: { carbsPerKg: 1.5, carbGrams: null, carbBasis: 'body_weight', targetKcal: null },
    medium: { carbsPerKg: 2.5, carbGrams: null, carbBasis: 'body_weight', targetKcal: null },
    high: { carbsPerKg: 3.5, carbGrams: null, carbBasis: 'body_weight', targetKcal: null },
  },
  assignments: {
    seg: 'medium', ter: 'medium', qua: 'medium', qui: 'medium',
    sex: 'medium', sab: 'low', dom: 'low',
  },
  manual: { seg: false, ter: false, qua: false, qui: false, sex: false, sab: false, dom: false },
  fixedClosingMacro: null,
});

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Gramas de carboidrato do tipo — sempre pela base escolhida no próprio tipo. */
export const carbGramsForType = (
  type: CarbDayTypeConfig,
  body: BodyBasis,
): number | null => {
  if (type.carbGrams != null && Number.isFinite(type.carbGrams)) return round1(type.carbGrams);
  if (type.carbsPerKg == null) return null;
  return gramsFromPerKg(type.carbsPerKg, type.carbBasis, body);
};

/** Edição bidirecional do carboidrato do tipo — reutiliza os helpers da Fase 2. */
export const setCarbTypePerKg = (
  type: CarbDayTypeConfig,
  perKg: number | null,
  body: BodyBasis,
): CarbDayTypeConfig =>
  perKg == null
    ? { ...type, carbsPerKg: null, carbGrams: null }
    : { ...type, carbsPerKg: perKg, carbGrams: gramsFromPerKg(perKg, type.carbBasis, body) };

export const setCarbTypeGrams = (
  type: CarbDayTypeConfig,
  grams: number | null,
  body: BodyBasis,
): CarbDayTypeConfig =>
  grams == null
    ? { ...type, carbsPerKg: null, carbGrams: null }
    : { ...type, carbGrams: grams, carbsPerKg: perKgFromGrams(grams, type.carbBasis, body) };

/** Troca de base: mantém o g/kg quando ele é a origem, senão recalcula o g/kg. */
export const setCarbTypeBasis = (
  type: CarbDayTypeConfig,
  basis: MacroBasis,
  body: BodyBasis,
): CarbDayTypeConfig => {
  const next = { ...type, carbBasis: basis };
  if (!basisWeight(basis, body)) return next;
  if (type.carbsPerKg != null) return setCarbTypePerKg(next, type.carbsPerKg, body);
  if (type.carbGrams != null) return setCarbTypeGrams(next, type.carbGrams, body);
  return next;
};

export interface CarbDayTypeResult {
  type: CarbDayType;
  status: MacroResolution['status'];
  target: DayTarget | null;
  carbsPerKg: number | null;
  carbBasis: MacroBasis;
  message: string | null;
  warning: string | null;
}

export interface BuildCarbDayTypeInput {
  mode: CarbCyclingMode;
  carbCycling: CarbCyclingConfig;
  /** Configuração canônica de macros das Fases 1–2. */
  macroConfig: MacroConfig;
  body: BodyBasis;
  /** Meta calórica base (fonte única já calculada). */
  baseKcal: number;
  closingMacro?: MacroKey | null;
  /**
   * Macros canônicos JÁ RESOLVIDOS pela Fase 2 (`resolveMacroConfig`).
   * No modo variable é esta a origem de P e G — o carb cycling nunca
   * reinterpreta as travas para derivar os macros constantes.
   */
  baseResolvedMacros?: { p: number; c: number; g: number } | null;
}

/**
 * Metas de cada tipo de dia.
 *  - variable_calories: P e G vêm da configuração canônica, C varia, kcal é consequência.
 *  - fixed_calories: carboidrato do tipo + travas atuais resolvidos por `resolveMacroConfig`.
 */
export const buildCarbDayTypeTargets = ({
  mode,
  carbCycling,
  macroConfig,
  body,
  baseKcal,
  closingMacro,
  baseResolvedMacros,
}: BuildCarbDayTypeInput): Record<CarbDayType, CarbDayTypeResult> => {
  const out = {} as Record<CarbDayType, CarbDayTypeResult>;

  for (const type of CARB_DAY_TYPES) {
    const cfg = carbCycling.types[type];
    const carbs = carbGramsForType(cfg, body);
    const base: CarbDayTypeResult = {
      type,
      status: 'ok',
      target: null,
      carbsPerKg: cfg.carbsPerKg,
      carbBasis: cfg.carbBasis,
      message: null,
      warning: null,
    };

    if (carbs == null) {
      out[type] = { ...base, status: 'incomplete', message: 'Defina o carboidrato deste tipo de dia.' };
      continue;
    }

    if (mode === 'variable_calories') {
      // P e G constantes: preferencialmente os macros CANÔNICOS já resolvidos
      // pela Fase 2 (inclui o macro que fechou as calorias). Só quando a
      // resolução não estiver disponível caímos na configuração declarada.
      const protein =
        baseResolvedMacros?.p ??
        macroConfig.protein.grams ??
        (macroConfig.protein.perKg != null
          ? gramsFromPerKg(macroConfig.protein.perKg, macroConfig.protein.basis, body)
          : null);
      const fat =
        baseResolvedMacros?.g ??
        macroConfig.fat.grams ??
        (macroConfig.fat.perKg != null
          ? gramsFromPerKg(macroConfig.fat.perKg, macroConfig.fat.basis, body)
          : null);
      if (protein == null || fat == null) {
        out[type] = {
          ...base,
          status: 'incomplete',
          message: 'Defina proteína e gordura na configuração de macros.',
        };
        continue;
      }
      const kcal =
        protein * MACRO_KCAL_PER_G.protein +
        carbs * MACRO_KCAL_PER_G.carbs +
        fat * MACRO_KCAL_PER_G.fat;
      out[type] = {
        ...base,
        target: {
          kcal: Math.round(kcal),
          p: Math.round(protein),
          c: Math.round(carbs),
          g: Math.round(fat),
        },
      };
      continue;
    }

    // fixed_calories — reaproveita integralmente as travas de macroConfig.
    const fixedClosing = carbCycling.fixedClosingMacro ?? null;
    if (!fixedClosing) {
      out[type] = {
        ...base,
        status: 'needs_closing_macro',
        message: 'Escolha qual macro deve fechar as calorias nos dias do ciclo.',
      };
      continue;
    }
    const kcalTarget = cfg.targetKcal && cfg.targetKcal > 0 ? cfg.targetKcal : baseKcal;
    const config: MacroConfig = {
      ...macroConfig,
      carbs: {
        ...macroConfig.carbs,
        perKg: cfg.carbsPerKg,
        grams: carbs,
        basis: cfg.carbBasis,
        locked: true,
      },
    };
    const resolution = resolveMacroConfig({ kcalTarget, config, body, closingMacro: fixedClosing });
    out[type] = {
      ...base,
      status: resolution.status,
      message: resolution.message,
      warning: closingMacroWarning(resolution, body),
      target:
        resolution.status === 'ok' && resolution.grams
          ? {
              kcal: Math.round(kcalTarget),
              p: Math.round(resolution.grams.protein),
              c: Math.round(resolution.grams.carbs),
              g: Math.round(resolution.grams.fat),
            }
          : null,
    };
  }

  return out;
};

export interface WeeklyCarbDayTarget extends DayTarget {
  type: CarbDayType;
}

/** Metas dos 7 dias a partir dos tipos configurados. */
export const buildWeeklyCarbTargets = (
  carbCycling: CarbCyclingConfig,
  typeTargets: Record<CarbDayType, CarbDayTypeResult>,
): Partial<Record<WeekdayKey, WeeklyCarbDayTarget>> => {
  const out: Partial<Record<WeekdayKey, WeeklyCarbDayTarget>> = {};
  for (const wd of WEEKDAY_KEYS) {
    const type = carbCycling.assignments[wd];
    const target = typeTargets[type]?.target;
    if (target) out[wd] = { ...target, type };
  }
  return out;
};

export interface WeeklyAverage {
  days: number;
  /** Só é média semanal oficial quando os 7 dias possuem target válido. */
  complete: boolean;
  average: DayTarget;
  weeklyKcal: number;
  incompleteMessage: string | null;
}

export const calculateWeeklyAverage = (
  weekly: Partial<Record<WeekdayKey, WeeklyCarbDayTarget>>,
): WeeklyAverage | null => {
  const values = WEEKDAY_KEYS.map((wd) => weekly[wd]).filter(Boolean) as WeeklyCarbDayTarget[];
  if (values.length === 0) return null;
  const sum = values.reduce(
    (acc, d) => ({ kcal: acc.kcal + d.kcal, p: acc.p + d.p, c: acc.c + d.c, g: acc.g + d.g }),
    { kcal: 0, p: 0, c: 0, g: 0 },
  );
  const n = values.length;
  const complete = n === WEEKDAY_KEYS.length;
  return {
    days: n,
    complete,
    incompleteMessage: complete
      ? null
      : `Configuração semanal incompleta — ${n} de ${WEEKDAY_KEYS.length} dias válidos.`,
    average: {
      kcal: Math.round(sum.kcal / n),
      p: Math.round(sum.p / n),
      c: Math.round(sum.c / n),
      g: Math.round(sum.g / n),
    },
    weeklyKcal: Math.round(sum.kcal),
  };
};

export interface BaseComparison {
  baseKcal: number;
  averageKcal: number;
  diffPerDay: number;
  diffWeek: number;
  warning: string | null;
}

/** Comparação informativa com a meta base — nunca bloqueia. */
export const compareWeeklyAverageToBase = (
  average: WeeklyAverage | null,
  baseKcal: number | null,
  tolerancePct = 10,
): BaseComparison | null => {
  if (!average || !average.complete || !baseKcal || baseKcal <= 0) return null;
  const diffPerDay = Math.round(average.average.kcal - baseKcal);
  const diffWeek = Math.round(diffPerDay * 7);
  const overTolerance = Math.abs(diffPerDay) > (baseKcal * tolerancePct) / 100;
  return {
    baseKcal,
    averageKcal: average.average.kcal,
    diffPerDay,
    diffWeek,
    warning: overTolerance
      ? `Média semanal está ${Math.abs(diffPerDay)} kcal/dia ${
          diffPerDay < 0 ? 'abaixo' : 'acima'
        } da meta base. Revise LOW/MEDIUM/HIGH.`
      : null,
  };
};

/** Sugestão inicial simples pelo treino do dia — sem IA, e nunca obrigatória. */
export const suggestCarbDayTypeForWorkout = (
  workout: { label?: string | null; type?: string | null; muscles?: string[] } | null | undefined,
): CarbDayType => {
  const text = [workout?.label, workout?.type, ...(workout?.muscles ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // Sem informação suficiente → MEDIUM (preset neutro), nunca LOW por omissão.
  if (!text.trim()) return 'medium';
  if (/descanso|rest|folga|off/.test(text)) return 'low';
  if (/perna|lower|quadr|gl[uú]teo|posterior|full ?body|corpo inteiro/.test(text)) return 'high';
  if (/cardio|caminhada|aer[oó]bic/.test(text)) return 'low';
  return 'medium';
};

/** Validação da semana: com o ciclo ativo, os 7 dias precisam de target válido. */
export const isCarbCyclingValid = (
  config: CarbCyclingConfig,
  typeTargets: Record<CarbDayType, CarbDayTypeResult>,
  weekly: Partial<Record<WeekdayKey, WeeklyCarbDayTarget>>,
): { valid: boolean; reason: string | null } => {
  if (!config.enabled) return { valid: true, reason: null };
  for (const wd of WEEKDAY_KEYS) {
    const type = config.assignments[wd];
    const result = typeTargets[type];
    if (!weekly[wd] || !result || result.status !== 'ok' || !result.target) {
      return {
        valid: false,
        reason:
          result?.message ??
          `Carb cycling incompleto: o dia ${wd.toUpperCase()} (${CARB_DAY_TYPE_LABEL[type]}) não tem meta válida.`,
      };
    }
  }
  return { valid: true, reason: null };
};
