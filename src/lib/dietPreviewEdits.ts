/**
 * HOTFIX UX — preview EDITÁVEL do autoajuste (Fase 5 intacta).
 *
 * Toda edição do modal acontece sobre um `workingPlan` local; o plano real só
 * muda quando o treinador aplica. Nenhuma matemática nova: macros sempre pelo
 * nutritionCore (strict_id), tolerância sempre a OFICIAL.
 */
import { buildFoodIndex, computeDayTotals, type FoodRecord } from './nutritionEngine';
import { recomputeDayFromFoods } from './dietFoodResolution';
import { isWithinTolerance } from './dietAutoAdjust';
import type { DayTarget } from './dietDayTargets';

export const PREVIEW_SRC_KEY = '__previewSrcIndex';

export const clonePlan = <T,>(plan: T): T => JSON.parse(JSON.stringify(plan));

/** Marca cada item do dia com o índice de origem — permite diffs após remoções. */
export const buildWorkingPlan = <T extends { days?: any[] }>(plan: T, dayIndex: number): T => {
  const next: any = clonePlan(plan);
  const day = next?.days?.[dayIndex];
  (day?.meals ?? []).forEach((meal: any) => {
    (meal?.items ?? []).forEach((item: any, i: number) => {
      // Identidade estável: uma vez atribuída, NUNCA é reatribuída.
      if (item[PREVIEW_SRC_KEY] == null) item[PREVIEW_SRC_KEY] = i;
    });
  });
  return next as T;
};

/** Remove a marcação interna antes de devolver o plano ao fluxo canônico. */
export const stripPreviewMeta = <T extends { days?: any[] }>(plan: T): T => {
  const next: any = clonePlan(plan);
  (next?.days ?? []).forEach((day: any) => {
    (day?.meals ?? []).forEach((meal: any) => {
      (meal?.items ?? []).forEach((item: any) => {
        delete item[PREVIEW_SRC_KEY];
      });
    });
  });
  return next as T;
};

const recompute = <T extends { days?: any[] }>(plan: T, dayIndex: number, foods: FoodRecord[]): T => {
  const day = (plan as any)?.days?.[dayIndex];
  if (day) recomputeDayFromFoods(day, foods ?? []);
  return plan;
};

export interface PreviewItemRef {
  dayIndex: number;
  mealIndex: number;
  itemIndex: number;
}

/** Aceita "130", "130.5" e "130,5"; precisa ser > 0. */
export const parsePreviewGrams = (text: string): number | null => {
  const normalized = String(text ?? '').replace(',', '.').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const setPreviewItemQty = <T extends { days?: any[] }>(
  plan: T,
  ref: PreviewItemRef,
  grams: number,
  foods: FoodRecord[],
): T => {
  const next: any = clonePlan(plan);
  const item = next?.days?.[ref.dayIndex]?.meals?.[ref.mealIndex]?.items?.[ref.itemIndex];
  if (!item || !(grams > 0)) return plan;
  item.qtyGrams = grams;
  item.manualLocked = true;
  return recompute(next as T, ref.dayIndex, foods);
};

export const replacePreviewItemFood = <T extends { days?: any[] }>(
  plan: T,
  ref: PreviewItemRef,
  food: FoodRecord,
  foods: FoodRecord[],
): T => {
  const next: any = clonePlan(plan);
  const item = next?.days?.[ref.dayIndex]?.meals?.[ref.mealIndex]?.items?.[ref.itemIndex];
  if (!item || !food?.id) return plan;
  item.foodId = food.id;
  item.name = food.name;
  item.resolutionStatus = 'resolved_by_id';
  item.manualLocked = true;
  delete item.nutritionSnapshot;
  return recompute(next as T, ref.dayIndex, foods);
};

/** Refeição nunca pode ficar sem nenhum alimento. */
export const canRemovePreviewItem = (plan: any, ref: PreviewItemRef): boolean => {
  const meal = plan?.days?.[ref.dayIndex]?.meals?.[ref.mealIndex];
  return (meal?.items?.length ?? 0) > 1;
};

export const removePreviewItem = <T extends { days?: any[] }>(
  plan: T,
  ref: PreviewItemRef,
  foods: FoodRecord[],
): T => {
  if (!canRemovePreviewItem(plan, ref)) return plan;
  const next: any = clonePlan(plan);
  next.days[ref.dayIndex].meals[ref.mealIndex].items.splice(ref.itemIndex, 1);
  return recompute(next as T, ref.dayIndex, foods);
};

export interface PreviewDiffEntry {
  kind: 'qty' | 'replace' | 'remove' | 'add';
  mealIndex: number;
  mealName: string;
  beforeName?: string;
  afterName?: string;
  beforeGrams?: number;
  afterGrams?: number;
}

/** Diff ATUAL: plano original × workingPlan (não o diff inicial do optimizer). */
export const diffPreviewDay = (
  originalPlan: any,
  workingPlan: any,
  dayIndex: number,
): PreviewDiffEntry[] => {
  const out: PreviewDiffEntry[] = [];
  const origDay = originalPlan?.days?.[dayIndex];
  const workDay = workingPlan?.days?.[dayIndex];
  if (!origDay || !workDay) return out;

  (origDay.meals ?? []).forEach((meal: any, mealIndex: number) => {
    const workMeal = workDay.meals?.[mealIndex];
    const mealName = String(meal?.name ?? `Refeição ${mealIndex + 1}`);
    const workItems: any[] = workMeal?.items ?? [];

    (meal?.items ?? []).forEach((item: any, itemIndex: number) => {
      const match = workItems.find((w) => Number(w?.[PREVIEW_SRC_KEY]) === itemIndex);
      if (!match) {
        out.push({
          kind: 'remove',
          mealIndex,
          mealName,
          beforeName: String(item?.name ?? ''),
          beforeGrams: Number(item?.qtyGrams) || 0,
        });
        return;
      }
      const sameFood = String(match?.foodId ?? '') === String(item?.foodId ?? '');
      const beforeGrams = Number(item?.qtyGrams) || 0;
      const afterGrams = Number(match?.qtyGrams) || 0;
      if (!sameFood) {
        out.push({
          kind: 'replace',
          mealIndex,
          mealName,
          beforeName: String(item?.name ?? ''),
          afterName: String(match?.name ?? ''),
          beforeGrams,
          afterGrams,
        });
        return;
      }
      if (Math.abs(afterGrams - beforeGrams) > 0.0001) {
        out.push({
          kind: 'qty',
          mealIndex,
          mealName,
          beforeName: String(item?.name ?? ''),
          afterName: String(match?.name ?? ''),
          beforeGrams,
          afterGrams,
        });
      }
    });

    workItems.forEach((w) => {
      if (w?.[PREVIEW_SRC_KEY] == null) {
        out.push({
          kind: 'add',
          mealIndex,
          mealName,
          afterName: String(w?.name ?? ''),
          afterGrams: Number(w?.qtyGrams) || 0,
        });
      }
    });
  });

  return out;
};

export interface PreviewDayStatus {
  totals: DayTarget;
  diff: DayTarget | null;
  withinTolerance: boolean;
}

export const previewDayStatus = (
  plan: any,
  dayIndex: number,
  target: DayTarget | null | undefined,
  foods: FoodRecord[],
): PreviewDayStatus => {
  const index = buildFoodIndex(foods ?? []);
  const day = plan?.days?.[dayIndex];
  const computed = computeDayTotals(
    (day?.meals ?? []).map((m: any) => ({
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
  const totals = { ...computed.totals };
  if (!target) return { totals, diff: null, withinTolerance: false };
  const diff = {
    kcal: totals.kcal - target.kcal,
    p: totals.p - target.p,
    c: totals.c - target.c,
    g: totals.g - target.g,
  };
  return { totals, diff, withinTolerance: isWithinTolerance(diff) };
};
