import { describe, it, expect, vi } from 'vitest';
import { buildProgressionExecutionOutcomes, TelemetrySessionInput } from '../src/lib/progressionTelemetry';
import { ProgressionSnapshot } from '../src/lib/sessionProgression';

describe('progressionTelemetry', () => {
  it('detects partial increase_load correctly', () => {
    const rec = {
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 85,
    };
    // Exemplo do prompt: current 80, rec 85, exec 82.5 (parcial)
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: { recommendations: { 'SUPINO': { ...rec, exerciseName: 'Supino' } as any } } as ProgressionSnapshot,
      logs: [{ exercise_name: 'SUPINO', weight_kg: 82.5, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].alignmentStatus).toBe('partial');
  });

  it('classifies same load as different if action is increase_load', () => {
    const rec = {
      action: 'increase_load',
      currentLoadKg: 80,
      recommendedLoadKg: 85,
    };
    const outcome = buildProgressionExecutionOutcomes({
      snapshot: { recommendations: { 'SUPINO': { ...rec, exerciseName: 'Supino' } as any } } as ProgressionSnapshot,
      logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
      studentId: 'u1',
      sessionId: 's1',
    });
    expect(outcome[0].alignmentStatus).toBe('different');
  });
});
