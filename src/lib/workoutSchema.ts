import { z } from "zod";
import type { ParsedTrainingDay, ParsedExercise } from "./trainingResultParser";

/**
 * Workout plan v2 — JSON-first source of truth.
 *
 * Architectural rules (do not violate):
 * - JSON is the source of truth, markdown is derived for display/PDF/legacy.
 * - Every day and every exercise carries a stable `id` so edits don't reshuffle.
 * - `restSeconds` is numeric; the legacy `pause` string is kept only as display
 *   fallback for plans coming from markdown.
 * - `exerciseId` is optional and points to `public.exercises.id` when matched.
 */

export const WORKOUT_PLAN_VERSION = "2.0" as const;

const trimmedString = z.string().min(1).transform((v) => v.trim());

const optionalString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v): string => (v == null ? "" : String(v).trim()));

/**
 * Reps / load are kept as strings because trainers use ranges ("8-12"),
 * tempos ("3-1-1"), or letters ("AMRAP"). We do, however, validate that
 * it is a string and trim it so consumers can rely on the shape.
 */
export const WorkoutExerciseSchema = z.object({
  id: z.string().min(1),
  exercise: z.string().min(1),
  exerciseId: optionalString.optional(),
  series: optionalString,
  series2: optionalString.optional(),
  reps: optionalString,
  rir: optionalString.optional(),
  restSeconds: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === "") return undefined;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
    })
    .optional(),
  /** Legacy display fallback ("60s", "1min", "-"). Use restSeconds when present. */
  pause: optionalString.optional(),
  description: optionalString.optional(),
  variation: optionalString.optional(),
  tempo: optionalString.optional(),
  notes: optionalString.optional(),
});

export type WorkoutExercise = z.infer<typeof WorkoutExerciseSchema>;

export const WorkoutDaySchema = z.object({
  id: z.string().min(1),
  day: z.string().min(1),
  focus: optionalString.optional(),
  exercises: z.array(WorkoutExerciseSchema),
});

export type WorkoutDay = z.infer<typeof WorkoutDaySchema>;

export const WorkoutMetadataSchema = z.object({
  goal: optionalString.optional(),
  frequency: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === "") return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    })
    .optional(),
  notes: optionalString.optional(),
  muscleGroups: z.array(z.string()).optional(),
});

export type WorkoutMetadata = z.infer<typeof WorkoutMetadataSchema>;

export const WorkoutPlanSchema = z.object({
  version: z.literal(WORKOUT_PLAN_VERSION).or(z.string()),
  type: z.literal("workout"),
  metadata: WorkoutMetadataSchema.default({}),
  days: z.array(WorkoutDaySchema),
});

export type WorkoutPlan = z.infer<typeof WorkoutPlanSchema>;

/** Stable ID helper — uses crypto.randomUUID when available, falls back otherwise. */
export const newId = (prefix = "id"): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = typeof crypto !== "undefined" ? crypto : undefined;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* ignore */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const parsePauseToSeconds = (raw?: string): number | undefined => {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-" || s === "—") return undefined;
  const min = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|m)\b/);
  if (min) return Math.round(Number(min[1].replace(",", ".")) * 60);
  const sec = s.match(/^(\d+)\s*(?:s|seg|segundos?|["''”″`])?$/);
  if (sec) return Number(sec[1]);
  return undefined;
};

/** Convert legacy markdown-parsed days to the v2 JSON shape (with stable ids). */
export const parsedDaysToWorkoutPlan = (
  days: ParsedTrainingDay[],
  metadata: Partial<WorkoutMetadata> = {},
): WorkoutPlan => ({
  version: WORKOUT_PLAN_VERSION,
  type: "workout",
  metadata: { ...metadata },
  days: days.map((d) => ({
    id: newId("day"),
    day: d.day,
    focus: "",
    exercises: (d.exercises || []).map((e: ParsedExercise) => ({
      id: newId("ex"),
      exercise: e.exercise,
      series: e.series || "",
      series2: e.series2 || "",
      reps: e.reps || "",
      rir: e.rir || "",
      pause: e.pause || "",
      restSeconds: parsePauseToSeconds(e.pause),
      description: e.description || "",
      variation: e.variation || "",
    })),
  })),
});

/** Back-compat: project a v2 plan to the legacy ParsedTrainingDay[] shape. */
export const workoutPlanToParsedDays = (plan: WorkoutPlan): ParsedTrainingDay[] =>
  plan.days.map((d): ParsedTrainingDay => ({
    day: String(d.day),
    exercises: d.exercises.map((e): ParsedExercise => ({
      exercise: String(e.exercise),
      series: e.series || "",
      series2: e.series2 || "",
      reps: e.reps || "",
      rir: e.rir || "",
      pause: e.pause || (e.restSeconds ? `${e.restSeconds}s` : ""),
      description: e.description || "",
      variation: e.variation || "",
    })),
  }));

/**
 * Best-effort normalization for plans that already live in `conteudo_json`
 * but were written by an older shape (v1 without ids, missing fields).
 * Never throws — fills defaults and assigns ids so downstream code is safe.
 */
export const normalizeWorkoutPlan = (raw: unknown): WorkoutPlan | null => {
  if (!raw || typeof raw !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  if (r.type !== "workout" || !Array.isArray(r.days)) return null;
  const normalized: WorkoutPlan = {
    version: typeof r.version === "string" ? r.version : WORKOUT_PLAN_VERSION,
    type: "workout",
    metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : {},
    days: r.days
      .filter((d: unknown) => d && typeof d === "object")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((d: any) => ({
        id: typeof d.id === "string" && d.id ? d.id : newId("day"),
        day: String(d.day || "Treino").trim(),
        focus: typeof d.focus === "string" ? d.focus : "",
        exercises: Array.isArray(d.exercises)
          ? d.exercises
              .filter((e: unknown) => e && typeof e === "object")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((e: any) => ({
                id: typeof e.id === "string" && e.id ? e.id : newId("ex"),
                exercise: String(e.exercise || "").trim(),
                exerciseId: typeof e.exerciseId === "string" ? e.exerciseId : undefined,
                series: String(e.series ?? "").trim(),
                series2: String(e.series2 ?? "").trim(),
                reps: String(e.reps ?? "").trim(),
                rir: String(e.rir ?? "").trim(),
                pause: String(e.pause ?? "").trim(),
                restSeconds:
                  typeof e.restSeconds === "number" && Number.isFinite(e.restSeconds)
                    ? e.restSeconds
                    : parsePauseToSeconds(e.pause),
                description: String(e.description ?? "").trim(),
                variation: String(e.variation ?? "").trim(),
                tempo: typeof e.tempo === "string" ? e.tempo : undefined,
                notes: typeof e.notes === "string" ? e.notes : undefined,
              }))
              .filter((e: WorkoutExercise) => e.exercise.length > 0)
          : [],
      }))
      .filter((d: WorkoutDay) => d.day.length > 0),
  };
  return normalized;
};

/** Strict validation. Returns parsed (defaulted) plan or an error. */
export const validateWorkoutPlan = (
  raw: unknown,
): { success: true; data: WorkoutPlan } | { success: false; error: string } => {
  const normalized = normalizeWorkoutPlan(raw);
  if (!normalized) return { success: false, error: "Estrutura JSON inválida para treino" };
  const parsed = WorkoutPlanSchema.safeParse(normalized);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  if (parsed.data.days.length === 0) {
    return { success: false, error: "Plano sem dias de treino" };
  }
  const hasExercise = parsed.data.days.some((d) => d.exercises.length > 0);
  if (!hasExercise) return { success: false, error: "Plano sem exercícios válidos" };
  return { success: true, data: parsed.data };
};