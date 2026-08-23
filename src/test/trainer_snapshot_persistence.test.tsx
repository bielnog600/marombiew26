import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readProgressionSnapshot } from '../lib/sessionProgression';

describe('TrainerLogSheet Snapshot Persistence & Restoration', () => {
  const mockSnapshot = {
    studentId: 'student-1',
    sessionId: 'session-123',
    phase: 'semana_1',
    timestamp: Date.now(),
    recommendations: {
      'Supino': {
        nextAction: 'increase_load',
        suggestedLoad: 65,
        suggestedReps: 8,
        reason: 'Improved'
      }
    }
  };

  it('restores snapshot correctly from session_state root', () => {
    const sessionState = {
      meta: { admin_id: 'coach-1' },
      form: { some_input: 'value' },
      progressionRecommendations: mockSnapshot
    };

    const restored = readProgressionSnapshot(sessionState);
    expect(restored).toEqual(mockSnapshot);
  });

  it('prevents re-computation if snapshot exists in root', () => {
    // This is a logic test for the behavior we implemented in TrainerLogSheet
    const sessionState = {
      progressionRecommendations: mockSnapshot
    };

    // Simulate TrainerLogSheet logic
    const existing = readProgressionSnapshot(sessionState);
    let patchCalled = false;
    const patchSessionState = (updater: any) => {
      patchCalled = true;
    };

    if (!existing) {
      patchSessionState(() => ({ progressionRecommendations: mockSnapshot }));
    }

    expect(patchCalled).toBe(false);
  });

  it('handles Duo snapshots by student identity', () => {
    const studentAId = 'uuid-a';
    const studentBId = 'uuid-b';
    const snapshotA = { ...mockSnapshot, studentId: studentAId };
    const snapshotB = { ...mockSnapshot, studentId: studentBId, recommendations: {} };

    const sessionState = {
      progressionRecommendationsByStudent: {
        [studentAId]: snapshotA,
        [studentBId]: snapshotB
      }
    };

    const restoredA = readProgressionSnapshot(sessionState?.progressionRecommendationsByStudent?.[studentAId]);
    const restoredB = readProgressionSnapshot(sessionState?.progressionRecommendationsByStudent?.[studentBId]);

    expect(restoredA).toEqual(snapshotA);
    expect(restoredB).toEqual(snapshotB);
  });

  it('identifies collision safety when swapping students', () => {
    const studentBId = 'uuid-b';
    const studentCId = 'uuid-c';
    const snapshotB = { ...mockSnapshot, studentId: studentBId };

    const sessionState = {
      progressionRecommendationsByStudent: {
        [studentBId]: snapshotB
      }
    };

    // When Student C is selected, we look for its ID
    const restoredC = readProgressionSnapshot(sessionState?.progressionRecommendationsByStudent?.[studentCId]);
    expect(restoredC).toBeNull();
  });
});
