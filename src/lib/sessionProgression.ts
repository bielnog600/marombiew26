/**
 * CAMADA CENTRAL DE RECOMENDAÇÃO DA SESSÃO (pura, sem I/O)
 * ========================================================
 *
 * Transforma histórico ANTERIOR + incrementos configurados em um SNAPSHOT
 * consultivo de recomendações por exercício, congelado no início da sessão.
 *
 * Garantias:
 *  - nunca usa logs da sessão atual (`currentSessionId` é excluído aqui,
 *    além do filtro feito na query);
 *  - nunca escreve em exercise_set_logs nem altera o plano;
 *  - não chama resolveActiveWeek nem recalcula aderência/semana;
 *  - saída versionada (`PROGRESSION_SNAPSHOT_VERSION`) para permitir evolução
 *    sem quebrar sessões antigas (sessões sem snapshot continuam funcionando).
 */

import {
  buildExercisePerformance,
  parseRepRange,
  repRangeFromPlanned,
  type ExerciseLog,
  type NextAction,
  type RepRange,
} from './weeklyProgression';
import {
  buildQuantitativeProgressionRecommendation,
  type QuantitativeAction,
  type QuantitativeRecommendation,
  type RecommendationConfidence,
} from './quantitativeProgression';
import { normalizeExerciseKey, type IncrementSource } from './loadIncrement';
import type { TrainingPhase } from './trainingPhase';
import type { ParsedExercise } from './trainingResultParser';

export const PROGRESSION_SNAPSHOT_VERSION = 1;

export type SessionLog = ExerciseLog & { session_id?: string | null };

export interface SessionRecommendation {
  exerciseKey: string;
  exerciseName: string;
  action: QuantitativeAction;
  sourceAction: NextAction;
  currentLoadKg: number | null;
  recommendedLoadKg: number | null;
  currentReps: number | null;
  targetReps: number | null;
  workingSetTargets: number[] | null;
  repRange: RepRange | null;
  confidence: RecommendationConfidence;
  incrementKg: number | null;
  incrementSource: IncrementSource;
  incrementConfidence: RecommendationConfidence;
  qualitative: boolean;
  bodyweight: boolean;
  basis: string;
  reasons: string[];
  /** Telemetria futura: comparar recomendado x executado. Nunca vira log. */
  executedLoadKg?: number | null;
}

export interface ProgressionSnapshot {
  version: number;
  generatedAt: string;
  sessionId: string | null;
  phase: TrainingPhase | null;
  /** Plano usado como contexto de comparabilidade (null = desconhecido). */
  planId?: string | null;
  recommendations: Record<string, SessionRecommendation>;
}

/** Metadados de sessões anteriores (workout_sessions), buscados em lote. */
export interface SessionMetaRow {
  sessionId: string;
  planId?: string | null;
  phase?: string | null;
}

export interface BuildSessionRecommendationsInput {
  exercises: ParsedExercise[];
  /** Histórico bruto (já sem a sessão atual, mas revalidado aqui). */
  logs: SessionLog[];
  currentSessionId: string | null;
  activePhase: TrainingPhase | null;
  /** Mapa exerciseKey → incremento configurado (kg), buscado em lote. */
  configuredIncrements: Record<string, number>;
  /** sessionId → { planId, phase } das sessões anteriores. */
  sessionMeta?: Record<string, SessionMetaRow>;
  /** Plano da sessão atual; null = desconhecido (sem filtro por plano). */
  currentPlanId?: string | null;
}

/** Remove explicitamente qualquer log pertencente à sessão em andamento. */
export const excludeCurrentSessionLogs = <T extends { session_id?: string | null }>(
  logs: T[],
  currentSessionId: string | null,
): T[] => (currentSessionId ? logs.filter((l) => l.session_id !== currentSessionId) : logs.slice());

const byTimeAsc = (a: SessionLog, b: SessionLog) =>
  new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime();

/** Chave de agrupamento por sessão (dado legado sem session_id → por dia). */
export const sessionGroupKey = (l: SessionLog): string =>
  l.session_id || String(l.performed_at).slice(0, 10);

export interface ComparableHistoryResult {
  logs: SessionLog[];
  /** Alguma sessão usada não tem plan_id conhecido (histórico legado). */
  legacyFallback: boolean;
  excludedDeloadSessions: number;
  excludedOtherPlanSessions: number;
}

/**
 * POLÍTICA DE COMPARABILIDADE (explícita, conservadora)
 * =====================================================
 *  1. a sessão atual nunca entra (dupla proteção: query + aqui);
 *  2. sessões de DELOAD nunca servem como evidência de tendência — uma S4 de
 *     70 kg depois de 100 kg em S3 não pode virar `reduce_load` na nova S1;
 *  3. plano: se o plano atual é conhecido e a sessão pertence a OUTRO plano,
 *     ela é descartada (nunca misturamos planos silenciosamente);
 *  4. plano desconhecido na sessão antiga (legado) → entra como fallback
 *     explícito, com confiança reduzida (ver `legacyFallback`);
 *  5. fase divergente mas não-deload (S1 x S2 x S3 do mesmo plano) é
 *     comparável; fase null é legado e também entra como fallback.
 *
 * Não reproduz `resolveActiveWeek`: apenas seleciona quais performances
 * passadas podem alimentar `buildExercisePerformance`.
 */
export const filterComparableSessionHistory = (input: {
  logs: SessionLog[];
  currentSessionId: string | null;
  currentPlanId?: string | null;
  sessionMeta?: Record<string, SessionMetaRow>;
}): ComparableHistoryResult => {
  const logs = excludeCurrentSessionLogs(input.logs ?? [], input.currentSessionId);
  const meta = input.sessionMeta ?? {};
  const currentPlanId = input.currentPlanId ?? null;

  const groups = new Map<string, SessionLog[]>();
  logs.forEach((l) => {
    const k = sessionGroupKey(l);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  });

  const kept: SessionLog[] = [];
  let excludedDeloadSessions = 0;
  let excludedOtherPlanSessions = 0;
  let legacyFallback = false;

  groups.forEach((rows, key) => {
    const m = meta[key];
    const phase = rows.find((r) => (r as any).phase)?.['phase' as keyof SessionLog] ?? m?.phase ?? null;
    const planId = m?.planId ?? null;

    if (String(phase ?? '') === 'deload') {
      excludedDeloadSessions += 1;
      return;
    }
    if (currentPlanId && planId && planId !== currentPlanId) {
      excludedOtherPlanSessions += 1;
      return;
    }
    if (currentPlanId && !planId) legacyFallback = true;
    kept.push(...rows);
  });

  return { logs: kept, legacyFallback, excludedDeloadSessions, excludedOtherPlanSessions };
};

/**
 * Divide o histórico de UM exercício em (sessão mais recente, sessão anterior).
 * Quando não há session_id (dado legado), agrupa por dia.
 */
export const splitLastTwoSessions = (
  logs: SessionLog[],
): { current: SessionLog[]; previous: SessionLog[] } => {
  const sorted = [...logs].sort(byTimeAsc);
  const order: string[] = [];
  const groups = new Map<string, SessionLog[]>();
  sorted.forEach((l) => {
    const k = sessionGroupKey(l);
    if (!groups.has(k)) {
      groups.set(k, []);
      order.push(k);
    }
    groups.get(k)!.push(l);
  });
  const lastKey = order[order.length - 1];
  const prevKey = order[order.length - 2];
  return {
    current: lastKey ? groups.get(lastKey)! : [],
    previous: prevKey ? groups.get(prevKey)! : [],
  };
};

const plannedRepsTextOf = (ex: ParsedExercise): string =>
  ex.setScheme?.sets?.map((s) => s.target_reps).filter(Boolean).join('/') || ex.reps || '';

/** Motor central: recebe exercícios + histórico anterior, devolve o snapshot. */
export const buildSessionProgressionRecommendations = (
  input: BuildSessionRecommendationsInput,
): ProgressionSnapshot => {
  const safeLogs = excludeCurrentSessionLogs(input.logs ?? [], input.currentSessionId);

  const byKey = new Map<string, SessionLog[]>();
  safeLogs.forEach((l) => {
    const key = normalizeExerciseKey(l.exercise_name || '');
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(l);
  });

  const recommendations: Record<string, SessionRecommendation> = {};

  (input.exercises ?? []).forEach((ex) => {
    const name = (ex?.exercise || '').trim();
    const key = normalizeExerciseKey(name);
    if (!key || recommendations[key]) return;
    const history = byKey.get(key) ?? [];
    // Aluno sem histórico: não inventamos recomendação (regra 21/22).
    if (history.length === 0) return;

    const { current, previous } = splitLastTwoSessions(history);
    const repRange: RepRange | null = repRangeFromPlanned(ex) ?? parseRepRange(ex?.reps);
    const performance = buildExercisePerformance(name, current, previous, repRange);

    const quant: QuantitativeRecommendation = buildQuantitativeProgressionRecommendation({
      performance,
      recentLogs: current,
      historyLogs: history,
      configuredIncrementKg: input.configuredIncrements?.[key] ?? null,
      activePhase: input.activePhase,
      setSchemeMode: ex.setScheme?.mode ?? null,
      setSchemeTargets: ex.setScheme?.sets?.map((s) => s.target_reps) ?? null,
      plannedRepsText: plannedRepsTextOf(ex),
    });

    // Sem base quantificável: nada é exibido (evita card vazio).
    if (quant.basis === 'sem_base_quantificavel') return;

    const bodyweight = !!performance.bestSet && performance.bestSet.weightKg <= 0;

    recommendations[key] = {
      exerciseKey: key,
      exerciseName: name,
      action: quant.action,
      sourceAction: quant.sourceAction,
      currentLoadKg: quant.currentLoadKg,
      recommendedLoadKg: quant.recommendedLoadKg,
      currentReps: quant.currentReps,
      targetReps: quant.targetReps,
      workingSetTargets: quant.workingSetTargets,
      repRange: quant.repRange,
      confidence: quant.confidence,
      incrementKg: quant.incrementKg,
      incrementSource: quant.incrementSource,
      incrementConfidence: quant.incrementConfidence,
      qualitative: quant.qualitative,
      bodyweight,
      basis: quant.basis,
      reasons: quant.reasons,
      executedLoadKg: null,
    };
  });

  return {
    version: PROGRESSION_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    sessionId: input.currentSessionId,
    phase: input.activePhase ?? null,
    recommendations,
  };
};

/** Lê um snapshot já persistido no session_state (tolerante a formatos antigos). */
export const readProgressionSnapshot = (state: any): ProgressionSnapshot | null => {
  const snap = state?.progressionRecommendations;
  if (!snap || typeof snap !== 'object') return null;
  if (!snap.recommendations || typeof snap.recommendations !== 'object') return null;
  if (Number(snap.version) !== PROGRESSION_SNAPSHOT_VERSION) return null;
  return snap as ProgressionSnapshot;
};

export const getRecommendationFor = (
  snapshot: ProgressionSnapshot | null,
  exerciseName: string,
): SessionRecommendation | null => {
  if (!snapshot) return null;
  return snapshot.recommendations[normalizeExerciseKey(exerciseName || '')] ?? null;
};

// ------------------------------------------------------------------
// Apresentação (PT-BR, discreta) — derivada apenas dos números acima
// ------------------------------------------------------------------

export const SESSION_ACTION_LABEL: Record<QuantitativeAction, string> = {
  increase_load: 'Aumentar carga',
  increase_reps: 'Progredir reps',
  maintain: 'Manter',
  reduce_load: 'Reduzir/recuperar',
  review: 'Sem sugestão',
  manual_increment_required: 'Manter',
};

const kg = (n: number) => String(n).replace('.', ',');

export interface SessionHint {
  label: string;
  text: string;
  /** Incremento inferido do histórico (medium) — indicar discretamente. */
  estimated: boolean;
}

/** Texto curto da sugestão. Retorna null quando não há nada útil a mostrar. */
export const formatSessionHint = (r: SessionRecommendation | null): SessionHint | null => {
  if (!r) return null;
  const estimated = r.incrementSource === 'inferred_history';
  const label = SESSION_ACTION_LABEL[r.action] ?? 'Sugestão';
  const range = r.repRange ? `${r.repRange.min}–${r.repRange.max}` : null;

  if (r.action === 'review') return null;

  if (r.action === 'manual_increment_required') {
    return {
      label,
      estimated,
      text: 'O próximo incremento disponível é muito alto. Mantenha a carga e priorize repetições e execução.',
    };
  }

  if (r.bodyweight) {
    if (r.targetReps) return { label, estimated: false, text: `Alvo: ${r.targetReps} reps` };
    return { label, estimated: false, text: 'Mantenha a execução e o esforço controlado.' };
  }

  if (r.qualitative) {
    if (r.action === 'increase_load')
      return { label, estimated, text: 'Aumente pelo menor incremento disponível.' };
    if (r.action === 'reduce_load')
      return { label, estimated, text: 'Reduza um incremento disponível e recupere a faixa.' };
    if (r.action === 'increase_reps')
      return { label, estimated, text: 'Mantenha a carga e busque mais repetições dentro da faixa.' };
    return { label, estimated, text: 'Mantenha a carga e consolide a execução.' };
  }

  switch (r.action) {
    case 'increase_load':
      return {
        label,
        estimated,
        text: `${kg(r.recommendedLoadKg!)} kg · alvo ${range ?? r.targetReps} reps`,
      };
    case 'increase_reps': {
      const targets =
        r.workingSetTargets && r.workingSetTargets.length > 1
          ? r.workingSetTargets.join(' / ')
          : String(r.targetReps ?? '');
      return {
        label,
        estimated,
        text: r.currentLoadKg
          ? `Mantenha ${kg(r.currentLoadKg)} kg · alvo ${targets} reps`
          : `Alvo ${targets} reps`,
      };
    }
    case 'reduce_load':
      return {
        label,
        estimated,
        text: `Reduza para ${kg(r.recommendedLoadKg!)} kg e recupere a faixa${range ? ` de ${range}` : ''} reps.`,
      };
    case 'maintain':
    default: {
      if (r.basis === 'deload_sem_sobrecarga')
        return { label, estimated: false, text: 'Semana de recuperação — priorize execução e esforço controlado.' };
      if (!r.currentLoadKg) return { label, estimated, text: 'Mantenha a execução atual.' };
      const lowReserve = /RIR/.test(r.reasons?.[0] ?? '');
      return {
        label,
        estimated,
        text: lowReserve
          ? `Mantenha ${kg(r.currentLoadKg)} kg e consolide a faixa antes de aumentar.`
          : `Mantenha ${kg(r.currentLoadKg)} kg · consolide ${range ?? r.targetReps} reps`,
      };
    }
  }
};
