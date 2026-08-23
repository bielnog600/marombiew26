/**
 * Camada determinística de PERFORMANCE semanal.
 *
 * Compara duas janelas semanais (semana anterior vs. 2 semanas atrás) de
 * exercise_set_logs e classifica cada exercício em
 * improved | stable | regressed | missing | insufficient_data,
 * além de recomendar a próxima ação (increase_load, increase_reps, ...).
 *
 * REGRA CENTRAL: nunca combinar a maior carga de uma série com as maiores
 * repetições de outra. Toda comparação usa UM set real (carga + reps + RIR do
 * mesmo registro).
 *
 * Aderência (o aluno treinou?) continua vindo de workout_sessions /
 * weeklyAdherence.ts. Este módulo NÃO decide presença — só performance.
 *
 * A IA nunca decide a matemática: ela apenas transforma este resultado
 * determinístico em texto.
 */

import type { ParsedTrainingDay, ParsedExercise } from './trainingResultParser';
import type { AdherenceStatus } from './weeklyAdherence';
import { TRAINING_PHASES, type TrainingPhase } from './trainingPhase';
import { isNoLoadExercise } from './exerciseLoadType';

export interface ExerciseLog {
  exercise_name: string;
  weight_kg: number | null;
  reps: number | null;
  performed_at: string; // ISO
  set_number?: number | null;
  /**
   * Escala de esforço do set. `rir` é a fonte primária (coluna
   * exercise_set_logs.rir, opcional, preenchida pelo aluno na execução).
   * `rpe` (0-10) é aceito como fonte secundária: RIR = 10 - RPE.
   * NULL = desconhecido — nunca inferido/preenchido artificialmente.
   */
  rpe?: number | null;
  rir?: number | null;
  /**
   * Tipo estrutural da série (exercise_set_logs.set_type).
   * NULL = legado/desconhecido => tratado como série de trabalho (fallback).
   */
  set_type?: SetType | string | null;
}

/** Tipos de série reconhecidos (espelham o CHECK de exercise_set_logs.set_type). */
export type SetType =
  | 'warmup'
  | 'recognition'
  | 'work'
  | 'top'
  | 'backoff'
  | 'drop'
  | 'rest_pause'
  | 'myo_reps'
  | 'technique';

/**
 * Papel da série na avaliação de performance:
 *  - primary: working set / top set — representa a performance da semana;
 *  - auxiliary: backoff e técnicas (drop, rest-pause, myo-reps) — contam em
 *    volume/reps/contexto, mas não substituem uma série principal;
 *  - preparation: aquecimento e reconhecimento — nunca representam performance.
 */
export type SetRole = 'primary' | 'auxiliary' | 'preparation';

const SET_ROLE_BY_TYPE: Record<SetType, SetRole> = {
  warmup: 'preparation',
  recognition: 'preparation',
  work: 'primary',
  top: 'primary',
  backoff: 'auxiliary',
  drop: 'auxiliary',
  rest_pause: 'auxiliary',
  myo_reps: 'auxiliary',
  technique: 'auxiliary',
};

/** Sem tipo estrutural (dado legado) => assume série de trabalho. */
export const setRoleOf = (log: Pick<ExerciseLog, 'set_type'>): SetRole => {
  const t = String(log.set_type ?? '').trim() as SetType;
  return SET_ROLE_BY_TYPE[t] ?? 'primary';
};

/** true quando pelo menos um log da janela traz tipo estrutural explícito. */
export const hasStructuredSetTypes = (logs: ExerciseLog[]): boolean =>
  logs.some((l) => !!String(l.set_type ?? '').trim());

/**
 * Como as duas janelas foram comparadas:
 *  - like_for_like: ambas as janelas têm tipos estruturados (working set vs working set);
 *  - fallback_untyped: uma ou ambas as janelas são dados legados sem set_type.
 */
export type ComparisonBasis = 'like_for_like' | 'fallback_untyped';


// ============================================================
// Constantes de decisão (centralizadas)
// ============================================================

/** e1RM (Epley) só é aplicado em sets com carga externa e reps nesta faixa. */
export const E1RM_MIN_REPS = 1;
export const E1RM_MAX_REPS = 15;

/** Faixa neutra de e1RM: variação dentro de ±3% é ruído humano => stable. */
export const E1RM_NEUTRAL_PCT = 0.03;

/** Queda de e1RM a partir da qual a recomendação vira reduce_load. */
export const E1RM_STRONG_DROP_PCT = 0.07;

/** Bodyweight: diferença de até 1 rep é considerada oscilação (stable). */
export const BODYWEIGHT_REPS_TOLERANCE = 1;

/** Mesma carga com apenas 1 rep a menos => stable (ruído), não regressão. */
export const SAME_LOAD_REPS_TOLERANCE = 1;

/** RIR: ganho/perda mínima de reserva para modificar a classificação. */
export const RIR_MEANINGFUL_DELTA = 2;

/** RIR a partir do qual há margem real para subir carga no topo da faixa. */
export const RIR_ROOM_TO_ADD_LOAD = 2;

export type PerformanceStatus =
  | 'improved'
  | 'stable'
  | 'regressed'
  | 'missing'
  | 'insufficient_data';

export type NextAction =
  | 'increase_load'
  | 'increase_reps'
  | 'maintain'
  | 'reduce_load'
  | 'review';

export interface PerformedSet {
  weightKg: number;
  reps: number;
  rir: number | null;
  performedAt: string;
  setNumber: number | null;
  /** Epley, só quando aplicável (carga > 0 e reps entre 1 e 15). */
  estimated1RM: number | null;
}

export interface RepRange {
  min: number;
  max: number;
}

export interface ExercisePerformance {
  exerciseName: string;
  /** Set real com a melhor performance da janela (nunca um set sintético). */
  bestSet?: PerformedSet;
  /** Séries de trabalho + auxiliares (aquecimento/reconhecimento não contam). */
  totalWorkingSets: number;
  /** Backoff/drop/rest-pause/myo-reps: contexto, nunca decisão isolada. */
  auxiliarySets: number;
  /** Aquecimento/reconhecimento registrados na janela. */
  preparationSets: number;
  totalReps: number;
  totalVolume: number; // Σ(peso × reps) — métrica AUXILIAR, nunca decisória
  loaded: boolean;     // teve carga externa registrada
  /** Base da comparação semana a semana (tipos estruturados ou fallback legado). */
  comparisonBasis: ComparisonBasis;

  status: PerformanceStatus;
  /** Só presente quando há set atual e set anterior comparáveis. */
  e1rmDeltaPct?: number | null;
  repsDelta?: number | null;
  weightDelta?: number | null;
  rirDelta?: number | null;
  previousBestSet?: PerformedSet;
  repRange?: RepRange | null;
  nextAction: NextAction;
  reason: string;
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
  /** Camada nova: performance real por exercício (fonte para IA e admin). */
  performances: ExercisePerformance[];
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

// ============================================================
// Set real / e1RM
// ============================================================

/** Epley. Só faz sentido com carga externa e reps baixas/moderadas. */
export const estimate1RM = (weightKg: number, reps: number): number | null => {
  if (!(weightKg > 0)) return null;
  if (!Number.isFinite(reps) || reps < E1RM_MIN_REPS || reps > E1RM_MAX_REPS) return null;
  return +(weightKg * (1 + reps / 30)).toFixed(2);
};

const rirOf = (l: ExerciseLog): number | null => {
  if (l.rir != null && Number.isFinite(l.rir)) return Number(l.rir);
  if (l.rpe != null && Number.isFinite(l.rpe)) return +(10 - Number(l.rpe)).toFixed(1);
  return null;
};

export const toPerformedSet = (l: ExerciseLog): PerformedSet => {
  const weightKg = Number(l.weight_kg ?? 0) || 0;
  const reps = Number(l.reps ?? 0) || 0;
  return {
    weightKg,
    reps,
    rir: rirOf(l),
    performedAt: l.performed_at,
    setNumber: l.set_number ?? null,
    estimated1RM: estimate1RM(weightKg, reps),
  };
};

/**
 * Escolhe UM set real como referência da janela.
 *
 * PRIORIDADE DE TIPO (nunca cega):
 *   working/top set  >  backoff e técnicas (drop/rest-pause/myo-reps)
 *   > aquecimento/reconhecimento (último recurso).
 * Uma técnica ou um aquecimento nunca substitui uma série principal como
 * representação da performance semanal; só entram se não houver nenhuma
 * série principal registrada.
 *
 * Dentro do pool escolhido:
 *  - com carga externa: maior e1RM; empate => maior carga; depois mais reps;
 *    depois melhor RIR (mais reserva com o mesmo trabalho).
 *  - sem carga externa (bodyweight/isométrico): mais repetições.
 * Nunca mistura o peso de um set com as reps de outro.
 */
export const selectBestSet = (logs: ExerciseLog[]): PerformedSet | undefined => {
  const usable = logs.filter((l) => (Number(l.reps) || 0) > 0 || (Number(l.weight_kg) || 0) > 0);
  if (usable.length === 0) return undefined;

  const byRole = (role: SetRole) => usable.filter((l) => setRoleOf(l) === role);
  const ordered = [byRole('primary'), byRole('auxiliary'), byRole('preparation')];
  const chosenLogs = ordered.find((group) => group.length > 0)!;

  const sets = chosenLogs.map(toPerformedSet);
  const loaded = sets.filter((s) => s.weightKg > 0);
  const pool = loaded.length > 0 ? loaded : sets;

  return pool.reduce((best, s) => {
    if (!best) return s;
    const a = s.estimated1RM ?? -1;
    const b = best.estimated1RM ?? -1;
    if (a !== b) return a > b ? s : best;
    if (s.weightKg !== best.weightKg) return s.weightKg > best.weightKg ? s : best;
    if (s.reps !== best.reps) return s.reps > best.reps ? s : best;
    const sr = s.rir ?? -1;
    const br = best.rir ?? -1;
    return sr > br ? s : best;
  });
};


/** Faixa prescrita de repetições: "8-12", "8 a 12", "10", "12/10/8" (usa min-max). */
export const parseRepRange = (raw?: string | null): RepRange | null => {
  const txt = String(raw ?? '').replace(',', '.');
  const nums = (txt.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0 && n <= 100);
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max };
};

/** Faixa prescrita do exercício no plano (setScheme tem prioridade). */
export const repRangeFromPlanned = (e?: ParsedExercise | null): RepRange | null => {
  if (!e) return null;
  const schemeReps = e.setScheme?.sets?.map((s) => s.target_reps).filter(Boolean).join('-');
  return parseRepRange(schemeReps || e.reps);
};

// ============================================================
// Performance por exercício
// ============================================================

export const buildExercisePerformance = (
  exerciseName: string,
  currentLogs: ExerciseLog[],
  previousLogs: ExerciseLog[],
  repRange?: RepRange | null,
): ExercisePerformance => {
  const bestSet = selectBestSet(currentLogs);
  const previousBestSet = selectBestSet(previousLogs);

  const usable = currentLogs.filter((l) => (l.reps ?? 0) > 0 || (l.weight_kg ?? 0) > 0);
  const primarySets = usable.filter((l) => setRoleOf(l) === 'primary');
  const auxiliarySets = usable.filter((l) => setRoleOf(l) === 'auxiliary');
  const preparationSets = usable.filter((l) => setRoleOf(l) === 'preparation');
  // Técnicas não são perdidas: entram em volume/reps/contagem de trabalho.
  const countedSets = [...primarySets, ...auxiliarySets];
  const totalWorkingSets = countedSets.length;
  const totalReps = countedSets.reduce((a, l) => a + (Number(l.reps) || 0), 0);
  const totalVolume = +countedSets
    .reduce((a, l) => a + (Number(l.reps) || 0) * (Number(l.weight_kg) || 0), 0)
    .toFixed(1);
  const loaded = !!bestSet && bestSet.weightKg > 0;
  const comparisonBasis: ComparisonBasis =
    hasStructuredSetTypes(currentLogs) && (previousLogs.length === 0 || hasStructuredSetTypes(previousLogs))
      ? 'like_for_like'
      : 'fallback_untyped';

  const base: ExercisePerformance = {
    exerciseName,
    bestSet,
    previousBestSet,
    totalWorkingSets,
    auxiliarySets: auxiliarySets.length,
    preparationSets: preparationSets.length,
    totalReps,
    totalVolume,
    loaded,
    comparisonBasis,
    repRange: repRange ?? null,
    status: 'insufficient_data',
    nextAction: 'review',
    reason: 'Sem dados suficientes para avaliar performance.',
    e1rmDeltaPct: null,
    repsDelta: null,
    weightDelta: null,
    rirDelta: null,
  };


  if (!bestSet) {
    return { ...base, status: 'missing', nextAction: 'review', reason: 'Exercício planejado sem registro na semana.' };
  }
  if (bestSet.reps <= 0 && bestSet.weightKg <= 0) {
    return base;
  }

  const rirDelta =
    bestSet.rir != null && previousBestSet?.rir != null ? bestSet.rir - previousBestSet.rir : null;

  if (!previousBestSet) {
    return {
      ...base,
      rirDelta,
      status: 'insufficient_data',
      nextAction: nextActionFor('insufficient_data', bestSet, repRange ?? null, null),
      reason: 'Primeira semana com registro — sem base de comparação.',
    };
  }

  const weightDelta = +(bestSet.weightKg - previousBestSet.weightKg).toFixed(1);
  const repsDelta = bestSet.reps - previousBestSet.reps;

  let status: PerformanceStatus;
  let reason: string;
  let e1rmDeltaPct: number | null = null;

  const bothLoaded = bestSet.weightKg > 0 && previousBestSet.weightKg > 0;
  const e1rmComparable = bothLoaded && bestSet.estimated1RM != null && previousBestSet.estimated1RM != null;

  if (e1rmComparable) {
    e1rmDeltaPct = +(
      (bestSet.estimated1RM! - previousBestSet.estimated1RM!) / previousBestSet.estimated1RM!
    ).toFixed(4);
    const sameLoadSmallRepDrop =
      weightDelta === 0 && repsDelta < 0 && Math.abs(repsDelta) <= SAME_LOAD_REPS_TOLERANCE;

    if (e1rmDeltaPct > E1RM_NEUTRAL_PCT) {
      status = 'improved';
      reason = `e1RM ${(e1rmDeltaPct * 100).toFixed(1)}% acima da semana anterior (${bestSet.weightKg}kg × ${bestSet.reps}).`;
    } else if (e1rmDeltaPct < -E1RM_NEUTRAL_PCT && !sameLoadSmallRepDrop) {
      status = 'regressed';
      reason = `e1RM ${(e1rmDeltaPct * 100).toFixed(1)}% abaixo da semana anterior (${bestSet.weightKg}kg × ${bestSet.reps}).`;
    } else {
      status = 'stable';
      reason = 'Performance equivalente à semana anterior (dentro da faixa neutra).';
    }
  } else if (!bothLoaded && bestSet.weightKg === 0 && previousBestSet.weightKg === 0) {
    // Bodyweight / isométrico com reps: só repetições fazem sentido.
    if (repsDelta > BODYWEIGHT_REPS_TOLERANCE) {
      status = 'improved';
      reason = `Peso corporal: ${previousBestSet.reps} → ${bestSet.reps} repetições.`;
    } else if (repsDelta < -BODYWEIGHT_REPS_TOLERANCE) {
      status = 'regressed';
      reason = `Peso corporal: queda de ${previousBestSet.reps} para ${bestSet.reps} repetições.`;
    } else {
      status = 'stable';
      reason = 'Peso corporal: repetições equivalentes à semana anterior.';
    }
  } else {
    // Reps fora da faixa do e1RM (ex.: >15) ou carga só em uma das semanas.
    if (weightDelta > 0 && repsDelta >= 0) {
      status = 'improved';
      reason = 'Mais carga com as mesmas (ou mais) repetições.';
    } else if (weightDelta < 0 || repsDelta < -BODYWEIGHT_REPS_TOLERANCE) {
      status = 'regressed';
      reason = 'Queda de carga ou de repetições em relação à semana anterior.';
    } else if (repsDelta > BODYWEIGHT_REPS_TOLERANCE) {
      status = 'improved';
      reason = 'Mais repetições com a mesma carga.';
    } else {
      status = 'stable';
      reason = 'Performance equivalente à semana anterior.';
    }
  }

  // RIR como MODIFICADOR (nunca requisito): só age quando o resultado bruto
  // ficou estável e existe RIR nas duas semanas.
  if (status === 'stable' && rirDelta != null && Math.abs(rirDelta) >= RIR_MEANINGFUL_DELTA) {
    if (rirDelta > 0) {
      status = 'improved';
      reason = `Mesmo trabalho com mais reserva (RIR ${previousBestSet.rir} → ${bestSet.rir}).`;
    } else {
      status = 'regressed';
      reason = `Mesmo trabalho com muito mais esforço (RIR ${previousBestSet.rir} → ${bestSet.rir}).`;
    }
  }

  return {
    ...base,
    status,
    reason,
    e1rmDeltaPct,
    repsDelta,
    weightDelta,
    rirDelta,
    nextAction: nextActionFor(status, bestSet, repRange ?? null, e1rmDeltaPct),
  };
};

/**
 * Recomendação conservadora para a próxima sessão (double progression).
 * Nunca manda subir carga só porque a semana foi boa: exige topo da faixa
 * (ou RIR com folga real quando não há faixa prescrita).
 */
export const nextActionFor = (
  status: PerformanceStatus,
  bestSet: PerformedSet | undefined,
  repRange: RepRange | null,
  e1rmDeltaPct: number | null,
): NextAction => {
  if (!bestSet || status === 'missing' || status === 'insufficient_data') return 'review';

  if (status === 'regressed') {
    return e1rmDeltaPct != null && e1rmDeltaPct <= -E1RM_STRONG_DROP_PCT ? 'reduce_load' : 'maintain';
  }

  const rir = bestSet.rir;
  const maxedOut = rir != null && rir <= 1; // esforço máximo declarado

  if (repRange) {
    if (bestSet.reps < repRange.min) {
      // Abaixo da faixa: nunca subir carga.
      return status === 'improved' ? 'maintain' : maxedOut ? 'reduce_load' : 'maintain';
    }
    if (bestSet.reps >= repRange.max) {
      return maxedOut ? 'maintain' : 'increase_load';
    }
    return 'increase_reps'; // dentro da faixa, ainda abaixo do topo
  }

  // Sem faixa prescrita: só sobe carga com folga de RIR explícita.
  if (rir != null && rir >= RIR_ROOM_TO_ADD_LOAD) return 'increase_load';
  return 'maintain';
};

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  increase_load: 'Aumentar carga',
  increase_reps: 'Aumentar repetições',
  maintain: 'Manter',
  reduce_load: 'Reduzir carga',
  review: 'Revisar/registrar',
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

  // Faixa prescrita por exercício (quando o plano informa).
  const rangeByEx = new Map<string, RepRange | null>();
  const plannedByEx = new Map<string, ParsedExercise>();
  for (const d of plannedDays) {
    for (const e of d.exercises) {
      const key = norm(e.exercise);
      if (!key || plannedByEx.has(key)) continue;
      plannedByEx.set(key, e);
      rangeByEx.set(key, repRangeFromPlanned(e));
    }
  }

  const performances: ExercisePerformance[] = [];
  const improved: ExerciseDelta[] = [];
  const regressed: ExerciseDelta[] = [];

  for (const [key, { display, logs }] of lastByEx.entries()) {
    const perf = buildExercisePerformance(
      display,
      logs,
      prevByEx.get(key)?.logs ?? [],
      rangeByEx.get(key) ?? null,
    );
    performances.push(perf);

    const prevBest = perf.previousBestSet;
    if (!perf.bestSet || !prevBest) continue;

    // Contrato legado (admin/consultoria/IA de texto): sempre derivado do
    // MESMO set real, nunca de máximos combinados.
    const delta: ExerciseDelta = {
      exercise: display,
      weightDelta: perf.weightDelta ?? 0,
      repsDelta: perf.repsDelta ?? 0,
      lastWeight: perf.bestSet.weightKg,
      lastReps: perf.bestSet.reps,
      prevWeight: prevBest.weightKg,
      prevReps: prevBest.reps,
    };
    if (perf.status === 'improved') improved.push(delta);
    else if (perf.status === 'regressed') regressed.push(delta);
  }

  improved.sort((a, b) => (b.weightDelta - a.weightDelta) || (b.repsDelta - a.repsDelta));
  regressed.sort((a, b) => (a.weightDelta - b.weightDelta) || (a.repsDelta - b.repsDelta));

  // Missing = planejado mas sem nenhum log na semana. Isso é ADERÊNCIA/registro,
  // não regressão de performance.
  const missing: string[] = [];
  if (plannedDays.length > 0) {
    const seen = new Set<string>();
    for (const d of plannedDays) {
      for (const e of d.exercises) {
        const key = norm(e.exercise);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        // Mobilidade/alongamento/ativação não devem virar "exercício faltante"
        if (isNoLoadExercise(e.exercise)) continue;
        if (!lastByEx.has(key)) {
          missing.push(e.exercise);
          performances.push({
            exerciseName: e.exercise,
            totalWorkingSets: 0,
            totalReps: 0,
            totalVolume: 0,
            loaded: false,
            repRange: rangeByEx.get(key) ?? null,
            status: 'missing',
            nextAction: 'review',
            reason: 'Exercício planejado sem registro na semana.',
          });
        }
      }
    }
  }

  return {
    improved: improved.slice(0, 3),
    regressed: regressed.slice(0, 3),
    missing: missing.slice(0, 5),
    hasProgress: improved.length > 0,
    performances,
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
// ============================================================
// LIMITAÇÕES DO SCHEMA ATUAL (documentado, sem migration nesta etapa)
// ------------------------------------------------------------
//  - exercise_set_logs tem `rpe` (numeric) mas NÃO tem coluna `rir`. Hoje
//    100% dos registros têm rpe = null, então o modificador de RIR fica
//    inerte até o app passar a coletar esforço por série. A leitura já está
//    pronta: `rir` explícito ou derivado de 10 - rpe.
//  - Não há duração/tempo por série: exercícios isométricos ou por tempo
//    (prancha, 30s → 40s) não têm dado estruturado e caem em
//    insufficient_data ou são avaliados só por repetições quando existirem.
//  - A correspondência entre semanas é por nome normalizado do exercício
//    (não há exercise_id / exercise_instance_id no log). Trocas de variação
//    aparecem como exercícios diferentes.
//  - A faixa prescrita vem do texto do plano (reps "8-12" ou setScheme);
//    quando ausente, nextAction fica conservador (maintain).
