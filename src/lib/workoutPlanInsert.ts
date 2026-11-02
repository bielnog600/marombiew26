import type { Json } from "@/integrations/supabase/types";
import { validateWorkoutPlan, type WorkoutPlan } from "./workoutSchema";
import { workoutPlanToMarkdown } from "./workoutMarkdownSerializer";
import { removeEmptyDays } from "./workoutEmptyDays";
import { calculateCurrentPhase, getPhaseByMonthDay } from "./trainingPhase";
import type { SaveExtras } from "./workoutPlanRepo";

/**
 * Monta (sem gravar) a linha de ai_plans de um treino novo. Compartilhado com
 * a edge function office-gerar para que "publicar" grave exatamente o mesmo.
 */
export const buildWorkoutPlanInsertPayload = (
  studentId: string,
  json: WorkoutPlan,
  extras: SaveExtras & { tipo?: string; cycle_status?: string } = {},
):
  | { success: true; payload: Record<string, unknown>; markdown: string; json: WorkoutPlan }
  | { success: false; error: string } => {
  // Dia vazio nunca é gravado (nem no JSON nem no markdown).
  const validation = validateWorkoutPlan(removeEmptyDays(json));
  if (!validation.success) {
    return { success: false, error: (validation as { error: string }).error };
  }
  const markdown = workoutPlanToMarkdown(validation.data);
  const insertPayload: Record<string, unknown> = {
    student_id: studentId,
    tipo: extras.tipo ?? "treino",
    titulo: extras.titulo ?? `Treino - ${new Date().toLocaleDateString("pt-BR")}`,
    conteudo: markdown,
    conteudo_json: validation.data as unknown as Json,
    migration_status: "completed",
    cycle_status: extras.cycle_status ?? "em_dia",
    // `fase` is NOT NULL on ai_plans. Always derive a fallback so insert never fails.
    fase:
      extras.fase ??
      calculateCurrentPhase(extras.fase_inicio_data ?? null) ??
      getPhaseByMonthDay(),
    fase_inicio_data: extras.fase_inicio_data ?? new Date().toISOString().slice(0, 10),
    ...(extras.periodization ?? {}),
  };
  return { success: true, payload: insertPayload, markdown, json: validation.data };
};

