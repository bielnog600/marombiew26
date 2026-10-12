/**
 * Edição de horário de refeição — puro, sem tocar em alimentos/macros.
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

/**
 * Aplica o horário. onlyThisDay=false → todos os dias: mesmo índice e mesmo
 * nome; se o nome não bater, só pelo índice quando o dia tem o mesmo número
 * de refeições; senão pula o dia. Só o campo `time` muda.
 */
export function applyMealTime<D extends TimedDay>(
  days: D[], dayIdx: number, mealIdx: number, time: string | null | undefined, onlyThisDay: boolean,
): D[] {
  const source = days[dayIdx]?.meals?.[mealIdx];
  if (!source) return days;
  const value = normalizeTime(time);
  const srcName = norm(source.name);
  const srcCount = days[dayIdx].meals?.length ?? 0;
  const setTime = <M extends TimedMeal>(m: M): M => {
    const next = { ...m } as M;
    if (value) next.time = value; else delete (next as any).time;
    return next;
  };
  return days.map((d, di) => {
    if (di !== dayIdx) {
      if (onlyThisDay) return d;
      const target = d.meals?.[mealIdx];
      if (!target) return d;
      const nameOk = norm(target.name) === srcName;
      if (!nameOk && (d.meals?.length ?? 0) !== srcCount) return d;
    }
    return { ...d, meals: (d.meals ?? []).map((m, mi) => (mi === mealIdx ? setTime(m) : m)) };
  });
}

/** true quando algum horário vem antes do anterior (ignora vazios). */
export const mealTimesOutOfOrder = (meals: TimedMeal[]): boolean => {
  let last = -1;
  for (const m of meals ?? []) {
    const v = parseTimeToMinutes(m?.time);
    if (v == null) continue;
    if (v < last) return true;
    last = v;
  }
  return false;
};
