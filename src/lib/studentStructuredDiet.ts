/**
 * HOTFIX ALUNO — dieta STRUCTURED publicada é exibida exatamente como foi
 * publicada. A autoridade é `conteudo_json.days`: nada de markdown, nada de
 * base_daily_kcal, nada de scaling proporcional no cliente.
 */
import type { ParsedFood, ParsedMeal } from '@/lib/dietResultParser';
import { isStructuredCanonicalPlan } from '@/lib/dietStructuredGuards';
import { dayCarbLevelLabel } from '@/lib/dietCarbCycle';

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
  /** Rótulo legível do nível (ex.: "Carbo alto"), quando houver. */
  label?: string | null;
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
    label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : null,
  };
};

export interface StudentStructuredDay {
  weekday: StudentWeekdayKey;
  label: string;
  tag: string;
  /** Selo do ciclo de carbo do dia ("Carbo alto"…), null nos dias padrão. */
  carbLabel: string | null;
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
    const carbLabel = dayCarbLevelLabel(day, target);
    out.push({
      weekday: key,
      label: STUDENT_WEEKDAY_LABELS[i],
      tag: carbLabel ?? target?.type ?? '',
      carbLabel,
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

/* ───────────────── Opções por refeição (Opção 1 = plano, 2/3 = banco) ───────────────── */

export interface StudentMealOption {
  name: string;
  source: 'plan' | 'bank';
  bankCode?: string;
  prep?: string | null;
  foods: ParsedFood[];
  kcal: number;
}

const sumFoodsKcal = (foods: ParsedFood[]): number =>
  foods.reduce((acc, f) => acc + num(String(f?.kcal ?? '').replace(',', '.')), 0);

const sameMealName = (a: unknown, b: unknown) => strip(a).replace(/[^a-z0-9]+/g, '') === strip(b).replace(/[^a-z0-9]+/g, '');

/** Dia canônico de um weekday; dieta com um único dia ("Padrão") vale para todos. */
export const canonicalDayFor = (plan: any, weekdayIndex: number) => {
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const key = STUDENT_WEEKDAY_KEYS[weekdayIndex];
  return (key ? getStructuredDietDay(plan, key) : null) ?? (days.length === 1 ? days[0] : null);
};

/**
 * Opções de cada refeição exibida no dia. A Opção 1 usa os alimentos já
 * exibidos (o plano publicado); as opções 2/3 vêm de `meal.options` do
 * conteudo_json. Refeições sem par seguro (nome diferente) ficam com 1 opção.
 */
export const studentMealOptionsForDay = (
  plan: any,
  weekdayIndex: number,
  meals: Array<Pick<ParsedMeal, 'name' | 'foods'>>,
): Array<StudentMealOption[] | null> => {
  const day = canonicalDayFor(plan, weekdayIndex);
  const canonicalMeals: any[] = Array.isArray(day?.meals) ? day.meals : [];
  return meals.map((meal, i) => {
    const byIndex = canonicalMeals[i];
    const cm = byIndex && sameMealName(byIndex?.name, meal.name)
      ? byIndex
      : canonicalMeals.find((m) => sameMealName(m?.name, meal.name));
    const options: any[] = Array.isArray(cm?.options) ? cm.options : [];
    const bank = options.filter((o) => o?.source === 'bank' && Array.isArray(o?.items) && o.items.length > 0).slice(0, 2);
    if (bank.length === 0) return null;
    const plan0 = options.find((o) => o?.source === 'plan');
    const first: StudentMealOption = {
      name: String(plan0?.name ?? meal.name),
      source: 'plan',
      prep: plan0?.prep ?? null,
      foods: meal.foods ?? [],
      kcal: sumFoodsKcal(meal.foods ?? []),
    };
    return [
      first,
      ...bank.map((o) => {
        const foods = (o.items ?? []).map((it: any) => canonicalItemToStudentFood({ ...it, portionLabel: undefined }));
        return {
          name: String(o?.name ?? ''),
          source: 'bank' as const,
          ...(o?.bankCode ? { bankCode: String(o.bankCode) } : {}),
          prep: o?.prep ? String(o.prep) : null,
          foods,
          kcal: sumFoodsKcal(foods),
        };
      }),
    ];
  });
};

export type MealWithOptions<M> = M & {
  options?: StudentMealOption[];
  selectedOption?: number;
  prep?: string | null;
};

/** Aplica a opção escolhida (por refeição) trocando os alimentos padrão. */
export const applyStudentMealOptions = <M extends { foods: ParsedFood[]; totalKcal?: string; totalP?: string; totalC?: string; totalG?: string }>(
  meals: M[],
  optionsByMeal: Array<StudentMealOption[] | null>,
  choiceFor: (mealIndex: number) => number,
): Array<MealWithOptions<M>> =>
  meals.map((meal, i) => {
    const options = optionsByMeal[i];
    if (!options || options.length < 2) return meal;
    const raw = choiceFor(i);
    const selected = Number.isInteger(raw) && raw >= 0 && raw < options.length ? raw : 0;
    const opt = options[selected];
    if (selected === 0) return { ...meal, options, selectedOption: 0, prep: opt.prep ?? null };
    const t = opt.foods.reduce(
      (acc, f) => ({
        kcal: acc.kcal + num(f.kcal),
        p: acc.p + num(f.p),
        c: acc.c + num(f.c),
        g: acc.g + num(f.g),
      }),
      { kcal: 0, p: 0, c: 0, g: 0 },
    );
    return {
      ...meal,
      foods: opt.foods.map((f) => ({ ...f })),
      totalKcal: fmt(t.kcal),
      totalP: fmt(t.p),
      totalC: fmt(t.c),
      totalG: fmt(t.g),
      options,
      selectedOption: selected,
      prep: opt.prep ?? null,
    };
  });
