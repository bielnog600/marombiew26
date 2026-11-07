import { formatSessionHint, formatTargetLoadHint, normalizeTargetLoadPerSet, targetLoadForSet, type SessionRecommendation } from './sessionProgression';
import { isWorkLogSetType, normalizePlanSetType, suggestedLoadForSetType, type PlanSetType } from './setTypes';

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

/** Tipo planejado da série + posição entre as séries de trabalho (opcional). */
export interface SetTypeContext {
  type?: PlanSetType | string | null;
  /** 0-based: índice desta série entre as séries de TRABALHO do plano. */
  workOrdinal?: number;
  exerciseName?: string | null;
}

/**
 * Carga de TRABALHO sugerida (base para aquecimento/preparatória): alvo manual
 * global → maior alvo por série do motor → carga da recomendação → maior carga
 * das séries de trabalho da última sessão. Nunca usa aquecimento/preparatória.
 */
export const suggestedWorkLoad = (
  previous: PreviousExerciseSet[], target: StudentLoadTarget, recommendation: SessionRecommendation | null,
): number | null => {
  const seriesMax = (recommendation?.seriesTargets ?? [])
    .map((s) => positive(s.recommendedLoadKg)).filter((v): v is number => v != null);
  return positive(target.kg)
    ?? (seriesMax.length ? Math.max(...seriesMax) : null)
    ?? recommendationLoad(recommendation)
    ?? (() => {
      const work = previous.filter((r) => isWorkLogSetType(r.set_type)).map((r) => positive(r.weight_kg)).filter((v): v is number => v != null);
      return work.length ? Math.max(...work) : null;
    })();
};

/** Display only: these values must never populate the student's draft. */
export const studentWeightPlaceholder = (
  setNumber: number, previous: PreviousExerciseSet[], target: StudentLoadTarget,
  recommendation: SessionRecommendation | null, ctx?: SetTypeContext,
): string => {
  const manualForSet = targetLoadForSet(target.perSet, setNumber);
  if (ctx?.type != null) {
    const type = normalizePlanSetType(ctx.type);
    if (type !== 'work') {
      // Aquecimento ~50%, preparatória/reconhecimento ~85% da carga de trabalho.
      const value = manualForSet
        ?? suggestedLoadForSetType(suggestedWorkLoad(previous, target, recommendation), type, ctx.exerciseName)
        ?? positive(previous.find((row) => row.set_number === setNumber && normalizePlanSetType(row.set_type) === type)?.weight_kg);
      return value == null ? 'kg' : kgText(value);
    }
    if (ctx.workOrdinal != null) {
      const ordered = [...(recommendation?.seriesTargets ?? [])].sort((a, b) => a.setNumber - b.setNumber);
      const value = manualForSet ?? positive(target.kg)
        ?? positive(ordered[ctx.workOrdinal]?.recommendedLoadKg)
        ?? recommendationLoad(recommendation)
        ?? positive(previous.find((row) => row.set_number === setNumber && isWorkLogSetType(row.set_type))?.weight_kg);
      return value == null ? 'kg' : kgText(value);
    }
  }
  const value = manualForSet ?? positive(target.kg)
    ?? positive(recommendation?.seriesTargets?.find(s => s.setNumber === setNumber)?.recommendedLoadKg)
    ?? recommendationLoad(recommendation)
    ?? positive(previous.find((row) => row.set_number === setNumber)?.weight_kg);
  return value == null ? 'kg' : kgText(value);
};

/** Contexto de tipo para cada série do plano (tipo + ordinal entre as de trabalho). */
export const setTypeContexts = (types: Array<string | null | undefined>, exerciseName?: string | null): SetTypeContext[] => {
  let work = 0;
  return types.map((t) => {
    const type = normalizePlanSetType(t);
    return { type, workOrdinal: type === 'work' ? work++ : undefined, exerciseName };
  });
};

export const lastWorkSetLine = (previous: PreviousExerciseSet[], plannedTypes: string[] = []): string | null => {
  const work = previous.filter((row) =>
    // Log sem tipo (legado) conta como trabalho, exceto quando o plano marcava
    // reconhecimento naquela posição (comportamento anterior preservado).
    (row.set_type ? isWorkLogSetType(row.set_type) : plannedTypes[row.set_number - 1] !== 'recognition')
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
  if (!manual && recommendation?.seriesTargets) return `Sugestão: ${formatSessionHint(recommendation)?.text ?? ""}`;
  const load = positive(target.kg) ?? recommendationLoad(recommendation);
  const hint = manual ?? formatSessionHint(recommendation);
  if (!hint) return null;
  const range = recommendation?.repRange;
  const repText = manual ? reps : range ? `${range.min}–${range.max}` : String(recommendation?.targetReps ?? reps);
  return load == null ? `Sugestão: ${hint.text}`
    : `${manual ? 'Carga alvo' : 'Sugestão'}: ${kgText(load)} kg${repText ? ` · ${repText.replace(/\s*-\s*/g, '–')} reps` : ''}`;
};