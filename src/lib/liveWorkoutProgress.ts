import type { ActivityExercise, ActivitySet } from '@/lib/adminActivityExercises';

export interface LiveSetRef {
  exerciseIndex: number;
  setIndex: number;
  exerciseName: string;
  weight: string;
  reps: string;
  /** Horário da atualização em que o admin viu esta série ser registrada. */
  at?: string | null;
}

export interface LiveCurrent {
  exerciseIndex: number;
  exerciseName: string;
  totalExercises: number;
  plannedSets: number;
  doneSets: number;
  /** Próxima série a fazer (1-based); null = todas feitas. */
  setNumber: number | null;
}

const done = (set?: ActivitySet) => set?.completed === true;
const text = (value: unknown) => (value == null || value === '' ? null : String(value));

/** Carga × reps da série (parte principal nos métodos com sub-registros). */
export function liveSetValues(set: ActivitySet): { weight: string; reps: string } {
  const main = set.subRecords?.length ? set.subRecords[0] : set;
  const weight = text(main?.weight);
  const reps = text(main?.reps);
  return { weight: weight ? `${weight.replace('.', ',')} kg` : '—', reps: reps ?? '—' };
}

const ref = (exercises: ActivityExercise[], ei: number, si: number, at?: string | null): LiveSetRef => ({
  exerciseIndex: ei, setIndex: si, exerciseName: exercises[ei].name, ...liveSetValues(exercises[ei].sets[si]), at: at ?? null,
});

export function liveCurrent(exercises: ActivityExercise[], currentIndex: number): LiveCurrent | null {
  if (!exercises.length) return null;
  const idx = Math.min(Math.max(0, Number(currentIndex) || 0), exercises.length - 1);
  const ex = exercises[idx];
  const planned = Math.max(ex.planned || 0, ex.sets.length);
  let setNumber: number | null = null;
  for (let i = 0; i < planned; i++) if (!done(ex.sets[i])) { setNumber = i + 1; break; }
  return {
    exerciseIndex: idx, exerciseName: ex.name, totalExercises: exercises.length,
    plannedSets: planned, doneSets: ex.sets.filter(done).length, setNumber,
  };
}

/** Última série feita sem histórico de atualizações: exercício atual, depois os anteriores, depois os seguintes. */
export function latestCompletedSet(exercises: ActivityExercise[], currentIndex: number): LiveSetRef | null {
  const cur = Math.min(Math.max(0, Number(currentIndex) || 0), Math.max(0, exercises.length - 1));
  const order = [cur, ...Array.from({ length: cur }, (_, i) => cur - 1 - i), ...Array.from({ length: Math.max(0, exercises.length - cur - 1) }, (_, i) => cur + 1 + i)];
  for (const ei of order) {
    const sets = exercises[ei]?.sets ?? [];
    for (let si = sets.length - 1; si >= 0; si--) if (done(sets[si])) return ref(exercises, ei, si);
  }
  return null;
}

/** Série que passou a feita (ou mudou de carga/reps) entre duas atualizações. */
export function newlyCompletedSet(previous: ActivityExercise[] | null, next: ActivityExercise[], at?: string | null): LiveSetRef | null {
  if (!previous?.length) return null;
  let found: LiveSetRef | null = null;
  const usedPrev = new Set<number>();
  next.forEach((ex, ei) => {
    let pi = previous.findIndex((p, i) => !usedPrev.has(i) && p.name === ex.name);
    if (pi < 0 && previous[ei] && !usedPrev.has(ei)) pi = ei;
    if (pi >= 0) usedPrev.add(pi);
    const before = pi >= 0 ? previous[pi] : undefined;
    ex.sets.forEach((set, si) => {
      if (!done(set)) return;
      const old = before?.sets[si];
      const a = liveSetValues(set);
      const b = old && done(old) ? liveSetValues(old) : null;
      if (!b || a.weight !== b.weight || a.reps !== b.reps) found = ref(next, ei, si, at);
    });
  });
  return found;
}

/**
 * Atualiza a "última série registrada" do ao vivo: a recém-feita (com o horário
 * da atualização) ou, sem novidade, mantém a anterior enquanto ela continuar
 * feita; senão volta para a última feita pela ordem do treino.
 */
export function nextLastSet(
  previous: ActivityExercise[] | null,
  next: ActivityExercise[],
  currentIndex: number,
  last: LiveSetRef | null,
  at?: string | null,
): LiveSetRef | null {
  const fresh = newlyCompletedSet(previous, next, at);
  if (fresh) return fresh;
  if (last) {
    const ei = next.findIndex((ex) => ex.name === last.exerciseName);
    const set = ei >= 0 ? next[ei].sets[last.setIndex] : undefined;
    if (set && done(set)) return { ...ref(next, ei, last.setIndex, last.at) };
  }
  return latestCompletedSet(next, currentIndex);
}

/** "agora", "há 12 s", "há 3 min", "há 1 h 05". */
export function liveAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return '—';
  const sec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (sec < 5) return 'agora';
  if (sec < 60) return `há ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h ${String(min % 60).padStart(2, '0')}`;
}

/** Atualização recente (<= 60 s), parada (<= 5 min) ou sem sinal. */
export function liveFreshness(iso: string | null | undefined, now: number): 'fresh' | 'idle' | 'stale' {
  if (!iso) return 'stale';
  const ms = now - new Date(iso).getTime();
  return ms <= 60_000 ? 'fresh' : ms <= 5 * 60_000 ? 'idle' : 'stale';
}
