/**
 * Descanso automático depois de confirmar uma série, pelo TIPO da série
 * confirmada. Função pura: não grava nada e não mexe em grupos (bi-set /
 * superset continuam com a pausa A→B e o descanso do par).
 *
 * - Aquecimento 60s · Preparatória 120s · Trabalho 180s · Reconhecimento 90s;
 * - exercício sem tipos (todas as séries de trabalho, padrão antigo) continua
 *   usando a pausa do plano, sem rótulo de tipo.
 */
import { normalizePlanSetType, SET_TYPE_LABEL, type PlanSetType } from './setTypes';

export const SET_TYPE_REST_SECONDS: Record<PlanSetType, number> = {
  warmup: 60,
  preparatory: 120,
  work: 180,
  recognition: 90,
};

/** "3 min", "1 min 30s", "45s". */
export const formatRestDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const min = Math.floor(s / 60), sec = s % 60;
  if (min === 0) return `${sec}s`;
  return sec === 0 ? `${min} min` : `${min} min ${sec}s`;
};

export interface SetRest { seconds: number; /** Ex.: "Trabalho 3 min"; null = pausa do plano (sem tipos). */ label: string | null }

export const restAfterSet = (opts: {
  /** Tipos das séries do exercício, na ordem (plano da sessão). */
  setTypes: Array<unknown>;
  /** Série que acabou de ser confirmada (0-based). */
  setIndex: number;
  /** Pausa do plano já convertida em segundos (usada quando não há tipos). */
  planPauseSeconds: number;
}): SetRest => {
  const types = opts.setTypes.map(normalizePlanSetType);
  const typed = types.some((t) => t !== 'work');
  if (!typed) return { seconds: Math.max(0, opts.planPauseSeconds), label: null };
  const type = types[opts.setIndex] ?? 'work';
  const seconds = SET_TYPE_REST_SECONDS[type];
  return { seconds, label: `${SET_TYPE_LABEL[type]} ${formatRestDuration(seconds)}` };
};
