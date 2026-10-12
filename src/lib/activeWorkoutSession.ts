/**
 * Regras puras da sessão de treino em andamento do aluno (qualquer dia do
 * plano). A sessão `workout_sessions` com status `in_progress` é a fonte de
 * verdade; estas funções só decidem o que mostrar / fazer.
 */
import { getEffectiveLastActivity } from './workoutSessionResolution';

/** Horas sem atividade para considerar a sessão "esquecida" e perguntar. */
export const FORGOTTEN_SESSION_HOURS = 6;

export interface ActiveSessionLike {
  id: string;
  day_name: string | null;
  started_at: string;
  last_active_at?: string | null;
  created_at?: string;
}

/** Segundos decorridos desde o início REAL (started_at), nunca desde a abertura da tela. */
export const elapsedSecondsSince = (startedAt: string | number | null | undefined, now: number = Date.now()): number => {
  if (startedAt == null) return 0;
  const ms = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((now - ms) / 1000));
};

export const isSessionForgotten = (
  row: { last_active_at?: string | null; started_at?: string | null; created_at?: string },
  now: number = Date.now(),
): boolean => now - getEffectiveLastActivity(row) >= FORGOTTEN_SESSION_HOURS * 3600 * 1000;

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const normalizeDayName = (s: string | null | undefined) =>
  stripAccents(String(s ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();

export const isSameWorkoutDay = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && normalizeDayName(a) === normalizeDayName(b);

const WEEKDAYS: Array<{ re: RegExp; label: string; short: string }> = [
  { re: /\bseg(unda)?\b/, label: 'SEGUNDA-FEIRA', short: 'SEGUNDA' },
  { re: /\bter(ca)?\b/, label: 'TERÇA-FEIRA', short: 'TERÇA' },
  { re: /\bqua(rta)?\b/, label: 'QUARTA-FEIRA', short: 'QUARTA' },
  { re: /\bqui(nta)?\b/, label: 'QUINTA-FEIRA', short: 'QUINTA' },
  { re: /\bsex(ta)?\b/, label: 'SEXTA-FEIRA', short: 'SEXTA' },
  { re: /\bsab(ado)?\b/, label: 'SÁBADO', short: 'SÁBADO' },
  { re: /\bdom(ingo)?\b/, label: 'DOMINGO', short: 'DOMINGO' },
];

/** "Terça" / "TER - Pernas" → "TERÇA-FEIRA"; sem dia da semana → nome em maiúsculas. */
export const workoutDayLabel = (dayName: string | null | undefined, variant: 'long' | 'short' = 'long'): string => {
  const n = normalizeDayName(dayName).replace(/[-–—:·|/]/g, ' ');
  for (const w of WEEKDAYS) if (w.re.test(n)) return variant === 'long' ? w.label : w.short;
  return String(dayName ?? 'Treino').trim().toUpperCase() || 'TREINO';
};

export type StartDecision =
  | { kind: 'new' }
  | { kind: 'resume'; session: ActiveSessionLike }
  | { kind: 'conflict'; session: ActiveSessionLike; message: string };

/**
 * Decide o que fazer quando o aluno pede para iniciar `requestedDay`.
 * Nunca há duas sessões abertas: outro dia em andamento → pergunta.
 */
export const decideWorkoutStart = (
  active: ActiveSessionLike | null | undefined,
  requestedDay: string | null | undefined,
): StartDecision => {
  if (!active) return { kind: 'new' };
  if (!requestedDay || !active.day_name || isSameWorkoutDay(active.day_name, requestedDay)) {
    return { kind: 'resume', session: active };
  }
  return {
    kind: 'conflict',
    session: active,
    message: `Você tem o treino de ${workoutDayLabel(active.day_name, 'short')} em andamento. Continuar ele ou encerrar e começar o de ${workoutDayLabel(requestedDay, 'short')}?`,
  };
};

export type HomeTrainingCard<D> =
  | { mode: 'active'; day: D | null; dayLabel: string; minutes: number; title: string; sessionId: string }
  | { mode: 'today'; day: D }
  | { mode: 'none' };

/** Card "Hoje": sessão em andamento (de qualquer dia) tem prioridade sobre o treino do dia. */
export const resolveHomeTrainingCard = <D extends { day: string }>(params: {
  activeSession: ActiveSessionLike | null | undefined;
  todayTraining: D | null | undefined;
  trainingDays: D[];
  now?: number;
}): HomeTrainingCard<D> => {
  const { activeSession, todayTraining, trainingDays, now = Date.now() } = params;
  if (activeSession) {
    const day = trainingDays.find((d) => isSameWorkoutDay(d.day, activeSession.day_name)) ?? null;
    const dayLabel = workoutDayLabel(activeSession.day_name ?? day?.day);
    const minutes = Math.floor(elapsedSecondsSince(activeSession.started_at, now) / 60);
    return {
      mode: 'active',
      day,
      dayLabel,
      minutes,
      title: `Treino em andamento · ${dayLabel} · ${minutes} min`,
      sessionId: activeSession.id,
    };
  }
  if (todayTraining) return { mode: 'today', day: todayTraining };
  return { mode: 'none' };
};
