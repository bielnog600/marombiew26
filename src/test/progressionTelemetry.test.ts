import { describe, it, expect } from 'vitest';
import { 
  buildProgressionExecutionOutcomes, 
  type TelemetrySessionInput, 
  type ProgressionExecutionOutcome 
} from '@/lib/progressionTelemetry';
import { 
  PROGRESSION_SNAPSHOT_VERSION, 
  type ProgressionSnapshot 
} from '@/lib/sessionProgression';

const mockSnapshot = (recommendations: any, sessionId = 's1'): ProgressionSnapshot => ({
  version: PROGRESSION_SNAPSHOT_VERSION,
  generatedAt: new Date().toISOString(),
  sessionId,
  phase: 'semana_1',
  recommendations
});

describe('progressionTelemetry', () => {
  it('detects partial increase_load correctly', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 85,
    };
    // Exemplo do prompt: current 80, rec 85, exec 82.5 (parcial)
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 82.5, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].alignmentStatus).toBe('partial');
  });

  it('classifies same load as different if action is increase_load', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 85,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].alignmentStatus).toBe('different');
  });
});
