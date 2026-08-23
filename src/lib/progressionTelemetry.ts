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

export interface ProgressionExecutionOutcome {
  sessionId: string;
  studentId: string;
  exerciseKey: string;
  exerciseName: string;
  recommendationAction: string | null;
  recommendedLoadKg: number | null;
  recommendedTargetReps: number | null;
  recommendedWorkingSetTargets: number[] | null;
  recommendedRepRange: { min: number; max: number } | null;
  recommendationConfidence: string | null;
  incrementSource: string | null;
  
  executedPrimaryLoadKg: number | null;
  executedReps: number[];
  executedWorkingSetCount: number;
  executedWorkingSets: Array<{
    setNumber: number;
    weightKg: number | null;
    reps: number | null;
    rir: number | null;
    setType: string | null;
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
  // Campos opcionais vindo do contexto
  source?: string;
  executedBy?: string;
}

/**
 * Motor de Telemetria (V1 Hardened)
 * Compara a sugestão congelada com a execução real das séries principais.
 */
export function buildProgressionExecutionOutcomes(input: TelemetrySessionInput): ProgressionExecutionOutcome[] {
  const { snapshot, logs, studentId, sessionId, source, executedBy } = input;
  const outcomes: ProgressionExecutionOutcome[] = [];
  
  // Agrupar logs por exercício, garantindo isolamento student/session (Regra 3)
  const logsByEx = new Map<string, TelemetryLog[]>();
  logs.forEach(log => {
    // Dupla proteção: revalidar student_id e session_id dentro da função pura
    if (log.student_id !== studentId || log.session_id !== sessionId) return;

    const key = normalizeExerciseKey(log.exercise_name);
    if (!key) return;
    if (!logsByEx.has(key)) logsByEx.set(key, []);
    logsByEx.get(key)!.push(log);
  });

  // Se não tem snapshot, ainda listamos execuções, mas sem comparação
  const exerciseKeys = new Set<string>();
  logsByEx.forEach((_, k) => exerciseKeys.add(k));
  if (snapshot?.recommendations) {
    Object.keys(snapshot.recommendations).forEach(k => exerciseKeys.add(k));
  }

  exerciseKeys.forEach(key => {
    const exLogs = logsByEx.get(key) || [];
    const rec = snapshot?.recommendations?.[key] || null;
    
    // Filtro de séries principais (work/top)
    const primaryLogs = exLogs.filter(l => !l.set_type || ['work', 'top'].includes(l.set_type));
    const hasLegacyLogs = primaryLogs.some(l => !l.set_type);
    
    const executedReps = primaryLogs.map(l => l.reps || 0);
    const loads = primaryLogs.map(l => l.weight_kg || 0).filter(w => w > 0);
    
    // Regra 10: executedPrimaryLoadKg e mixedWorkingLoads
    let primaryLoad: number | null = null;
    let mixedWorkingLoads = false;
    if (loads.length > 0) {
      const uniqueLoads = Array.from(new Set(loads.map(w => Math.round(w / LOAD_FLOAT_TOLERANCE_KG) * LOAD_FLOAT_TOLERANCE_KG)));
      if (uniqueLoads.length > 1) {
        mixedWorkingLoads = true;
      }
      // Mesmo em mixed, usamos o máximo para classificar "alinhamento" vs "target", 
      // mas registramos que foi misto.
      primaryLoad = Math.max(...loads);
    }
    
    // Regra 9: executedWorkingSets detalhado
    const executedWorkingSets = primaryLogs.map(l => ({
      setNumber: l.set_number,
      weightKg: l.weight_kg,
      reps: l.reps,
      rir: l.rir ?? null,
      setType: l.set_type ?? null
    }));

    const outcome: ProgressionExecutionOutcome = {
      sessionId,
      studentId,
      exerciseKey: key,
      exerciseName: rec?.exerciseName || exLogs[0]?.exercise_name || 'Exercício',
      recommendationAction: rec?.action || null,
      recommendedLoadKg: rec?.recommendedLoadKg ?? null, // Regra 5: Não preencher artificialmente com currentLoadKg
      recommendedTargetReps: rec?.targetReps || null,
      recommendedWorkingSetTargets: rec?.workingSetTargets || null,
      recommendedRepRange: rec?.repRange || null,
      recommendationConfidence: rec?.confidence || null,
      incrementSource: rec?.incrementSource || null,
      
      executedPrimaryLoadKg: primaryLoad,
      executedReps,
      executedWorkingSetCount: primaryLogs.length,
      executedWorkingSets,
      mixedWorkingLoads,
      
      alignmentStatus: 'not_evaluable',
      targetStatus: 'not_evaluable',
      comparisonConfidence: hasLegacyLogs ? 'low' : 'high',
      reasons: [],

      source,
      executedBy,
      phase: snapshot?.phase ?? null
    };

    // Regra 7: Deload excluído do KPI
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
      // 1. Avaliar Alinhamento (Seguiu a carga?)
      evaluateAlignment(outcome, rec, primaryLoad);

      // 2. Avaliar Alvo (Atingiu as reps?)
      evaluateTarget(outcome, rec, primaryLogs);
    }

    outcomes.push(outcome);
  });

  return outcomes;
}

function evaluateAlignment(outcome: ProgressionExecutionOutcome, rec: SessionRecommendation, primaryLoad: number | null) {
  const execLoad = primaryLoad ?? 0;
  const currentLoad = rec.currentLoadKg ?? 0;
  const recommendedLoad = rec.recommendedLoadKg; // Pode ser null para qualitativo

  if (rec.bodyweight) {
    outcome.alignmentStatus = 'matched';
    return;
  }

  // Regra 8: Manual Increment Required
  if (rec.action === 'manual_increment_required') {
    if (execLoad > 0 && currentLoad > 0) {
      const diff = Math.abs(execLoad - currentLoad);
      if (diff < LOAD_FLOAT_TOLERANCE_KG) {
        outcome.alignmentStatus = 'matched';
      } else {
        outcome.alignmentStatus = 'different';
        if (execLoad > currentLoad) {
          outcome.reasons.push('used_rejected_large_increment');
        } else {
          outcome.reasons.push('load_reduced');
        }
      }
    }
    return;
  }

  // Regra 6: Increase Load Qualitativo
  if (rec.action === 'increase_load' && recommendedLoad === null) {
    if (execLoad > currentLoad + LOAD_FLOAT_TOLERANCE_KG) {
      outcome.alignmentStatus = 'matched';
      outcome.comparisonConfidence = 'low';
      outcome.reasons.push('qualitative_load_increase_followed');
    } else if (Math.abs(execLoad - currentLoad) < LOAD_FLOAT_TOLERANCE_KG) {
      outcome.alignmentStatus = 'different';
      outcome.reasons.push('qualitative_load_not_increased');
    } else {
      outcome.alignmentStatus = 'different';
      outcome.reasons.push('load_reduced_instead_of_increased');
    }
    return;
  }

  // Casos Quantitativos
  if (recommendedLoad !== null) {
    const diff = Math.abs(execLoad - recommendedLoad);
    if (diff < LOAD_FLOAT_TOLERANCE_KG) {
      outcome.alignmentStatus = 'matched';
    } else if (execLoad > recommendedLoad) {
      outcome.alignmentStatus = 'different';
      outcome.reasons.push('executed_above_recommendation');
    } else {
      // Abaixo da recomendação
      if (rec.action === 'increase_load' && execLoad >= currentLoad) {
        outcome.alignmentStatus = 'partial';
        outcome.reasons.push('load_increased_less_than_recommended');
      } else {
        outcome.alignmentStatus = 'different';
        outcome.reasons.push(execLoad < currentLoad ? 'load_reduced' : 'load_not_increased');
      }
    }
    return;
  }

  // Fallback para Maintain qualitativo ou outros
  if (rec.action === 'maintain' || rec.action === 'increase_reps') {
    const diff = Math.abs(execLoad - currentLoad);
    if (diff < LOAD_FLOAT_TOLERANCE_KG) {
      outcome.alignmentStatus = 'matched';
    } else {
      outcome.alignmentStatus = 'different';
      outcome.reasons.push(execLoad > currentLoad ? 'executed_above_recommendation' : 'load_reduced');
    }
  }
}

function evaluateTarget(outcome: ProgressionExecutionOutcome, rec: SessionRecommendation, primaryLogs: TelemetryLog[]) {
  // Regra 12: Hierarquia de targets (workingSetTargets > targetReps > repRange.min)
  const targets = rec.workingSetTargets && rec.workingSetTargets.length > 0
    ? rec.workingSetTargets
    : null;
  
  const singleTarget = rec.targetReps || rec.repRange?.min || 0;

  if (targets) {
    // Comparar série por série
    let achievedCount = 0;
    primaryLogs.forEach((log, i) => {
      const targetForThisSet = targets[i] ?? targets[targets.length - 1]; // Fallback para o último target definido
      if ((log.reps || 0) >= targetForThisSet) {
        achievedCount++;
      }
    });

    if (achievedCount === primaryLogs.length) {
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
