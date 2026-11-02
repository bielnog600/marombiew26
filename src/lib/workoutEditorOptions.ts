/**
 * Opções dos selects do editor de treino do admin (TrainingDayCard).
 * Compartilhadas com o escritório (office-gerar → ajustar/analisar) para que
 * um ajuste nunca grave valores que o editor não consegue exibir.
 */
export const REC_SERIES_OPTS = ['1', '2'];
export const REC_REPS_OPTS = ['8', '10', '12', '15', '20', '15s', '20s', '30s', '45s', '60s'];
export const WORK_SERIES_OPTS = ['1', '2', '3', '4', '5'];
export const WORK_REPS_OPTS = ['6', '8', '10', '12', '15', '6-8', '8-10', '8-12', '10-12', '12-15', '15s', '20s', '30s', '45s', '60s', '90s'];
export const RIR_OPTS = ['', '0', '1', '2', '3', '1-2', '2-3'];
export const PAUSE_OPTS = ['10s', '15s', '30s', '45s', '60s', '90s', '120s', '180s'];
/** Pausas aceitas pelo escritório (regra do Fabiew: até 120s). */
export const OFFICE_PAUSE_OPTS = PAUSE_OPTS.filter((p) => p !== '180s');
