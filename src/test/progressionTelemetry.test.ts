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

describe('progressionTelemetry engine hardening', () => {
  it('1. increase_load exato matches', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 85,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 85, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].alignmentStatus).toBe('matched');
  });

  it('2. current 80 / recommended 82.5 / executed 80 -> different', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 82.5,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    // Não houve aumento real
    expect(outcome[0].alignmentStatus).toBe('different');
  });

  it('3. current 80 / recommended 85 / executed 82.5 -> partial', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 85,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 82.5, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    // 82.5 > 80 e < 85 -> partial
    expect(outcome[0].alignmentStatus).toBe('partial');
  });

  it('4. diferença dentro de 0.05 não é progressão', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 85,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 80.03, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    // 80.03 está dentro da tolerância de 80.05
    expect(outcome[0].alignmentStatus).toBe('different');
  });

  it('7. missing weight -> not_evaluable', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'maintain',
      currentLoadKg: 80,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: null, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].alignmentStatus).toBe('not_evaluable');
    expect(outcome[0].reasons).toContain('missing_load_for_alignment');
  });

  it('8. missing currentLoad -> not_evaluable', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'maintain',
      currentLoadKg: null,
      recommendedLoadKg: null,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].alignmentStatus).toBe('not_evaluable');
    expect(outcome[0].reasons).toContain('missing_current_load');
  });

  it('12. null reps -> not_evaluable target', () => {
    const rec = {
      exerciseName: 'Supino',
      action: 'maintain',
      currentLoadKg: 80,
      targetReps: 10
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: mockSnapshot({ 'SUPINO': rec }),
      logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: null, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].targetStatus).toBe('not_evaluable');
  });
});
