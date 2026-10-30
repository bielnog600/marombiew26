/** Calendar dates belong to the device, not UTC. Noon avoids DST boundaries. */
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getWeekRange(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return localDateKey(date);
  });
  return { start: dates[0], end: dates[6], dates };
}

export interface DailyTracking {
  id?: string;
  water_glasses: number;
  water_ml?: number | null;
  meals_completed: number[];
  workout_completed: boolean;
}

export function emptyDailyTracking(): DailyTracking {
  return { water_glasses: 0, meals_completed: [], workout_completed: false };
}

export function normalizeDailyTracking(row: {
  id?: string; water_glasses?: number | null; water_ml?: number | null;
  meals_completed?: unknown; workout_completed?: boolean | null;
}): DailyTracking {
  let meals: number[] = [];
  try {
    const value = typeof row.meals_completed === 'string' ? JSON.parse(row.meals_completed) : row.meals_completed;
    if (Array.isArray(value)) meals = value.map(Number).filter(n => Number.isInteger(n) && n >= 0);
  } catch { /* Malformed legacy entries remain empty. */ }
  return { id: row.id, water_glasses: row.water_glasses ?? 0, water_ml: row.water_ml,
    meals_completed: meals, workout_completed: row.workout_completed ?? false };
}

export function canRegisterTrackingDate(date: string, today = localDateKey()): boolean {
  const { start, end } = getWeekRange(new Date(`${today}T12:00:00`));
  return date >= start && date <= end && date <= today;
}

export type WeekDietStatus = 'within' | 'above' | 'below' | null;
export function summarizeDietWeek(days: {
  date: string; tracking?: DailyTracking; consumedKcal: number; targetKcal: number;
}[], today = localDateKey()) {
  let within = 0;
  let registered = 0;
  const statuses: WeekDietStatus[] = days.map(day => {
    if (!canRegisterTrackingDate(day.date, today) || !day.tracking || day.targetKcal <= 0) return null;
    const hasRecord = day.tracking.meals_completed.length > 0 ||
      (day.tracking.water_ml ?? day.tracking.water_glasses * 250) > 0 || day.tracking.workout_completed;
    if (!hasRecord) return null;
    registered++;
    const delta = day.consumedKcal - day.targetKcal;
    if (Math.abs(delta) <= 50) { within++; return 'within'; }
    return delta > 0 ? 'above' : 'below';
  });
  return { within, registered, statuses };
}