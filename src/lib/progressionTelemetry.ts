import { PROGRESSION_SNAPSHOT_VERSION, type ProgressionSnapshot, type SessionRecommendation } from './sessionProgression';
import { normalizeExerciseKey } from './loadIncrement';

export type TelemetryAlignmentStatus =
  | 'matched'
  | 'partial'
  | 'different'
  | 'no_execution'
  | 'not_evaluable';

export type TelemetryTargetStatus =
  | 'achieved'
  | 'partially_achieved'
  | 'not_achieved'
  | 'not_evaluable';

export const LOAD_FLOAT_TOLERANCE_KG = 0.05;

/** Regra 15: Helper para comparar cargas com tolerância explícita */
export const sameLoad = (a: number | null | undefined, b: number | null | undefined): boolean => {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= LOAD_FLOAT_TOLERANCE_KG;
};

export interface ProgressionExecutionOutcome {
  sessionId: string;
  studentId: string;
  exerciseKey: string;
  exerciseName: string;
  recommendationAction: string | null;
  currentLoadKg: number | null; // Regra 17
  recommendedLoadKg: number | null;
  recommendedTargetReps: number | null;
  recommendedWorkingSetTargets: number[] | null;
  recommendedRepRange: { min: number; max: number } | null;
  recommendationConfidence: string | null;
  incrementSource: string | null;
  
  executedPrimaryLoadKg: number | null;
  executedReps: Array<number | null>; // Regra 9: Preservar nulls
  executedWorkingSetCount: number;
  executedWorkingSets: Array<{
    setNumber: number;
    weightKg: number | null;
    reps: number | null;
    rir: number | null;
    setType: string | null;
    alignmentStatus?: TelemetryAlignmentStatus; // Regra 14: Auditoria por série
  }>;
  mixedWorkingLoads: boolean;
  
  alignmentStatus: TelemetryAlignmentStatus;
  targetStatus: TelemetryTargetStatus;
  comparisonConfidence: 'high' | 'low';
  reasons: string[];

  // Metadados adicionais para auditoria
  source?: string;
  executedBy?: string;
  phase?: string | null;
}

export interface TelemetryLog {
  student_id: string;
  session_id: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rir?: number | null;
  set_type?: string | null;
}

export interface TelemetrySessionInput {
  snapshot: ProgressionSnapshot | null;
  logs: TelemetryLog[];
  studentId: string;
  sessionId: string;
  source?: string;
  executedBy?: string;
}

/**
 * Motor de Telemetria (V1 Hardened & Fixed)
 */
export function buildProgressionExecutionOutcomes(input: TelemetrySessionInput): ProgressionExecutionOutcome[] {
  const { snapshot, logs, studentId, sessionId, source, executedBy } = input;
  const outcomes: ProgressionExecutionOutcome[] = [];
  
  // Regra 6 & 7: Validação de Snapshot Version e Session ID
  if (snapshot) {
    if (snapshot.version !== PROGRESSION_SNAPSHOT_VERSION) {
      // invalid_snapshot_version - não retorna resultados comparáveis
      return [];
    }
    if (snapshot.sessionId != null && snapshot.sessionId !== sessionId) {
      // snapshot_session_mismatch - não retorna resultados comparáveis
      return [];
    }
  }
  
  // Agrupar logs por exercício
  const logsByEx = new Map<string, TelemetryLog[]>();
  logs.forEach(log => {
    if (log.student_id !== studentId || log.session_id !== sessionId) return;
    const key = normalizeExerciseKey(log.exercise_name);
    if (!key) return;
    if (!logsByEx.has(key)) logsByEx.set(key, []);
    logsByEx.get(key)!.push(log);
  });

  const exerciseKeys = new Set<string>();
  logsByEx.forEach((_, k) => exerciseKeys.add(k));
  if (snapshot?.recommendations) {
    Object.keys(snapshot.recommendations).forEach(k => exerciseKeys.add(k));
  }

  exerciseKeys.forEach(key => {
    const exLogs = logsByEx.get(key) || [];
    const rec = snapshot?.recommendations?.[key] || null;
    
    // Regra 11: Ordenar séries por set_number ASC antes de qualquer lógica
    const sortedLogs = [...exLogs].sort((a, b) => a.set_number - b.set_number);
    
    // Filtro de séries principais (work/top)
    const primaryLogs = sortedLogs.filter(l => !l.set_type || ['work', 'top'].includes(l.set_type));
    const hasLegacyLogs = primaryLogs.some(l => !l.set_type);
    
    // Regra 9: Preservar null em reps
    const executedReps = primaryLogs.map(l => l.reps ?? null);
    const loads = primaryLogs.map(l => l.weight_kg ?? 0).filter(w => w > 0);
    
    // Regra 15: Mixed loads baseadas em sameLoad
    let mixedWorkingLoads = false;
    if (loads.length > 1) {
      const firstLoad = loads[0];
      mixedWorkingLoads = loads.some(L => !sameLoad(L, firstLoad));
    }
    
    const outcome: ProgressionExecutionOutcome = {
      sessionId,
      studentId,
      exerciseKey: key,
      exerciseName: rec?.exerciseName || sortedLogs[0]?.exercise_name || 'Exercício',
      recommendationAction: rec?.action || null,
      currentLoadKg: rec?.currentLoadKg ?? null,
      recommendedLoadKg: rec?.recommendedLoadKg ?? null,
      recommendedTargetReps: rec?.targetReps || null,
      recommendedWorkingSetTargets: rec?.workingSetTargets || null,
      recommendedRepRange: rec?.repRange || null,
      recommendationConfidence: rec?.confidence || null,
      incrementSource: rec?.incrementSource || null,
      
      executedPrimaryLoadKg: loads.length > 0 ? Math.max(...loads) : null,
      executedReps,
      executedWorkingSetCount: primaryLogs.length,
      executedWorkingSets: [],
      mixedWorkingLoads,
      
      alignmentStatus: 'not_evaluable',
      targetStatus: 'not_evaluable',
      comparisonConfidence: hasLegacyLogs ? 'low' : 'high',
      reasons: [],
      source,
      executedBy,
      phase: snapshot?.phase ?? null
    };

    // Auditoria detalhada das séries
    outcome.executedWorkingSets = primaryLogs.map(l => ({
      setNumber: l.set_number,
      weightKg: l.weight_kg,
      reps: l.reps,
      rir: l.rir ?? null,
      setType: l.set_type ?? null
    }));

    const isDeload = snapshot?.phase === 'deload' || rec?.basis === 'deload_sem_sobrecarga';
    if (isDeload) {
      outcome.alignmentStatus = 'not_evaluable';
      outcome.targetStatus = 'not_evaluable';
      outcome.reasons.push('deload_excluded_from_progression_kpi');
      outcomes.push(outcome);
      return;
    }

    if (!rec) {
      outcome.alignmentStatus = 'not_evaluable';
      outcome.reasons.push('sem_recomendacao_no_inicio');
    } else if (primaryLogs.length === 0) {
      outcome.alignmentStatus = 'no_execution';
      outcome.targetStatus = 'not_evaluable';
    } else {
      // Avaliar Alinhamento de Carga (Regra 14)
      evaluateAlignmentMultiSet(outcome, rec);

      // Avaliar Alvo de Repetições (Regra 12)
      evaluateTargetMultiSet(outcome, rec, primaryLogs);
    }

    outcomes.push(outcome);
  });

  return outcomes;
}

function evaluateAlignmentMultiSet(outcome: ProgressionExecutionOutcome, rec: SessionRecommendation) {
  const currentLoad = rec.currentLoadKg ?? 0;
  const recommendedLoad = rec.recommendedLoadKg;
  const sets = outcome.executedWorkingSets;

  if (rec.bodyweight) {
    outcome.alignmentStatus = 'matched';
    return;
  }

  // Classificar cada série individualmente
  const setStatuses: TelemetryAlignmentStatus[] = sets.map(s => {
    const execLoad = s.weightKg ?? 0;
    
    // Regra 8: Manual Increment Required
    if (rec.action === 'manual_increment_required') {
      if (execLoad <= 0) return 'not_evaluable';
      return sameLoad(execLoad, currentLoad) ? 'matched' : 'different';
    }

    // Regra 6 & 18: Qualitativos
    if (rec.action === 'increase_load' && recommendedLoad === null) {
      if (execLoad <= 0) return 'not_evaluable';
      if (execLoad > currentLoad + LOAD_FLOAT_TOLERANCE_KG) return 'matched';
      return sameLoad(execLoad, currentLoad) ? 'different' : 'different';
    }
    if (rec.action === 'reduce_load' && recommendedLoad === null) {
      if (execLoad <= 0) return 'not_evaluable';
      if (execLoad < currentLoad - LOAD_FLOAT_TOLERANCE_KG) return 'matched';
      return sameLoad(execLoad, currentLoad) ? 'different' : 'different';
    }

    // Quantitativo
    if (recommendedLoad !== null) {
      if (sameLoad(execLoad, recommendedLoad)) return 'matched';
      if (execLoad > recommendedLoad) return 'different'; // Acima é different (não matched)
      if (rec.action === 'increase_load' && execLoad >= currentLoad && execLoad < recommendedLoad) return 'partial';
      return 'different';
    }

    // Maintain / Increase Reps
    if (sameLoad(execLoad, currentLoad)) return 'matched';
    return 'different';
  });

  // Salvar status por série para auditoria
  sets.forEach((s, i) => s.alignmentStatus = setStatuses[i]);

  // Regra 14: Agregação da política
  const hasDifferent = setStatuses.includes('different');
  const hasPartial = setStatuses.includes('partial');
  const hasMatched = setStatuses.includes('matched');
  
  if (hasDifferent) {
    outcome.alignmentStatus = 'different';
    // Adicionar motivos específicos se for qualitativo
    if (rec.action === 'increase_load' && recommendedLoad === null) {
      if (sets.some(s => sameLoad(s.weightKg, currentLoad))) outcome.reasons.push('qualitative_load_not_increased');
      if (sets.some(s => (s.weightKg ?? 0) < currentLoad - LOAD_FLOAT_TOLERANCE_KG)) outcome.reasons.push('load_reduced_instead_of_increased');
    }
    if (rec.action === 'reduce_load' && recommendedLoad === null) {
      if (sets.some(s => sameLoad(s.weightKg, currentLoad))) outcome.reasons.push('qualitative_load_not_reduced');
    }
    if (rec.action === 'manual_increment_required' && sets.some(s => (s.weightKg ?? 0) > currentLoad)) {
      outcome.reasons.push('used_rejected_large_increment');
    }
  } else if (hasMatched && !hasPartial) {
    outcome.alignmentStatus = 'matched';
    if (rec.action === 'increase_load' && recommendedLoad === null) {
      outcome.comparisonConfidence = 'low';
      outcome.reasons.push('qualitative_load_increase_followed');
    }
    if (rec.action === 'reduce_load' && recommendedLoad === null) {
      outcome.comparisonConfidence = 'low';
      outcome.reasons.push('qualitative_load_reduction_followed');
    }
  } else if (hasPartial || (hasMatched && hasPartial)) {
    outcome.alignmentStatus = 'partial';
    outcome.reasons.push('load_increased_less_than_recommended');
  } else {
    outcome.alignmentStatus = 'different';
  }
}

function evaluateTargetMultiSet(outcome: ProgressionExecutionOutcome, rec: SessionRecommendation, primaryLogs: TelemetryLog[]) {
  const targets = rec.workingSetTargets && rec.workingSetTargets.length > 0 ? rec.workingSetTargets : null;
  const singleTarget = rec.targetReps || rec.repRange?.min || 0;

  // Regra 10: Se há reps null, não podemos avaliar target com precisão
  if (primaryLogs.some(l => l.reps === null)) {
    outcome.targetStatus = 'not_evaluable';
    outcome.reasons.push('missing_reps_for_target_evaluation');
    return;
  }

  const execCount = primaryLogs.length;
  
  if (targets) {
    const targetCount = targets.length;
    let achievedCount = 0;
    
    primaryLogs.forEach((log, i) => {
      const t = targets[i] ?? targets[targets.length - 1];
      if ((log.reps || 0) >= t) achievedCount++;
    });

    // Regra 12: fewer_working_sets_than_target
    if (achievedCount === execCount && execCount < targetCount) {
      outcome.targetStatus = 'partially_achieved';
      outcome.reasons.push('fewer_working_sets_than_target');
    } else if (achievedCount === execCount && execCount >= targetCount) {
      outcome.targetStatus = 'achieved';
    } else if (achievedCount > 0) {
      outcome.targetStatus = 'partially_achieved';
    } else {
      outcome.targetStatus = 'not_achieved';
    }
  } else if (singleTarget > 0) {
    const achievedAll = primaryLogs.every(l => (l.reps || 0) >= singleTarget);
    const achievedSome = primaryLogs.some(l => (l.reps || 0) >= singleTarget);
    
    if (achievedAll) {
      outcome.targetStatus = 'achieved';
    } else if (achievedSome) {
      outcome.targetStatus = 'partially_achieved';
    } else {
      outcome.targetStatus = 'not_achieved';
    }
  }
}
