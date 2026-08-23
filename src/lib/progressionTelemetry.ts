import { PROGRESSION_SNAPSHOT_VERSION, type ProgressionSnapshot } from './sessionProgression';
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

export interface ProgressionExecutionOutcome {
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
  executedWorkingSets: number;
  
  alignmentStatus: TelemetryAlignmentStatus;
  targetStatus: TelemetryTargetStatus;
  comparisonConfidence: 'high' | 'low';
  reasons: string[];
}

export interface TelemetrySessionInput {
  snapshot: ProgressionSnapshot | null;
  logs: Array<{
    exercise_name: string;
    weight_kg: number | null;
    reps: number | null;
    set_type?: string | null;
  }>;
  studentId: string;
  sessionId: string;
}

/**
 * Motor de Telemetria (V1)
 * Compara a sugestão congelada com a execução real das séries principais.
 */
export function buildProgressionExecutionOutcomes(input: TelemetrySessionInput): ProgressionExecutionOutcome[] {
  const { snapshot, logs } = input;
  const outcomes: ProgressionExecutionOutcome[] = [];
  
  // Agrupar logs por exercício
  const logsByEx = new Map<string, typeof input.logs>();
  logs.forEach(log => {
    const key = normalizeExerciseKey(log.exercise_name);
    if (!key) return;
    if (!logsByEx.has(key)) logsByEx.set(key, []);
    logsByEx.get(key)!.push(log);
  });

  // Se não tem snapshot, ainda podemos listar execuções, mas sem comparação
  const exerciseKeys = new Set([...logsByEx.keys()]);
  if (snapshot?.recommendations) {
    Object.keys(snapshot.recommendations).forEach(k => exerciseKeys.add(k));
  }

  exerciseKeys.forEach(key => {
    const exLogs = logsByEx.get(key) || [];
    const rec = snapshot?.recommendations?.[key] || null;
    
    // Filtro de séries principais (work/top)
    // Se set_type for null (legado), aceitamos todos para não perder telemetria, 
    // mas com confiança menor.
    const primaryLogs = exLogs.filter(l => !l.set_type || ['work', 'top'].includes(l.set_type));
    const hasLegacyLogs = primaryLogs.some(l => !l.set_type);
    
    const executedReps = primaryLogs.map(l => l.reps || 0);
    const loads = primaryLogs.map(l => l.weight_kg || 0).filter(w => w > 0);
    const primaryLoad = loads.length > 0 ? Math.max(...loads) : null;
    
    const outcome: ProgressionExecutionOutcome = {
      exerciseKey: key,
      exerciseName: rec?.exerciseName || exLogs[0]?.exercise_name || 'Exercício',
      recommendationAction: rec?.action || null,
      recommendedLoadKg: rec?.recommendedLoadKg ?? rec?.currentLoadKg ?? null,
      recommendedTargetReps: rec?.targetReps || null,
      recommendedWorkingSetTargets: rec?.workingSetTargets || null,
      recommendedRepRange: rec?.repRange || null,
      recommendationConfidence: rec?.confidence || null,
      incrementSource: rec?.incrementSource || null,
      
      executedPrimaryLoadKg: primaryLoad,
      executedReps,
      executedWorkingSets: primaryLogs.length,
      
      alignmentStatus: 'not_evaluable',
      targetStatus: 'not_evaluable',
      comparisonConfidence: hasLegacyLogs ? 'low' : 'high',
      reasons: []
    };

    if (!rec) {
      outcome.alignmentStatus = 'not_evaluable';
      outcome.reasons.push('sem_recomendacao_no_inicio');
    } else if (primaryLogs.length === 0) {
      outcome.alignmentStatus = 'no_execution';
      outcome.targetStatus = 'not_evaluable';
    } else {
      // 1. Avaliar Alinhamento (Seguiu a carga?)
      const recLoad = rec.recommendedLoadKg ?? rec.currentLoadKg ?? 0;
      const execLoad = primaryLoad ?? 0;
      
      if (rec.bodyweight) {
        outcome.alignmentStatus = 'matched'; // Carga é irrelevante para bodyweight
      } else if (recLoad > 0 && execLoad > 0) {
        const diff = Math.abs(execLoad - recLoad);
        if (diff < 0.1) {
          outcome.alignmentStatus = 'matched';
        } else if (execLoad > recLoad) {
          outcome.alignmentStatus = 'different';
          outcome.reasons.push('executed_above_recommendation');
        } else {
          // Abaixo da recomendação
          if (rec.action === 'increase_load' && execLoad >= (rec.currentLoadKg || 0)) {
             outcome.alignmentStatus = 'partial';
             outcome.reasons.push('load_increased_less_than_recommended');
          } else {
             outcome.alignmentStatus = 'different';
             outcome.reasons.push(execLoad < (rec.currentLoadKg || 0) ? 'load_reduced' : 'load_not_increased');
          }
        }
      }

      // 2. Avaliar Alvo (Atingiu as reps?)
      const targetReps = rec.targetReps || (rec.repRange?.min) || 0;
      if (targetReps > 0) {
        const achievedAll = primaryLogs.every(l => (l.reps || 0) >= targetReps);
        const achievedSome = primaryLogs.some(l => (l.reps || 0) >= targetReps);
        
        if (achievedAll) {
          outcome.targetStatus = 'achieved';
        } else if (achievedSome) {
          outcome.targetStatus = 'partially_achieved';
        } else {
          outcome.targetStatus = 'not_achieved';
        }
      }
    }

    outcomes.push(outcome);
  });

  return outcomes;
}
