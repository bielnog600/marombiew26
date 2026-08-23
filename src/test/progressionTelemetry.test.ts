import { describe, it, expect } from 'vitest';
import { 
  buildProgressionExecutionOutcomes, 
  buildProgressionSessionTelemetry,
  buildProgressionTelemetrySummary,
  type TelemetrySessionInput, 
  type ProgressionExecutionOutcome 
} from '@/lib/progressionTelemetry';
import { 
  PROGRESSION_SNAPSHOT_VERSION, 
  type ProgressionSnapshot 
} from '@/lib/sessionProgression';

const mockSnapshot = (recommendations: any, sessionId = 's1', phase = 'semana_1'): ProgressionSnapshot => ({
  version: PROGRESSION_SNAPSHOT_VERSION,
  generatedAt: new Date().toISOString(),
  sessionId,
  phase,
  recommendations
});

describe('progressionTelemetry engine V1 Hardening', () => {
  describe('Alignment Logic', () => {
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

    it('2. increase_load com carga original -> different', () => {
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
      expect(outcome[0].alignmentStatus).toBe('different');
      expect(outcome[0].reasons).not.toContain('load_increased_less_than_recommended');
    });

    it('3. increase_load com aumento parcial -> partial', () => {
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
      expect(outcome[0].alignmentStatus).toBe('partial');
      expect(outcome[0].reasons).toContain('load_increased_less_than_recommended');
    });

    it('4. tolerância de 0.05kg ignora micro-variações', () => {
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
      expect(outcome[0].alignmentStatus).toBe('different');
    });

    it('5. bodyweight sempre dá matched', () => {
      const rec = {
        exerciseName: 'Flexão',
        action: 'increase_reps',
        bodyweight: true,
      };
      const outcome = buildProgressionExecutionOutcomes({
        snapshot: mockSnapshot({ 'FLEXAO': rec }),
        logs: [{ exercise_name: 'FLEXAO', weight_kg: 0, reps: 15, set_number: 1, session_id: 's1', student_id: 'u1' }],
        studentId: 'u1',
        sessionId: 's1',
      });
      expect(outcome[0].alignmentStatus).toBe('matched');
    });
  });

  describe('Target Logic', () => {
    it('6. atingiu reps alvo exatas -> achieved', () => {
      const rec = {
        exerciseName: 'Supino',
        targetReps: 10
      };
      const outcome = buildProgressionExecutionOutcomes({
        snapshot: mockSnapshot({ 'SUPINO': rec }),
        logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
        studentId: 'u1',
        sessionId: 's1',
      });
      expect(outcome[0].targetStatus).toBe('achieved');
    });

    it('7. superou reps alvo -> achieved', () => {
      const rec = {
        exerciseName: 'Supino',
        targetReps: 10
      };
      const outcome = buildProgressionExecutionOutcomes({
        snapshot: mockSnapshot({ 'SUPINO': rec }),
        logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: 12, set_number: 1, session_id: 's1', student_id: 'u1' }],
        studentId: 'u1',
        sessionId: 's1',
      });
      expect(outcome[0].targetStatus).toBe('achieved');
    });

    it('8. multissérie com séries incompletas -> partially_achieved', () => {
      const rec = {
        exerciseName: 'Supino',
        workingSetTargets: [10, 10, 10]
      };
      const outcome = buildProgressionExecutionOutcomes({
        snapshot: mockSnapshot({ 'SUPINO': rec }),
        logs: [
          { exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' },
          { exercise_name: 'SUPINO', weight_kg: 80, reps: 8, set_number: 2, session_id: 's1', student_id: 'u1' }
        ],
        studentId: 'u1',
        sessionId: 's1',
      });
      expect(outcome[0].targetStatus).toBe('partially_achieved');
    });

    it('9. menos séries executadas que o planejado -> partially_achieved', () => {
      const rec = {
        exerciseName: 'Supino',
        workingSetTargets: [10, 10, 10]
      };
      const outcome = buildProgressionExecutionOutcomes({
        snapshot: mockSnapshot({ 'SUPINO': rec }),
        logs: [
          { exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }
        ],
        studentId: 'u1',
        sessionId: 's1',
      });
      expect(outcome[0].targetStatus).toBe('partially_achieved');
      expect(outcome[0].reasons).toContain('fewer_working_sets_than_target');
    });
  });

  describe('Session & Summary Logic', () => {
    it('10. Deload exclui do KPI de alinhamento', () => {
      const rec = {
        exerciseName: 'Supino',
        action: 'maintain',
        currentLoadKg: 80
      };
      const res = buildProgressionSessionTelemetry({
        snapshot: mockSnapshot({ 'SUPINO': rec }, 's1', 'deload'),
        logs: [{ exercise_name: 'SUPINO', weight_kg: 80, reps: 10, set_number: 1, session_id: 's1', student_id: 'u1' }],
        studentId: 'u1',
        sessionId: 's1',
      });
      
      const summary = buildProgressionTelemetrySummary([res]);
      expect(summary.deloadExcludedCount).toBe(1);
      expect(summary.evaluableRecommendations).toBe(0);
    });

    it('11. empty_snapshot retorna status correto', () => {
      const res = buildProgressionSessionTelemetry({
        snapshot: mockSnapshot({}, 's1'),
        logs: [],
        studentId: 'u1',
        sessionId: 's1',
      });
      expect(res.status).toBe('empty_snapshot');
      
      const summary = buildProgressionTelemetrySummary([res]);
      expect(summary.sessionsWithoutRecommendation).toBe(1);
    });

    it('12. pular exercício (no_execution) não afeta alinhamento rate', () => {
      const rec = { exerciseName: 'Supino', action: 'maintain', currentLoadKg: 80 };
      const res = buildProgressionSessionTelemetry({
        snapshot: mockSnapshot({ 'SUPINO': rec }, 's1'),
        logs: [], // Sem logs -> no_execution
        studentId: 'u1',
        sessionId: 's1',
      });
      
      const summary = buildProgressionTelemetrySummary([res]);
      expect(summary.noExecutionCount).toBe(1);
      expect(summary.evaluableRecommendations).toBe(0);
      expect(summary.executionCoverage).toBe(0);
    });
  });
});
