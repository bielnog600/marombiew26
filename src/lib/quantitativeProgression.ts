/**
 * MOTOR DE RECOMENDAÇÃO QUANTITATIVA (camada separada e PURA)
 * ===========================================================
 *
 * Transforma a `nextAction` já decidida por weeklyProgression.ts em uma
 * recomendação com números (carga alvo / repetições alvo) — SEM alterar
 * nada: não decide status, não muda thresholds, não escreve no plano,
 * no exercício, nas sessões ou nos logs.
 *
 * O que JÁ existia no banco (auditado antes de escrever este arquivo):
 *   - exercises.equipment_type (texto livre, hoje 100% NULL);
 *   - exercises.requires_load_logging (booleano);
 *   - exercises.ajustes (text[]) e student_exercise_adjustments.valores (jsonb)
 *     — ajustes de execução do aluno, não incrementos de carga;
 *   - exercise_set_logs.weight_kg / reps / rir / set_type (histórico real).
 *   NÃO existe nenhuma coluna de incremento (load_increment, plates,
 *   dumbbell_step, machine_stack_step, load_unit...). Nenhuma migration foi
 *   criada nesta etapa: o incremento vem de configuração externa (quando
 *   fornecida) ou é inferido do histórico com confiança menor.
 *
 * HIERARQUIA DE CONFIANÇA DO INCREMENTO:
 *   high   → incremento configurado explicitamente (passado no input);
 *   medium → incremento inferido de histórico consistente de working/top sets;
 *   low    → desconhecido: só orientação qualitativa (nunca kg inventado).
 */

import type {
  ExerciseLog,
  ExercisePerformance,
  NextAction,
  PerformedSet,
  RepRange,
} from './weeklyProgression';
import { setRoleOf } from './weeklyProgression';
import { computeSeriesProgression, type SeriesLoadTarget } from './seriesProgression';
import type { TrainingPhase } from './trainingPhase';
import {
  inferIncrementFromTransitions,
  resolveLoadIncrement,
  MAX_INFERRED_INCREMENT_KG as MAX_INFERRED_KG,
  MIN_INCREMENT_KG,
  MIN_TRANSITIONS_FOR_INFERENCE,
  type IncrementSource,
  type ResolvedIncrement,
} from './loadIncrement';

// ------------------------------------------------------------------
// Limites conservadores centralizados
// ------------------------------------------------------------------

/** Aumento relativo considerado ideal para progressão de carga. */
export const IDEAL_LOAD_INCREASE_MAX_PCT = 0.05;
/** Acima disso NUNCA recomendamos aumento automático. */
export const ABSOLUTE_LOAD_INCREASE_MAX_PCT = 0.10;
/** Redução máxima recomendada automaticamente em reduce_load. */
export const ABSOLUTE_LOAD_DECREASE_MAX_PCT = 0.10;
/** Regressão de e1RM a partir da qual aceitamos reduzir mais de um incremento. */
export const STRONG_REGRESSION_PCT = 0.15;
/** Incrementos plausíveis para inferência a partir do histórico (kg). */
export const MIN_INFERRED_INCREMENT_KG = MIN_INCREMENT_KG;
export const MAX_INFERRED_INCREMENT_KG = MAX_INFERRED_KG;
/** Mínimo de transições reais de carga para inferir um incremento. */
export const MIN_HISTORY_LOADS_FOR_INFERENCE = MIN_TRANSITIONS_FOR_INFERENCE;

export type RecommendationConfidence = 'high' | 'medium' | 'low';

export type { IncrementSource };

export type QuantitativeAction =
  | NextAction
  | 'manual_increment_required';

export interface EquipmentIncrement {
  incrementKg: number | null;
  source: IncrementSource;
  confidence: RecommendationConfidence;
  reason: string;
  evidence?: ResolvedIncrement['evidence'];
}


export interface QuantitativeRecommendation {
  seriesTargets?: SeriesLoadTarget[];
  exerciseName: string;
  /** Ação de origem (weeklyProgression) — nunca contrariada. */
  sourceAction: NextAction;
  /** Ação quantificada (pode virar manual_increment_required). */
  action: QuantitativeAction;
  currentLoadKg: number | null;
  recommendedLoadKg: number | null;
  currentReps: number | null;
  targetReps: number | null;
  /** Alvo por série de trabalho quando há várias séries (conservador). */
  workingSetTargets: number[] | null;
  /** Meta de reps totais nas séries de trabalho (estratégia conservadora). */
  totalRepsTarget: number | null;
  repRange: RepRange | null;
  incrementKg: number | null;
  incrementSource: IncrementSource;
  /** Confiança NA FONTE do incremento (independe da segurança do salto). */
  incrementConfidence: RecommendationConfidence;
  relativeChangePct: number | null;
  confidence: RecommendationConfidence;
  /** true quando não há número confiável: só orientação em texto. */
  qualitative: boolean;
  basis: string;
  reasons: string[];
}

export interface QuantitativeInput {
  previousLogs?: ExerciseLog[];
  prescribedSets?: Array<{ setNumber: number; reps: string }>;
  sessionAvgRpe?: number | null;
  now?: Date;
  performance: ExercisePerformance;
  /** Séries recentes do exercício (janela atual) — cru de exercise_set_logs. */
  recentLogs?: ExerciseLog[];
  /** Histórico mais longo do exercício, para inferir incremento. */
  historyLogs?: ExerciseLog[];
  /** Incremento configurado (equipamento/exercício), quando existir. */
  configuredIncrementKg?: number | null;
  /** Fase ativa — no deload nunca há aumento. */
  activePhase?: TrainingPhase | null;
  /** Esquema de séries do plano (texto/estrutura), para detectar complexidade. */
  setSchemeMode?: string | null;
  setSchemeTargets?: string[] | null;
  plannedRepsText?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Séries de trabalho reais (primary + auxiliary; warmup/recognition fora). */
export const workingSetsOf = (logs: ExerciseLog[] = []): ExerciseLog[] =>
  logs.filter(
    (l) => setRoleOf(l) !== 'preparation' && ((l.reps ?? 0) > 0 || (l.weight_kg ?? 0) > 0),
  );

const toEquipmentIncrement = (r: ResolvedIncrement): EquipmentIncrement => ({
  incrementKg: r.incrementKg,
  source: r.source,
  confidence: r.confidence,
  reason: r.evidence.reason,
  evidence: r.evidence,
});

/**
 * Inferência de incremento a partir do histórico — delegada a
 * `loadIncrement.inferIncrementFromTransitions`, que olha para TRANSIÇÕES
 * reais de carga (não para a divisibilidade das cargas absolutas).
 */
export const inferIncrementFromHistory = (logs: ExerciseLog[] = []): EquipmentIncrement =>
  toEquipmentIncrement(inferIncrementFromTransitions(logs));

/** Hierarquia: configurado (high) > histórico (medium) > desconhecido (low). */
export const resolveIncrement = (input: QuantitativeInput): EquipmentIncrement =>
  toEquipmentIncrement(
    resolveLoadIncrement({
      configuredIncrementKg: input.configuredIncrementKg ?? null,
      historicalWorkingSets: [...(input.historyLogs ?? []), ...(input.recentLogs ?? [])],
    }),
  );


/**
 * Esquemas suportados com alta confiança: faixa simples ("8-12") ou alvo
 * único ("10"). Esquemas por série diferentes (12/10/8), "10 + 8-10",
 * top set + backoff etc. viram recomendação qualitativa.
 */
export const isComplexScheme = (input: QuantitativeInput): boolean => {
  const targets = (input.setSchemeTargets ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (targets.length > 1 && new Set(targets).size > 1) return true;
  if (input.setSchemeMode === 'per_set' && new Set(targets).size > 1) return true;
  const txt = String(input.plannedRepsText ?? '');
  if (/[+]/.test(txt)) return true;
  if ((txt.match(/\//g) ?? []).length > 0) return true;
  return false;
};

const qualitative = (
  p: ExercisePerformance,
  action: QuantitativeAction,
  basis: string,
  reasons: string[],
  currentLoad: number | null,
  currentReps: number | null,
  repRange: RepRange | null,
  increment: EquipmentIncrement,
): QuantitativeRecommendation => ({
  exerciseName: p.exerciseName,
  sourceAction: p.nextAction,
  action,
  currentLoadKg: currentLoad,
  recommendedLoadKg: null,
  currentReps,
  targetReps: null,
  workingSetTargets: null,
  totalRepsTarget: null,
  repRange,
  incrementKg: increment.incrementKg,
  incrementSource: increment.source,
  incrementConfidence: increment.confidence,
  relativeChangePct: null,
  confidence: 'low',
  qualitative: true,
  basis,
  reasons,
});

/**
 * Motor principal. Função PURA: não escreve em nenhuma tabela nem muta os
 * objetos recebidos.
 */
export const buildQuantitativeProgressionRecommendation = (
  input: QuantitativeInput,
): QuantitativeRecommendation => {
  return computeSeriesProgression(input);
};

export const formatQuantitativeRecommendation = (r: QuantitativeRecommendation): string => {
  const kg = (n: number) => String(n).replace('.', ',');
  if (r.seriesTargets?.length) {
    const targets = r.seriesTargets;
    const same = targets.every(s => s.recommendedLoadKg === targets[0].recommendedLoadKg && s.targetReps === targets[0].targetReps && s.action === targets[0].action);
    const describe = (s: SeriesLoadTarget) => s.recommendedLoadKg == null
      ? `Busca ${s.targetReps} reps`
      : `${s.action === 'increase_load' ? 'Sobe para' : s.action === 'reduce_load' ? 'Reduz para' : 'Mantém'} ${kg(s.recommendedLoadKg)} kg e ${s.action === 'increase_load' ? 'busca' : 'tenta'} ${s.targetReps} reps${s.action === 'increase_load' ? ' limpas' : ''}`;
    return same ? `${describe(targets[0])} no ${r.exerciseName}.` : targets.map(s => `Série ${s.setNumber}: ${describe(s)}`).join(' · ');
  }
  if (r.qualitative) {
    if (r.basis === 'sem_base_quantificavel') return `Escolha uma carga para fazer ${r.repRange ? `${r.repRange.min}–${r.repRange.max}` : 'as'} reps com 2 de reserva.`;
    if (r.action === 'increase_load') return 'Atingiu o topo da faixa. Aumente pelo menor incremento disponível.';
    if (r.action === 'manual_increment_required')
      return 'O próximo incremento disponível é grande demais: mantenha a carga e progrida em repetições.';
    if (r.action === 'reduce_load') return 'Reduza pelo menor incremento disponível e recupere a faixa prescrita.';
    if (r.action === 'increase_reps') return 'Mantenha a carga e busque mais repetições dentro da faixa prescrita.';
    return 'Sem base confiável — registre carga e repetições na próxima sessão.';
  }
  switch (r.action) {
    case 'increase_load':
      return `Passe de ${kg(r.currentLoadKg!)} para ${kg(r.recommendedLoadKg!)} kg e trabalhe novamente dentro de ${r.repRange ? `${r.repRange.min}–${r.repRange.max}` : 'a faixa'} reps.`;
    case 'increase_reps':
      return r.currentLoadKg
        ? `Mantenha ${kg(r.currentLoadKg)} kg e tente ${r.targetReps} reps.`
        : `Tente ${r.targetReps} reps (peso corporal).`;
    case 'reduce_load':
      return `Reduza de ${kg(r.currentLoadKg!)} para ${kg(r.recommendedLoadKg!)} kg e recupere a faixa prescrita.`;
    case 'maintain':
      return r.currentLoadKg
        ? `Mantenha ${kg(r.currentLoadKg)} kg e busque ${r.targetReps} reps com melhor reserva.`
        : `Mantenha a execução atual e busque ${r.targetReps} reps.`;
    default:
      return 'Registre a execução completa para permitir avaliação na próxima semana.';
  }
};
