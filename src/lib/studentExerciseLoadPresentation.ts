import { formatSessionHint, formatTargetLoadHint, normalizeTargetLoadPerSet, targetLoadForSet, type SessionRecommendation } from './sessionProgression';

export interface PreviousExerciseSet {
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  set_type?: string | null;
  performed_at: string;
}

export interface StudentLoadTarget {
  kg?: number | null;
  note?: string | null;
  perSet?: unknown;
}

const positive = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const kgText = (value: number) => String(value).replace('.', ',');

export const recommendationLoad = (recommendation: SessionRecommendation | null): number | null => {
  if (!recommendation || recommendation.bodyweight || recommendation.qualitative || recommendation.action === 'review') return null;
  return positive(recommendation.recommendedLoadKg) ?? positive(recommendation.currentLoadKg);
};

/** Display only: these values must never populate the student's draft. */
export const studentWeightPlaceholder = (
  setNumber: number, previous: PreviousExerciseSet[], target: StudentLoadTarget,
  recommendation: SessionRecommendation | null,
): string => {
  const value = targetLoadForSet(target.perSet, setNumber) ?? positive(target.kg)
    ?? positive(recommendation?.seriesTargets?.find(s => s.setNumber === setNumber)?.recommendedLoadKg)
    ?? recommendationLoad(recommendation)
    ?? positive(previous.find((row) => row.set_number === setNumber)?.weight_kg);
  return value == null ? 'kg' : kgText(value);
};

export const lastWorkSetLine = (previous: PreviousExerciseSet[], plannedTypes: string[] = []): string | null => {
  const work = previous.filter((row) =>
    (row.set_type ? row.set_type === 'work' : plannedTypes[row.set_number - 1] === 'work')
    && positive(row.weight_kg) != null && row.reps != null && row.reps > 0,
  ).sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0));
  const best = work[0];
  if (!best || best.weight_kg == null) return null;
  const date = new Date(best.performed_at);
  if (!Number.isFinite(date.getTime())) return null;
  return `Última vez: ${kgText(best.weight_kg)} kg × ${best.reps} · ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
};

export const studentSuggestionLine = (target: StudentLoadTarget, recommendation: SessionRecommendation | null, reps: string): string | null => {
  const manual = formatTargetLoadHint(target.kg, target.note, target.perSet);
  if (manual && normalizeTargetLoadPerSet(target.perSet)) return `Carga alvo: ${manual.text}`;
  if (!manual && recommendation) return `Sugestão: ${formatSessionHint(recommendation)?.text ?? ""}`;
  const load = positive(target.kg) ?? recommendationLoad(recommendation);
  const hint = manual ?? formatSessionHint(recommendation);
  if (!hint) return null;
  const range = recommendation?.repRange;
  const repText = manual ? reps : range ? `${range.min}–${range.max}` : String(recommendation?.targetReps ?? reps);
  return load == null ? `Sugestão: ${hint.text}`
    : `${manual ? 'Carga alvo' : 'Sugestão'}: ${kgText(load)} kg${repText ? ` · ${repText.replace(/\s*-\s*/g, '–')} reps` : ''}`;
};