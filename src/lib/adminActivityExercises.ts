import { normalizeExerciseKey } from '@/lib/loadIncrement';

export interface ActivitySet {
  set_type?: string | null; reps?: any; weight?: any; completed?: boolean; rpe?: any; rir?: any;
  subRecords?: { label?: string; reps?: any; weight?: any; completed?: boolean }[];
}
export interface ActivityExercise {
  name: string;
  variationOf?: string;
  plan?: any;
  planned: number;
  method?: string;
  sets: ActivitySet[];
}
const number = (value: unknown) => Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;

/** Read-only assembly: associate execution aliases, never rename persisted logs/history. */
export function buildActivityExercises(session: any, logs: any[], planDay: any[] | null): ActivityExercise[] {
  const plans = (planDay ?? []).filter(Boolean);
  const state = session?.session_state ?? {};
  const findPlan = (slot?: string, name?: string, index?: number) => {
    const key = normalizeExerciseKey(name ?? '');
    return plans.find(p => slot && p.id === slot)
      ?? plans.find(p => key && normalizeExerciseKey(p.exercise) === key)
      ?? plans.find(p => key && normalizeExerciseKey(p.variation) === key)
      ?? (index != null ? planDay?.[index] : undefined);
  };
  const identity = (name: string, plan: any) => ({
    name, plan,
    variationOf: plan?.variation && normalizeExerciseKey(name) !== normalizeExerciseKey(plan.exercise)
      && normalizeExerciseKey(name) === normalizeExerciseKey(plan.variation) ? plan.exercise : undefined,
  });
  const method = (plan: any) => plan?.metodo && plan.metodo !== 'nenhum' ? plan.metodo : undefined;

  if (Array.isArray(state.exerciseNames) && state.exerciseNames.length) {
    return state.exerciseNames.map((name: string, index: number) => {
      const plan = findPlan(state.exerciseSlotIds?.[index], name, index);
      const live = (state.sets?.[index] ?? state.sets?.[String(index)] ?? []) as ActivitySet[];
      return {
        ...identity(name, plan),
        planned: Number(state.plannedSets?.[index]) || live.length || number(plan?.series),
        method: state.executionMethods?.[index] && state.executionMethods[index] !== 'nenhum' ? state.executionMethods[index] : method(plan),
        sets: live.map((set, i) => ({ ...set, set_type: set.set_type ?? state.plannedSetTypes?.[index]?.[i] })),
      };
    });
  }

  // A planned slot owns both its original name and its variation. Unmatched logs remain extras.
  const groups = new Map<any, any[]>();
  for (const log of logs) {
    const plan = findPlan(log.exercise_slot_id, log.exercise_name);
    const key = plan ?? log.exercise_slot_id ?? normalizeExerciseKey(log.exercise_name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(log);
  }
  const build = (plan: any, rows: any[]): ActivityExercise => {
    const sorted = [...rows].sort((a, b) => a.set_number - b.set_number);
    const name = sorted[0]?.exercise_name ?? plan?.exercise;
    const planned = Math.max(number(plan?.series), 0, ...sorted.map(row => Number(row.set_number) || 1));
    const sets: ActivitySet[] = Array.from({ length: planned }, () => ({ completed: false }));
    for (const row of sorted) {
      const index = Math.max(0, (Number(row.set_number) || 1) - 1);
      sets[index] = { reps: row.reps, weight: row.weight_kg, completed: true, set_type: row.set_type, rpe: row.rpe, rir: row.rir, subRecords: row.sub_records ?? undefined };
    }
    return { ...identity(name, plan), planned, method: sorted[0]?.training_method || method(plan), sets };
  };
  const result = plans.map(plan => build(plan, groups.get(plan) ?? []));
  for (const [key, rows] of groups) {
    if (!plans.includes(key)) result.push(build(undefined, rows));
  }
  return result;
}