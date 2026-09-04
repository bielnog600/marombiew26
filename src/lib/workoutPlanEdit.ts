import type { ParsedExercise, ParsedTrainingDay } from "./trainingResultParser";
import { newId, type WorkoutDay, type WorkoutExercise, type WorkoutPlan } from "./workoutSchema";

/**
 * Edição JSON-first do WorkoutPlan v2.
 *
 * Regras (Etapa 2A — identidade das edições):
 * - `conteudo_json` é a fonte de verdade; markdown é derivado.
 * - `exercise.id` é a identidade estável do SLOT de prescrição.
 * - `exerciseId` é o exercício do catálogo (`public.exercises.id`).
 * - Reorder move a identidade junto com o exercício.
 * - Alterar campos preserva o id; adicionar cria id novo; remover remove só aquele id.
 * - Substituição no mesmo slot preserva o id e atualiza `exercise`/`exerciseId`.
 * - Nada aqui passa por markdown -> parse -> JSON (isso regeneraria ids).
 */

export const parsePauseToSeconds = (raw?: string): number | undefined => {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-" || s === "—") return undefined;
  const min = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|m)\b/);
  if (min) return Math.round(Number(min[1].replace(",", ".")) * 60);
  const sec = s.match(/^(\d+)/);
  if (sec) return Number(sec[1]);
  return undefined;
};

const sameName = (a?: string, b?: string) =>
  String(a || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim() ===
  String(b || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Mescla um dia editado (shape legado `ParsedTrainingDay`, mas carregando ids)
 * de volta no exercício correspondente do plano v2, preservando identidade.
 */
export const mergeParsedExerciseIntoPlan = (
  parsed: ParsedExercise,
  previous?: WorkoutExercise,
): WorkoutExercise => {
  const name = String(parsed.exercise || "").trim();
  const replaced = !!previous && !sameName(previous.exercise, name);

  // exerciseId: usa o explícito da UI; se o nome mudou e nada foi informado,
  // não herda o exerciseId antigo (evita metadado incompatível).
  const exerciseId = parsed.exerciseId !== undefined
    ? parsed.exerciseId || undefined
    : replaced
      ? undefined
      : previous?.exerciseId;

  return {
    id: previous?.id || parsed.id || newId("ex"),
    exercise: name,
    exerciseId,
    series: parsed.series || "",
    series2: parsed.series2 || "",
    reps: parsed.reps || "",
    rir: parsed.rir || "",
    pause: parsed.pause || "",
    restSeconds: parsePauseToSeconds(parsed.pause),
    description: parsed.description || "",
    variation: parsed.variation || "",
    // Campos que não existem no shape legado seguem preservados no MESMO slot.
    tempo: previous?.tempo,
    notes: previous?.notes,
    setScheme: parsed.setScheme as WorkoutExercise["setScheme"],
  };
};

/**
 * Aplica um dia editado ao plano. O dia alvo é localizado por `day.id`;
 * fallback por índice apenas quando o dia editado não carrega id (legacy).
 */
export const applyParsedDayToPlan = (
  plan: WorkoutPlan,
  updatedDay: ParsedTrainingDay,
  dayIndexFallback?: number,
): WorkoutPlan => {
  let dayIdx = updatedDay.id ? plan.days.findIndex((d) => d.id === updatedDay.id) : -1;
  if (dayIdx < 0 && typeof dayIndexFallback === "number") dayIdx = dayIndexFallback;
  if (dayIdx < 0 || dayIdx >= plan.days.length) return plan;

  const prevDay = plan.days[dayIdx];
  const byId = new Map(prevDay.exercises.map((e) => [e.id, e]));

  const exercises = (updatedDay.exercises || [])
    .map((parsed) => mergeParsedExerciseIntoPlan(parsed, parsed.id ? byId.get(parsed.id) : undefined))
    .filter((e) => e.exercise.length > 0);

  const nextDay: WorkoutDay = {
    ...prevDay,
    day: updatedDay.day || prevDay.day,
    exercises,
  };

  return { ...plan, days: plan.days.map((d, i) => (i === dayIdx ? nextDay : d)) };
};

/** Substituição explícita de exercício num slot (preserva `id`). */
export const replacePlanExercise = (
  plan: WorkoutPlan,
  slotId: string,
  next: { exercise: string; exerciseId?: string },
): WorkoutPlan => ({
  ...plan,
  days: plan.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) =>
      e.id === slotId
        ? { ...e, exercise: next.exercise, exerciseId: next.exerciseId || undefined }
        : e,
    ),
  })),
});
