/**
 * Janela temporal ÚNICA da avaliação semanal.
 *
 * Aderência (weeklyAdherence) e performance (weeklyProgression) DEVEM usar
 * exatamente o mesmo intervalo lógico. Antes, cada camada resolvia sua própria
 * janela (getPreviousWeekWindow x getProgressionWindows) e nada garantia que os
 * limites coincidissem. Agora existe uma única fonte:
 *
 *   current  = [hoje-7d 00:00, hoje 00:00)   → semana avaliada (aderência)
 *   previous = [hoje-14d 00:00, hoje-7d 00:00) → semana anterior comparável
 *
 * `previous.end === current.start` por construção: não há sobreposição nem
 * buraco entre as janelas.
 */

import { getPreviousWeekWindow } from './weeklyAdherence';
import { TRAINING_PHASES, type TrainingPhase } from './trainingPhase';

export interface WeeklyWindow {
  start: Date;
  end: Date;
}

export interface WeeklyWindows {
  /** Semana avaliada (a mesma da aderência). */
  current: WeeklyWindow;
  /** Semana imediatamente anterior — base de comparação de performance. */
  previous: WeeklyWindow;
}

export const resolveWeeklyWindows = (now: Date = new Date()): WeeklyWindows => {
  // Deriva da MESMA função que a aderência usa — sem duplicar a matemática.
  const { start, end } = getPreviousWeekWindow(now);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  return {
    current: { start, end },
    previous: { start: prevStart, end: start },
  };
};

/**
 * Fase comparável da semana anterior dentro do mesmo mesociclo:
 * S2→S1, S3→S2, Deload→S3 e S1→Deload (fechamento do ciclo anterior).
 */
export const previousComparablePhase = (phase: TrainingPhase): TrainingPhase => {
  const i = TRAINING_PHASES.indexOf(phase);
  if (i < 0) return phase;
  return TRAINING_PHASES[(i - 1 + TRAINING_PHASES.length) % TRAINING_PHASES.length];
};
