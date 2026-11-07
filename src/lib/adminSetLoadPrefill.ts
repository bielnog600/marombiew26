/**
 * Pré-preenchimento de carga no Modo Treino do admin (individual e dupla) —
 * mesma regra para exercício normal e para cada exercício de bi-set/superset:
 * carga alvo do plano > sugestão de progressão > última carga de trabalho;
 * aquecimento 50%, preparatória/reconhecimento 85%. Puro; não registra nada.
 */
import { applyLoadPrefill } from './setLoadPrefill';
import { kindToSetType, type SetPlanKind } from './setTypes';
import { getRecommendationFor, type ProgressionSnapshot } from './sessionProgression';
import { setLoadDefaults, type PreviousExerciseSet } from './studentExerciseLoadPresentation';

export interface AdminPrefillExercise {
  exercise?: string;
  targetLoadKg?: number | null;
  targetLoadPerSet?: unknown;
}
export interface AdminPrefillState {
  plan?: Array<{ kind: SetPlanKind }>;
  exerciseName?: string;
  lastWorkLoad?: number | null;
  lastDate?: string | null;
}

/** Última carga de trabalho como "linha" de histórico (base do pré-preenchimento). */
export const lastWorkRows = (kg: number | null | undefined, date?: string | null): PreviousExerciseSet[] =>
  kg != null && kg > 0 ? [{ set_number: 0, weight_kg: kg, reps: null, set_type: 'work', performed_at: date ?? '' }] : [];

/** Cargas padrão por série do exercício (null = deixa vazio). */
export const adminSetLoadDefaults = (
  ex: AdminPrefillExercise | null | undefined, st: AdminPrefillState, count: number, snapshot?: ProgressionSnapshot | null,
): Array<number | null> => {
  const types = (st.plan ?? []).map((p) => kindToSetType(p.kind));
  const name = st.exerciseName || ex?.exercise || '';
  return setLoadDefaults(
    types, count, lastWorkRows(st.lastWorkLoad, st.lastDate),
    { kg: ex?.targetLoadKg ?? null, perSet: ex?.targetLoadPerSet ?? null },
    getRecommendationFor(snapshot ?? null, name), name,
  );
};

/** Aplica o pré-preenchimento nas séries; `null` quando nada muda. */
export const adminPrefillSets = <T extends { weight: string }>(
  ex: AdminPrefillExercise | null | undefined, st: AdminPrefillState, sets: T[], snapshot?: ProgressionSnapshot | null,
): T[] | null => applyLoadPrefill(
  sets, adminSetLoadDefaults(ex, st, sets.length, snapshot), (st.plan ?? []).map((p) => kindToSetType(p.kind)), 'dot',
);
