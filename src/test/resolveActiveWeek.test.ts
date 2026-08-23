import { describe, it, expect } from 'vitest';
import {
  buildPerformanceSummary,
  resolveActiveWeek,
  selectBestSet,
  buildExercisePerformance,
  type ExercisePerformance,
  type PerformanceStatus,
} from '@/lib/weeklyProgression';
import type { AdherenceReport } from '@/lib/weeklyAdherence';

const perfList = (counts: Partial<Record<PerformanceStatus, number>>): ExercisePerformance[] => {
  const out: ExercisePerformance[] = [];
  (Object.keys(counts) as PerformanceStatus[]).forEach((status) => {
    for (let i = 0; i < (counts[status] ?? 0); i++) {
      out.push({
        exerciseName: `${status}-${i}`,
        totalWorkingSets: 3,
        auxiliarySets: 0,
        preparationSets: 0,
        totalReps: 30,
        totalVolume: 1000,
        loaded: true,
        comparisonBasis: 'like_for_like',
        status,
        nextAction: 'maintain',
        reason: '',
      });
    }
  });
  return out;
};

const adherence = (
  status: AdherenceReport['status'],
  weighted = 1,
): { status: AdherenceReport['status']; weightedSessionAdherence: number } => ({
  status,
  weightedSessionAdherence: weighted,
});

describe('resumo global de performance', () => {
  it('missing e insufficient_data ficam fora do denominador', () => {
    const s = buildPerformanceSummary(
      perfList({ improved: 1, stable: 2, regressed: 1, missing: 2, insufficient_data: 1 }),
    );
    expect(s.comparableExercises).toBe(4);
    expect(s.exercisesExpectedForPerformance).toBe(7);
    expect(s.regressionRate).toBeCloseTo(0.25);
    expect(s.improvementRate).toBeCloseTo(0.25);
    expect(s.performanceCoverage).toBeCloseTo(4 / 7);
  });

  it('cobertura baixa => confiança baixa', () => {
    const s = buildPerformanceSummary(perfList({ improved: 1, missing: 7 }));
    expect(s.confidence).toBe('low');
    expect(s.hasRelevantRegression).toBe(false);
  });

  it('regressão relevante exige confiança alta e taxa >= 50%', () => {
    const s = buildPerformanceSummary(perfList({ regressed: 3, stable: 2, improved: 1 }));
    expect(s.confidence).toBe('high');
    expect(s.hasRelevantRegression).toBe(true);
  });
});

describe('S1 / S2 — política normal', () => {
  it('1. S1 + alta aderência + improved => avança para S2', () => {
    const r = resolveActiveWeek('semana_1', adherence('apto_avancar'), buildPerformanceSummary(perfList({ improved: 3, stable: 2 })));
    expect(r.decision).toBe('advance');
    expect(r.activePhase).toBe('semana_2');
    expect(r.reasons).toContain('no_significant_regression');
  });

  it('2. S1 + alta aderência + maioria stable => avança (stable não é falha)', () => {
    const r = resolveActiveWeek('semana_1', adherence('apto_avancar'), buildPerformanceSummary(perfList({ improved: 1, stable: 5 })));
    expect(r.decision).toBe('advance');
    expect(r.activePhase).toBe('semana_2');
  });

  it('3. S1 + alta aderência + regressão relevante => mantém', () => {
    const r = resolveActiveWeek('semana_1', adherence('apto_avancar'), buildPerformanceSummary(perfList({ regressed: 4, stable: 2 })));
    expect(r.decision).toBe('hold');
    expect(r.activePhase).toBe('semana_1');
    expect(r.reasons).toContain('significant_regression');
  });

  it('4. baixa cobertura de performance + boa aderência => performance não bloqueia o avanço', () => {
    const r = resolveActiveWeek('semana_1', adherence('apto_avancar'), buildPerformanceSummary(perfList({ regressed: 1, missing: 1 })));
    expect(r.decision).toBe('advance');
    expect(r.reasons).toContain('performance_low_confidence');
    expect(r.confidence).toBe('low');
  });

  it('15. 1 exercício regressed entre muitos não reprova a semana', () => {
    const r = resolveActiveWeek('semana_2', adherence('apto_avancar'), buildPerformanceSummary(perfList({ improved: 2, stable: 5, regressed: 1 })));
    expect(r.decision).toBe('advance');
    expect(r.activePhase).toBe('semana_3');
  });

  it('16. maioria stable é aceitável', () => {
    const s = buildPerformanceSummary(perfList({ improved: 1, stable: 5 }));
    expect(s.hasRelevantRegression).toBe(false);
  });

  it('5. aderência média => mantém', () => {
    const r = resolveActiveWeek('semana_1', adherence('manter_semana', 0.6), buildPerformanceSummary(perfList({ improved: 3, stable: 2 })));
    expect(r.decision).toBe('hold');
    expect(r.activePhase).toBe('semana_1');
  });

  it('6. aderência muito baixa => repete a SEMANA ATUAL', () => {
    const r = resolveActiveWeek('semana_1', adherence('repetir_semana', 0.2));
    expect(r.decision).toBe('repeat');
    expect(r.activePhase).toBe('semana_1');
  });

  it('7. S2 com baixa aderência => S2 novamente, nunca S1', () => {
    const r = resolveActiveWeek('semana_2', adherence('repetir_semana', 0.2));
    expect(r.decision).toBe('repeat');
    expect(r.activePhase).toBe('semana_2');
  });

  it('18. performance de baixa confiança não domina a aderência baixa nem a alta', () => {
    const low = buildPerformanceSummary(perfList({ improved: 1 }));
    expect(resolveActiveWeek('semana_1', adherence('manter_semana', 0.6), low).decision).toBe('hold');
    expect(resolveActiveWeek('semana_1', adherence('apto_avancar'), low).decision).toBe('advance');
  });

  it('sessões parciais rebaixam aderência alta para média', () => {
    const r = resolveActiveWeek('semana_1', adherence('apto_avancar', 0.5), buildPerformanceSummary(perfList({ improved: 3, stable: 2 })));
    expect(r.decision).toBe('hold');
    expect(r.reasons).toContain('partial_sessions_downgrade');
  });
});

describe('S3 — overload', () => {
  it('8. S3 + alta aderência + performance boa => S4 deload', () => {
    const r = resolveActiveWeek('semana_3', adherence('apto_avancar'), buildPerformanceSummary(perfList({ improved: 2, stable: 3 })));
    expect(r.decision).toBe('advance_to_deload');
    expect(r.activePhase).toBe('deload');
    expect(r.action).toBe('advance');
  });

  it('9. S3 + alta aderência + regressão relevante => S4 deload (fadiga acumulada)', () => {
    const r = resolveActiveWeek('semana_3', adherence('apto_avancar'), buildPerformanceSummary(perfList({ regressed: 3, stable: 2, improved: 1 })));
    expect(r.decision).toBe('advance_to_deload');
    expect(r.activePhase).toBe('deload');
    expect(r.reasons).toContain('regression_consistent_with_accumulated_fatigue');
  });

  it('10. S3 com aderência muito baixa => não avança para o deload', () => {
    const r = resolveActiveWeek('semana_3', adherence('repetir_semana', 0.2));
    expect(r.activePhase).toBe('semana_3');
    expect(r.decision).toBe('repeat');
    expect(r.reasons).toContain('overload_stimulus_not_delivered');
  });

  it('S3 com aderência média => mantém S3', () => {
    const r = resolveActiveWeek('semana_3', adherence('manter_semana', 0.6));
    expect(r.activePhase).toBe('semana_3');
    expect(r.decision).toBe('hold');
  });
});

describe('S4 — deload', () => {
  it('11. regressão proposital no deload não penaliza o aluno', () => {
    const r = resolveActiveWeek('deload', adherence('apto_avancar'), buildPerformanceSummary(perfList({ regressed: 6 })));
    expect(r.decision).toBe('advance');
    expect(r.reasons).toContain('deload_performance_ignored');
  });

  it('12. S4 concluída => próximo ciclo (S1)', () => {
    const r = resolveActiveWeek('deload', adherence('apto_avancar'));
    expect(r.activePhase).toBe('semana_1');
    expect(r.reasons).toContain('cycle_restart');
  });

  it('S4 praticamente não executada => repete o deload', () => {
    const r = resolveActiveWeek('deload', adherence('repetir_semana', 0.1));
    expect(r.decision).toBe('repeat');
    expect(r.activePhase).toBe('deload');
  });
});

describe('dados insuficientes e reanálise', () => {
  it('13. sem aderência => nenhuma progressão agressiva', () => {
    const r = resolveActiveWeek('semana_2');
    expect(r.decision).toBe('awaiting_data');
    expect(r.activePhase).toBe('semana_2');
    expect(r.blockOverload).toBe(true);
  });

  it('13b. dados_insuficientes mantém a fase e confiança baixa', () => {
    const r = resolveActiveWeek('semana_2', adherence('dados_insuficientes', 0));
    expect(r.decision).toBe('awaiting_data');
    expect(r.confidence).toBe('low');
  });

  it('14. registros de baixa qualidade => sugerir reanálise', () => {
    const r = resolveActiveWeek('semana_1', adherence('sugerir_reanalise', 0.6));
    expect(r.decision).toBe('revise');
    expect(r.suggestRevision).toBe(true);
  });

  it('14b. aderência alta mas quase nenhuma performance útil => reanálise', () => {
    const r = resolveActiveWeek('semana_1', adherence('apto_avancar'), buildPerformanceSummary(perfList({ improved: 2, stable: 1, missing: 5, insufficient_data: 3 })));
    expect(r.decision).toBe('revise');
    expect(r.reasons).toContain('poor_log_quality');
  });

  it('compatibilidade: aceita AdherenceStatus como string', () => {
    const r = resolveActiveWeek('semana_1', 'apto_avancar');
    expect(r.action).toBe('advance');
    expect(r.activePhase).toBe('semana_2');
  });
});

describe('17. recognition-only não cria performance válida', () => {
  const log = (w: number, reps: number, set_type: string | null, set_number: number) => ({
    exercise_name: 'SUPINO RETO',
    weight_kg: w,
    reps,
    performed_at: '2026-08-18T10:00:00Z',
    set_number,
    set_type,
    rir: null,
    rpe: null,
  });

  it('só recognition => sem bestSet', () => {
    expect(selectBestSet([log(40, 10, 'recognition', 1)])).toBeUndefined();
  });

  it('só warmup/recognition => insufficient_data, nunca stable/improved/regressed', () => {
    const p = buildExercisePerformance(
      'SUPINO RETO',
      [log(40, 10, 'recognition', 1), log(30, 12, 'warmup', 2)],
      [log(80, 8, 'work', 1)],
    );
    expect(p.bestSet).toBeUndefined();
    expect(p.status).toBe('insufficient_data');
    expect(p.preparationSets).toBe(2);
    expect(p.totalWorkingSets).toBe(0);
  });

  it('logs legados sem set_type mantêm o fallback documentado', () => {
    const p = buildExercisePerformance(
      'SUPINO RETO',
      [log(80, 8, null, 1)],
      [log(78, 8, null, 1)],
    );
    expect(p.bestSet?.weightKg).toBe(80);
    expect(p.status).not.toBe('insufficient_data');
  });
});
