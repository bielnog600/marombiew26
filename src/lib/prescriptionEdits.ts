import { supabase } from "@/integrations/supabase/client";
import type { WorkoutPlan } from "./workoutSchema";
import { diffWorkoutPlans, type WorkoutEditChange } from "./workoutPlanDiff";

/**
 * Etapa 2B — ponto canônico de captura de edições manuais de prescrição.
 *
 * Regras:
 * - Só é chamado APÓS o save do treino ter sido bem sucedido.
 * - Só grava quando o diff estruturado (JSON v2) produz pelo menos 1 evento.
 * - `professor_id` é sempre o usuário autenticado (RLS exige admin + self).
 * - Falha de telemetria NUNCA quebra o save do treino.
 * - Registro é append-only (trigger de imutabilidade no banco).
 */

export {
  buildPrescriptionContextSnapshot,
  buildPrescriptionEditRow,
  type PrescriptionEditSource,
  type PrescriptionEditOrigin,
  type PrescriptionContextSnapshot,
  type PrescriptionContextInput,
  type RecordPrescriptionEditInput,
} from "./prescriptionEditRow";
import { buildPrescriptionEditRow, type RecordPrescriptionEditInput } from "./prescriptionEditRow";

export type RecordPrescriptionEditResult =
  | { recorded: true; changes: WorkoutEditChange[] }
  | { recorded: false; reason: "no_changes" | "missing_data" | "no_professor" | "error"; error?: string };

export const recordWorkoutPrescriptionEdit = async (
  input: RecordPrescriptionEditInput,
): Promise<RecordPrescriptionEditResult> => {
  try {
    const { before, after, studentId, planId, source } = input;
    if (!before || !after || !studentId || !planId) {
      return { recorded: false, reason: "missing_data" };
    }

    const changes = diffWorkoutPlans(before, after);
    if (changes.length === 0) return { recorded: false, reason: "no_changes" };

    let professorId = input.professorId ?? null;
    if (!professorId) {
      const { data } = await supabase.auth.getUser();
      professorId = data?.user?.id ?? null;
    }
    if (!professorId || professorId === studentId) {
      return { recorded: false, reason: "no_professor" };
    }

    const { error } = await supabase
      .from("workout_prescription_edits")
      .insert(buildPrescriptionEditRow({ ...input, professorId }, changes) as never);

    if (error) {
      console.error("[prescription-edits] insert failed", error.message);
      return { recorded: false, reason: "error", error: error.message };
    }
    return { recorded: true, changes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[prescription-edits] unexpected failure", msg);
    return { recorded: false, reason: "error", error: msg };
  }
};
