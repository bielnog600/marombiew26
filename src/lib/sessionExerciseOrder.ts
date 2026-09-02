/**
 * Identidade estável dos exercícios dentro do "Modo Treino" (individual e Duo).
 *
 * O estado da sessão (`Record<number, ExerciseState>`) é indexado por posição.
 * Para que a reordenação por drag-and-drop não faça o React reutilizar o estado
 * interno do card anterior (histórico carregado, campos não controlados etc.),
 * cada exercício recebe um UID estável usado como `key` e como `id` do sortable.
 *
 * Ao reordenar, exercício + estado + UID são movidos JUNTOS — os dados seguem o
 * exercício, nunca a posição.
 */

let seq = 0;

export const makeExerciseUid = (): string => {
  seq += 1;
  return `exu_${Date.now().toString(36)}_${seq}`;
};

/** Gera/ajusta a lista de UIDs para `count` exercícios, preservando os existentes. */
export const buildExerciseUids = (count: number, prev: string[] = []): string[] => {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(prev[i] || makeExerciseUid());
  return out;
};

export interface ReorderResult<E, S> {
  exercises: E[];
  states: Record<number, S>;
  uids: string[];
  fromIndex: number;
  toIndex: number;
}

const move = <T,>(arr: T[], from: number, to: number): T[] => {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

/**
 * Move o exercício identificado por `fromUid` para a posição de `toUid`.
 * Retorna `null` quando a operação não é aplicável (uid inexistente, mesma posição).
 */
export function reorderExercisesByUid<E, S>(
  exercises: E[],
  states: Record<number, S | undefined>,
  uids: string[],
  fromUid: string,
  toUid: string,
): ReorderResult<E, S> | null {
  const fromIndex = uids.indexOf(fromUid);
  const toIndex = uids.indexOf(toUid);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
  if (uids.length !== exercises.length) return null;

  const nextExercises = move(exercises, fromIndex, toIndex);
  const nextUids = move(uids, fromIndex, toIndex);
  const orderedStates = exercises.map((_, i) => states[i]);
  const movedStates = move(orderedStates, fromIndex, toIndex);

  const nextStates: Record<number, S> = {};
  movedStates.forEach((st, i) => {
    if (st !== undefined) nextStates[i] = st as S;
  });

  return { exercises: nextExercises, states: nextStates, uids: nextUids, fromIndex, toIndex };
}

/** Nova posição do exercício "atual" após a reordenação (identidade preservada). */
export const resolveCurrentIndexAfterReorder = (
  uids: string[],
  currentUid: string | null | undefined,
): number | null => {
  if (!currentUid) return null;
  const idx = uids.indexOf(currentUid);
  return idx >= 0 ? idx : null;
};
