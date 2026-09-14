/**
 * Validação de macros POR DIA (Fase 3).
 *
 * Com carb cycling ativo cada weekday tem a sua própria meta determinística
 * ({kcal,p,c,g} vindos de `resolveDayTarget`). Comparar todos os dias com uma
 * meta global esconderia erros graves (ex.: um dia LOW com as calorias do HIGH).
 *
 * Este módulo NÃO recalcula metas nem cria uma segunda calculadora: recebe os
 * targets prontos e apenas confronta o que foi gerado, usando exatamente o
 * mesmo motor nutricional (`nutritionEngine`) e as mesmas tolerâncias.
 */

import { buildFoodIndex, computeItemMacros, type FoodIndex } from '@/lib/nutritionEngine';
import {
  DIET_MACRO_TOLERANCES,
  validateDietMacros,
  type DietMacroTargets,
  type DietMacroTotals,
  type FoodMacroRecord,
} from '@/lib/dietMacroValidation';
import { WEEKDAY_KEYS, type DayTarget, type WeekdayKey } from '@/lib/dietDayTargets';

export interface GeneratedDayInput {
  weekday: WeekdayKey;
  /** Rótulo do tipo do dia (LOW/MEDIUM/HIGH) — apenas informativo. */
  type?: string | null;
  /** Caminho markdown (fallback de geração). */
  markdown?: string | null;
  /** Caminho estruturado: itens já com nome e gramas. */
  items?: Array<{
    name: string;
    qtyGrams: number;
    macros?: { kcal?: number; p?: number; c?: number; g?: number } | null;
  }> | null;
}

export interface DayMacroValidationEntry {
  weekday: WeekdayKey;
  type: string | null;
  target: DayTarget;
  generated: DayTarget;
  difference: DayTarget;
  valid: boolean;
  reasons: string[];
  unmatchedFoods: string[];
}

export interface DietDaysMacroValidationReport {
  valid: boolean;
  days: Partial<Record<WeekdayKey, DayMacroValidationEntry>>;
  /** Dias com meta definida mas sem conteúdo gerado correspondente. */
  missingDays: WeekdayKey[];
  tolerances: DietMacroTargets;
}

const toTargets = (t: DayTarget): DietMacroTargets => ({
  calories: t.kcal,
  protein: t.p,
  carbs: t.c,
  fats: t.g,
});

const toDayTarget = (t: DietMacroTotals): DayTarget => ({
  kcal: Math.round(t.calories),
  p: Math.round(t.protein),
  c: Math.round(t.carbs),
  g: Math.round(t.fats),
});

const reasonsFor = (diff: DayTarget): string[] => {
  const out: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (Math.abs(diff.kcal) > DIET_MACRO_TOLERANCES.calories) out.push(`Calorias ${sign(diff.kcal)} kcal fora da tolerância.`);
  if (Math.abs(diff.p) > DIET_MACRO_TOLERANCES.protein) out.push(`Proteína ${sign(diff.p)} g fora da tolerância.`);
  if (Math.abs(diff.c) > DIET_MACRO_TOLERANCES.carbs) out.push(`Carboidrato ${sign(diff.c)} g fora da tolerância.`);
  if (Math.abs(diff.g) > DIET_MACRO_TOLERANCES.fats) out.push(`Gordura ${sign(diff.g)} g fora da tolerância.`);
  return out;
};

const computeItemsTotals = (
  items: NonNullable<GeneratedDayInput['items']>,
  index: FoodIndex,
): { totals: DayTarget; unmatched: string[] } => {
  const unmatched: string[] = [];
  let kcal = 0, p = 0, c = 0, g = 0;
  for (const item of items) {
    const computed = computeItemMacros(
      {
        name: item.name,
        qtyGrams: Number(item.qtyGrams) || 0,
        macros: {
          kcal: Number(item.macros?.kcal) || 0,
          p: Number(item.macros?.p) || 0,
          c: Number(item.macros?.c) || 0,
          g: Number(item.macros?.g) || 0,
        },
      },
      index,
    );
    if (!computed.validated) unmatched.push(item.name);
    kcal += computed.macros.kcal;
    p += computed.macros.p;
    c += computed.macros.c;
    g += computed.macros.g;
  }
  return {
    totals: { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), g: Math.round(g) },
    unmatched,
  };
};

export const validateDietDaysMacros = ({
  days,
  dayTargets,
  foods,
}: {
  days: GeneratedDayInput[];
  dayTargets: Partial<Record<WeekdayKey, DayTarget & { type?: string | null }>>;
  foods: FoodMacroRecord[];
}): DietDaysMacroValidationReport => {
  const index = buildFoodIndex(
    (foods ?? []).map((f, i) => ({
      id: (f as { id?: string }).id ?? `food-${i}`,
      name: f.name,
      portion_size: f.portion_size ?? 100,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fats: f.fats,
    })),
  );

  const byWeekday = new Map<WeekdayKey, GeneratedDayInput>();
  for (const day of days) byWeekday.set(day.weekday, day);

  const out: Partial<Record<WeekdayKey, DayMacroValidationEntry>> = {};
  const missingDays: WeekdayKey[] = [];

  for (const wd of WEEKDAY_KEYS) {
    const target = dayTargets[wd];
    if (!target) continue;
    const generatedDay = byWeekday.get(wd);
    if (!generatedDay) {
      missingDays.push(wd);
      continue;
    }

    let generated: DayTarget;
    let unmatchedFoods: string[] = [];
    if (generatedDay.items && generatedDay.items.length > 0) {
      const computed = computeItemsTotals(generatedDay.items, index);
      generated = computed.totals;
      unmatchedFoods = computed.unmatched;
    } else {
      const report = validateDietMacros(generatedDay.markdown ?? '', toTargets(target), foods);
      generated = toDayTarget(report.generated);
      unmatchedFoods = report.unmatchedFoods;
    }

    const difference: DayTarget = {
      kcal: generated.kcal - target.kcal,
      p: generated.p - target.p,
      c: generated.c - target.c,
      g: generated.g - target.g,
    };
    const reasons = reasonsFor(difference);
    out[wd] = {
      weekday: wd,
      type: generatedDay.type ?? target.type ?? null,
      target: { kcal: target.kcal, p: target.p, c: target.c, g: target.g },
      generated,
      difference,
      valid: reasons.length === 0,
      reasons,
      unmatchedFoods,
    };
  }

  const valid =
    missingDays.length === 0 &&
    WEEKDAY_KEYS.every((wd) => !dayTargets[wd] || out[wd]?.valid === true) &&
    Object.keys(out).length > 0;

  return { valid, days: out, missingDays, tolerances: DIET_MACRO_TOLERANCES };
};

export const formatDayTargetLine = (t: DayTarget) =>
  `${Math.round(t.kcal)} kcal / ${Math.round(t.p)}P / ${Math.round(t.c)}C / ${Math.round(t.g)}G`;
