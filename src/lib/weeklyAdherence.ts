/**
 * Periodização adaptativa por aderência.
 * Calcula o status de avanço semanal a partir da execução real do aluno.
 * Não depende apenas do calendário — usa logs reais de exercise_set_logs.
 */

import type { ParsedTrainingDay } from './trainingResultParser';

export type AdherenceStatus =
  | 'apto_avancar'
  | 'manter_semana'
  | 'repetir_semana'
  | 'dados_insuficientes'
  | 'sugerir_reanalise';

export interface AdherenceLog {
  exercise_name: string;
  reps: number | null;
  weight_kg: number | null;
  performed_at: string;
}

export interface AdherenceReport {
  status: AdherenceStatus;
  sessionsPlanned: number;
  sessionsExecuted: number;
  exercisesPlanned: number;
  exercisesLogged: number;
  setsTotal: number;
  setsWithLoad: number;
  sessionsPct: number;
  exercisesPct: number;
  setsPct: number;
  reasonLabel: string;
  detailLabel: string;
  canAutoAdvance: boolean;
  windowStart: string; // ISO
  windowEnd: string;   // ISO
}

// Limiares ajustáveis
const TH = {
  AVANCAR_SESSIONS: 0.75,
  AVANCAR_EXERCISES: 0.7,
  AVANCAR_SETS: 0.7,
  MANTER_SESSIONS: 0.5,
  REPETIR_SESSIONS: 0.25,
  REANALISE_SETS: 0.3, // se treinou mas <30% sets com carga/reps
};

const norm = (s: string) =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const dayKey = (iso: string) => iso.slice(0, 10);

/** Janela da semana anterior (7 dias) a partir de hoje. */
export const getPreviousWeekWindow = (now: Date = new Date()): { start: Date; end: Date } => {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
};

export const buildAdherenceReport = (
  plannedDays: ParsedTrainingDay[],
  logs: AdherenceLog[],
  windowStart: Date,
  windowEnd: Date,
): AdherenceReport => {
  const sessionsPlanned = plannedDays.length || 0;
  const exercisesPlanned = plannedDays.reduce((acc, d) => acc + (d.exercises?.length || 0), 0);

  // Sessões executadas = nº de dias distintos com ≥1 log na janela
  const daysWithLogs = new Set<string>();
  const exercisesLoggedSet = new Set<string>();
  let setsTotal = 0;
  let setsWithLoad = 0;

  for (const l of logs) {
    daysWithLogs.add(dayKey(l.performed_at));
    exercisesLoggedSet.add(norm(l.exercise_name));
    setsTotal += 1;
    if ((l.weight_kg ?? 0) > 0 && (l.reps ?? 0) > 0) setsWithLoad += 1;
  }

  const sessionsExecuted = Math.min(daysWithLogs.size, sessionsPlanned || daysWithLogs.size);

  // Match de exercícios planejados x logados
  let exercisesLogged = 0;
  if (exercisesPlanned > 0) {
    for (const d of plannedDays) {
      for (const e of d.exercises) {
        if (exercisesLoggedSet.has(norm(e.exercise))) exercisesLogged += 1;
      }
    }
  } else {
    exercisesLogged = exercisesLoggedSet.size;
  }

  const sessionsPct = sessionsPlanned > 0 ? sessionsExecuted / sessionsPlanned : 0;
  const exercisesPct = exercisesPlanned > 0 ? exercisesLogged / exercisesPlanned : 0;
  const setsPct = setsTotal > 0 ? setsWithLoad / setsTotal : 0;

  let status: AdherenceStatus;

  if (setsTotal === 0 || sessionsPct < TH.REPETIR_SESSIONS) {
    status = 'dados_insuficientes';
  } else if (sessionsPct >= TH.MANTER_SESSIONS && setsPct < TH.REANALISE_SETS) {
    // Treinou mas registrou pouquíssimo
    status = 'sugerir_reanalise';
  } else if (
    sessionsPct >= TH.AVANCAR_SESSIONS &&
    (exercisesPlanned === 0 || exercisesPct >= TH.AVANCAR_EXERCISES) &&
    setsPct >= TH.AVANCAR_SETS
  ) {
    status = 'apto_avancar';
  } else if (sessionsPct >= TH.MANTER_SESSIONS) {
    status = 'manter_semana';
  } else {
    status = 'repetir_semana';
  }

  const reasonLabel = REASON_LABELS[status];
  const detailLabel = buildDetail(status, sessionsExecuted, sessionsPlanned, setsWithLoad, setsTotal);

  return {
    status,
    sessionsPlanned,
    sessionsExecuted,
    exercisesPlanned,
    exercisesLogged,
    setsTotal,
    setsWithLoad,
    sessionsPct,
    exercisesPct,
    setsPct,
    reasonLabel,
    detailLabel,
    canAutoAdvance: status === 'apto_avancar',
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
};

const REASON_LABELS: Record<AdherenceStatus, string> = {
  apto_avancar: 'Apto para avançar de semana',
  manter_semana: 'Semana mantida por falta de registros suficientes',
  repetir_semana: 'Repetindo a semana — execução parcial na semana anterior',
  dados_insuficientes: 'Complete os registros para liberar progressão mais precisa',
  sugerir_reanalise: 'Na semana passada não houve registros confiáveis de cargas e repetições',
};

const buildDetail = (
  status: AdherenceStatus,
  sx: number,
  sp: number,
  loaded: number,
  total: number,
): string => {
  const sessions = `${sx}/${sp || '?'} sessões`;
  const sets = total > 0 ? ` · ${loaded}/${total} séries com carga e reps` : '';
  switch (status) {
    case 'apto_avancar':
      return `Aderência alta — ${sessions}${sets}`;
    case 'manter_semana':
      return `Execução parcial — ${sessions}${sets}`;
    case 'repetir_semana':
      return `Pouca execução — ${sessions}${sets}`;
    case 'sugerir_reanalise':
      return `Treinos sem registro confiável — ${sessions}${sets}`;
    case 'dados_insuficientes':
    default:
      return total === 0
        ? 'Nenhuma série registrada na semana anterior'
        : `Dados escassos — ${sessions}${sets}`;
  }
};

export const ADHERENCE_BADGE_CLASS: Record<AdherenceStatus, string> = {
  apto_avancar: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  manter_semana: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  repetir_semana: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  dados_insuficientes: 'bg-muted text-muted-foreground border-border',
  sugerir_reanalise: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
};

export const ADHERENCE_SHORT_LABEL: Record<AdherenceStatus, string> = {
  apto_avancar: 'Apto para avançar',
  manter_semana: 'Manter semana',
  repetir_semana: 'Repetir semana',
  dados_insuficientes: 'Dados insuficientes',
  sugerir_reanalise: 'Sugerir reanálise',
};