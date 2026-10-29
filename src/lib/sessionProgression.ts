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
  withPlannedSetTypes,
  parseRepRange,
  repRangeFromPlanned,
  type ExerciseLog,
  type NextAction,
  type RepRange,
} from './weeklyProgression';
import {
  buildQuantitativeProgressionRecommendation,
  formatQuantitativeRecommendation,
  type QuantitativeAction,
  type QuantitativeRecommendation,
  type RecommendationConfidence,
} from './quantitativeProgression';
import { normalizeExerciseKey, type IncrementSource } from './loadIncrement';
import type { TrainingPhase } from './trainingPhase';
import type { ParsedExercise } from './trainingResultParser';
import { buildSetPlan } from './setPlanBuilder';

export const buildPrescribedWorkSets = (ex: ParsedExercise) => buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme)
  .flatMap((s, i) => s.type === 'work' ? [{ setNumber: i + 1, reps: s.reps.includes('/') ? s.reps.split('/')[i]?.trim() ?? s.reps : s.reps }] : []);

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
  seriesTargets?: QuantitativeRecommendation["seriesTargets"];
  repRange: RepRange | null;
  confidence: RecommendationConfidence;
  incrementKg: number | null;
  incrementSource: IncrementSource;
  incrementConfidence: RecommendationConfidence;
  qualitative: boolean;
  bodyweight: boolean;
  basis: string;
  reasons: string[];
  /** Só havia UMA performance válida anterior (sem tendência inferida). */
  singlePerformance?: boolean;
  /** Alguma sessão usada não tinha plan_id conhecido (legado). */
  legacyFallback?: boolean;
  /** Telemetria futura: comparar recomendado x executado. Nunca vira log. */
  executedLoadKg?: number | null;
  /** Cargas do histórico ignoradas por parecerem erro de digitação (ex.: 275 em vez de 27,5). */
  ignoredOutliersKg?: number[];
}

export interface ProgressionSnapshot {
  version: number;
  generatedAt: string;
  sessionId: string | null;
  phase: TrainingPhase | null;
  /** Plano usado como contexto de comparabilidade (null = desconhecido). */
  planId?: string | null;
  recommendations: Record<string, SessionRecommendation>;
  /**
   * Chaves de exercício já avaliadas (com ou sem recomendação). Permite
   * completar o snapshot quando o treinador troca de dia, renomeia ou adiciona
   * exercício, sem recalcular o que já foi avaliado. Ausente = snapshot antigo:
   * vale `Object.keys(recommendations)`.
   */
  coveredKeys?: string[];
  /** Última vez que o snapshot foi completado. */
  updatedAt?: string;
}

/** Metadados de sessões anteriores (workout_sessions), buscados em lote. */
export interface SessionMetaRow {
  sessionId: string;
  planId?: string | null;
  phase?: string | null;
  avgRpe?: number | null;
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
  /**
   * Início do plano atual (published_at/created_at). Sessões SEM plan_id feitas
   * a partir dessa data são do plano atual (o app do aluno não grava plan_id).
   */
  currentPlanStartedAt?: string | null;
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
  /** Sessões (sessionGroupKey) legadas: sem plano e de antes do plano atual. */
  legacySessionKeys: Set<string>;
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
  currentPlanStartedAt?: string | null;
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
  const legacySessionKeys = new Set<string>();
  const planStart = input.currentPlanStartedAt ? Date.parse(input.currentPlanStartedAt) : NaN;
  let excludedDeloadSessions = 0;
  let excludedOtherPlanSessions = 0;
  let legacyFallback = false;

  groups.forEach((rows, key) => {
    const m = meta[key];
    const phase = (rows.find((r: any) => r?.phase) as any)?.phase ?? m?.phase ?? null;
    const planId = m?.planId ?? null;

    if (String(phase ?? '') === 'deload') {
      excludedDeloadSessions += 1;
      return;
    }
    // Same exercise is comparable across plans and days.
    if (currentPlanId && !planId) {
      // Sessão sem plan_id (o app do aluno não grava): se foi feita depois do
      // início do plano atual, é deste plano — não é legado.
      const quando = Math.min(...rows.map((r) => Date.parse(String(r.performed_at)) || Infinity));
      const dentroDoPlano = Number.isFinite(planStart) && Number.isFinite(quando) && quando >= planStart;
      if (!dentroDoPlano) {
        legacyFallback = true;
        legacySessionKeys.add(key);
      }
    }
    kept.push(...rows);
  });

  return { logs: kept, legacyFallback, legacySessionKeys, excludedDeloadSessions, excludedOtherPlanSessions };
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

/** Prescrição por tempo ("15s", "30 seg", "1 min"): não existe faixa de reps. */
export const isTimeBasedReps = (txt: string): boolean =>
  /\d+\s*(s|seg|segs|segundos|")(?![a-z])/i.test(txt) || /\bmin(uto)?s?\b/i.test(txt);

/**
 * Metas de reps das séries de TRABALHO (o reconhecimento nunca entra, porque
 * o histórico usado também não tem reconhecimento). "12 + 8-10" → ["8-10"];
 * setScheme com 3 séries iguais → ["8-10"] (uma meta só, não é esquema complexo).
 */
export const workRepTargetsOf = (ex: ParsedExercise): string[] => {
  const sets = (ex.setScheme?.sets ?? []) as Array<{ target_reps?: string | null; set_type?: string | null }>;
  const work = sets
    .filter((s) => String(s?.set_type ?? '') !== 'recognition')
    .map((s) => String(s?.target_reps ?? '').trim())
    .filter(Boolean);
  if (work.length > 0) return [...new Set(work)];
  const raw = String(ex.reps ?? '').trim();
  if (!raw) return [];
  if (raw.includes('+')) {
    const ultimo = raw.split('+').pop()?.trim();
    return ultimo ? [ultimo] : [];
  }
  return [raw];
};

const plannedRepsTextOf = (ex: ParsedExercise): string => workRepTargetsOf(ex).join('/');

/** Faixa de reps das séries de trabalho (null para prescrição por tempo). */
export const workRepRangeOf = (ex: ParsedExercise): RepRange | null => {
  const alvos = workRepTargetsOf(ex);
  if (alvos.length === 0 || alvos.some(isTimeBasedReps)) return null;
  return parseRepRange(alvos.join('-'));
};

/** Mediana simples. */
const median = (vals: number[]): number => {
  const v = [...vals].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Remove cargas que destoam demais do histórico do próprio exercício (erro de
 * digitação: 275 em vez de 27,5; 5 em vez de 50). Só age com 4+ séries com carga;
 * fora de [0,4× ; 2,5×] da mediana = ignorada.
 */
export const dropLoadOutliers = (logs: SessionLog[]): { logs: SessionLog[]; ignoredKg: number[] } => {
  const cargas = logs.map((l) => Number(l.weight_kg)).filter((w) => Number.isFinite(w) && w > 0);
  if (cargas.length < 4) return { logs, ignoredKg: [] };
  const m = median(cargas);
  if (!(m > 0)) return { logs, ignoredKg: [] };
  const ignored: number[] = [];
  const kept = logs.filter((l) => {
    const w = Number(l.weight_kg);
    if (!Number.isFinite(w) || w <= 0) return true;
    if (w > m * 2.5 || w < m * 0.4) {
      ignored.push(w);
      return false;
    }
    return true;
  });
  return { logs: kept, ignoredKg: [...new Set(ignored)] };
};

/**
 * Ajuste conservador quando a evidência é fraca:
 *  - apenas UMA performance válida anterior → não inferimos tendência
 *    (improved/regressed): nada de `increase_load` nem `reduce_load`;
 *  - histórico legado (sem plan_id conhecido) → confiança baixa e nunca
 *    `reduce_load` (evita regressão falsa vinda de outro contexto).
 */
const applyEvidencePolicy = (
  rec: SessionRecommendation,
  opts: { singlePerformance: boolean; legacyFallback: boolean },
): SessionRecommendation => {
  let out = { ...rec };

  if (opts.legacyFallback) {
    out.confidence = 'low';
    out.legacyFallback = true;
    out.reasons = [...out.reasons, 'historico_legado_sem_plano'];
    if (out.action === 'reduce_load') {
      out = { ...out, action: 'maintain', recommendedLoadKg: null, qualitative: true, basis: 'evidencia_legada' };
    }
  }

  if (opts.singlePerformance) {
    out.singlePerformance = true;
    out.confidence = 'low';
    out.reasons = [...out.reasons, 'apenas_uma_performance_valida'];
    if (out.action === 'reduce_load') {
      out = {
        ...out,
        action: 'maintain',
        recommendedLoadKg: null,
        qualitative: !out.currentLoadKg,
        basis: 'apenas_uma_performance_valida',
      };
    }
  }

  return out;
};

/** Motor central: recebe exercícios + histórico anterior, devolve o snapshot. */
export const buildSessionProgressionRecommendations = (
  input: BuildSessionRecommendationsInput,
): ProgressionSnapshot => {
  const comparable = filterComparableSessionHistory({
    logs: input.logs ?? [],
    currentSessionId: input.currentSessionId,
    currentPlanId: input.currentPlanId ?? null,
    sessionMeta: input.sessionMeta,
    currentPlanStartedAt: input.currentPlanStartedAt ?? null,
  });

  const byKey = new Map<string, SessionLog[]>();
  comparable.logs.forEach((l) => {
    const key = normalizeExerciseKey(l.exercise_name || '');
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(l);
  });

  const recommendations: Record<string, SessionRecommendation> = {};
  const coveredKeys = new Set<string>();

  (input.exercises ?? []).forEach((ex) => {
    const name = (ex?.exercise || '').trim();
    const key = normalizeExerciseKey(name);
    if (!key || recommendations[key] || coveredKeys.has(key)) return;
    coveredKeys.add(key);
    const { logs: history, ignoredKg } = dropLoadOutliers(byKey.get(key) ?? []);
    // Aluno sem histórico comparável: não inventamos recomendação (regra 21/22).


    const typedHistory = withPlannedSetTypes(history, ex);
    const { current, previous } = splitLastTwoSessions(typedHistory);
    // Legado POR EXERCÍCIO: só as duas sessões usadas contam.
    const legacyDoExercicio = [...current, ...previous].some((l) =>
      comparable.legacySessionKeys.has(sessionGroupKey(l)),
    );
    // Faixa das séries de TRABALHO ("12 + 8-10" → 8–10; "15s" → sem faixa).
    const repRange: RepRange | null = workRepRangeOf(ex);
    const performance = buildExercisePerformance(name, current, previous, repRange);

    const quant: QuantitativeRecommendation = buildQuantitativeProgressionRecommendation({
      performance,
      recentLogs: current,
      historyLogs: typedHistory,
      previousLogs: previous,
      prescribedSets: buildPrescribedWorkSets(ex),
      sessionAvgRpe: input.sessionMeta?.[current[0]?.session_id ?? ""]?.avgRpe ?? null,
      configuredIncrementKg: input.configuredIncrements?.[key] ?? null,
      activePhase: input.activePhase,
      setSchemeMode: ex.setScheme?.mode ?? null,
      setSchemeTargets: workRepTargetsOf(ex),
      plannedRepsText: plannedRepsTextOf(ex),
    });

    const singlePerformance = previous.length === 0;
    const bodyweight = !!performance.bestSet && performance.bestSet.weightKg <= 0;

    // Sem base quantificável: nada é exibido (evita card vazio), EXCETO quando
    // existe uma performance válida (mesmo que única) com carga conhecida — nesse
    // caso damos apenas a referência conservadora de manutenção (regra 7).
    if (quant.basis === 'sem_base_quantificavel') {
      const refLoad = performance.bestSet?.weightKg ?? null;
      // Se não houver bestSet nem carga, não há o que sugerir.
      if (!performance.bestSet) {
        recommendations[key] = { ...quant, exerciseKey: key, bodyweight: false };
        return;
      }

      recommendations[key] = applyEvidencePolicy(
        {
          exerciseKey: key,
          exerciseName: name,
          action: 'maintain',
          sourceAction: quant.sourceAction,
          currentLoadKg: refLoad,
          recommendedLoadKg: null,
          currentReps: performance.bestSet?.reps ?? null,
          targetReps: null,
          workingSetTargets: null,
          repRange,
          confidence: 'low',
          incrementKg: quant.incrementKg,
          incrementSource: quant.incrementSource,
          incrementConfidence: quant.incrementConfidence,
          qualitative: bodyweight || !refLoad,
          bodyweight,
          basis: singlePerformance ? 'apenas_uma_performance_valida' : 'sem_base_quantificavel',
          reasons: quant.reasons,
          singlePerformance,
          legacyFallback: false,
          executedLoadKg: null,
          ...(ignoredKg.length ? { ignoredOutliersKg: ignoredKg } : {}),
        },
        { singlePerformance, legacyFallback: legacyDoExercicio },
      );
      return;
    }

    const base: SessionRecommendation = {
      exerciseKey: key,
      exerciseName: name,
      action: quant.action,
      sourceAction: quant.sourceAction,
      currentLoadKg: quant.currentLoadKg,
      recommendedLoadKg: quant.recommendedLoadKg,
      currentReps: quant.currentReps,
      targetReps: quant.targetReps,
      workingSetTargets: quant.workingSetTargets,
      seriesTargets: quant.seriesTargets,
      repRange: quant.repRange,
      confidence: quant.confidence,
      incrementKg: quant.incrementKg,
      incrementSource: quant.incrementSource,
      incrementConfidence: quant.incrementConfidence,
      qualitative: quant.qualitative,
      bodyweight,
      basis: quant.basis,
      reasons: quant.reasons,
      singlePerformance: previous.length === 0,
      legacyFallback: false,
      executedLoadKg: null,
      ...(ignoredKg.length ? { ignoredOutliersKg: ignoredKg } : {}),
    };

    recommendations[key] = applyEvidencePolicy(base, {
      singlePerformance: previous.length === 0,
      legacyFallback: legacyDoExercicio,
    });
  });

  return {
    version: PROGRESSION_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    sessionId: input.currentSessionId,
    phase: input.activePhase ?? null,
    planId: input.currentPlanId ?? null,
    recommendations,
    coveredKeys: [...coveredKeys],
    updatedAt: new Date().toISOString(),
  };
};

/** Chaves já avaliadas de um snapshot (snapshots antigos: as recomendações). */
export const coveredKeysOf = (snapshot: ProgressionSnapshot | null): Set<string> =>
  new Set(snapshot ? (snapshot.coveredKeys ?? Object.keys(snapshot.recommendations ?? {})) : []);

/** Exercícios que ainda não foram avaliados no snapshot. */
export const missingExercisesFor = (snapshot: ProgressionSnapshot | null, exercises: ParsedExercise[]): ParsedExercise[] => {
  const cobertos = coveredKeysOf(snapshot);
  const vistos = new Set<string>();
  return (exercises ?? []).filter((ex) => {
    const k = normalizeExerciseKey(ex?.exercise || '');
    if (!k || cobertos.has(k) || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
};

/** Completa um snapshot com as recomendações de exercícios novos (nunca sobrescreve as antigas). */
export const mergeProgressionSnapshots = (
  base: ProgressionSnapshot,
  extra: ProgressionSnapshot,
): ProgressionSnapshot => ({
  ...base,
  recommendations: { ...extra.recommendations, ...base.recommendations },
  coveredKeys: [...new Set([...coveredKeysOf(base), ...coveredKeysOf(extra)])],
  updatedAt: new Date().toISOString(),
});

/** Lê um snapshot já persistido no session_state (tolerante a formatos antigos e Duo). */
export const readProgressionSnapshot = (stateOrSnapshot: any): ProgressionSnapshot | null => {
  if (!stateOrSnapshot || typeof stateOrSnapshot !== 'object') return null;

  // Regra 2: readProgressionSnapshotValue logic — tolerante a ProgressionSnapshot direto ou session_state

  // 1. Caso: objeto é o próprio snapshot (Duo ou retorno direto)
  if (stateOrSnapshot.recommendations && typeof stateOrSnapshot.recommendations === 'object') {
    const v = Number(stateOrSnapshot.version);
    if (v === PROGRESSION_SNAPSHOT_VERSION) {
      return stateOrSnapshot as ProgressionSnapshot;
    }
  }

  // 2. Caso: objeto é o session_state inteiro (Individual)
  const snap = stateOrSnapshot.progressionRecommendations;
  if (snap && typeof snap === 'object' && snap.recommendations && typeof snap.recommendations === 'object') {
    const v = Number(snap.version);
    if (v === PROGRESSION_SNAPSHOT_VERSION) {
      return snap as ProgressionSnapshot;
    }
  }

  return null;
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
  /** Observação curta (incremento padrão usado, carga do histórico ignorada). */
  note?: string;
}

/** Texto curto da sugestão. Retorna null quando não há nada útil a mostrar. */
export const formatSessionHint = (r: SessionRecommendation | null): SessionHint | null => {
  const hint = formatSessionHintBase(r);
  if (!hint || !r) return hint;
  const notas: string[] = [];
  if (r.ignoredOutliersKg && r.ignoredOutliersKg.length > 0) {
    notas.push(`Ignorei ${r.ignoredOutliersKg.map((v) => `${kg(v)} kg`).join(', ')} do histórico (parece erro de digitação).`);
  }
  return notas.length ? { ...hint, note: notas.join(' ') } : hint;
};

const formatSessionHintBase = (r: SessionRecommendation | null): SessionHint | null => {
  if (!r) return null;
  const estimated = r.incrementSource === 'inferred_history';
  const label = SESSION_ACTION_LABEL[r.action] ?? 'Sugestão';
  const range = r.repRange ? `${r.repRange.min}–${r.repRange.max}` : null;

  if (r.action === 'review') return { label: 'Sugestão', estimated: false, text: `Escolha uma carga para fazer ${range ?? 'as'} reps com 2 de reserva.` };
  if (r.seriesTargets?.length) return { label, estimated, text: formatQuantitativeRecommendation(r as QuantitativeRecommendation) };

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

/**
 * Carga alvo definida pelo professor (campo `targetLoadKg` do plano).
 * Quando existe, tem prioridade sobre a recomendação automática.
 * Função pura: não consulta histórico nem altera o motor de progressão.
 */
export type TargetLoadPerSet = Array<{ set_number: number; load_kg: number }>;

/** Normaliza/ordena a carga alvo por série, descartando entradas inválidas. */
export const normalizeTargetLoadPerSet = (raw: unknown): TargetLoadPerSet | null => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: TargetLoadPerSet = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const load = Number(o.load_kg);
    if (!Number.isFinite(load) || load <= 0) return;
    const n = Number(o.set_number);
    out.push({ set_number: Number.isFinite(n) && n > 0 ? Math.trunc(n) : i + 1, load_kg: load });
  });
  if (out.length === 0) return null;
  return out.sort((a, b) => a.set_number - b.set_number);
};

/** "1° set: 40 kg - 2° set: 65 kg - 3° set: 65 kg" — uma linha, sem agrupar. */
export const formatTargetLoadPerSetText = (raw: unknown): string | null => {
  const sets = normalizeTargetLoadPerSet(raw);
  if (!sets) return null;
  return sets.map((s) => `${s.set_number}° set: ${kg(s.load_kg)} kg`).join(' - ');
};

/** Carga alvo da série `setNumber` (1-based), quando definida. */
export const targetLoadForSet = (raw: unknown, setNumber: number): number | null => {
  const sets = normalizeTargetLoadPerSet(raw);
  if (!sets) return null;
  return sets.find((s) => s.set_number === setNumber)?.load_kg ?? null;
};

export const formatTargetLoadHint = (
  targetLoadKg: number | null | undefined,
  targetLoadNote?: string | null,
  targetLoadPerSet?: unknown,
): SessionHint | null => {
  const note = targetLoadNote && String(targetLoadNote).trim() ? String(targetLoadNote).trim() : null;
  const perSetText = formatTargetLoadPerSetText(targetLoadPerSet);
  if (perSetText) {
    return { label: 'Carga alvo', estimated: false, text: perSetText };
  }
  if (typeof targetLoadKg !== 'number' || !Number.isFinite(targetLoadKg) || targetLoadKg <= 0) return null;
  return {
    label: 'Carga alvo',
    estimated: false,
    text: `${kg(targetLoadKg)} kg · ${note ?? 'definido pelo professor'}`,
  };
};
