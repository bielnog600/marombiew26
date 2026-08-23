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
  relativeChangePct: number | null;
  confidence: RecommendationConfidence;
  /** true quando não há número confiável: só orientação em texto. */
  qualitative: boolean;
  basis: string;
  reasons: string[];
}

export interface QuantitativeInput {
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
  const p = input.performance;
  const increment = resolveIncrement(input);
  const repRange = p.repRange ?? null;
  const best: PerformedSet | undefined = p.bestSet;
  const bodyweight = !!best && best.weightKg <= 0;
  const currentLoad = best && best.weightKg > 0 ? round2(best.weightKg) : null;
  const currentReps = best ? best.reps : null;
  const deload = input.activePhase === 'deload';
  const reasons: string[] = [];

  // --- Sem base / exercício não quantificável --------------------------
  if (!best || p.status === 'missing' || p.status === 'insufficient_data' || p.nextAction === 'review') {
    return qualitative(
      p,
      'review',
      'sem_base_quantificavel',
      ['Sem série de trabalho válida registrada — nenhuma meta numérica é gerada.'],
      currentLoad,
      currentReps,
      repRange,
      increment,
    );
  }

  // --- Deload: nunca sobrecarga ---------------------------------------
  if (deload) {
    return {
      exerciseName: p.exerciseName,
      sourceAction: p.nextAction,
      action: 'maintain',
      currentLoadKg: currentLoad,
      recommendedLoadKg: currentLoad,
      currentReps,
      targetReps: currentReps,
      workingSetTargets: null,
      totalRepsTarget: null,
      repRange,
      incrementKg: increment.incrementKg,
      incrementSource: increment.source,
      relativeChangePct: 0,
      confidence: 'high',
      qualitative: false,
      basis: 'deload_sem_sobrecarga',
      reasons: ['Semana de deload: nenhuma progressão de carga ou repetições é recomendada.'],
    };
  }

  const complex = isComplexScheme(input);
  const working = workingSetsOf(input.recentLogs ?? []).filter((l) => setRoleOf(l) !== 'preparation');
  const workingReps = working.map((l) => Number(l.reps) || 0).filter((r) => r > 0);

  const repsTargetFrom = (reps: number): number =>
    repRange ? Math.min(reps + 1, repRange.max) : reps + 1;

  // --- Exercício sem carga externa (bodyweight) ------------------------
  if (bodyweight) {
    if (p.nextAction === 'increase_reps' || p.nextAction === 'maintain') {
      const target = p.nextAction === 'increase_reps' ? repsTargetFrom(best.reps) : best.reps;
      return {
        exerciseName: p.exerciseName,
        sourceAction: p.nextAction,
        action: p.nextAction,
        currentLoadKg: null, // nunca 0 kg como se fosse carga prescrita
        recommendedLoadKg: null,
        currentReps: best.reps,
        targetReps: target,
        workingSetTargets: workingReps.length > 1 ? workingReps.map(repsTargetFrom) : null,
        totalRepsTarget:
          workingReps.length > 0
            ? workingReps.reduce((a, b) => a + b, 0) + (p.nextAction === 'increase_reps' ? 1 : 0)
            : null,
        repRange,
        incrementKg: null,
        incrementSource: increment.source,
        relativeChangePct: null,
        confidence: 'high',
        qualitative: false,
        basis: 'bodyweight_reps',
        reasons: ['Exercício de peso corporal: progressão por repetições, sem carga externa.'],
      };
    }
    return qualitative(
      p,
      p.nextAction,
      'bodyweight_sem_carga',
      ['Exercício de peso corporal: ajuste de carga não se aplica.'],
      null,
      best.reps,
      repRange,
      increment,
    );
  }

  // --- Esquema complexo: sem falsa precisão ----------------------------
  if (complex && (p.nextAction === 'increase_load' || p.nextAction === 'increase_reps' || p.nextAction === 'reduce_load')) {
    return qualitative(
      p,
      p.nextAction,
      'esquema_complexo',
      ['Esquema de séries complexo (metas diferentes por série): recomendação apenas qualitativa.'],
      currentLoad,
      best.reps,
      repRange,
      increment,
    );
  }

  // --- INCREASE_LOAD ---------------------------------------------------
  if (p.nextAction === 'increase_load') {
    if (!currentLoad) {
      return qualitative(p, 'increase_load', 'carga_atual_desconhecida', ['Sem carga registrada na melhor série.'], null, best.reps, repRange, increment);
    }
    if (!increment.incrementKg) {
      return qualitative(
        p,
        'increase_load',
        'incremento_desconhecido',
        ['Incremento do equipamento desconhecido: aumente pelo menor incremento disponível.'],
        currentLoad,
        best.reps,
        repRange,
        increment,
      );
    }
    const candidate = round2(currentLoad + increment.incrementKg);
    const rel = round2((candidate - currentLoad) / currentLoad);
    if (rel > ABSOLUTE_LOAD_INCREASE_MAX_PCT) {
      return {
        ...qualitative(
          p,
          'manual_increment_required',
          'incremento_excessivo',
          [
            `O próximo incremento disponível (${increment.incrementKg} kg) representa ${(rel * 100).toFixed(1)}% de aumento, acima do limite de ${ABSOLUTE_LOAD_INCREASE_MAX_PCT * 100}%.`,
            'Mantenha a carga e progrida em repetições/execução, ou ajuste manualmente.',
          ],
          currentLoad,
          best.reps,
          repRange,
          increment,
        ),
        recommendedLoadKg: currentLoad,
        relativeChangePct: rel,
      };
    }
    if (rel > IDEAL_LOAD_INCREASE_MAX_PCT) {
      reasons.push(`Aumento de ${(rel * 100).toFixed(1)}% acima do ideal (${IDEAL_LOAD_INCREASE_MAX_PCT * 100}%), mas dentro do limite absoluto.`);
    }
    const target = repRange ? repRange.min : best.reps;
    reasons.push(`${currentLoad} kg → ${candidate} kg (${increment.reason}).`);
    if (repRange) reasons.push(`Após subir a carga, retomar a faixa a partir de ${repRange.min} reps.`);
    return {
      exerciseName: p.exerciseName,
      sourceAction: 'increase_load',
      action: 'increase_load',
      currentLoadKg: currentLoad,
      recommendedLoadKg: candidate,
      currentReps: best.reps,
      targetReps: target,
      workingSetTargets: null,
      totalRepsTarget: null,
      repRange,
      incrementKg: increment.incrementKg,
      incrementSource: increment.source,
      relativeChangePct: rel,
      confidence: increment.confidence,
      qualitative: false,
      basis: 'double_progression_load',
      reasons,
    };
  }

  // --- INCREASE_REPS ---------------------------------------------------
  if (p.nextAction === 'increase_reps') {
    const target = repsTargetFrom(best.reps);
    const setTargets = workingReps.length > 1 ? workingReps.map(repsTargetFrom) : null;
    return {
      exerciseName: p.exerciseName,
      sourceAction: 'increase_reps',
      action: 'increase_reps',
      currentLoadKg: currentLoad,
      recommendedLoadKg: currentLoad,
      currentReps: best.reps,
      targetReps: target,
      workingSetTargets: setTargets,
      totalRepsTarget: workingReps.length > 0 ? workingReps.reduce((a, b) => a + b, 0) + 1 : null,
      repRange,
      incrementKg: increment.incrementKg,
      incrementSource: increment.source,
      relativeChangePct: 0,
      confidence: 'high',
      qualitative: false,
      basis: 'double_progression_reps',
      reasons: [
        `Manter ${currentLoad} kg e buscar ${target} reps (progressão mínima de 1 rep, sem ultrapassar o teto prescrito).`,
      ],
    };
  }

  // --- REDUCE_LOAD -----------------------------------------------------
  if (p.nextAction === 'reduce_load') {
    if (!currentLoad || !increment.incrementKg) {
      return qualitative(
        p,
        'reduce_load',
        'incremento_desconhecido',
        ['Reduza pelo menor incremento disponível e recupere a faixa prescrita.'],
        currentLoad,
        best.reps,
        repRange,
        increment,
      );
    }
    const drop = p.e1rmDeltaPct != null && p.e1rmDeltaPct <= -STRONG_REGRESSION_PCT ? 2 : 1;
    let steps = drop;
    let candidate = round2(currentLoad - increment.incrementKg * steps);
    let rel = round2((candidate - currentLoad) / currentLoad);
    if (Math.abs(rel) > ABSOLUTE_LOAD_DECREASE_MAX_PCT && steps > 1) {
      steps = 1;
      candidate = round2(currentLoad - increment.incrementKg);
      rel = round2((candidate - currentLoad) / currentLoad);
    }
    if (candidate <= 0 || Math.abs(rel) > ABSOLUTE_LOAD_DECREASE_MAX_PCT) {
      return qualitative(
        p,
        'reduce_load',
        'reducao_excessiva',
        ['Uma redução de um incremento já ultrapassa o limite conservador: ajuste manualmente.'],
        currentLoad,
        best.reps,
        repRange,
        increment,
      );
    }
    return {
      exerciseName: p.exerciseName,
      sourceAction: 'reduce_load',
      action: 'reduce_load',
      currentLoadKg: currentLoad,
      recommendedLoadKg: candidate,
      currentReps: best.reps,
      targetReps: repRange ? repRange.min : best.reps,
      workingSetTargets: null,
      totalRepsTarget: null,
      repRange,
      incrementKg: increment.incrementKg,
      incrementSource: increment.source,
      relativeChangePct: rel,
      confidence: increment.confidence,
      qualitative: false,
      basis: 'regressao_reduz_incremento',
      reasons: [
        `Regressão relevante: reduzir ${steps} incremento(s) (${currentLoad} → ${candidate} kg) e recuperar a faixa prescrita.`,
      ],
    };
  }

  // --- MAINTAIN --------------------------------------------------------
  const consolidate = repRange && best.reps < repRange.max ? repsTargetFrom(best.reps) : best.reps;
  return {
    exerciseName: p.exerciseName,
    sourceAction: 'maintain',
    action: 'maintain',
    currentLoadKg: currentLoad,
    recommendedLoadKg: currentLoad,
    currentReps: best.reps,
    targetReps: consolidate,
    workingSetTargets: null,
    totalRepsTarget: null,
    repRange,
    incrementKg: increment.incrementKg,
    incrementSource: increment.source,
    relativeChangePct: 0,
    confidence: 'high',
    qualitative: false,
    basis: 'consolidar_carga_atual',
    reasons: [
      best.rir != null && best.rir <= 1
        ? `Reserva baixa (RIR ${best.rir}): manter ${currentLoad} kg e consolidar a execução antes de subir.`
        : `Manter ${currentLoad} kg e consolidar a faixa atual.`,
    ],
  };
};

/** Texto curto em PT-BR derivado exclusivamente dos números acima (sem IA). */
export const formatQuantitativeRecommendation = (r: QuantitativeRecommendation): string => {
  const kg = (n: number) => String(n).replace('.', ',');
  if (r.qualitative) {
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
