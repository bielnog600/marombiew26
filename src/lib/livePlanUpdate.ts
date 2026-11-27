import type { ParsedExercise } from '@/lib/trainingResultParser';
import { normalizeExerciseKey } from '@/lib/loadIncrement';

/** Série do player (mesma forma gravada em session_state.sets). */
export interface LiveSetEntry { completed?: boolean; reps?: unknown; weight?: unknown; [key: string]: unknown }
export type LiveSetsByIndex = Record<number, LiveSetEntry[]>;

export interface LivePlanMergeInput {
  /** Exercícios que o player está mostrando agora. */
  current: Array<ParsedExercise | null | undefined>;
  /** Exercícios do mesmo dia no plano salvo pelo coach. */
  next: Array<ParsedExercise | null | undefined>;
  sets: LiveSetsByIndex | Record<string, LiveSetEntry[]>;
  currentIndex: number;
  /** Nº de séries planejadas de um exercício (buildSetPlan no player). */
  setCount: (exercise: ParsedExercise) => number;
}

export interface LivePlanMerge {
  changed: boolean;
  exercises: Array<ParsedExercise | null | undefined>;
  sets: LiveSetsByIndex;
  currentIndex: number;
  /** Índice antigo → índice novo (exercícios que continuam na tela). */
  indexMap: Record<number, number>;
  /** Exercícios tirados pelo coach mas mantidos por já terem séries feitas. */
  kept: number;
}

const EMPTY_SET: LiveSetEntry = { reps: '', weight: '', completed: false };
const keyOf = (exercise?: ParsedExercise | null) => normalizeExerciseKey(exercise?.exercise ?? '');
const setsAt = (sets: LivePlanMergeInput['sets'], index: number) =>
  ((sets as Record<string, LiveSetEntry[]>)[String(index)] ?? (sets as Record<number, LiveSetEntry[]>)[index]) as LiveSetEntry[] | undefined;
const hasDone = (list?: LiveSetEntry[]) => !!list?.some((set) => set?.completed === true);

/** Assinatura do treino do dia: igual = nada mudou (atualizações sem efeito são ignoradas). */
export const workoutDaySignature = (exercises: Array<ParsedExercise | null | undefined>) => JSON.stringify(exercises ?? []);

/**
 * Aplica no treino em andamento o plano que o coach acabou de salvar, sem perder
 * nada que o aluno já registrou: o mesmo exercício (mesmo slot e nome, ou mesmo
 * nome) leva as suas séries para a nova posição; séries feitas nunca são
 * apagadas, mesmo que o coach reduza as séries; exercícios novos entram vazios;
 * exercícios removidos somem, a não ser que já tenham séries feitas.
 */
export function mergeLivePlanUpdate({ current, next, sets, currentIndex, setCount }: LivePlanMergeInput): LivePlanMerge {
  const unchanged = (): LivePlanMerge => {
    const indexMap: Record<number, number> = {};
    current.forEach((_, i) => { indexMap[i] = i; });
    const copy: LiveSetsByIndex = {};
    Object.keys(sets ?? {}).forEach((k) => { const v = setsAt(sets, Number(k)); if (v) copy[Number(k)] = v; });
    return { changed: false, exercises: current, sets: copy, currentIndex, indexMap, kept: 0 };
  };
  if (!Array.isArray(next) || next.length === 0) return unchanged();
  if (workoutDaySignature(current) === workoutDaySignature(next)) return unchanged();

  const used = new Set<number>();
  const matchOld: Array<number | null> = next.map(() => null);
  // 1º mesmo slot e mesmo exercício; 2º mesmo exercício (nome normalizado).
  next.forEach((ex, i) => {
    if (!ex?.id) return;
    const j = current.findIndex((old, oi) => !used.has(oi) && old?.id === ex.id && keyOf(old) === keyOf(ex) && !!keyOf(ex));
    if (j >= 0) { used.add(j); matchOld[i] = j; }
  });
  next.forEach((ex, i) => {
    if (matchOld[i] != null || !keyOf(ex)) return;
    const j = current.findIndex((old, oi) => !used.has(oi) && keyOf(old) === keyOf(ex));
    if (j >= 0) { used.add(j); matchOld[i] = j; }
  });

  type Item = { ex: ParsedExercise | null | undefined; oldIdx: number | null; kept: boolean };
  const merged: Item[] = next.map((ex, i) => ({ ex, oldIdx: matchOld[i], kept: false }));
  let kept = 0;
  current.forEach((old, j) => {
    if (used.has(j) || !hasDone(setsAt(sets, j))) return;
    // Fica logo depois do exercício que vinha antes dele no treino.
    let pos = -1;
    merged.forEach((item, p) => { if (item.oldIdx != null && item.oldIdx < j) pos = p; });
    merged.splice(pos + 1, 0, { ex: old, oldIdx: j, kept: true });
    kept += 1;
  });

  const outSets: LiveSetsByIndex = {};
  const indexMap: Record<number, number> = {};
  merged.forEach((item, k) => {
    if (item.oldIdx == null) return;
    indexMap[item.oldIdx] = k;
    const old = setsAt(sets, item.oldIdx);
    if (!old) return;
    if (item.kept || !item.ex) { outSets[k] = old; return; }
    const planned = Math.max(1, setCount(item.ex) || 0);
    let lastDone = -1;
    old.forEach((set, si) => { if (set?.completed === true) lastDone = si; });
    const length = Math.max(planned, lastDone + 1);
    const list = old.slice(0, length);
    while (list.length < length) list.push({ ...EMPTY_SET });
    outSets[k] = list;
  });

  let nextIndex = indexMap[currentIndex];
  if (nextIndex == null) {
    const slot = current[currentIndex]?.id;
    const sameSlot = slot ? merged.findIndex((item) => item.oldIdx == null && item.ex?.id === slot) : -1;
    const after = merged.findIndex((item) => item.oldIdx != null && item.oldIdx > currentIndex);
    nextIndex = sameSlot >= 0 ? sameSlot : after >= 0 ? after : merged.length - 1;
  }
  nextIndex = Math.min(Math.max(0, nextIndex), Math.max(0, merged.length - 1));

  return { changed: true, exercises: merged.map((item) => item.ex), sets: outSets, currentIndex: nextIndex, indexMap, kept };
}

/** Evento do Realtime em ai_plans que interessa a uma tela do aluno (por tipo de plano). */
export function isRelevantPlanChange(
  payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null } | null | undefined,
  tipo: 'treino' | 'dieta' | 'cardio',
): boolean {
  const fresh = payload?.new && Object.keys(payload.new).length ? payload.new : null;
  const row = fresh ?? payload?.old ?? null;
  if (!row) return true;
  // Sem "tipo" (registro grande demais ou DELETE só com a chave): confere de novo.
  if (row.tipo != null && row.tipo !== tipo) return false;
  if (fresh && fresh.is_draft === true) return false;
  return true;
}

/** Atualização ao vivo só quando o plano salvo é o mesmo plano da sessão. */
export function shouldApplyLivePlan(sessionPlanId: string | null | undefined, updatedPlanId: string | null | undefined): boolean {
  return !!sessionPlanId && !!updatedPlanId && sessionPlanId === updatedPlanId;
}
