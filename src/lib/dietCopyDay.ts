/**
 * HOTFIX UX — copiar o cardápio de um dia para os demais dias da semana.
 *
 * Copia apenas a ESTRUTURA alimentar (refeições, horários, ordem, foodId,
 * nome, quantidade de partida). Nunca copia weekday, meta, tipo LOW/MEDIUM/
 * HIGH, totals ou nutritionSnapshot do dia de origem. Cada destino é ajustado
 * pelo optimizer da Fase 5 contra a SUA meta. Sem IA, sem rede, determinístico.
 */
import { buildFoodIndex, computeDayTotals, type FoodRecord } from './nutritionEngine';
import { recomputeDayFromFoods } from './dietFoodResolution';
import { optimizeDietDay, isValidTarget, isWithinTolerance } from './dietAutoAdjust';
import type { DayTarget } from './dietDayTargets';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const COPY_DAY_MESSAGES = {
  unresolved: 'Resolva todos os alimentos deste dia antes de copiar para a semana.',
  no_target: 'Sem meta válida',
  infeasible: 'Não foi possível ajustar.',
} as const;

/** true quando todos os itens do dia têm foodId válido presente na base. */
export const dayIsFullyResolved = (
  plan: any,
  dayIndex: number,
  foods: FoodRecord[],
): boolean => {
  const index = buildFoodIndex(foods ?? []);
  const day = plan?.days?.[dayIndex];
  if (!day) return false;
  const computed = computeDayTotals(
    (day.meals ?? []).map((m: any) => ({
      items: (m?.items ?? []).map((it: any) => ({
        foodId: it?.foodId ?? null,
        name: String(it?.name ?? ''),
        qtyGrams: Number(it?.qtyGrams) || 0,
      })),
    })),
    index,
    'draft',
    'strict_id',
  );
  const anyItem = (day.meals ?? []).some((m: any) => (m?.items ?? []).length > 0);
  if (!anyItem) return false;
  return !computed.meals.some((m) => m.items.some((i) => i.status === 'unresolved'));
};

/**
 * Dia de destino com as refeições do dia de origem como ponto de partida.
 * weekday/label/metadados do destino são preservados.
 */
export const prepareDayCopy = (sourceDay: any, destinationDay: any): any => {
  const dest = clone(destinationDay ?? {});
  const meals = (sourceDay?.meals ?? []).map((meal: any) => {
    const nextMeal = clone(meal);
    delete nextMeal.totals;
    nextMeal.totals = { kcal: 0, p: 0, c: 0, g: 0 };
    nextMeal.items = (meal?.items ?? []).map((item: any) => {
      const nextItem: any = clone(item);
      delete nextItem.nutritionSnapshot;
      nextItem.manualLocked = false;
      nextItem.macros = { kcal: 0, p: 0, c: 0, g: 0 };
      return nextItem;
    });
    return nextMeal;
  });
  dest.meals = meals;
  dest.totals = { kcal: 0, p: 0, c: 0, g: 0 };
  return dest;
};

export type CopyDayStatus = 'ok' | 'infeasible' | 'no_target';

export interface CopyDayResult {
  dayIndex: number;
  weekday?: string;
  label?: string;
  target: DayTarget | null;
  status: CopyDayStatus;
  totals: DayTarget | null;
  message?: string;
}

export interface SimulateCopyInput<T = any> {
  plan: T;
  sourceIndex: number;
  targetsByDay?: Array<DayTarget | null | undefined>;
  foods: FoodRecord[];
  /** Quando informado, apenas estes índices são simulados/substituídos. */
  destinationIndexes?: number[];
}

export interface SimulateCopyOutput<T = any> {
  /** Plano com APENAS os destinos viáveis substituídos. */
  plan: T;
  results: CopyDayResult[];
  blocked?: string;
}

/** Normaliza rótulo de tipo do dia (LOW/MEDIUM/HIGH). */
export const normalizeDayType = (raw: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | null => {
  const v = String(raw ?? '').trim().toUpperCase();
  return v === 'LOW' || v === 'MEDIUM' || v === 'HIGH' ? v : null;
};

/** Índices de todos os destinos possíveis (todos os dias menos a origem). */
export const allDestinationIndexes = (dayCount: number, sourceIndex: number): number[] =>
  Array.from({ length: Math.max(0, dayCount) }, (_, i) => i).filter((i) => i !== sourceIndex);

/** Índices dos dias com o MESMO tipo da origem (nunca inclui a origem). */
export const sameTypeDestinationIndexes = (
  dayTypes: Array<string | null | undefined>,
  sourceIndex: number,
): number[] => {
  const sourceType = normalizeDayType(dayTypes?.[sourceIndex]);
  if (!sourceType) return [];
  return dayTypes
    .map((t, i) => (i !== sourceIndex && normalizeDayType(t) === sourceType ? i : -1))
    .filter((i) => i >= 0);
};

/**
 * Simula a cópia em memória. Nunca muta o plano recebido; devolve um plano
 * novo com os destinos viáveis já otimizados contra a própria meta.
 */
export function simulateCopyDayToWeek<T extends { days?: any[] }>({
  plan,
  sourceIndex,
  targetsByDay,
  foods,
  destinationIndexes,
}: SimulateCopyInput<T>): SimulateCopyOutput<T> {
  const results: CopyDayResult[] = [];
  const days = (plan as any)?.days ?? [];
  const sourceDay = days[sourceIndex];
  if (!sourceDay) return { plan, results, blocked: 'Dia de origem inexistente.' };
  if (!dayIsFullyResolved(plan, sourceIndex, foods)) {
    return { plan, results, blocked: COPY_DAY_MESSAGES.unresolved };
  }

  const allowed = destinationIndexes ? new Set(destinationIndexes) : null;

  let working: any = clone(plan);

  days.forEach((destDay: any, dayIndex: number) => {
    if (dayIndex === sourceIndex) return;
    if (allowed && !allowed.has(dayIndex)) return;

    const target = targetsByDay?.[dayIndex] ?? null;
    const meta: CopyDayResult = {
      dayIndex,
      weekday: destDay?.weekday,
      label: destDay?.label,
      target: target ?? null,
      status: 'no_target',
      totals: null,
    };
    if (!isValidTarget(target)) {
      meta.message = COPY_DAY_MESSAGES.no_target;
      results.push(meta);
      return;
    }

    const candidate: any = clone(working);
    candidate.days[dayIndex] = prepareDayCopy(sourceDay, destDay);
    recomputeDayFromFoods(candidate.days[dayIndex], foods);

    const optimized = optimizeDietDay<any>({
      plan: candidate,
      dayIndex,
      target,
      foods,
    });

    let finalPlan: any | null = null;
    if (optimized.status === 'already_within_target') finalPlan = candidate;
    else if (optimized.status === 'feasible' && optimized.feasibleAdjustedPlan)
      finalPlan = optimized.feasibleAdjustedPlan;

    if (!finalPlan) {
      meta.status = 'infeasible';
      meta.message = optimized.reason ?? COPY_DAY_MESSAGES.infeasible;
      results.push(meta);
      return;
    }

    recomputeDayFromFoods(finalPlan.days[dayIndex], foods);
    const totals = finalPlan.days[dayIndex].totals as DayTarget;
    const diff = {
      kcal: totals.kcal - target.kcal,
      p: totals.p - target.p,
      c: totals.c - target.c,
      g: totals.g - target.g,
    };
    if (!isWithinTolerance(diff)) {
      meta.status = 'infeasible';
      meta.message = COPY_DAY_MESSAGES.infeasible;
      results.push(meta);
      return;
    }

    meta.status = 'ok';
    meta.totals = totals;
    results.push(meta);
    working = finalPlan;
  });

  return { plan: working as T, results };
}
