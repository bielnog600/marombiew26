/**
 * HOTFIX ALUNO — dieta STRUCTURED publicada é exibida exatamente como foi
 * publicada. A autoridade é `conteudo_json.days`: nada de markdown, nada de
 * base_daily_kcal, nada de scaling proporcional no cliente.
 */
import type { ParsedFood, ParsedMeal } from '@/lib/dietResultParser';
import { isStructuredCanonicalPlan } from '@/lib/dietStructuredGuards';

export const STUDENT_WEEKDAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
export const STUDENT_WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export type StudentWeekdayKey = (typeof STUDENT_WEEKDAY_KEYS)[number];

const strip = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const WEEKDAY_ALIASES: Record<string, StudentWeekdayKey> = {
  seg: 'seg', segunda: 'seg', 'segunda-feira': 'seg', monday: 'seg', mon: 'seg',
  ter: 'ter', terca: 'ter', 'terca-feira': 'ter', tuesday: 'ter', tue: 'ter',
  qua: 'qua', quarta: 'qua', 'quarta-feira': 'qua', wednesday: 'qua', wed: 'qua',
  qui: 'qui', quinta: 'qui', 'quinta-feira': 'qui', thursday: 'qui', thu: 'qui',
  sex: 'sex', sexta: 'sex', 'sexta-feira': 'sex', friday: 'sex', fri: 'sex',
  sab: 'sab', sabado: 'sab', saturday: 'sab', sat: 'sab',
  dom: 'dom', domingo: 'dom', sunday: 'dom', sun: 'dom',
};

export const normalizeWeekdayKey = (value: unknown): StudentWeekdayKey | null =>
  WEEKDAY_ALIASES[strip(value)] ?? null;

/** Índice 0=Seg .. 6=Dom do dia de hoje. */
export const todayWeekdayIndex = (date: Date = new Date()): number => (date.getDay() + 6) % 7;

export const isStructuredPublishedDiet = (plan: any, isDraft?: boolean | null): boolean =>
  isDraft !== true && isStructuredCanonicalPlan(plan);

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: unknown): string => {
  const n = num(v);
  return String(Math.round(n * 10) / 10);
};

/**
 * Converte um item canônico publicado em ParsedFood.
 * IMPORTANTE: `item.macros` já corresponde à quantidade REAL do item;
 * `nutritionSnapshot` é por porção de referência e NUNCA vai para a UI.
 */
export const canonicalItemToStudentFood = (item: any): ParsedFood => ({
  food: String(item?.name ?? ''),
  qty: item?.portionLabel ? String(item.portionLabel) : `${num(item?.qtyGrams)} g`,
  kcal: fmt(item?.macros?.kcal),
  p: fmt(item?.macros?.p),
  c: fmt(item?.macros?.c),
  g: fmt(item?.macros?.g),
});

export const canonicalDayToStudentMeals = (day: any): ParsedMeal[] =>
  (day?.meals ?? []).map((meal: any) => ({
    name: String(meal?.name ?? 'Refeição'),
    time: meal?.time ? String(meal.time) : undefined,
    foods: (meal?.items ?? []).map(canonicalItemToStudentFood),
    totalKcal: meal?.totals ? fmt(meal.totals.kcal) : undefined,
    totalP: meal?.totals ? fmt(meal.totals.p) : undefined,
    totalC: meal?.totals ? fmt(meal.totals.c) : undefined,
    totalG: meal?.totals ? fmt(meal.totals.g) : undefined,
  }));

export const getStructuredDietDay = (plan: any, weekday: StudentWeekdayKey | string) => {
  const key = normalizeWeekdayKey(weekday);
  const days = Array.isArray(plan?.days) ? plan.days : [];
  if (!key) return null;
  return (
    days.find((d: any) => normalizeWeekdayKey(d?.weekday) === key) ??
    days.find((d: any) => normalizeWeekdayKey(d?.label) === key) ??
    null
  );
};

export interface PublishedDayTarget {
  kcal: number;
  p: number;
  c: number;
  g: number;
  type?: string | null;
}

/**
 * Meta TEÓRICA do dia (referência). Prioridade: weekly_day_targets.
 * base_daily_kcal nunca é usado quando weekly_day_targets existe.
 */
export const getPublishedDayTarget = (
  protocols: any,
  weekday: StudentWeekdayKey | string,
): PublishedDayTarget | null => {
  const key = normalizeWeekdayKey(weekday);
  if (!key) return null;
  const table = protocols?.weekly_day_targets;
  if (!table || typeof table !== 'object') return null;
  const entry = table[key];
  if (!entry || typeof entry !== 'object') return null;
  const kcal = num(entry.kcal);
  if (kcal <= 0) return null;
  return {
    kcal,
    p: num(entry.p),
    c: num(entry.c),
    g: num(entry.g),
    type: entry.type ? String(entry.type).toUpperCase() : null,
  };
};

export interface StudentStructuredDay {
  weekday: StudentWeekdayKey;
  label: string;
  tag: string;
  meals: ParsedMeal[];
  totals: { kcal: number; p: number; c: number; g: number };
  target: PublishedDayTarget | null;
}

const sumMeals = (meals: ParsedMeal[]) =>
  meals.reduce(
    (acc, meal) => {
      meal.foods.forEach((f) => {
        acc.kcal += num(f.kcal);
        acc.p += num(f.p);
        acc.c += num(f.c);
        acc.g += num(f.g);
      });
      return acc;
    },
    { kcal: 0, p: 0, c: 0, g: 0 },
  );

/** Um grupo por weekday, sempre a partir do dia publicado real. */
export const buildStructuredDisplayGroups = (
  plan: any,
  protocols: any,
): StudentStructuredDay[] => {
  if (!isStructuredCanonicalPlan(plan)) return [];
  const out: StudentStructuredDay[] = [];
  STUDENT_WEEKDAY_KEYS.forEach((key, i) => {
    const day = getStructuredDietDay(plan, key);
    if (!day) return;
    const meals = canonicalDayToStudentMeals(day);
    const target = getPublishedDayTarget(protocols, key);
    const totals = day?.totals
      ? { kcal: num(day.totals.kcal), p: num(day.totals.p), c: num(day.totals.c), g: num(day.totals.g) }
      : sumMeals(meals);
    out.push({
      weekday: key,
      label: STUDENT_WEEKDAY_LABELS[i],
      tag: target?.type ?? '',
      meals,
      totals,
      target,
    });
  });
  return out;
};

export const getStructuredDayDisplay = (
  plan: any,
  protocols: any,
  weekday: StudentWeekdayKey | string,
): StudentStructuredDay | null => {
  const key = normalizeWeekdayKey(weekday);
  if (!key) return null;
  return buildStructuredDisplayGroups(plan, protocols).find((d) => d.weekday === key) ?? null;
};
