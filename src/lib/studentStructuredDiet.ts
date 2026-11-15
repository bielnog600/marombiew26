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

/* ───────────── Opções por refeição (Opção 1 = plano, Opção 2 = banco, Receitas) ───────────── */

export interface StudentMealOption {
  name: string;
  source: 'plan' | 'bank';
  bankCode?: string;
  prep?: string | null;
  foods: ParsedFood[];
  kcal: number;
}

/** Item de opção salvo (foodId/nome/gramas/macros), como no conteudo_json. */
export interface StudentOptionItem {
  foodId: string | null;
  name: string;
  qtyGrams: number;
  macros: { kcal: number; p: number; c: number; g: number };
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

/** Refeição canônica de cada refeição exibida (mesmo índice e nome; senão pelo nome). */
export const matchCanonicalMeals = (
  plan: any,
  weekdayIndex: number,
  meals: Array<Pick<ParsedMeal, 'name'>>,
): Array<{ meal: any; index: number } | null> => {
  const day = canonicalDayFor(plan, weekdayIndex);
  const canonicalMeals: any[] = Array.isArray(day?.meals) ? day.meals : [];
  return meals.map((meal, i) => {
    const byIndex = canonicalMeals[i];
    if (byIndex && sameMealName(byIndex?.name, meal.name)) return { meal: byIndex, index: i };
    const j = canonicalMeals.findIndex((m) => sameMealName(m?.name, meal.name));
    return j >= 0 ? { meal: canonicalMeals[j], index: j } : null;
  });
};

const savedBankOptions = (cm: any): any[] =>
  (Array.isArray(cm?.options) ? cm.options : []).filter(
    (o: any) => o?.source === 'bank' && Array.isArray(o?.items) && o.items.length > 0,
  );

/** Opção do banco (itens salvos ou calculados) → opção exibida ao aluno. */
export const bankOptionToStudent = (o: { name?: string; bankCode?: string; prep?: string | null; items?: StudentOptionItem[] }): StudentMealOption => {
  const foods = (o.items ?? []).map((it: any) => canonicalItemToStudentFood({ ...it, portionLabel: undefined }));
  return {
    name: String(o?.name ?? ''),
    source: 'bank',
    ...(o?.bankCode ? { bankCode: String(o.bankCode) } : {}),
    prep: o?.prep ? String(o.prep) : null,
    foods,
    kcal: sumFoodsKcal(foods),
  };
};

/**
 * Opções de cada refeição exibida no dia: Opção 1 = alimentos já exibidos (o
 * plano publicado); Opção 2 = a primeira salva pelo admin em `meal.options` ou,
 * sem opções salvas, a calculada no app (`auto`, por índice da refeição
 * canônica). Refeições sem par seguro (nome diferente) ficam `null`.
 */
export const studentMealOptionsForDay = (
  plan: any,
  weekdayIndex: number,
  meals: Array<Pick<ParsedMeal, 'name' | 'foods'>>,
  auto?: Array<{ name?: string; bankCode?: string; prep?: string | null; items?: StudentOptionItem[] } | null> | null,
): Array<StudentMealOption[] | null> => {
  const matched = matchCanonicalMeals(plan, weekdayIndex, meals);
  return meals.map((meal, i) => {
    const m = matched[i];
    if (!m) return null;
    const cm = m.meal;
    const options: any[] = Array.isArray(cm?.options) ? cm.options : [];
    const second = savedBankOptions(cm)[0] ?? auto?.[m.index] ?? null;
    const plan0 = options.find((o) => o?.source === 'plan');
    const first: StudentMealOption = {
      name: String(plan0?.name ?? meal.name),
      source: 'plan',
      prep: plan0?.prep ?? null,
      foods: meal.foods ?? [],
      kcal: sumFoodsKcal(meal.foods ?? []),
    };
    return second && (second.items?.length ?? 0) > 0 ? [first, bankOptionToStudent(second)] : [first];
  });
};

/** Antiga Opção 3 salva pelo admin (vira uma receita quando o aluno já a tinha escolhido). */
export const savedThirdOption = (cm: any): StudentMealOption | null => {
  const third = savedBankOptions(cm)[1];
  return third ? bankOptionToStudent(third) : null;
};

export type MealWithOptions<M> = M & {
  options?: StudentMealOption[];
  /** 0 = Opção 1, 1 = Opção 2, -1 = receita escolhida. */
  selectedOption?: number;
  /** Receita escolhida para o dia (cartão "Receitas"). */
  recipe?: StudentMealOption | null;
  prep?: string | null;
};

/** Escolha de uma refeição: índice da opção ou a receita do dia. */
export type StudentMealChoice = number | StudentMealOption | null | undefined;

const withFoods = <M extends { foods: ParsedFood[] }>(meal: M, opt: StudentMealOption) => {
  const t = opt.foods.reduce(
    (acc, f) => ({ kcal: acc.kcal + num(f.kcal), p: acc.p + num(f.p), c: acc.c + num(f.c), g: acc.g + num(f.g) }),
    { kcal: 0, p: 0, c: 0, g: 0 },
  );
  return {
    ...meal,
    foods: opt.foods.map((f) => ({ ...f })),
    totalKcal: fmt(t.kcal),
    totalP: fmt(t.p),
    totalC: fmt(t.c),
    totalG: fmt(t.g),
  };
};

/** Aplica a escolha (por refeição) trocando os alimentos padrão. A meta do dia continua pela Opção 1. */
export const applyStudentMealOptions = <M extends { foods: ParsedFood[]; totalKcal?: string; totalP?: string; totalC?: string; totalG?: string }>(
  meals: M[],
  optionsByMeal: Array<StudentMealOption[] | null>,
  choiceFor: (mealIndex: number) => StudentMealChoice,
): Array<MealWithOptions<M>> =>
  meals.map((meal, i) => {
    const options = optionsByMeal[i];
    if (!options || options.length === 0) return meal;
    const raw = choiceFor(i);
    if (raw && typeof raw === 'object') {
      return { ...withFoods(meal, raw), options, selectedOption: -1, recipe: raw, prep: raw.prep ?? null };
    }
    const selected = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < options.length ? (raw as number) : 0;
    const opt = options[selected];
    if (selected === 0) return { ...meal, options, selectedOption: 0, recipe: null, prep: opt.prep ?? null };
    return { ...withFoods(meal, opt), options, selectedOption: selected, recipe: null, prep: opt.prep ?? null };
  });
