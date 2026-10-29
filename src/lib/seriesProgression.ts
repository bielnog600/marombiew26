import type { QuantitativeInput, QuantitativeRecommendation } from './quantitativeProgression';
import { ABSOLUTE_LOAD_INCREASE_MAX_PCT } from './quantitativeProgression';
import { lastExerciseSessions, parseRepRange, setRoleOf } from './weeklyProgression';
import { resolveLoadIncrement } from './loadIncrement';
import { isNoLoadExercise, isExerciseReferenceExpired } from './consultoriaRegression';

export interface SeriesLoadTarget {
  setNumber: number;
  currentLoadKg: number | null;
  recommendedLoadKg: number | null;
  targetReps: number;
  action: 'increase_load' | 'increase_reps' | 'maintain' | 'reduce_load';
}

/** Pure advice only: actual latest working loads, never weekly best-set projections. */
export function computeSeriesProgression(input: QuantitativeInput): QuantitativeRecommendation {
  const p = input.performance;
  const now = input.now ?? new Date();
  const loadedWork = (rows: NonNullable<QuantitativeInput['recentLogs']>) => rows.filter(l =>
    setRoleOf(l) === 'primary' && Number(l.reps) > 0 && Number(l.weight_kg) > 0);
  const pair = lastExerciseSessions(input.recentLogs ?? []);
  const recent = loadedWork(pair.current).sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
  const previous = loadedWork(input.previousLogs ?? pair.previous);
  const increment = resolveLoadIncrement({
    historicalWorkingSets: [...(input.historyLogs ?? []), ...(input.previousLogs ?? []), ...recent],
    configuredIncrementKg: input.configuredIncrementKg, now,
  });
  // Legacy callers may supply only a real best set, but cannot prove all prescribed sets reached the top.
  const unweighted = pair.current.filter(l => setRoleOf(l) === 'primary' && Number(l.reps) > 0);
  const sets = recent.length ? recent : unweighted.length ? unweighted : !input.recentLogs && p.bestSet ? [{
    weight_kg: p.bestSet.weightKg, reps: p.bestSet.reps, set_number: p.bestSet.setNumber ?? 1,
    performed_at: p.bestSet.performedAt, rir: p.bestSet.rir,
  }] : [];
  const maxLoad = Math.max(0, ...sets.map(s => Number(s.weight_kg)));
  const baseSets = sets.filter(s => Number(s.weight_kg) === maxLoad);
  const last = recent[recent.length - 1];
  const rir = last?.rir ?? p.finalWorkingRir ?? (!input.recentLogs ? p.bestSet?.rir : null) ?? null;
  const exhausted = (rir != null && rir <= 1) || (input.sessionAvgRpe != null && input.sessionAvgRpe >= 9);
  const deload = input.activePhase === 'deload';
  const noLoad = isNoLoadExercise(p.exerciseName) || maxLoad <= 0;
  const at = sets.length ? Math.max(...sets.map(s => Date.parse(s.performed_at))) : null;
  const expired = at != null && isExerciseReferenceExpired(at, now.getTime());
  const rangeFor = (number: number, index: number) => parseRepRange(
    input.prescribedSets?.find(s => s.setNumber === number)?.reps
    ?? input.setSchemeTargets?.[index]
    ?? input.plannedRepsText?.split('+').pop()?.split('/')[index]
    ?? input.plannedRepsText?.split('+').pop()
  ) ?? p.repRange ?? null;
  const individual = new Set(sets.map((s, i) => {
    const r = rangeFor(s.set_number ?? i + 1, i);
    return r ? `${r.min}-${r.max}` : '';
  })).size > 1 || /pyramid/.test(input.setSchemeMode ?? '');
  const relevant = individual ? sets : baseSets;
  const allTop = relevant.length > 0 && relevant.every(s => {
    const i = sets.indexOf(s), r = rangeFor(s.set_number ?? i + 1, i);
    return r != null && Number(s.reps) >= r.max;
  }) && (input.recentLogs != null || sets.length >= p.totalWorkingSets)
    && (!input.prescribedSets?.length || sets.length >= input.prescribedSets.length);
  const repeatedTop = allTop && relevant.every(s => {
    const i = sets.indexOf(s), r = rangeFor(s.set_number ?? i + 1, i);
    const old = previous.find(l => l.set_number === s.set_number);
    return old != null && r != null && Number(old.reps) >= r.max && Number(old.weight_kg) >= Number(s.weight_kg);
  });
  const room = !exhausted && (rir != null ? rir >= 2 : repeatedTop || (allTop && input.sessionAvgRpe != null && input.sessionAvgRpe <= 6));
  const observed = [...new Set(increment.evidence.loadSeriesKg)].sort((a, b) => a - b);
  const series: SeriesLoadTarget[] = expired ? [] : sets.map((s, i): SeriesLoadTarget => {
    const ownLoad = Number(s.weight_kg) > 0 ? Number(s.weight_kg) : null;
    const reps = Number(s.reps), n = s.set_number ?? i + 1, range = rangeFor(n, i);
    const base: SeriesLoadTarget = { setNumber: n, currentLoadKg: ownLoad, recommendedLoadKg: ownLoad, targetReps: reps, action: 'maintain' };
    if (deload || isNoLoadExercise(p.exerciseName) || !range) return base;
    if (noLoad || ownLoad == null) return reps < range.max ? { ...base, currentLoadKg: null, recommendedLoadKg: null, targetReps: Math.min(reps + 1, range.max), action: 'increase_reps' } : base;
    // Uniform prescriptions progress only the base load; lighter ramp sets stay intact.
    if (!individual && ownLoad !== maxLoad) return base;
    if (reps < range.min) {
      const lower = [...observed].reverse().find(w => w < ownLoad && w >= ownLoad * 0.9);
      if (lower != null && (p.nextAction === 'reduce_load' || rir === 0)) return { ...base, recommendedLoadKg: lower, targetReps: range.min, action: 'reduce_load' };
      return { ...base, targetReps: range.min, action: 'increase_reps' };
    }
    if (exhausted) return base;
    // One learned step, not the next historical load (which may skip several steps).
    const candidate = increment.incrementKg != null ? Math.round((ownLoad + increment.incrementKg) * 1000) / 1000 : null;
    const largeStep = candidate != null && (candidate - ownLoad) / ownLoad > ABSOLUTE_LOAD_INCREASE_MAX_PCT + 1e-9;
    if (allTop && room && candidate != null && candidate > ownLoad && !largeStep) {
      return { ...base, recommendedLoadKg: candidate, targetReps: range.min, action: 'increase_load' };
    }
    if (reps < range.max || largeStep) {
      return { ...base, targetReps: largeStep ? reps + 1 : Math.min(reps + 1, range.max), action: 'increase_reps' };
    }
    return base;
  });
  const baseSeries = series.filter(s => s.currentLoadKg === maxLoad);
  // Summary action and kg always come from the SAME representative base-load set.
  const representative = baseSeries.find(s => s.action === 'reduce_load')
    ?? baseSeries.find(s => s.action === 'increase_load')
    ?? baseSeries.find(s => s.action === 'increase_reps') ?? baseSeries[0] ?? series[0];
  const currentReps = baseSets.length ? Math.min(...baseSets.map(s => Number(s.reps))) : null;
  return {
    exerciseName: p.exerciseName, sourceAction: p.nextAction,
    action: expired ? 'maintain' : representative?.action ?? 'review',
    currentLoadKg: expired ? null : maxLoad || null,
    recommendedLoadKg: representative?.recommendedLoadKg ?? null,
    currentReps: expired ? null : currentReps, targetReps: representative?.targetReps ?? null,
    workingSetTargets: series.length > 1 ? series.map(s => s.targetReps) : null,
    totalRepsTarget: series.length ? series.reduce((sum, s) => sum + s.targetReps, 0) : null,
    seriesTargets: series, repRange: p.repRange ?? null,
    incrementKg: increment.incrementKg, incrementSource: increment.source, incrementConfidence: increment.confidence,
    relativeChangePct: representative?.currentLoadKg && representative.recommendedLoadKg ? (representative.recommendedLoadKg - representative.currentLoadKg) / representative.currentLoadKg : null,
    confidence: representative ? increment.confidence : 'low', qualitative: !representative,
    basis: expired ? 'retomar_referencia' : deload ? 'deload_sem_sobrecarga' : representative ? 'metas_por_serie' : 'sem_base_quantificavel',
    reasons: [expired ? 'Retomar com carga de referência' : deload ? 'Deload: sem progressão.' : exhausted ? 'Reserva baixa ou RPE alto: manter quando dentro da faixa.' : increment.evidence.reason],
  };
}
