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

export type TelemetrySessionStatus =
  | 'available'
  | 'without_snapshot'
  | 'empty_snapshot'
  | 'invalid_snapshot_version'
  | 'snapshot_session_mismatch';

export interface SessionTelemetryResult {
  status: TelemetrySessionStatus;
  outcomes: ProgressionExecutionOutcome[];
}

export interface TelemetrySummary {
  sessionsWithSnapshot: number;
  sessionsWithoutSnapshot: number;
  sessionsWithoutRecommendation: number;
  invalidSnapshotSessions: number;

  recommendationsShown: number;
  evaluableRecommendations: number;
  recommendationsWithExecution: number;

  matchedCount: number;
  partialCount: number;
  differentCount: number;
  noExecutionCount: number;

  alignmentRate: number;
  fullOrPartialAlignmentRate: number;
  executionCoverage: number;

  targetsEvaluable: number;
  targetAchievedCount: number;
  targetPartialCount: number;
  targetNotAchievedCount: number;

  targetAchievementRate: number;
  targetAtLeastPartialRate: number;

  deloadExcludedCount: number;
}

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
 * Avalia a sessão inteira e retorna o status estruturado (Regra 10).
 */
export function buildProgressionSessionTelemetry(input: TelemetrySessionInput): SessionTelemetryResult {
  const { snapshot, sessionId } = input;
  
  if (!snapshot) {
    return { status: 'without_snapshot', outcomes: [] };
  }
  
  if (snapshot.version !== PROGRESSION_SNAPSHOT_VERSION) {
    return { status: 'invalid_snapshot_version', outcomes: [] };
  }
  
  if (snapshot.sessionId != null && snapshot.sessionId !== sessionId) {
    return { status: 'snapshot_session_mismatch', outcomes: [] };
  }
  
  const outcomes = buildProgressionExecutionOutcomes(input);
  
  if (outcomes.length === 0) {
    return { status: 'empty_snapshot', outcomes: [] };
  }
  
  return { status: 'available', outcomes };
}

/**
 * Motor de Telemetria (V1 Hardened & Fixed)
 */
export function buildProgressionExecutionOutcomes(input: TelemetrySessionInput): ProgressionExecutionOutcome[] {
  const { snapshot, logs, studentId, sessionId, source, executedBy } = input;
  const outcomes: ProgressionExecutionOutcome[] = [];
  
  if (!snapshot) return [];
  
  // Regra 6 & 7: Validação de Snapshot Version e Session ID (mantida por compatibilidade no motor interno)
  if (snapshot.version !== PROGRESSION_SNAPSHOT_VERSION || (snapshot.sessionId != null && snapshot.sessionId !== sessionId)) {
    return [];
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
  const currentLoad = rec.currentLoadKg; // Pode ser null
  const recommendedLoad = rec.recommendedLoadKg;
  const sets = outcome.executedWorkingSets;

  if (rec.bodyweight) {
    outcome.alignmentStatus = 'matched';
    return;
  }

  // Regra 19: currentLoad DESCONHECIDO para ações que dependem de baseline
  const actionsRequiringBaseline = [
    'maintain', 'increase_reps', 'increase_load', 'reduce_load', 'manual_increment_required'
  ];
  
  // Classificar cada série individualmente
  const setStatuses: TelemetryAlignmentStatus[] = sets.map(s => {
    const execLoad = s.weightKg;
    
    // Regra 16: Carga ausente na execução não é "different"
    if (execLoad == null) {
      outcome.reasons.push('missing_load_for_alignment');
      return 'not_evaluable';
    }

    // Regra 17: currentLoad desconhecido
    if (currentLoad == null && recommendedLoad == null && actionsRequiringBaseline.includes(rec.action || '')) {
      outcome.reasons.push('missing_current_load');
      return 'not_evaluable';
    }

    const safeCurrent = currentLoad ?? 0;
    
    // Regra 8: Manual Increment Required
    if (rec.action === 'manual_increment_required') {
      return sameLoad(execLoad, safeCurrent) ? 'matched' : 'different';
    }

    // Regra 6 & 18: Qualitativos
    if (rec.action === 'increase_load' && recommendedLoad === null) {
      if (execLoad > safeCurrent + LOAD_FLOAT_TOLERANCE_KG) return 'matched';
      // Regra 4 & 5: Mesmo valor ou dentro da tolerância não é aumento
      return 'different';
    }
    if (rec.action === 'reduce_load' && recommendedLoad === null) {
      if (execLoad < safeCurrent - LOAD_FLOAT_TOLERANCE_KG) return 'matched';
      return 'different';
    }

    // Quantitativo
    if (recommendedLoad !== null) {
      if (sameLoad(execLoad, recommendedLoad)) return 'matched';
      if (execLoad > recommendedLoad + LOAD_FLOAT_TOLERANCE_KG) return 'different';
      
      // Regra 4: Partial exige aumento real acima de currentLoad
      if (rec.action === 'increase_load') {
         if (execLoad > safeCurrent + LOAD_FLOAT_TOLERANCE_KG && execLoad < recommendedLoad) return 'partial';
      }
      return 'different';
    }

    // Maintain / Increase Reps
    if (sameLoad(execLoad, safeCurrent)) return 'matched';
    return 'different';
  });

  // Salvar status por série para auditoria
  sets.forEach((s, i) => s.alignmentStatus = setStatuses[i]);

  // Regra 18: Agregação da política
  const hasDifferent = setStatuses.includes('different');
  const hasPartial = setStatuses.includes('partial');
  const hasMatched = setStatuses.includes('matched');
  const hasNotEvaluable = setStatuses.includes('not_evaluable');
  const allNotEvaluable = setStatuses.every(s => s === 'not_evaluable');
  
  if (hasDifferent) {
    outcome.alignmentStatus = 'different';
    if (rec.action === 'increase_load' && recommendedLoad === null) {
      if (sets.some(s => sameLoad(s.weightKg, currentLoad))) outcome.reasons.push('qualitative_load_not_increased');
    }
  } else if (hasPartial) {
    outcome.alignmentStatus = 'partial';
    outcome.reasons.push('load_increased_less_than_recommended');
  } else if (hasMatched) {
    outcome.alignmentStatus = 'matched';
    if (hasNotEvaluable) {
      outcome.comparisonConfidence = 'low';
      outcome.reasons.push('incomplete_load_evidence');
    }
  } else if (allNotEvaluable) {
    outcome.alignmentStatus = 'not_evaluable';
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
