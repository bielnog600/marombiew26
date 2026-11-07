/**
 * Troca do exercício pela VARIAÇÃO do plano, só na sessão do Modo Treino (admin).
 *
 * Funções puras. A troca vale apenas para a sessão: o exercício da sessão passa
 * a ser a variação (nome, vídeo, histórico e registro) e o original fica
 * guardado em `sessionVariation` para voltar. A carga alvo do plano
 * (targetLoadKg / targetLoadPerSet) pertence ao exercício ORIGINAL — enquanto a
 * variação estiver ativa ela não existe no exercício da sessão.
 *
 * O plano só muda se o admin usar "Salvar no plano do aluno"; as gravações
 * automáticas (finalizar, salvar sequência) usam `planViewOfExercise`, que
 * devolve o exercício original.
 */
import type { ParsedExercise } from './trainingResultParser';

export interface SessionVariationSwap {
  /** Nome do exercício original do plano. */
  original: string;
  exerciseId?: string;
  targetLoadKg?: number | null;
  targetLoadNote?: string | null;
  targetLoadPerSet?: ParsedExercise['targetLoadPerSet'];
}

export type SessionExercise = ParsedExercise & { sessionVariation?: SessionVariationSwap };

const key = (name: string | null | undefined) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const isSessionVariationActive = (ex: SessionExercise | null | undefined): boolean => !!ex?.sessionVariation;

/** Há variação diferente do exercício no plano (ou a variação já está ativa). */
export const canToggleSessionVariation = (ex: SessionExercise | null | undefined): boolean =>
  !!ex && (isSessionVariationActive(ex) || (!!ex.variation?.trim() && key(ex.variation) !== key(ex.exercise)));

/** Troca original ⇄ variação. `null` quando o exercício não tem variação. */
export function toggleSessionVariation(ex: SessionExercise): SessionExercise | null {
  const swap = ex.sessionVariation;
  if (swap) {
    const { sessionVariation: _swap, ...rest } = ex;
    return {
      ...rest,
      exercise: swap.original,
      variation: ex.exercise,
      exerciseId: swap.exerciseId,
      targetLoadKg: swap.targetLoadKg,
      targetLoadNote: swap.targetLoadNote,
      targetLoadPerSet: swap.targetLoadPerSet,
    };
  }
  if (!canToggleSessionVariation(ex)) return null;
  return {
    ...ex,
    exercise: ex.variation.trim(),
    variation: ex.exercise,
    exerciseId: undefined,
    targetLoadKg: undefined,
    targetLoadNote: undefined,
    targetLoadPerSet: undefined,
    sessionVariation: {
      original: ex.exercise,
      exerciseId: ex.exerciseId,
      targetLoadKg: ex.targetLoadKg,
      targetLoadNote: ex.targetLoadNote,
      targetLoadPerSet: ex.targetLoadPerSet,
    },
  };
}

/** Exercício como está no plano (desfaz a troca da sessão, se houver). */
export const planViewOfExercise = (ex: SessionExercise): SessionExercise =>
  ex.sessionVariation ? toggleSessionVariation(ex) ?? ex : ex;

/** Rótulo do botão: para onde a troca leva. */
export const sessionVariationButtonLabel = (ex: SessionExercise): string =>
  ex.sessionVariation ? `Original: ${ex.sessionVariation.original}` : `Variação: ${ex.variation.trim()}`;

/**
 * Reaplica a troca guardada num rascunho (o rascunho tem o exercício da sessão
 * ou só o nome registrado). Só vale se o rascunho é do mesmo slot do plano.
 */
export const restoreSessionVariation = (
  planEx: SessionExercise,
  draftEx: SessionExercise | null | undefined,
  draftName?: string | null,
): SessionExercise => {
  if (planEx.sessionVariation || !canToggleSessionVariation(planEx)) return planEx;
  const fromDraft = !!draftEx?.sessionVariation && key(draftEx.sessionVariation.original) === key(planEx.exercise)
    && key(draftEx.exercise) === key(planEx.variation);
  const fromName = !!draftName && key(draftName) === key(planEx.variation);
  return fromDraft || fromName ? toggleSessionVariation(planEx) ?? planEx : planEx;
};
