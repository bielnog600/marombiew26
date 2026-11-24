import { countsTowardWorkoutCompletion } from './exerciseLoadType';
import { isTimeBasedReps } from './sessionProgression';
import type { MethodSetEntry } from './workoutExecutionMethods';

/** Valor aceito durante a digitação: vazio ou somente dígitos. Null = rejeitar a tecla/cola. */
export const repsInputValue = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  return /^\d+$/.test(text) ? text : null;
};

/** Reps executadas válidas. Faixas ("6-8") e decimais nunca viram o mínimo da faixa. */
export const executedRepsInteger = (value: unknown): number | null => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Valor numérico para o log. Prescrições por tempo mantêm o comportamento
 * legado ("30s" → 30), mas uma faixa de repetições nunca é interpretada.
 */
export const executedRepsForLog = (value: unknown): number | null => {
  const integer = executedRepsInteger(value);
  if (integer != null) return integer;
  const text = String(value ?? '').trim();
  if (!isTimeBasedReps(text)) return null;
  const match = text.match(/^\d+/);
  return match ? Number(match[0]) : null;
};

/** Exercícios por tempo e preparo/recuperação não ganham uma nova exigência de reps. */
export const requiresExecutedReps = (exerciseName: string, targetReps?: string | null): boolean =>
  !isTimeBasedReps(String(targetReps ?? '')) && countsTowardWorkoutCompletion(exerciseName);

const isLegacyRepRange = (value: unknown): boolean =>
  /^\s*\d+\s*[-–—]\s*\d+\s*$/.test(String(value ?? ''));

/**
 * Limpa somente o campo de reps na retomada local. Uma faixa legada concluída
 * reabre a série para a pessoa informar o que realmente fez; números válidos,
 * cargas, RIR e prazos continuam intactos. Nenhum histórico do banco é lido ou
 * alterado por esta função.
 */
export function sanitizeResumedSetReps<T extends MethodSetEntry>(set: T): T {
  const cleanMain = repsInputValue(set.reps) ?? (isTimeBasedReps(String(set.reps ?? '')) ? set.reps : '');
  const subRecords = set.subRecords?.map(part => ({
    ...part,
    reps: repsInputValue(part.reps) ?? (isTimeBasedReps(String(part.reps ?? '')) ? part.reps : ''),
    ...(isLegacyRepRange(part.reps) && part.completed ? { completed: false } : {}),
  }));
  const reopened = isLegacyRepRange(set.reps) || !!set.subRecords?.some(part => isLegacyRepRange(part.reps));
  return {
    ...set,
    reps: cleanMain,
    ...(subRecords ? { subRecords } : {}),
    ...(reopened && set.completed ? { completed: false } : {}),
  };
}
