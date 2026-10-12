/**
 * Edição de horário de refeição — puro, sem tocar em alimentos/macros.
 * Após aplicar, as refeições do(s) dia(s) alterado(s) são reordenadas por horário.
 */
export interface TimedMeal { name?: string | null; time?: string | null }
export interface TimedDay<M extends TimedMeal = TimedMeal> { meals?: M[] }

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

export const parseTimeToMinutes = (t?: string | null): number | null => {
  const m = TIME_RE.exec(String(t ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

export const minutesToTime = (mins: number): string => {
  const v = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

export const normalizeTime = (t?: string | null): string | undefined => {
  const m = parseTimeToMinutes(t);
  return m == null ? undefined : minutesToTime(m);
};

/** Soma minutos; sem horário parte de 07:00. */
export const shiftTime = (t: string | null | undefined, delta: number): string =>
  minutesToTime((parseTimeToMinutes(t) ?? 7 * 60) + delta);

const norm = (s?: string | null) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Chave de ordenação: 00:00–03:59 conta como fim do dia. */
export const mealSortMinutes = (t?: string | null): number | null => {
  const v = parseTimeToMinutes(t);
  if (v == null) return null;
  return v < 4 * 60 ? v + 1440 : v;
};

/**
 * Ordena por horário (estável). Refeições sem horário acompanham a refeição
 * imediatamente anterior a elas (ou ficam no início se não houver).
 */
export function sortMealsByTime<M extends TimedMeal>(meals: M[]): M[] {
  const groups: { key: number; idx: number; items: M[] }[] = [];
  const leading: M[] = [];
  meals.forEach((m, i) => {
    const k = mealSortMinutes(m?.time);
    if (k == null) {
      if (groups.length) groups[groups.length - 1].items.push(m); else leading.push(m);
    } else groups.push({ key: k, idx: i, items: [m] });
  });
  groups.sort((a, b) => a.key - b.key || a.idx - b.idx);
  return [...leading, ...groups.flatMap((g) => g.items)];
}

const withOrder = <M,>(meals: M[]): M[] =>
  meals.map((m, i) => (m && typeof (m as any).order === 'number' && (m as any).order !== i ? { ...m, order: i } : m));

export interface ApplyMealTimeResult<D> {
  days: D[];
  /** Nova posição da refeição editada no dia aberto. */
  newIndex: number;
}

/**
 * Aplica o horário. onlyThisDay=false → todos os dias: procura pelo nome
 * normalizado; se não existir, usa a posição quando o dia tem o mesmo número
 * de refeições; senão pula o dia. Só `time` (e `order`) mudam.
 */
export function applyMealTimeAndSort<D extends TimedDay>(
  days: D[], dayIdx: number, mealIdx: number, time: string | null | undefined, onlyThisDay: boolean,
): ApplyMealTimeResult<D> {
  const srcMeals = days[dayIdx]?.meals ?? [];
  const source = srcMeals[mealIdx];
  if (!source) return { days, newIndex: mealIdx };
  const value = normalizeTime(time);
  const srcName = norm(source.name);
  const srcCount = srcMeals.length;
  let newIndex = mealIdx;

  const out = days.map((d, di) => {
    const meals = d.meals ?? [];
    let target = -1;
    if (di === dayIdx) target = mealIdx;
    else if (!onlyThisDay) {
      target = srcName ? meals.findIndex((m) => norm(m?.name) === srcName) : -1;
      if (target < 0 && meals.length === srcCount && meals[mealIdx]) target = mealIdx;
    }
    if (target < 0) return d;
    const edited = { ...meals[target] } as any;
    if (value) edited.time = value; else delete edited.time;
    const sorted = withOrder(sortMealsByTime(meals.map((m, mi) => (mi === target ? edited : m))));
    if (di === dayIdx) newIndex = sorted.indexOf(edited);
    return { ...d, meals: sorted };
  });
  return { days: out, newIndex };
}

/** Compat: apenas os dias. */
export function applyMealTime<D extends TimedDay>(
  days: D[], dayIdx: number, mealIdx: number, time: string | null | undefined, onlyThisDay: boolean,
): D[] {
  return applyMealTimeAndSort(days, dayIdx, mealIdx, time, onlyThisDay).days;
}
