/**
 * Camada de integração: junta ADERÊNCIA + PERFORMANCE + FASE numa única
 * avaliação semanal determinística, usada tanto pelo aluno (MeusTreinos)
 * quanto pelo admin (StudentTrainingTab e resumo em lote da Consultoria).
 *
 * Regras:
 *  - toda a matemática continua em weeklyAdherence.ts / weeklyProgression.ts;
 *  - a semana avaliada é a SEMANA LÓGICA do plano (weekContext.ts). A janela
 *    móvel de 7 dias só é usada como fallback legado;
 *  - fase explicitamente diferente NUNCA entra na avaliação (não relaxamos);
 *  - S1 de novo ciclo e deload não produzem comparação de performance.
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
import type { WeeklyWindows } from './weeklyWindows';
import {
  inWindow,
  phaseCompatible,
  planCompatible,
  type ComparisonBasis,
  type WeekContext,
  type WeekContextSource,
  performanceComparablePhase,
  type WeekContexts,
} from './weekContext';
import type { TrainingPhase } from './trainingPhase';

/** Log cru vindo de exercise_set_logs (superset de AdherenceLog + ExerciseLog). */
export interface RawSetLog extends ExerciseLog {
  phase?: string | null;
  session_id?: string | null;
}

export interface RawSession extends AdherenceSession {
  id?: string | null;
  plan_id?: string | null;
  phase?: string | null;
}

export interface WeeklyTrainingInput {
  plannedPhase: TrainingPhase;
  plannedDays: ParsedTrainingDay[];
  /** Identidade estruturada da semana (preferencial). */
  contexts?: WeekContexts;
  /** Fallback legado: janela móvel de 7 dias. */
  windows?: WeeklyWindows;
  /** Todos os logs das duas janelas (uma única query). */
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
  /** Diagnóstico da semana/identidade (para UI, admin e debug). */
  context: {
    currentStart: string;
    currentEnd: string;
    previousStart: string | null;
    previousEnd: string | null;
    evaluatedPhase: TrainingPhase;
    /** Fase comparada (null quando não há semana comparável). */
    comparedPhase: TrainingPhase | null;
    /** De onde veio a identidade da semana avaliada. */
    weekContextSource: WeekContextSource;
    /** Base da comparação de performance. */
    comparisonBasis: ComparisonBasis;
    comparisonNote?: string;
    /** false quando não há semana anterior comparável (S1, deload, troca de plano). */
    previousWeekComparable: boolean;
    /** Sempre false: fase explicitamente divergente nunca é relaxada. */
    phaseFilterRelaxed: boolean;
    /** Logs descartados por pertencerem a outra fase/plano. */
    rejectedByPhase: number;
    /** Logs da semana atual sem session_id (dados legados). */
    legacyLogs: number;
    /** Logs da semana atual vinculados a uma workout_session. */
    structuredLogs: number;
  };
}

const sessionAt = (s: RawSession) => s.completed_at || s.started_at || s.created_at || '';

/** Contexto derivado de janelas móveis (compat com chamadas antigas). */
const contextsFromWindows = (
  windows: WeeklyWindows,
  phase: TrainingPhase,
  planId: string | null,
  comparedPhase: TrainingPhase | null,
): WeekContexts => ({
  current: {
    planId,
    phase,
    startedAt: windows.current.start,
    endedAt: windows.current.end,
    source: 'legacy_time_window',
  },
  previous: comparedPhase
    ? {
        planId,
        phase: comparedPhase,
        startedAt: windows.previous.start,
        endedAt: windows.previous.end,
        source: 'legacy_time_window',
      }
    : null,
  comparisonBasis: comparedPhase ? 'legacy_time_window' : 'none',
});

interface Selection {
  logs: RawSetLog[];
  rejectedByPhase: number;
  legacyLogs: number;
  structuredLogs: number;
}

/**
 * Seleciona os logs que pertencem ao contexto da semana.
 *
 * 1. Se o log tem session_id e a sessão é conhecida → identidade ESTRUTURADA:
 *    a sessão precisa pertencer à janela, à fase e ao plano do contexto.
 * 2. Sem session_id (ou sessão desconhecida) → FALLBACK legado por janela
 *    temporal, ainda respeitando a fase quando ela existe no próprio log.
 * 3. Fase explicitamente diferente → rejeitada em qualquer caso.
 */
const selectLogsForContext = (
  logs: RawSetLog[],
  ctx: WeekContext,
  sessionsById: Map<string, RawSession>,
): Selection => {
  let rejectedByPhase = 0;
  let legacyLogs = 0;
  let structuredLogs = 0;
  const out: RawSetLog[] = [];

  for (const l of logs) {
    const s = l.session_id ? sessionsById.get(l.session_id) : undefined;
    const itemPhase = s?.phase ?? l.phase;
    const itemPlanId = s?.plan_id ?? null;

    // Se o log/sessão tem fase explícita, deve bater com a fase do contexto.
    // Se NÃO tem (legado), aceitamos se estiver na janela temporal.
    const okPhase = itemPhase ? phaseCompatible(itemPhase, ctx.phase) : true;
    const okPlan = planCompatible(itemPlanId, ctx.planId);

    if (!okPhase || !okPlan) {
      if (!okPhase) rejectedByPhase += 1;
      continue;
    }

    if (s) {
      if (!inWindow(sessionAt(s), ctx) && !inWindow(l.performed_at, ctx)) continue;
      structuredLogs += 1;
      out.push(l);
    } else {
      if (!inWindow(l.performed_at, ctx)) continue;
      legacyLogs += 1;
      out.push(l);
    }
  }

  return { logs: out, rejectedByPhase, legacyLogs, structuredLogs };
};

const selectSessionsForContext = (sessions: RawSession[], ctx: WeekContext): RawSession[] =>
  sessions.filter((s) => {
    const okPhase = s.phase ? phaseCompatible(s.phase, ctx.phase) : true;
    const okPlan = planCompatible(s.plan_id, ctx.planId);
    return okPhase && okPlan && inWindow(sessionAt(s), ctx);
  });

export const buildWeeklyTrainingReport = (
  input: WeeklyTrainingInput,
): WeeklyTrainingReport => {
  const { plannedPhase, plannedDays, logs, sessions, planId = null } = input;

  const contexts: WeekContexts =
    input.contexts ??
    contextsFromWindows(
      input.windows!,
      plannedPhase,
      planId,
      performanceComparablePhase(plannedPhase),
    );

  const current = contexts.current;
  const previous = contexts.previous;

  const sessionsById = new Map<string, RawSession>();
  for (const s of sessions) if (s.id) sessionsById.set(s.id, s);

  const cur = selectLogsForContext(logs, current, sessionsById);
  const prev = previous
    ? selectLogsForContext(logs, previous, sessionsById)
    : { logs: [] as RawSetLog[], rejectedByPhase: 0, legacyLogs: 0, structuredLogs: 0 };

  const currentSessions = selectSessionsForContext(sessions, current);
  const previousSessions = previous ? selectSessionsForContext(sessions, previous) : [];

  // ---- ADERÊNCIA: janela da semana avaliada.
  const adherenceLogs: AdherenceLog[] = cur.logs.map((l) => ({
    exercise_name: l.exercise_name,
    reps: l.reps,
    weight_kg: l.weight_kg,
    performed_at: l.performed_at,
  }));
  const adherence = buildAdherenceReport(
    plannedDays,
    adherenceLogs,
    current.startedAt,
    current.endedAt,
    currentSessions,
  );

  // ---- Troca de plano/ciclo: se TODAS as sessões da semana anterior apontam
  // para outro plano, a comparação não é válida (não misturar ciclos).
  const previousSessionsAnyPlan = previous
    ? sessions.filter((s) => phaseCompatible(s.phase, previous.phase) && inWindow(sessionAt(s), previous))
    : [];
  const prevPlanIds = previousSessionsAnyPlan.map((s) => s.plan_id).filter(Boolean) as string[];
  const planStillMatches =
    !planId || prevPlanIds.length === 0 || prevPlanIds.some((id) => id === planId);
  const previousWeekComparable = !!previous && planStillMatches && prev.logs.length > 0;

  const progression = buildProgressionReport(
    cur.logs,
    previousWeekComparable ? prev.logs : [],
    plannedDays,
  );
  let performance = buildPerformanceSummary(progression.performances);

  // Dados legados (sem session_id) nunca têm a mesma confiança de sessões
  // estruturadas: rebaixa a confiança sem alterar nenhum threshold.
  const comparisonBasis: ComparisonBasis = !previousWeekComparable
    ? 'none'
    : current.source === 'structured_session' &&
        cur.structuredLogs > 0 &&
        prev.structuredLogs > 0
      ? 'structured_previous_phase'
      : 'legacy_time_window';

  if (comparisonBasis !== 'structured_previous_phase' && performance.confidence === 'high') {
    performance = { ...performance, confidence: 'low', hasRelevantRegression: false };
  }

  const resolution = resolveActiveWeek(plannedPhase, adherence, performance);

  return {
    adherence,
    progression,
    performance,
    resolution,
    context: {
      currentStart: current.startedAt.toISOString(),
      currentEnd: current.endedAt.toISOString(),
      previousStart: previous ? previous.startedAt.toISOString() : null,
      previousEnd: previous ? previous.endedAt.toISOString() : null,
      evaluatedPhase: plannedPhase,
      comparedPhase: previous?.phase ?? null,
      weekContextSource: current.source,
      comparisonBasis,
      comparisonNote: contexts.comparisonNote,
      previousWeekComparable,
      phaseFilterRelaxed: false,
      rejectedByPhase: cur.rejectedByPhase + prev.rejectedByPhase,
      legacyLogs: cur.legacyLogs,
      structuredLogs: cur.structuredLogs,
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
