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
  sessionId: string;
  studentId: string;
  completedAt: string;
  source: string;
  executedBy: string;
  sessionMode?: string;
  phase?: string | null;
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
  currentLoadKg: number | null; 
  recommendedLoadKg: number | null;
  recommendedTargetReps: number | null;
  recommendedWorkingSetTargets: number[] | null;
  recommendedRepRange: { min: number; max: number } | null;
  recommendationConfidence: string | null;
  incrementSource: string | null;
  
  executedPrimaryLoadKg: number | null;
  executedReps: Array<number | null>; 
  executedWorkingSetCount: number;
  executedWorkingSets: Array<{
    setNumber: number;
    weightKg: number | null;
    reps: number | null;
    rir: number | null;
    setType: string | null;
    alignmentStatus?: TelemetryAlignmentStatus;
  }>;
  mixedWorkingLoads: boolean;
  
  alignmentStatus: TelemetryAlignmentStatus;
  targetStatus: TelemetryTargetStatus;
  comparisonConfidence: 'high' | 'low';
  reasons: string[];

  source?: string;
  executedBy?: string;
  phase?: string | null;
  performed_at?: string;
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
  performed_at?: string;
}

export interface TelemetrySessionInput {
  snapshot: ProgressionSnapshot | null;
  logs: TelemetryLog[];
  studentId: string;
  sessionId: string;
  source?: string;
  executedBy?: string;
  completedAt?: string;
  sessionMode?: string;
  phase?: string | null;
}

/**
 * Avalia a sessão inteira e retorna o status estruturado (Item 2 & 11).
 */
export function buildProgressionSessionTelemetry(input: TelemetrySessionInput): SessionTelemetryResult {
  const { snapshot, sessionId, studentId, completedAt, source, executedBy, sessionMode, phase } = input;
  
  const baseResult: SessionTelemetryResult = {
    status: 'without_snapshot',
    sessionId,
    studentId,
    completedAt: completedAt || new Date().toISOString(),
    source: source || 'student',
    executedBy: executedBy || 'student',
    sessionMode,
    phase,
    outcomes: []
  };

  if (!snapshot) {
    return baseResult;
  }
  
  if (snapshot.version !== PROGRESSION_SNAPSHOT_VERSION) {
    return { ...baseResult, status: 'invalid_snapshot_version' };
  }
  
  if (snapshot.sessionId != null && snapshot.sessionId !== sessionId) {
    return { ...baseResult, status: 'snapshot_session_mismatch' };
  }
  
  // Item 2: empty_snapshot validado DIRETAMENTE no snapshot
  if (Object.keys(snapshot.recommendations || {}).length === 0) {
    return { ...baseResult, status: 'empty_snapshot' };
  }

  const outcomes = buildProgressionExecutionOutcomes(input);
  
  return { ...baseResult, status: 'available', outcomes };
}

/**
 * Motor de Telemetria (V1 Hardened & Fixed)
 */
export function buildProgressionExecutionOutcomes(input: TelemetrySessionInput): ProgressionExecutionOutcome[] {
  const { snapshot, logs, studentId, sessionId, source, executedBy } = input;
  const outcomes: ProgressionExecutionOutcome[] = [];
  
  if (!snapshot) return [];
  
  if (snapshot.version !== PROGRESSION_SNAPSHOT_VERSION || (snapshot.sessionId != null && snapshot.sessionId !== sessionId)) {
    return [];
  }
  
  const logsByEx = new Map<string, TelemetryLog[]>();
  logs.forEach(log => {
    if (log.student_id !== studentId || log.session_id !== sessionId) return;
    const key = normalizeExerciseKey(log.exercise_name);
    if (!key) return;
    if (!logsByEx.has(key)) logsByEx.set(key, []);
    logsByEx.get(key)!.push(log);
  });

  // Item 3: outcomes principais dirigidos SOMENTE pelas recomendações
  const exerciseKeys = Object.keys(snapshot.recommendations || {});

  exerciseKeys.forEach(key => {
    const exLogs = logsByEx.get(key) || [];
    const rec = snapshot.recommendations[key];
    
    const sortedLogs = [...exLogs].sort((a, b) => a.set_number - b.set_number);
    const primaryLogs = sortedLogs.filter(l => !l.set_type || ['work', 'top'].includes(l.set_type));
    const hasLegacyLogs = primaryLogs.some(l => !l.set_type);
    
    const executedReps = primaryLogs.map(l => l.reps ?? null);
    const loads = primaryLogs.map(l => l.weight_kg ?? 0).filter(w => w > 0);
    
    let mixedWorkingLoads = false;
    if (loads.length > 1) {
      const firstLoad = loads[0];
      mixedWorkingLoads = loads.some(L => !sameLoad(L, firstLoad));
    }
    
    const outcome: ProgressionExecutionOutcome = {
      sessionId,
      studentId,
      exerciseKey: key,
      exerciseName: rec.exerciseName || 'Exercício',
      recommendationAction: rec.action || null,
      currentLoadKg: rec.currentLoadKg ?? null,
      recommendedLoadKg: rec.recommendedLoadKg ?? null,
      recommendedTargetReps: rec.targetReps || null,
      recommendedWorkingSetTargets: rec.workingSetTargets || null,
      recommendedRepRange: rec.repRange || null,
      recommendationConfidence: rec.confidence || null,
      incrementSource: rec.incrementSource || null,
      
      executedPrimaryLoadKg: loads.length > 0 ? Math.max(...loads) : null,
      executedReps,
      executedWorkingSetCount: primaryLogs.length,
      executedWorkingSets: primaryLogs.map(l => ({
        setNumber: l.set_number,
        weightKg: l.weight_kg,
        reps: l.reps,
        rir: l.rir ?? null,
        setType: l.set_type ?? null
      })),
      mixedWorkingLoads,
      
      alignmentStatus: 'not_evaluable',
      targetStatus: 'not_evaluable',
      comparisonConfidence: hasLegacyLogs ? 'low' : 'high',
      reasons: [],
      source,
      executedBy,
      phase: snapshot.phase ?? null,
      performed_at: primaryLogs[0]?.performed_at || undefined
    };

    const isDeload = snapshot.phase === 'deload' || rec.basis === 'deload_sem_sobrecarga';
    if (isDeload) {
      outcome.alignmentStatus = 'not_evaluable';
      outcome.targetStatus = 'not_evaluable';
      outcome.reasons.push('deload_excluded_from_progression_kpi');
      outcomes.push(outcome);
      return;
    }

    if (primaryLogs.length === 0) {
      outcome.alignmentStatus = 'no_execution';
      outcome.targetStatus = 'not_evaluable';
    } else {
      evaluateAlignmentMultiSet(outcome, rec);
      evaluateTargetMultiSet(outcome, rec, primaryLogs);
    }

    outcomes.push(outcome);
  });

  return outcomes;
}

function evaluateAlignmentMultiSet(outcome: ProgressionExecutionOutcome, rec: SessionRecommendation) {
  const currentLoad = rec.currentLoadKg; 
  const recommendedLoad = rec.recommendedLoadKg;
  const sets = outcome.executedWorkingSets;

  if (rec.bodyweight) {
    outcome.alignmentStatus = 'matched';
    return;
  }

  const actionsRequiringBaseline = [
    'maintain', 'increase_reps', 'increase_load', 'reduce_load', 'manual_increment_required'
  ];
  
  const setStatuses: TelemetryAlignmentStatus[] = sets.map(s => {
    const execLoad = s.weightKg;
    
    if (execLoad == null) {
      return 'not_evaluable';
    }

    if (currentLoad == null && recommendedLoad == null && actionsRequiringBaseline.includes(rec.action || '')) {
      return 'not_evaluable';
    }

    const safeCurrent = currentLoad ?? 0;
    
    if (rec.action === 'manual_increment_required') {
      return sameLoad(execLoad, safeCurrent) ? 'matched' : 'different';
    }

    if (rec.action === 'increase_load' && recommendedLoad === null) {
      if (execLoad > safeCurrent + LOAD_FLOAT_TOLERANCE_KG) return 'matched';
      return 'different';
    }
    if (rec.action === 'reduce_load' && recommendedLoad === null) {
      if (execLoad < safeCurrent - LOAD_FLOAT_TOLERANCE_KG) return 'matched';
      return 'different';
    }

    if (recommendedLoad !== null) {
      if (sameLoad(execLoad, recommendedLoad)) return 'matched';
      if (execLoad > recommendedLoad + LOAD_FLOAT_TOLERANCE_KG) return 'different';
      
      if (rec.action === 'increase_load') {
         if (execLoad > safeCurrent + LOAD_FLOAT_TOLERANCE_KG && execLoad < recommendedLoad) return 'partial';
      }
      return 'different';
    }

    if (sameLoad(execLoad, safeCurrent)) return 'matched';
    return 'different';
  });

  sets.forEach((s, i) => s.alignmentStatus = setStatuses[i]);

  const hasDifferent = setStatuses.includes('different');
  const hasPartial = setStatuses.includes('partial');
  const hasMatched = setStatuses.includes('matched');
  const allNotEvaluable = setStatuses.every(s => s === 'not_evaluable');
  const hasNotEvaluable = setStatuses.includes('not_evaluable');
  
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
    if (currentLoad == null && recommendedLoad == null && actionsRequiringBaseline.includes(rec.action || '')) {
      outcome.reasons.push('missing_current_load');
    } else {
      outcome.reasons.push('missing_load_for_alignment');
    }
  } else {
    outcome.alignmentStatus = 'different';
  }
}

function evaluateTargetMultiSet(outcome: ProgressionExecutionOutcome, rec: SessionRecommendation, primaryLogs: TelemetryLog[]) {
  const targets = rec.workingSetTargets && rec.workingSetTargets.length > 0 ? rec.workingSetTargets : null;
  const singleTarget = rec.targetReps || rec.repRange?.min || 0;

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

/**
 * Agrega múltiplos resultados de sessões para gerar o sumário (Item 5, 6, 7, 8).
 */
export function buildProgressionTelemetrySummary(results: SessionTelemetryResult[]): TelemetrySummary {
  const summary: TelemetrySummary = {
    sessionsWithSnapshot: 0,
    sessionsWithoutSnapshot: 0,
    sessionsWithoutRecommendation: 0,
    invalidSnapshotSessions: 0,
    recommendationsShown: 0,
    evaluableRecommendations: 0,
    recommendationsWithExecution: 0,
    matchedCount: 0,
    partialCount: 0,
    differentCount: 0,
    noExecutionCount: 0,
    alignmentRate: 0,
    fullOrPartialAlignmentRate: 0,
    executionCoverage: 0,
    targetsEvaluable: 0,
    targetAchievedCount: 0,
    targetPartialCount: 0,
    targetNotAchievedCount: 0,
    targetAchievementRate: 0,
    targetAtLeastPartialRate: 0,
    deloadExcludedCount: 0,
  };

  results.forEach(res => {
    // Item 8: Sessions With Snapshot definition
    if (['available', 'empty_snapshot'].includes(res.status)) {
      summary.sessionsWithSnapshot++;
      if (res.status === 'empty_snapshot') {
        summary.sessionsWithoutRecommendation++;
      }
    } else if (res.status === 'without_snapshot') {
      summary.sessionsWithoutSnapshot++;
      return;
    } else {
      summary.invalidSnapshotSessions++;
      return;
    }

    res.outcomes.forEach(out => {
      // Item 4: deloadExcludedCount counts ONLY Deload
      if (out.reasons.includes('deload_excluded_from_progression_kpi')) {
        summary.deloadExcludedCount++;
        return;
      }

      summary.recommendationsShown++;
      
      const hasExecution = out.executedWorkingSetCount > 0;
      if (hasExecution) {
        summary.recommendationsWithExecution++;
      }

      // Item 5: Alinhamento e Alvo 100% independentes
      
      // ALINHAMENTO
      if (out.alignmentStatus === 'no_execution') {
        summary.noExecutionCount++;
      } else if (out.alignmentStatus !== 'not_evaluable') {
        summary.evaluableRecommendations++;
        if (out.alignmentStatus === 'matched') summary.matchedCount++;
        else if (out.alignmentStatus === 'partial') summary.partialCount++;
        else if (out.alignmentStatus === 'different') summary.differentCount++;
      }

      // TARGET
      if (out.targetStatus !== 'not_evaluable') {
        summary.targetsEvaluable++;
        if (out.targetStatus === 'achieved') summary.targetAchievedCount++;
        else if (out.targetStatus === 'partially_achieved') summary.targetPartialCount++;
        else if (out.targetStatus === 'not_achieved') summary.targetNotAchievedCount++;
      }
    });
  });

  if (summary.evaluableRecommendations > 0) {
    summary.alignmentRate = summary.matchedCount / summary.evaluableRecommendations;
    summary.fullOrPartialAlignmentRate = (summary.matchedCount + summary.partialCount) / summary.evaluableRecommendations;
  }

  if (summary.recommendationsShown > 0) {
    summary.executionCoverage = summary.recommendationsWithExecution / summary.recommendationsShown;
  }

  if (summary.targetsEvaluable > 0) {
    summary.targetAchievementRate = summary.targetAchievedCount / summary.targetsEvaluable;
    summary.targetAtLeastPartialRate = (summary.targetAchievedCount + summary.targetPartialCount) / summary.targetsEvaluable;
  }

  return summary;
}
