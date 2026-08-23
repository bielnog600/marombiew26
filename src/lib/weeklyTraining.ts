/**
 * Camada de integração: junta ADERÊNCIA + PERFORMANCE + FASE numa única
 * avaliação semanal determinística, usada tanto pelo aluno (MeusTreinos)
 * quanto pelo admin (StudentTrainingTab).
 *
 * Regras:
 *  - toda a matemática continua em weeklyAdherence.ts / weeklyProgression.ts;
 *  - aqui só há montagem de contexto (janela, fase, ciclo) e chamada das
 *    funções puras — nenhuma decisão nova, nenhum threshold novo;
 *  - a janela é única (weeklyWindows.ts): aderência e performance avaliam
 *    exatamente o mesmo intervalo.
 */

import type { ParsedTrainingDay } from './trainingResultParser';
import {
  buildAdherenceReport,
  type AdherenceReport,
  type AdherenceLog,
  type AdherenceSession,
} from './weeklyAdherence';
import {
  buildProgressionReport,
  buildPerformanceSummary,
  resolveActiveWeek,
  type ExerciseLog,
  type ProgressionReport,
  type PerformanceSummary,
  type WeekResolution,
} from './weeklyProgression';
import { previousComparablePhase, type WeeklyWindows } from './weeklyWindows';
import type { TrainingPhase } from './trainingPhase';

/** Log cru vindo de exercise_set_logs (superset de AdherenceLog + ExerciseLog). */
export interface RawSetLog extends ExerciseLog {
  phase?: string | null;
}

export interface RawSession extends AdherenceSession {
  plan_id?: string | null;
}

export interface WeeklyTrainingInput {
  plannedPhase: TrainingPhase;
  plannedDays: ParsedTrainingDay[];
  windows: WeeklyWindows;
  /** Todos os logs das DUAS janelas (uma única query). */
  logs: RawSetLog[];
  /** Sessões estruturadas das duas janelas. */
  sessions: RawSession[];
  /** Plano avaliado — usado para detectar troca de plano/ciclo. */
  planId?: string | null;
}

export interface WeeklyTrainingReport {
  adherence: AdherenceReport;
  progression: ProgressionReport;
  performance: PerformanceSummary;
  resolution: WeekResolution;
  /** Diagnóstico da janela/ciclo (para UI e debug). */
  context: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
    evaluatedPhase: TrainingPhase;
    comparedPhase: TrainingPhase;
    /** false quando a semana anterior pertence a outro plano/ciclo. */
    previousWeekComparable: boolean;
    /** true quando os logs não têm `phase` e o filtro de fase foi relaxado. */
    phaseFilterRelaxed: boolean;
  };
}

const inWindow = (iso: string, start: Date, end: Date) => {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
};

const sessionAt = (s: RawSession) => s.completed_at || s.started_at || s.created_at || '';

/**
 * Mantém apenas logs compatíveis com a fase avaliada.
 * Logs legados (phase = null) são sempre aceitos. Se o filtro eliminar tudo
 * mas existirem logs, o filtro é relaxado (dado legado sem fase confiável).
 */
const filterByPhase = (logs: RawSetLog[], phase: TrainingPhase) => {
  const filtered = logs.filter((l) => !l.phase || l.phase === phase);
  if (filtered.length === 0 && logs.length > 0) {
    return { logs, relaxed: true };
  }
  return { logs: filtered, relaxed: false };
};

export const buildWeeklyTrainingReport = (
  input: WeeklyTrainingInput,
): WeeklyTrainingReport => {
  const { plannedPhase, plannedDays, windows, logs, sessions, planId } = input;
  const { current, previous } = windows;

  const currentLogsRaw = logs.filter((l) => inWindow(l.performed_at, current.start, current.end));
  const previousLogsRaw = logs.filter((l) => inWindow(l.performed_at, previous.start, previous.end));

  const currentSessions = sessions.filter((s) => {
    const at = sessionAt(s);
    return !!at && inWindow(at, current.start, current.end);
  });
  const previousSessions = sessions.filter((s) => {
    const at = sessionAt(s);
    return !!at && inWindow(at, previous.start, previous.end);
  });

  // ---- ADERÊNCIA: janela atual (mesma de sempre).
  const adherenceLogs: AdherenceLog[] = currentLogsRaw.map((l) => ({
    exercise_name: l.exercise_name,
    reps: l.reps,
    weight_kg: l.weight_kg,
    performed_at: l.performed_at,
  }));
  const adherence = buildAdherenceReport(
    plannedDays,
    adherenceLogs,
    current.start,
    current.end,
    currentSessions,
  );

  // ---- PERFORMANCE: mesma janela atual + semana anterior comparável.
  const comparedPhase = previousComparablePhase(plannedPhase);
  const cur = filterByPhase(currentLogsRaw, plannedPhase);
  const prev = filterByPhase(previousLogsRaw, comparedPhase);

  // Troca de plano/ciclo: se TODAS as sessões da semana anterior apontam para
  // outro plano, a comparação não é válida (não misturar ciclos).
  const prevPlanIds = previousSessions.map((s) => s.plan_id).filter(Boolean) as string[];
  const previousWeekComparable =
    !planId || prevPlanIds.length === 0 || prevPlanIds.some((id) => id === planId);

  const progression = buildProgressionReport(
    cur.logs,
    previousWeekComparable ? prev.logs : [],
    plannedDays,
  );
  const performance = buildPerformanceSummary(progression.performances);
  const resolution = resolveActiveWeek(plannedPhase, adherence, performance);

  return {
    adherence,
    progression,
    performance,
    resolution,
    context: {
      currentStart: current.start.toISOString(),
      currentEnd: current.end.toISOString(),
      previousStart: previous.start.toISOString(),
      previousEnd: previous.end.toISOString(),
      evaluatedPhase: plannedPhase,
      comparedPhase,
      previousWeekComparable,
      phaseFilterRelaxed: cur.relaxed || prev.relaxed,
    },
  };
};

/**
 * Frase estruturada da decisão semanal, derivada SOMENTE dos reasons
 * determinísticos (nenhuma IA, nenhuma justificativa inventada).
 */
export const describeWeekDecision = (r: WeekResolution | null | undefined): string => {
  if (!r) return '';
  const has = (x: string) => r.reasons.includes(x as any);

  if (has('deload_week_completed')) return 'Semana de deload concluída — reiniciar o ciclo na Semana 1.';
  if (has('overload_week_completed')) {
    return has('regression_consistent_with_accumulated_fatigue')
      ? 'Semana de sobrecarga concluída com queda esperada de performance — avançar para deload.'
      : 'Semana de sobrecarga concluída — avançar para deload.';
  }
  if (has('significant_regression')) return 'Boa aderência, mas houve regressão consistente — mantenha esta semana.';
  if (has('poor_log_quality')) return 'Registros incompletos demais para avaliar performance — plano em revisão.';
  if (has('adherence_insufficient_data') || has('no_adherence_data')) {
    return 'Poucos registros na semana — sem base para decidir a progressão.';
  }
  if (has('weighted_adherence_low')) return 'Aderência baixa na semana — repetir a semana atual.';
  if (has('performance_low_confidence')) return 'Poucos dados de performance; decisão baseada principalmente na aderência.';
  if (r.decision === 'advance') {
    return has('performance_improved')
      ? 'Boa aderência e performance em evolução — próxima semana liberada.'
      : 'Boa aderência e performance estável — próxima semana liberada.';
  }
  if (has('partial_sessions_downgrade')) return 'Semana sustentada por sessões parciais — mantenha esta semana.';
  return r.reasonLabel;
};
