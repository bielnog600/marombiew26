/**
 * Etapa 3 — acesso ao Professor Prescription Profile no frontend.
 *
 * NÃO duplica lógica: a implementação canônica é
 * `supabase/functions/_shared/professorPrescriptionProfile.ts`.
 * Aqui existem apenas o LOADER (I/O) e reexports de tipos/função pura.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  buildProfessorPrescriptionProfile,
  type ProfessorPrescriptionProfile,
  type WorkoutPrescriptionEditRecord,
} from "../../supabase/functions/_shared/professorPrescriptionProfile";

export {
  buildProfessorPrescriptionProfile,
  doesExerciseMatchPriority,
  deriveExerciseRole,
  deriveExerciseFunction,
} from "../../supabase/functions/_shared/professorPrescriptionProfile";

export type {
  ProfessorPrescriptionProfile,
  ProfessorPreference,
  PreferenceCategory,
  PreferenceContext,
  PreferenceEvidence,
  WorkoutPrescriptionEditRecord,
} from "../../supabase/functions/_shared/professorPrescriptionProfile";

/**
 * Carrega as edições do professor. A RLS já restringe leitura a admins;
 * nenhum aluno consegue montar perfil de professor.
 */
export const loadProfessorPrescriptionEdits = async (
  professorId: string,
  limit = 500,
): Promise<WorkoutPrescriptionEditRecord[]> => {
  const { data, error } = await supabase
    .from("workout_prescription_edits")
    .select(
      "id, professor_id, student_id, plan_id, plan_version, cycle_key, source, action_origin, changes, context_snapshot, exclude_from_profile, created_at",
    )
    .eq("professor_id", professorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[professor-profile] load failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as WorkoutPrescriptionEditRecord[];
};

/** Inspeção DEV-ONLY: carrega + calcula. Sem UI, sem exposição a alunos. */
export const inspectProfessorPrescriptionProfile = async (
  professorId: string,
): Promise<ProfessorPrescriptionProfile> => {
  const edits = await loadProfessorPrescriptionEdits(professorId);
  return buildProfessorPrescriptionProfile(edits, { professorId });
};
