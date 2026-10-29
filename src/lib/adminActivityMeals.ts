import { parseDietPlanLoose } from '@/lib/dietSchema';
import { parseSections } from '@/lib/dietResultParser';
import { canonicalDayToStudentMeals, getStructuredDietDay, isStructuredPublishedDiet, normalizeWeekdayKey, STUDENT_WEEKDAY_KEYS } from '@/lib/studentStructuredDiet';
import { resolveDayTarget } from '@/lib/dietDayTargets';
import { sumMeals, type OverrideMeal, type Totals } from '@/lib/studentDietOverrideDiff';

/** Read-only projection: persisted snapshots win; never recalculates food data. */
export function buildActivityDiet(plan: any, override?: any) {
  const canonical = parseDietPlanLoose(plan?.conteudo_json);
  const prescribed: Record<number, OverrideMeal[]> = {};
  const student: Record<number, OverrideMeal[]> = {};
  const targets: Record<number, Totals> = {};
  const legacy = parseSections(plan?.conteudo || '').filter(s => s.type === 'meal' && s.meals?.length).map(s => s.meals ?? []);
  const structured = isStructuredPublishedDiet(canonical, plan?.is_draft);
  const days: any[] = canonical?.days ?? [];
  STUDENT_WEEKDAY_KEYS.forEach((key, i) => {
    // Older structured diets contain one generic day ("Padrão"), not weekdays.
    const generic = days.length === 1 && !normalizeWeekdayKey(days[0]?.weekday ?? days[0]?.label) ? days[0] : null;
    const day = getStructuredDietDay(canonical, key) ?? generic;
    const base = structured && day ? canonicalDayToStudentMeals(day) : legacy[i % legacy.length] ?? [];
    const snapshot = override?.groups?.[String(i)];
    prescribed[i] = Array.isArray(snapshot?.prescribed) ? snapshot.prescribed : base;
    student[i] = Array.isArray(snapshot?.student) ? snapshot.student : prescribed[i].map((m, mi) => {
      const foods = override?.substitutions?.[`${i}-${mi}`];
      return Array.isArray(foods) ? { ...m, foods } : m;
    });
    const totals = sumMeals(prescribed[i]);
    const target = resolveDayTarget({
      dayIndex: i, schedule: plan?.protocols?.weekly_energy_schedule,
      dayTarget: plan?.protocols?.weekly_day_targets?.[key] ?? day?.targets ?? day?.target,
      planTargetKcal: canonical?.targets?.kcal, planTargetMacros: canonical?.targets,
      currentTotalKcal: totals.kcal,
    });
    targets[i] = canonical?.targets || target.p || target.c || target.g ? target : { ...totals, kcal: target.kcal };
  });
  return { prescribed, student, targets };
}

export function decodeActivityMeal(key: number, date: string) {
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  return { day: key >= 1000 ? Math.floor(key / 1000) : weekday, meal: key % 1000 };
}

export function resolveActivityMeals(diet: ReturnType<typeof buildActivityDiet>, keys: number[], date: string, eventKey?: number) {
  const validKeys = keys.filter(k => Number.isInteger(k) && k >= 0);
  const selected = decodeActivityMeal(eventKey ?? validKeys.at(-1) ?? 0, date);
  const entries = new Map<string, { day: number; meal: number }>();
  validKeys.forEach(k => {
    const ref = decodeActivityMeal(k, date);
    if (diet.student[ref.day]?.[ref.meal]) entries.set(`${ref.day}-${ref.meal}`, ref);
  });
  const consumed = sumMeals(Array.from(entries.values()).flatMap(ref => diet.student[ref.day]?.[ref.meal] ?? []));
  const done = Array.from(entries.values()).filter(ref => ref.day === selected.day).map(ref => ref.meal);
  return {
    day: selected.day, ordered: [selected.meal, ...done.filter(i => i !== selected.meal).reverse()],
    doneCount: entries.size, consumed, target: diet.targets[selected.day] ?? sumMeals(diet.prescribed[selected.day] ?? []),
  };
}