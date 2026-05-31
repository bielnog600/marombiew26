/**
 * Structured diff between two DietPlans (canonical pipeline).
 *
 * Pure functions only. Used by the version comparison dialog to power a
 * structured review (meals added/removed, items changed, kcal/macros per
 * meal, structural preservation and change magnitude) without depending on
 * markdown parsing.
 */
import type { DietPlan, DietDay, Meal, MealItem, Macros } from './dietSchema';
import { recomputePlanTotals } from './dietValidation';

const ZERO: Macros = { kcal: 0, p: 0, c: 0, g: 0 };

const round = (n: number, d = 1): number => {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

const sub = (a: Macros, b: Macros): Macros => ({
  kcal: round(a.kcal - b.kcal, 0),
  p: round(a.p - b.p, 1),
  c: round(a.c - b.c, 1),
  g: round(a.g - b.g, 1),
});

const normalizeKey = (s: string): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const itemKey = (it: MealItem): string => normalizeKey(it.name);

const macrosEqual = (a: Macros, b: Macros, tol = 1): boolean =>
  Math.abs(a.kcal - b.kcal) <= tol * 5 &&
  Math.abs(a.p - b.p) <= tol &&
  Math.abs(a.c - b.c) <= tol &&
  Math.abs(a.g - b.g) <= tol;

const portionEqual = (a: MealItem, b: MealItem): boolean => {
  if (a.qtyGrams != null && b.qtyGrams != null) {
    return Math.abs((a.qtyGrams ?? 0) - (b.qtyGrams ?? 0)) <= 1;
  }
  return (a.portionLabel ?? '').trim() === (b.portionLabel ?? '').trim();
};

export type ItemChangeReason = 'portion' | 'macros' | 'both';

export interface ItemChange {
  from: MealItem;
  to: MealItem;
  reason: ItemChangeReason;
  kcalDelta: number;
  macroDeltas: { p: number; c: number; g: number };
}

export type MealDiffStatus = 'unchanged' | 'added' | 'removed' | 'modified';

export interface MealDiff {
  status: MealDiffStatus;
  name: string;
  time?: string;
  order: number;
  current?: Meal;
  draft?: Meal;
  itemsAdded: MealItem[];
  itemsRemoved: MealItem[];
  itemsChanged: ItemChange[];
  itemsUnchanged: number;
  kcalDelta: number;
  macroDeltas: { p: number; c: number; g: number };
  totalsCurrent: Macros;
  totalsDraft: Macros;
}

export interface DayDiff {
  label: string;
  weekdayCurrent?: string;
  weekdayDraft?: string;
  meals: MealDiff[];
  totalsCurrent: Macros;
  totalsDraft: Macros;
  kcalDelta: number;
  macroDeltas: { p: number; c: number; g: number };
}

export type ChangeMagnitude = 'leve' | 'moderada' | 'alta';

export interface DietPlanDiff {
  dayDiffs: DayDiff[];
  totalsCurrent: Macros;
  totalsDraft: Macros;
  kcalDelta: number;
  macroDeltas: { p: number; c: number; g: number };
  mealsAdded: number;
  mealsRemoved: number;
  mealsModified: number;
  mealsUnchanged: number;
  itemsAdded: number;
  itemsRemoved: number;
  itemsChanged: number;
  itemsTotalCurrent: number;
  itemsTotalDraft: number;
  /** % de itens preservados (mesmo alimento, mesma porção, mesmos macros). */
  structurePreservationPct: number;
  magnitude: ChangeMagnitude;
  magnitudeReasons: string[];
}

const matchMealName = (a: Meal, b: Meal): boolean =>
  normalizeKey(a.name) === normalizeKey(b.name);

const diffMeal = (current: Meal | undefined, draft: Meal | undefined): MealDiff => {
  const cItems = current?.items ?? [];
  const dItems = draft?.items ?? [];

  const cMap = new Map<string, MealItem>();
  cItems.forEach((it) => cMap.set(itemKey(it), it));
  const dMap = new Map<string, MealItem>();
  dItems.forEach((it) => dMap.set(itemKey(it), it));

  const itemsAdded: MealItem[] = [];
  const itemsRemoved: MealItem[] = [];
  const itemsChanged: ItemChange[] = [];
  let itemsUnchanged = 0;

  for (const [k, c] of cMap) {
    const d = dMap.get(k);
    if (!d) {
      itemsRemoved.push(c);
      continue;
    }
    const samePortion = portionEqual(c, d);
    const sameMacros = macrosEqual(c.macros, d.macros);
    if (samePortion && sameMacros) {
      itemsUnchanged += 1;
    } else {
      const reason: ItemChangeReason =
        !samePortion && !sameMacros ? 'both' : !samePortion ? 'portion' : 'macros';
      itemsChanged.push({
        from: c,
        to: d,
        reason,
        kcalDelta: round(d.macros.kcal - c.macros.kcal, 0),
        macroDeltas: {
          p: round(d.macros.p - c.macros.p, 1),
          c: round(d.macros.c - c.macros.c, 1),
          g: round(d.macros.g - c.macros.g, 1),
        },
      });
    }
  }
  for (const [k, d] of dMap) if (!cMap.has(k)) itemsAdded.push(d);

  const totalsCurrent: Macros = current?.totals ?? ZERO;
  const totalsDraft: Macros = draft?.totals ?? ZERO;
  const delta = sub(totalsDraft, totalsCurrent);

  const status: MealDiffStatus = !current
    ? 'added'
    : !draft
      ? 'removed'
      : itemsAdded.length + itemsRemoved.length + itemsChanged.length === 0
        ? 'unchanged'
        : 'modified';

  return {
    status,
    name: draft?.name ?? current?.name ?? 'Refeição',
    time: draft?.time ?? current?.time,
    order: draft?.order ?? current?.order ?? 0,
    current,
    draft,
    itemsAdded,
    itemsRemoved,
    itemsChanged,
    itemsUnchanged,
    kcalDelta: delta.kcal,
    macroDeltas: { p: delta.p, c: delta.c, g: delta.g },
    totalsCurrent,
    totalsDraft,
  };
};

/**
 * Pareia as refeições do `current` com as do `draft`.
 * Estratégia: tenta casar pelo nome normalizado; refeições sem par viram
 * adicionadas/removidas; ordem segue o draft, depois sobras do current.
 */
const pairMeals = (
  currentMeals: Meal[],
  draftMeals: Meal[],
): Array<{ current?: Meal; draft?: Meal }> => {
  const unmatchedCurrent = [...currentMeals];
  const pairs: Array<{ current?: Meal; draft?: Meal }> = [];
  for (const d of draftMeals) {
    const idx = unmatchedCurrent.findIndex((c) => matchMealName(c, d));
    if (idx >= 0) {
      const [c] = unmatchedCurrent.splice(idx, 1);
      pairs.push({ current: c, draft: d });
    } else {
      pairs.push({ draft: d });
    }
  }
  for (const c of unmatchedCurrent) pairs.push({ current: c });
  pairs.sort((a, b) => {
    const ao = a.draft?.order ?? a.current?.order ?? 99;
    const bo = b.draft?.order ?? b.current?.order ?? 99;
    return ao - bo;
  });
  return pairs;
};

const diffDay = (current: DietDay | undefined, draft: DietDay | undefined): DayDiff => {
  const pairs = pairMeals(current?.meals ?? [], draft?.meals ?? []);
  const meals = pairs.map((p) => diffMeal(p.current, p.draft));
  const totalsCurrent: Macros = current?.totals ?? ZERO;
  const totalsDraft: Macros = draft?.totals ?? ZERO;
  const delta = sub(totalsDraft, totalsCurrent);
  return {
    label: draft?.label ?? current?.label ?? 'Dia',
    weekdayCurrent: current?.weekday,
    weekdayDraft: draft?.weekday,
    meals,
    totalsCurrent,
    totalsDraft,
    kcalDelta: delta.kcal,
    macroDeltas: { p: delta.p, c: delta.c, g: delta.g },
  };
};

const classifyMagnitude = (d: {
  mealsAdded: number;
  mealsRemoved: number;
  mealsModified: number;
  itemsAdded: number;
  itemsRemoved: number;
  itemsChanged: number;
  itemsTotalCurrent: number;
  totalsCurrent: Macros;
  kcalDelta: number;
}): { magnitude: ChangeMagnitude; reasons: string[] } => {
  const reasons: string[] = [];
  const touched = d.itemsAdded + d.itemsRemoved + d.itemsChanged;
  const base = Math.max(d.itemsTotalCurrent, 1);
  const changedRatio = touched / base;
  const kcalPct = d.totalsCurrent.kcal > 0 ? Math.abs(d.kcalDelta) / d.totalsCurrent.kcal : 0;

  let magnitude: ChangeMagnitude = 'leve';

  if (changedRatio >= 0.4) {
    magnitude = 'alta';
    reasons.push(`${Math.round(changedRatio * 100)}% dos itens foram tocados`);
  } else if (changedRatio >= 0.15) {
    magnitude = 'moderada';
    reasons.push(`${Math.round(changedRatio * 100)}% dos itens foram tocados`);
  }

  if (kcalPct >= 0.15) {
    magnitude = 'alta';
    reasons.push(`variação calórica de ${Math.round(kcalPct * 100)}%`);
  } else if (kcalPct >= 0.05 && magnitude === 'leve') {
    magnitude = 'moderada';
    reasons.push(`variação calórica de ${Math.round(kcalPct * 100)}%`);
  }

  if (d.mealsAdded + d.mealsRemoved > 0) {
    magnitude = 'alta';
    reasons.push(`estrutura de refeições mudou (+${d.mealsAdded} / -${d.mealsRemoved})`);
  } else if (d.mealsModified >= 3 && magnitude === 'leve') {
    magnitude = 'moderada';
    reasons.push(`${d.mealsModified} refeições com alterações`);
  }

  if (reasons.length === 0) reasons.push('Mudanças pequenas — plano amplamente preservado');

  return { magnitude, reasons };
};

/**
 * Compara dois DietPlan e devolve um diff estruturado pronto pra UI.
 * Foco no primeiro dia (referência). Para ciclos, soma todos os dias.
 */
export const diffDietPlans = (currentRaw: DietPlan, draftRaw: DietPlan): DietPlanDiff => {
  const current = recomputePlanTotals(currentRaw);
  const draft = recomputePlanTotals(draftRaw);

  const maxDays = Math.max(current.days.length, draft.days.length);
  const dayDiffs: DayDiff[] = [];
  for (let i = 0; i < maxDays; i++) {
    dayDiffs.push(diffDay(current.days[i], draft.days[i]));
  }

  let mealsAdded = 0, mealsRemoved = 0, mealsModified = 0, mealsUnchanged = 0;
  let itemsAdded = 0, itemsRemoved = 0, itemsChanged = 0;
  let itemsTotalCurrent = 0, itemsTotalDraft = 0;
  let itemsUnchangedTotal = 0;

  for (const day of dayDiffs) {
    for (const meal of day.meals) {
      if (meal.status === 'added') mealsAdded += 1;
      else if (meal.status === 'removed') mealsRemoved += 1;
      else if (meal.status === 'modified') mealsModified += 1;
      else mealsUnchanged += 1;
      itemsAdded += meal.itemsAdded.length;
      itemsRemoved += meal.itemsRemoved.length;
      itemsChanged += meal.itemsChanged.length;
      itemsUnchangedTotal += meal.itemsUnchanged;
      itemsTotalCurrent += meal.current?.items.length ?? 0;
      itemsTotalDraft += meal.draft?.items.length ?? 0;
    }
  }

  // totals (sum across all days)
  const totalsCurrent = dayDiffs.reduce<Macros>(
    (acc, d) => ({
      kcal: acc.kcal + d.totalsCurrent.kcal,
      p: acc.p + d.totalsCurrent.p,
      c: acc.c + d.totalsCurrent.c,
      g: acc.g + d.totalsCurrent.g,
    }),
    ZERO,
  );
  const totalsDraft = dayDiffs.reduce<Macros>(
    (acc, d) => ({
      kcal: acc.kcal + d.totalsDraft.kcal,
      p: acc.p + d.totalsDraft.p,
      c: acc.c + d.totalsDraft.c,
      g: acc.g + d.totalsDraft.g,
    }),
    ZERO,
  );
  // Use day 0 as reference for delta (avg comportment for single-day plans)
  const refIdx = 0;
  const refDay = dayDiffs[refIdx];
  const kcalDelta = refDay?.kcalDelta ?? sub(totalsDraft, totalsCurrent).kcal;
  const macroDeltas = refDay?.macroDeltas ?? {
    p: round(totalsDraft.p - totalsCurrent.p, 1),
    c: round(totalsDraft.c - totalsCurrent.c, 1),
    g: round(totalsDraft.g - totalsCurrent.g, 1),
  };

  const structureBase = Math.max(itemsTotalCurrent, itemsTotalDraft, 1);
  const structurePreservationPct = Math.round((itemsUnchangedTotal / structureBase) * 100);

  const { magnitude, reasons } = classifyMagnitude({
    mealsAdded,
    mealsRemoved,
    mealsModified,
    itemsAdded,
    itemsRemoved,
    itemsChanged,
    itemsTotalCurrent,
    totalsCurrent: refDay?.totalsCurrent ?? totalsCurrent,
    kcalDelta,
  });

  return {
    dayDiffs,
    totalsCurrent,
    totalsDraft,
    kcalDelta,
    macroDeltas,
    mealsAdded,
    mealsRemoved,
    mealsModified,
    mealsUnchanged,
    itemsAdded,
    itemsRemoved,
    itemsChanged,
    itemsTotalCurrent,
    itemsTotalDraft,
    structurePreservationPct,
    magnitude,
    magnitudeReasons: reasons,
  };
};

export const magnitudeMeta: Record<
  ChangeMagnitude,
  { label: string; className: string; description: string }
> = {
  leve: {
    label: 'Mudança leve',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    description: 'A IA preservou a maior parte do plano anterior.',
  },
  moderada: {
    label: 'Mudança moderada',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    description: 'Ajustes significativos, mas a estrutura principal foi mantida.',
  },
  alta: {
    label: 'Mudança alta',
    className: 'bg-red-500/10 text-red-400 border-red-500/30',
    description: 'Reestruturação ampla — revise com atenção antes de publicar.',
  },
};