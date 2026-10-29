/**
 * Regressão da Consultoria ("Para falar hoje" / tag "Regressão" / FOCO DA SEMANA).
 * Regras puras e determinísticas — só leitura de logs já gravados.
 */
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { RawSetLog } from '@/lib/weeklyTraining';
import type { RepRange } from '@/lib/weeklyProgression';
import { seriesMethod } from '@/lib/workoutExecutionMethods';

export const REFERENCE_MAX_DAYS = 28;
export const TAG_WINDOW_DAYS = 14;
export const REGRESSION_E1RM_DROP = 0.10;
export const MIN_REGRESSED_FOR_TAG = 2;
const DAY = 86400000;

export type RegressionKind = 'no_load' | 'insufficient' | 'resume' | 'regression' | 'ok';

export interface ExerciseRegressionAssessment {
  kind: RegressionKind;
  currentAt?: number;
  e1rmDropPct?: number;
}

const norm = (s: string | null | undefined) =>
  (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Mobilidade, alongamento, abdominais: nunca recebem orientação de carga. */
export const isNoLoadExercise = (name: string, muscleGroup?: string | null): boolean => {
  const n = norm(name);
  if (/^(MOBILIDADE|ALONGAMENTO|ABDOMINAL|ABS)\b/.test(n)) return true;
  const g = norm(muscleGroup);
  return g === 'MOBILIDADE' || g === 'ALONGAMENTO' || g === 'ABDOMEN';
};

export const epley = (w: number, r: number) => w * (1 + r / 30);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface SessionBest { at: number; weight: number; reps: number; e1rm: number }

export const assessExerciseRegression = (input: {
  exerciseName: string;
  logs: RawSetLog[];
  planned?: ParsedExercise | null;
  muscleGroup?: string | null;
  repRange?: RepRange | null;
}): ExerciseRegressionAssessment => {
  if (isNoLoadExercise(input.exerciseName, input.muscleGroup)) return { kind: 'no_load' };
  const firstSetOnly = input.planned
    ? ['dropset', 'restpause'].includes(seriesMethod(input.planned))
    : false;

  const bySession = new Map<string, RawSetLog[]>();
  for (const l of input.logs) {
    const t = (l.set_type || '').toLowerCase();
    if (t === 'recognition' || t === 'warmup') continue;
    const w = Number(l.weight_kg);
    const r = Number(l.reps);
    if (!w || w <= 0 || !r || r <= 0) continue;
    const key = l.session_id || (l.performed_at || '').slice(0, 10);
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key)!.push(l);
  }
  if (bySession.size === 0) return { kind: 'no_load' };

  const sessions: SessionBest[] = [];
  for (const sets of bySession.values()) {
    const sorted = [...sets].sort((a, b) =>
      (Number(a.set_number) || 0) - (Number(b.set_number) || 0)
      || new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());
    const pool = firstSetOnly ? sorted.slice(0, 1) : sorted;
    let best: SessionBest | null = null;
    for (const s of pool) {
      const w = Number(s.weight_kg), r = Number(s.reps);
      const e = epley(w, r);
      if (!best || e > best.e1rm) best = { at: new Date(s.performed_at).getTime(), weight: w, reps: r, e1rm: e };
    }
    if (best) {
      best.at = Math.max(...sets.map(s => new Date(s.performed_at).getTime()));
      sessions.push(best);
    }
  }
  sessions.sort((a, b) => b.at - a.at);

  // Outliers de digitação: < 30% ou > 250% da mediana das últimas 3 sessões.
  const med = median(sessions.slice(0, 3).map(s => s.weight));
  const valid = sessions.filter(s => s.weight >= med * 0.3 && s.weight <= med * 2.5);
  const [current, previous] = valid;
  if (!current || !previous) return { kind: 'insufficient', currentAt: current?.at };
  if (current.at - previous.at > REFERENCE_MAX_DAYS * DAY) return { kind: 'resume', currentAt: current.at };

  const drop = (previous.e1rm - current.e1rm) / previous.e1rm;
  if (drop < REGRESSION_E1RM_DROP) return { kind: 'ok', currentAt: current.at, e1rmDropPct: drop };
  const range = input.repRange;
  const tradedLoadForReps = current.weight < previous.weight && current.reps > previous.reps
    && (!range || current.reps <= range.max);
  if (tradedLoadForReps) return { kind: 'ok', currentAt: current.at, e1rmDropPct: drop };
  return { kind: 'regression', currentAt: current.at, e1rmDropPct: drop };
};

/** Tag "Regressão": ≥2 exercícios em regressão real com sessão nos últimos 14 dias. */
export const shouldTagRegression = (
  assessments: ExerciseRegressionAssessment[],
  nowMs = Date.now(),
): boolean =>
  assessments.filter(a => a.kind === 'regression' && (a.currentAt ?? 0) >= nowMs - TAG_WINDOW_DAYS * DAY).length
    >= MIN_REGRESSED_FOR_TAG;
