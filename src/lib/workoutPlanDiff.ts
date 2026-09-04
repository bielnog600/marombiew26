import type { SetScheme, WorkoutExercise, WorkoutPlan } from "./workoutSchema";
import { parsePauseToSeconds } from "./workoutPlanEdit";

/**
 * Etapa 2B — diff estruturado e determinístico entre dois WorkoutPlan v2.
 *
 * Regras (não violar):
 * - Identidade vem de `day.id` e `exercise.id`. Nunca de nome/índice.
 * - Reorder NUNCA vira remove + add.
 * - Substituição no mesmo slot NUNCA vira remove + add (é EXERCISE_REPLACED).
 * - Campos inalterados não geram evento (evidência neutra).
 * - Função pura: sem I/O, sem Date.now(), sem randomicidade (o
 *   `reorder_operation_id` é determinístico por dia).
 */

export type WorkoutEditChangeType =
  | "EXERCISE_ADDED"
  | "EXERCISE_REMOVED"
  | "EXERCISE_REPLACED"
  | "EXERCISE_REORDERED"
  | "SETS_CHANGED"
  | "RECOGNITION_SETS_CHANGED"
  | "REPS_CHANGED"
  | "PER_SET_REPS_CHANGED"
  | "RIR_CHANGED"
  | "REST_CHANGED"
  | "VARIATION_CHANGED"
  | "DESCRIPTION_CHANGED"
  | "TEMPO_CHANGED"
  | "NOTES_CHANGED"
  | "DAY_CHANGED";

export interface WorkoutEditChangeMetadata {
  exercise_function?: string | null;
  exercise_family?: string | null;
  exercise_role?: "anchor" | "secondary" | "accessory" | "unknown";
  reorder_operation_id?: string;
}

export interface WorkoutEditChange {
  type: WorkoutEditChangeType;
  day_id: string | null;
  day_name: string | null;
  exercise_id: string | null;
  exercise_before: string | null;
  exercise_after: string | null;
  position_before: number | null;
  position_after: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: WorkoutEditChangeMetadata;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const restSecondsOf = (e: WorkoutExercise): number | null => {
  if (typeof e.restSeconds === "number" && Number.isFinite(e.restSeconds)) return e.restSeconds;
  const parsed = parsePauseToSeconds(e.pause);
  return typeof parsed === "number" ? parsed : null;
};

const intOf = (v: unknown): number => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Séries de reconhecimento e de trabalho, normalizadas a partir de series/series2. */
const setCounts = (e: WorkoutExercise): { recon: number; work: number } => {
  const s1 = intOf(e.series);
  const s2 = intOf(e.series2);
  if (s2 > 0) return { recon: s1, work: s2 };
  return { recon: 0, work: s1 };
};

const perSetSignature = (scheme?: SetScheme | null): string | null => {
  if (!scheme || !Array.isArray(scheme.sets) || scheme.sets.length === 0) return null;
  return [...scheme.sets]
    .sort((a, b) => (a.set_number || 0) - (b.set_number || 0))
    .map((s) => `${s.set_number}:${s.set_type}:${norm(s.target_reps)}`)
    .join("|");
};

const schemeSnapshot = (e: WorkoutExercise) => ({
  series: e.series || "",
  series2: e.series2 || "",
  setScheme: e.setScheme ?? null,
});

const baseChange = (
  type: WorkoutEditChangeType,
  ctx: {
    dayId: string | null;
    dayName: string | null;
    exerciseId: string | null;
    before?: WorkoutExercise;
    after?: WorkoutExercise;
    positionBefore?: number | null;
    positionAfter?: number | null;
  },
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: WorkoutEditChangeMetadata = {},
): WorkoutEditChange => ({
  type,
  day_id: ctx.dayId,
  day_name: ctx.dayName,
  exercise_id: ctx.exerciseId,
  exercise_before: ctx.before?.exercise ?? null,
  exercise_after: ctx.after?.exercise ?? null,
  position_before: ctx.positionBefore ?? null,
  position_after: ctx.positionAfter ?? null,
  before,
  after,
  metadata: { exercise_role: "unknown", ...metadata },
});

const matchDays = (before: WorkoutPlan, after: WorkoutPlan) => {
  const pairs: Array<{ before?: WorkoutPlan["days"][number]; after?: WorkoutPlan["days"][number] }> = [];
  const beforeById = new Map(before.days.map((d) => [d.id, d]));
  const usedBefore = new Set<string>();

  after.days.forEach((ad) => {
    let bd = beforeById.get(ad.id);
    if (!bd) bd = before.days.find((d) => !usedBefore.has(d.id) && norm(d.day) === norm(ad.day));
    if (bd) usedBefore.add(bd.id);
    pairs.push({ before: bd, after: ad });
  });
  before.days.forEach((bd) => {
    if (!usedBefore.has(bd.id) && !after.days.some((ad) => ad.id === bd.id)) {
      pairs.push({ before: bd, after: undefined });
    }
  });
  return pairs;
};

/** Diff determinístico entre dois planos v2. Retorna [] quando semanticamente iguais. */
export const diffWorkoutPlans = (before: WorkoutPlan, after: WorkoutPlan): WorkoutEditChange[] => {
  const changes: WorkoutEditChange[] = [];

  matchDays(before, after).forEach(({ before: bDay, after: aDay }) => {
    const dayId = aDay?.id ?? bDay?.id ?? null;
    const dayName = aDay?.day ?? bDay?.day ?? null;

    // Dia removido inteiro -> todos os exercícios contam como removidos.
    if (bDay && !aDay) {
      bDay.exercises.forEach((ex, i) => {
        changes.push(
          baseChange(
            "EXERCISE_REMOVED",
            { dayId: bDay.id, dayName: bDay.day, exerciseId: ex.id, before: ex, positionBefore: i + 1 },
            { exercise: ex.exercise, exerciseId: ex.exerciseId ?? null },
            null,
          ),
        );
      });
      return;
    }
    if (!aDay) return;

    if (bDay && norm(bDay.day) !== norm(aDay.day)) {
      changes.push(
        baseChange(
          "DAY_CHANGED",
          { dayId: aDay.id, dayName: aDay.day, exerciseId: null },
          { day: bDay.day },
          { day: aDay.day },
        ),
      );
    }

    const beforeExercises = bDay?.exercises ?? [];
    const beforeIndex = new Map(beforeExercises.map((e, i) => [e.id, { ex: e, pos: i + 1 }]));
    const afterIds = new Set(aDay.exercises.map((e) => e.id));

    // Removidos
    beforeExercises.forEach((ex, i) => {
      if (afterIds.has(ex.id)) return;
      changes.push(
        baseChange(
          "EXERCISE_REMOVED",
          { dayId: aDay.id, dayName: aDay.day, exerciseId: ex.id, before: ex, positionBefore: i + 1 },
          { exercise: ex.exercise, exerciseId: ex.exerciseId ?? null },
          null,
        ),
      );
    });

    const reorderOperationId = `reorder:${aDay.id}`;

    aDay.exercises.forEach((aEx, idx) => {
      const posAfter = idx + 1;
      const prev = beforeIndex.get(aEx.id);

      if (!prev) {
        changes.push(
          baseChange(
            "EXERCISE_ADDED",
            { dayId: aDay.id, dayName: aDay.day, exerciseId: aEx.id, after: aEx, positionAfter: posAfter },
            null,
            { exercise: aEx.exercise, exerciseId: aEx.exerciseId ?? null },
          ),
        );
        return;
      }

      const bEx = prev.ex;
      const posBefore = prev.pos;
      const ctx = {
        dayId: aDay.id,
        dayName: aDay.day,
        exerciseId: aEx.id,
        before: bEx,
        after: aEx,
        positionBefore: posBefore,
        positionAfter: posAfter,
      };

      if (posBefore !== posAfter) {
        changes.push(
          baseChange("EXERCISE_REORDERED", ctx, { position: posBefore }, { position: posAfter }, {
            reorder_operation_id: reorderOperationId,
          }),
        );
      }

      const replaced =
        norm(bEx.exercise) !== norm(aEx.exercise) ||
        (!!bEx.exerciseId && !!aEx.exerciseId && bEx.exerciseId !== aEx.exerciseId);

      if (replaced) {
        // Substituição no mesmo slot: um único evento, sem remove+add
        // e sem inflar com diffs de prescrição do exercício anterior.
        changes.push(
          baseChange(
            "EXERCISE_REPLACED",
            ctx,
            { exercise: bEx.exercise, exerciseId: bEx.exerciseId ?? null },
            { exercise: aEx.exercise, exerciseId: aEx.exerciseId ?? null },
          ),
        );
        return;
      }

      // --- Séries ---
      const bc = setCounts(bEx);
      const ac = setCounts(aEx);
      if (bc.recon !== ac.recon) {
        changes.push(
          baseChange("RECOGNITION_SETS_CHANGED", ctx, schemeSnapshot(bEx), schemeSnapshot(aEx)),
        );
      } else if (bc.work !== ac.work) {
        changes.push(baseChange("SETS_CHANGED", ctx, schemeSnapshot(bEx), schemeSnapshot(aEx)));
      }

      // --- Reps (per-set tem prioridade sobre texto) ---
      const bMode = bEx.setScheme?.mode ?? null;
      const aMode = aEx.setScheme?.mode ?? null;
      const bSig = perSetSignature(bEx.setScheme);
      const aSig = perSetSignature(aEx.setScheme);
      const perSetInvolved = bMode === "per_set" || aMode === "per_set";

      if (perSetInvolved && (bSig !== aSig || bMode !== aMode)) {
        changes.push(
          baseChange(
            "PER_SET_REPS_CHANGED",
            ctx,
            { reps: bEx.reps || "", setScheme: bEx.setScheme ?? null },
            { reps: aEx.reps || "", setScheme: aEx.setScheme ?? null },
          ),
        );
      } else if (norm(bEx.reps) !== norm(aEx.reps)) {
        changes.push(baseChange("REPS_CHANGED", ctx, { reps: bEx.reps || "" }, { reps: aEx.reps || "" }));
      }

      if (norm(bEx.rir) !== norm(aEx.rir)) {
        changes.push(baseChange("RIR_CHANGED", ctx, { rir: bEx.rir || "" }, { rir: aEx.rir || "" }));
      }

      const bRest = restSecondsOf(bEx);
      const aRest = restSecondsOf(aEx);
      if (bRest !== aRest) {
        changes.push(
          baseChange(
            "REST_CHANGED",
            ctx,
            { restSeconds: bRest, pause: bEx.pause || "" },
            { restSeconds: aRest, pause: aEx.pause || "" },
          ),
        );
      }

      if (norm(bEx.variation) !== norm(aEx.variation)) {
        changes.push(
          baseChange("VARIATION_CHANGED", ctx, { variation: bEx.variation || "" }, { variation: aEx.variation || "" }),
        );
      }
      if (norm(bEx.description) !== norm(aEx.description)) {
        changes.push(
          baseChange(
            "DESCRIPTION_CHANGED",
            ctx,
            { description: bEx.description || "" },
            { description: aEx.description || "" },
          ),
        );
      }
      if (norm(bEx.tempo) !== norm(aEx.tempo)) {
        changes.push(baseChange("TEMPO_CHANGED", ctx, { tempo: bEx.tempo || "" }, { tempo: aEx.tempo || "" }));
      }
      if (norm(bEx.notes) !== norm(aEx.notes)) {
        changes.push(baseChange("NOTES_CHANGED", ctx, { notes: bEx.notes || "" }, { notes: aEx.notes || "" }));
      }
    });
  });

  return changes;
};

/** true quando os dois planos são semanticamente equivalentes (nenhum evento). */
export const workoutPlansAreEquivalent = (before: WorkoutPlan, after: WorkoutPlan): boolean =>
  diffWorkoutPlans(before, after).length === 0;
