import { parseRepRange, setRoleOf } from '@/lib/weeklyProgression';
import { isTimeBasedReps } from '@/lib/sessionProgression';

export interface ActivityPerformanceSet {
  weight?: unknown; reps?: unknown; completed?: boolean; set_type?: string | null;
  subRecords?: { weight?: unknown; reps?: unknown; completed?: boolean; label?: string }[];
}
export interface ActivityHistoryLog {
  exercise_name: string; session_id?: string | null; performed_at: string; set_number?: number;
  weight_kg?: unknown; reps?: unknown; set_type?: string | null;
  sub_records?: ActivityPerformanceSet['subRecords'];
}
const number = (v: unknown) => Number(String(v ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
export const noExerciseProgress = (name: string) => /mobilidade|alongamento|libera[çc][aã]o|ativa[çc][aã]o|respira[çc][aã]o/i.test(name);
const working = (s: ActivityPerformanceSet) => s.completed !== false && setRoleOf(s) !== 'preparation';
const main = (s: ActivityPerformanceSet) => s.subRecords?.[0] ?? s;
export const performanceSetVolume = (s: ActivityPerformanceSet) =>
  (s.subRecords?.length ? s.subRecords.filter(p => p.completed !== false) : [s]).reduce((n,p) => n + number(p.weight)*number(p.reps),0);
const fromLog = (l: ActivityHistoryLog): ActivityPerformanceSet => ({ weight: l.weight_kg, reps: l.reps, set_type: l.set_type, subRecords: l.sub_records, completed: true });

/** Historical display only: no recommendation engine, no persistence. */
export function exerciseProgress(name: string, today: ActivityPerformanceSet[], history: ActivityHistoryLog[], currentSessionId: string, startedAt: string, plan?: any) {
  const eligible = history.filter(l => l.exercise_name === name && l.session_id !== currentSessionId && Date.parse(l.performed_at) < Date.parse(startedAt) && setRoleOf(l) !== 'preparation');
  const sorted = [...eligible].sort((a,b) => Date.parse(b.performed_at)-Date.parse(a.performed_at));
  const latest = sorted[0];
  const key = (l: ActivityHistoryLog) => l.session_id ?? l.performed_at.slice(0,10);
  const previous = latest ? sorted.filter(l => key(l) === key(latest)).sort((a,b) => (a.set_number ?? 0)-(b.set_number ?? 0)).map(fromLog) : [];
  const done = today.filter(s => s.completed === true && working(s));
  const topLoad = (sets: ActivityPerformanceSet[]) => Math.max(0,...sets.map(s => number(main(s).weight)));
  const topReps = (sets: ActivityPerformanceSet[], load: number) => Math.max(0,...sets.filter(s=>number(main(s).weight)===load).map(s=>number(main(s).reps)));
  const todayLoad = topLoad(done), lastLoad = topLoad(previous);
  const loadDelta = todayLoad-lastLoad;
  const repsDelta = topReps(done,todayLoad)-topReps(previous,todayLoad);
  const excluded = noExerciseProgress(name) || isTimeBasedReps(String(plan?.reps ?? ''));
  const status = excluded ? 'excluded' : !done.length ? 'pending' : !previous.length ? 'first' : loadDelta > 0 || (loadDelta === 0 && repsDelta > 0) ? 'up' : loadDelta < 0 || repsDelta < 0 ? 'down' : 'same';
  const past = eligible.map(fromLog);
  const historicalLoad = topLoad(past);
  const historicalSetVolume = Math.max(0,...past.map(performanceSetVolume));
  const todaySetVolume = Math.max(0,...done.map(performanceSetVolume));
  const alerts = today.flatMap((s,i) => {
    if (excluded || !s.completed || !working(s)) return [];
    const raw = String(plan?.setScheme?.sets?.[i]?.target_reps ?? String(plan?.reps ?? '').split('/')[i] ?? plan?.reps ?? '');
    const range = parseRepRange(raw);
    if (!range) return [];
    const reps = number(main(s).reps);
    return reps > range.max ? [{ set:i+1,kind:'above' as const }] : reps < range.min ? [{set:i+1,kind:'below' as const}] : [];
  });
  return { status, previous, date: latest?.performed_at, done, todayLoad, lastLoad, loadDelta, loadPercent: lastLoad ? loadDelta/lastLoad*100 : 0, repsDelta,
    todayVolume: done.reduce((n,s)=>n+performanceSetVolume(s),0), lastVolume: previous.reduce((n,s)=>n+performanceSetVolume(s),0),
    prLoad: Math.max(historicalLoad,todayLoad), prSetVolume: Math.max(historicalSetVolume,todaySetVolume),
    recordLoad: !excluded && past.length > 0 && todayLoad > historicalLoad,
    recordVolume: !excluded && past.length > 0 && todaySetVolume > historicalSetVolume, alerts };
}
export const performanceSetsText = (sets: ActivityPerformanceSet[]) => sets.map(s=>`${main(s).weight ?? '—'}×${main(s).reps ?? '—'}`).join(' · ') || '—';