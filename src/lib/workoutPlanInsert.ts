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


/**
 * Monta (sem gravar) o UPDATE do botão Salvar do editor de treino
 * (saveWorkoutPlanJSON). Compartilhado com office-gerar → publicar de um ajuste.
 * `fase` é NOT NULL: nunca sobrescreve com null/undefined.
 */
export const buildWorkoutPlanUpdatePayload = (
  json: WorkoutPlan,
  extras: SaveExtras = {},
):
  | { success: true; updates: Record<string, unknown>; markdown: string; json: WorkoutPlan }
  | { success: false; error: string } => {
  const validation = validateWorkoutPlan(removeEmptyDays(json));
  if (!validation.success) {
    return { success: false, error: (validation as { error: string }).error };
  }
  const markdown = workoutPlanToMarkdown(validation.data);
  const { periodization, ...rest } = extras;
  const clean: Record<string, unknown> = { ...rest };
  if (clean.fase === null || clean.fase === undefined) delete clean.fase;
  if (clean.fase_inicio_data === undefined) delete clean.fase_inicio_data;
  if (periodization) Object.assign(clean, periodization);
  const updates: Record<string, unknown> = {
    conteudo: markdown,
    conteudo_json: validation.data as unknown as Json,
    migration_status: "completed",
    ...clean,
  };
  return { success: true, updates, markdown, json: validation.data };
};
