/**
 * Compara duas janelas semanais (semana anterior vs. 2 semanas atrás) de
 * exercise_set_logs e classifica cada exercício como improved | regressed.
 * Também identifica exercícios planejados sem nenhum log na semana anterior.
 */

import type { ParsedTrainingDay } from './trainingResultParser';
import type { AdherenceStatus } from './weeklyAdherence';
import { TRAINING_PHASES, type TrainingPhase } from './trainingPhase';

export interface ExerciseLog {
  exercise_name: string;
  weight_kg: number | null;
  reps: number | null;
  performed_at: string; // ISO
}

export interface ExerciseDelta {
  exercise: string;
  weightDelta: number;   // kg
  repsDelta: number;     // reps
  lastWeight: number;
  lastReps: number;
  prevWeight: number;
  prevReps: number;
}

export interface ProgressionReport {
  improved: ExerciseDelta[];
  regressed: ExerciseDelta[];
  missing: string[]; // exercícios planejados sem nenhum log na semana
  hasProgress: boolean;
}

const norm = (s: string) =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Devolve as duas janelas semanais consecutivas anteriores a hoje. */
export const getProgressionWindows = (now: Date = new Date()) => {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const lastStart = new Date(end);
  lastStart.setDate(lastStart.getDate() - 7);
  const prevStart = new Date(lastStart);
  prevStart.setDate(prevStart.getDate() - 7);
  return {
    lastStart,
    lastEnd: end,
    prevStart,
    prevEnd: lastStart,
  };
};

const bestSet = (logs: ExerciseLog[]) => {
  let maxWeight = 0;
  let maxReps = 0;
  for (const l of logs) {
    const w = l.weight_kg ?? 0;
    const r = l.reps ?? 0;
    if (w > maxWeight) maxWeight = w;
    if (r > maxReps) maxReps = r;
  }
  return { maxWeight, maxReps };
};

const groupByExercise = (logs: ExerciseLog[]) => {
  const map = new Map<string, { display: string; logs: ExerciseLog[] }>();
  for (const l of logs) {
    const key = norm(l.exercise_name);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { display: l.exercise_name, logs: [] });
    map.get(key)!.logs.push(l);
  }
  return map;
};

export const buildProgressionReport = (
  lastWeekLogs: ExerciseLog[],
  prevWeekLogs: ExerciseLog[],
  plannedDays: ParsedTrainingDay[],
): ProgressionReport => {
  const lastByEx = groupByExercise(lastWeekLogs);
  const prevByEx = groupByExercise(prevWeekLogs);

  const improved: ExerciseDelta[] = [];
  const regressed: ExerciseDelta[] = [];

  for (const [key, { display, logs }] of lastByEx.entries()) {
    const last = bestSet(logs);
    const prev = prevByEx.get(key);
    if (!prev) continue; // sem base de comparação
    const prevBest = bestSet(prev.logs);
    const weightDelta = +(last.maxWeight - prevBest.maxWeight).toFixed(1);
    const repsDelta = last.maxReps - prevBest.maxReps;

    const delta: ExerciseDelta = {
      exercise: display,
      weightDelta,
      repsDelta,
      lastWeight: last.maxWeight,
      lastReps: last.maxReps,
      prevWeight: prevBest.maxWeight,
      prevReps: prevBest.maxReps,
    };

    if (weightDelta > 0 || (weightDelta === 0 && repsDelta > 0)) {
      improved.push(delta);
    } else if (weightDelta < 0 || (weightDelta === 0 && repsDelta < 0)) {
      regressed.push(delta);
    }
  }

  improved.sort((a, b) => (b.weightDelta - a.weightDelta) || (b.repsDelta - a.repsDelta));
  regressed.sort((a, b) => (a.weightDelta - b.weightDelta) || (a.repsDelta - b.repsDelta));

  // Missing = planejado mas sem nenhum log na semana
  const missing: string[] = [];
  if (plannedDays.length > 0) {
    const seen = new Set<string>();
    for (const d of plannedDays) {
      for (const e of d.exercises) {
        const key = norm(e.exercise);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!lastByEx.has(key)) missing.push(e.exercise);
      }
    }
  }

  return {
    improved: improved.slice(0, 3),
    regressed: regressed.slice(0, 3),
    missing: missing.slice(0, 5),
    hasProgress: improved.length > 0,
  };
};

export const formatDelta = (d: ExerciseDelta): string => {
  const parts: string[] = [];
  if (d.weightDelta !== 0) parts.push(`${d.weightDelta > 0 ? '+' : ''}${d.weightDelta}kg`);
  if (d.repsDelta !== 0) parts.push(`${d.repsDelta > 0 ? '+' : ''}${d.repsDelta} reps`);
  return `${d.exercise}${parts.length ? ' ' + parts.join(' / ') : ''}`;
};

// ============================================================
// Resolução de semana ativa a partir da aderência
// ============================================================

export type WeekAction =
  | 'advance'
  | 'hold'
  | 'repeat'
  | 'revise'
  | 'awaiting_data';

export const WEEK_ACTION_LABEL: Record<WeekAction, string> = {
  advance: 'Avançar para próxima semana',
  hold: 'Manter semana atual',
  repeat: 'Repetir semana anterior',
  revise: 'Sugerir reanálise do plano',
  awaiting_data: 'Aguardando registros suficientes',
};

export interface WeekResolution {
  plannedPhase: TrainingPhase;
  activePhase: TrainingPhase;
  action: WeekAction;
  blockOverload: boolean;
  suggestRevision: boolean;
  reasonLabel: string;
}

const nextPhase = (p: TrainingPhase): TrainingPhase => {
  const i = TRAINING_PHASES.indexOf(p);
  if (i < 0 || i === TRAINING_PHASES.length - 1) return p;
  return TRAINING_PHASES[i + 1];
};

const prevPhase = (p: TrainingPhase): TrainingPhase => {
  const i = TRAINING_PHASES.indexOf(p);
  if (i <= 0) return p;
  return TRAINING_PHASES[i - 1];
};

/**
 * Decide qual semana o aluno deve treinar agora, com base na aderência
 * da semana anterior e na fase planejada.
 */
export const resolveActiveWeek = (
  plannedPhase: TrainingPhase,
  adherence?: AdherenceStatus,
): WeekResolution => {
  const base: WeekResolution = {
    plannedPhase,
    activePhase: plannedPhase,
    action: 'hold',
    blockOverload: false,
    suggestRevision: false,
    reasonLabel: WEEK_ACTION_LABEL['hold'],
  };

  if (!adherence) return { ...base, action: 'awaiting_data', reasonLabel: WEEK_ACTION_LABEL['awaiting_data'] };

  switch (adherence) {
    case 'apto_avancar':
      return { ...base, activePhase: nextPhase(plannedPhase), action: 'advance', reasonLabel: WEEK_ACTION_LABEL['advance'] };
    case 'manter_semana':
      return { ...base, action: 'hold', reasonLabel: WEEK_ACTION_LABEL['hold'] };
    case 'repetir_semana':
      return {
        ...base,
        activePhase: prevPhase(plannedPhase),
        action: 'repeat',
        blockOverload: true,
        reasonLabel: WEEK_ACTION_LABEL['repeat'],
      };
    case 'sugerir_reanalise':
      return { ...base, action: 'revise', suggestRevision: true, blockOverload: true, reasonLabel: WEEK_ACTION_LABEL['revise'] };
    case 'dados_insuficientes':
    default:
      return { ...base, action: 'awaiting_data', blockOverload: true, reasonLabel: WEEK_ACTION_LABEL['awaiting_data'] };
  }
};