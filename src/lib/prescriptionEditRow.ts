import type { WorkoutPlan } from "./workoutSchema";
import type { WorkoutEditChange } from "./workoutPlanDiff";

/** Partes puras do registro de edições de prescrição (sem cliente do app). */
export type PrescriptionEditSource =
  | "manual_plan_editor"
  | "manual_training_mode"
  | "manual_renewal_review";

export type PrescriptionEditOrigin = "manual" | "ai_assisted" | "mixed";

export interface PrescriptionContextSnapshot {
  objective: string | null;
  level: string | null;
  days_per_week: number | null;
  priority_muscles: string[];
  periodization: {
    model: string | null;
    block_type: string | null;
    block_number: number | null;
    week: number | null;
    volume_target: number | null;
  };
  restrictions: {
    status: string | null;
    explicit_restrictions: string[];
    pain_flags: string[];
  };
  recovery: {
    recent_rpe: number | null;
    adherence: number | null;
    data_quality: string | null;
  };
  session_context: {
    day_id: string | null;
    day_name: string | null;
    session_role: "main" | "complementary" | "unknown";
  };
  captured_at: string;
}

export type PrescriptionContextInput = {
  objective?: string | null;
  level?: string | null;
  daysPerWeek?: number | string | null;
  priorityMuscles?: string[] | null;
  periodization?: Partial<PrescriptionContextSnapshot["periodization"]> | null;
  restrictions?: Partial<PrescriptionContextSnapshot["restrictions"]> | null;
  recovery?: Partial<PrescriptionContextSnapshot["recovery"]> | null;
  sessionContext?: Partial<PrescriptionContextSnapshot["session_context"]> | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

/**
 * Congela o contexto NO MOMENTO DO SAVE. Campos sem evidência confiável ficam
 * null/[] — nunca inferimos objetivo, prioridade muscular ou diagnóstico.
 */
export const buildPrescriptionContextSnapshot = (
  input: PrescriptionContextInput = {},
): PrescriptionContextSnapshot => ({
  objective: str(input.objective),
  level: str(input.level),
  days_per_week: num(input.daysPerWeek),
  priority_muscles: list(input.priorityMuscles),
  periodization: {
    model: str(input.periodization?.model),
    block_type: str(input.periodization?.block_type),
    block_number: num(input.periodization?.block_number),
    week: num(input.periodization?.week),
    volume_target: num(input.periodization?.volume_target),
  },
  restrictions: {
    status: str(input.restrictions?.status),
    explicit_restrictions: list(input.restrictions?.explicit_restrictions),
    pain_flags: list(input.restrictions?.pain_flags),
  },
  recovery: {
    recent_rpe: num(input.recovery?.recent_rpe),
    adherence: num(input.recovery?.adherence),
    data_quality: str(input.recovery?.data_quality),
  },
  session_context: {
    day_id: str(input.sessionContext?.day_id),
    day_name: str(input.sessionContext?.day_name),
    session_role: input.sessionContext?.session_role ?? "unknown",
  },
  captured_at: new Date().toISOString(),
});

export interface RecordPrescriptionEditInput {
  before: WorkoutPlan | null | undefined;
  after: WorkoutPlan | null | undefined;
  studentId: string;
  planId: string;
  source: PrescriptionEditSource;
  actionOrigin?: PrescriptionEditOrigin;
  context?: PrescriptionContextInput;
  planVersion?: number | null;
  cycleKey?: string | null;
  /** Injetável em testes. Por padrão usa o usuário autenticado. */
  professorId?: string | null;
}

/** Linha de workout_prescription_edits (pura; compartilhada com o escritório). */
export const buildPrescriptionEditRow = (
  input: RecordPrescriptionEditInput & { professorId: string },
  changes: WorkoutEditChange[],
) => ({
  professor_id: input.professorId,
  student_id: input.studentId,
  plan_id: input.planId,
  plan_version: input.planVersion ?? null,
  cycle_key: input.cycleKey ?? null,
  source: input.source,
  action_origin: input.actionOrigin ?? "manual",
  before_json: input.before,
  after_json: input.after,
  changes,
  context_snapshot: buildPrescriptionContextSnapshot(input.context),
});

