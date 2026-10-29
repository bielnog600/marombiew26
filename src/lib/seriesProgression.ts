import type { QuantitativeInput, QuantitativeRecommendation } from './quantitativeProgression';
import { parseRepRange, setRoleOf } from './weeklyProgression';
import { resolveLoadIncrement } from './loadIncrement';
import { isNoLoadExercise } from './exerciseLoadType';

export interface SeriesLoadTarget {
  setNumber: number;
  currentLoadKg: number | null;
  recommendedLoadKg: number | null;
  targetReps: number;
  action: 'increase_load' | 'increase_reps' | 'maintain' | 'reduce_load';
}

/** All decisions use real principal sets and their own prescription. No synthesized best set. */
export function computeSeriesProgression(input: QuantitativeInput): QuantitativeRecommendation {
  const p = input.performance;
  const recent = (input.recentLogs ?? []).filter(l => setRoleOf(l) === 'primary' && Number(l.reps) > 0)
    .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
  const previous = (input.previousLogs ?? []).filter(l => setRoleOf(l) === 'primary');
  const history = [...(input.historyLogs ?? []), ...recent];
  const increment = resolveLoadIncrement({ historicalWorkingSets: history, now: input.now });
  const last = recent[recent.length - 1];
  const rir = last?.rir ?? p.finalWorkingRir ?? (recent.length === 0 ? p.bestSet?.rir : null) ?? null;
  const rpe = input.sessionAvgRpe ?? null;
  const deload = input.activePhase === 'deload';
  const exhausted = (rir != null && rir <= 1) || (rpe != null && rpe >= 9);
  const rangeFor = (number: number, index: number) => parseRepRange(
    input.prescribedSets?.find(s => s.setNumber === number)?.reps
    ?? input.setSchemeTargets?.[index]
    ?? input.plannedRepsText?.split('+').pop()?.split('/')[index]
    ?? input.plannedRepsText?.split('+').pop()
  ) ?? p.repRange ?? null;
  const sets = recent.length ? recent : p.bestSet ? [{
    weight_kg: p.bestSet.weightKg, reps: p.bestSet.reps, set_number: p.bestSet.setNumber ?? 1,
    performed_at: p.bestSet.performedAt, rir: p.bestSet.rir,
  }] : [];
  const allTop = sets.length > 0 && sets.every((s, i) => {
    const range = rangeFor(s.set_number ?? i + 1, i);
    return range != null && Number(s.reps) >= range.max;
  }) && (!input.prescribedSets?.length || sets.length >= input.prescribedSets.length);
  const repeatedTop = allTop && sets.every((s, i) => {
    const old = previous.find(l => l.set_number === s.set_number);
    const range = rangeFor(s.set_number ?? i + 1, i);
    return !!old && !!range && Number(old.reps) >= range.max && Number(old.weight_kg) >= Number(s.weight_kg);
  });
  const room = !exhausted && (rir != null ? rir >= 2 : repeatedTop || (allTop && rpe != null && rpe <= 6));
  const observed = [...new Set(increment.evidence.loadSeriesKg)].sort((a, b) => a - b);
  const series: SeriesLoadTarget[] = sets.map((s, i): SeriesLoadTarget => {
    const current = Number(s.weight_kg) > 0 ? Number(s.weight_kg) : null;
    const reps = Number(s.reps);
    const n = s.set_number ?? i + 1;
    const range = rangeFor(n, i);
    const base: SeriesLoadTarget = { setNumber: n, currentLoadKg: current, recommendedLoadKg: current, targetReps: reps, action: 'maintain' };
    if (deload || exhausted || isNoLoadExercise(p.exerciseName)) return base;
    if (range && reps < range.min) return { ...base, targetReps: range.min };
    const candidate = current != null ? observed.find(w => w > current) ?? (increment.incrementKg ? Math.round((current + increment.incrementKg) * 1000) / 1000 : null) : null;
    const largeStep = candidate != null && current != null && (candidate - current) / current > 0.1 + 1e-9;
    const beyondTop = sets.every((row, index) => {
      const ownRange = rangeFor(row.set_number ?? index + 1, index);
      return !!ownRange && Number(row.reps) > ownRange.max;
    });
    if (allTop && room && candidate != null && (!largeStep || beyondTop)) {
      return { ...base, recommendedLoadKg: candidate, targetReps: range?.min ?? reps, action: 'increase_load' };
    }
    if (p.nextAction === 'reduce_load' && current != null) {
      const lower = [...observed].reverse().find(w => w < current);
      if (lower != null) return { ...base, recommendedLoadKg: lower, targetReps: range?.min ?? reps, action: 'reduce_load' };
    }
    if (range && (reps < range.max || (largeStep && reps >= range.max))) {
      return { ...base, targetReps: largeStep ? reps + 1 : Math.min(reps + 1, range.max), action: 'increase_reps' };
    }
    return base;
  });
  const first = series[0];
  const action = series.some(s => s.action === 'increase_load') ? 'increase_load'
    : series.some(s => s.action === 'reduce_load') ? 'reduce_load'
    : series.some(s => s.action === 'increase_reps') ? 'increase_reps' : first ? 'maintain' : 'review';
  return {
    exerciseName: p.exerciseName, sourceAction: p.nextAction, action,
    currentLoadKg: first?.currentLoadKg ?? null, recommendedLoadKg: first?.recommendedLoadKg ?? null,
    currentReps: sets[0] ? Number(sets[0].reps) : null, targetReps: first?.targetReps ?? null,
    workingSetTargets: series.length > 1 ? series.map(s => s.targetReps) : null,
    totalRepsTarget: series.length ? series.reduce((sum, s) => sum + s.targetReps, 0) : null,
    seriesTargets: series, repRange: p.repRange ?? null,
    incrementKg: increment.incrementKg, incrementSource: increment.source, incrementConfidence: increment.confidence,
    relativeChangePct: first?.currentLoadKg && first.recommendedLoadKg ? (first.recommendedLoadKg - first.currentLoadKg) / first.currentLoadKg : null,
    confidence: first ? increment.confidence : 'low', qualitative: !first,
    basis: deload ? 'deload_sem_sobrecarga' : first ? 'metas_por_serie' : 'sem_base_quantificavel',
    reasons: [deload ? 'Deload: sem progressão.' : exhausted ? 'Reserva baixa ou RPE alto: manter.' : increment.evidence.reason],
  };
}