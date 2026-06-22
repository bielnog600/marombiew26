import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  parsedDaysToWorkoutPlan,
  validateWorkoutPlan,
  type WorkoutPlan,
} from "./workoutSchema";
import { workoutPlanToMarkdown } from "./workoutMarkdownSerializer";
import { parseTrainingSections } from "./trainingResultParser";
import { calculateCurrentPhase, getPhaseByMonthDay } from "./trainingPhase";

/**
 * Single point of persistence for workout plans.
 *
 * Hard rules — do not bypass:
 * 1. `conteudo_json` is NEVER set to null on an edit.
 * 2. Saves are JSON-first: we validate the JSON, then derive markdown from it.
 * 3. Markdown-only edits (legacy editor) are converted to JSON before saving;
 *    if conversion fails we keep the previous `conteudo_json` untouched and
 *    only update markdown plus flag `migration_status = 'manual_fix_needed'`.
 * 4. `migration_status` is telemetry only — readers must not gate on it.
 */

export type SaveExtras = {
  fase?: string | null;
  fase_inicio_data?: string | null;
  titulo?: string;
};

export type SaveResult =
  | { success: true; markdown: string; json: WorkoutPlan }
  | { success: false; error: string };

export type CreateResult =
  | { success: true; id: string; markdown: string; json: WorkoutPlan }
  | { success: false; error: string };

/**
 * Sanitize SaveExtras before merging into an UPDATE payload.
 * `fase` is NOT NULL on ai_plans — never overwrite it with null/undefined.
 * Same protection for `fase_inicio_data` when undefined.
 */
const sanitizeExtras = (extras: SaveExtras): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...extras };
  if (out.fase === null || out.fase === undefined) delete out.fase;
  if (out.fase_inicio_data === undefined) delete out.fase_inicio_data;
  return out;
};

/** Save a workout plan from a validated v2 JSON. Markdown is derived. */
export const saveWorkoutPlanJSON = async (
  planId: string,
  json: WorkoutPlan,
  extras: SaveExtras = {},
): Promise<SaveResult> => {
  const validation = validateWorkoutPlan(json);
  if (!validation.success) {
    return { success: false, error: (validation as { error: string }).error };
  }
  const markdown = workoutPlanToMarkdown(validation.data);
  const updates: Record<string, unknown> = {
    conteudo: markdown,
    conteudo_json: validation.data as unknown as Json,
    migration_status: "completed",
    ...sanitizeExtras(extras),
  };
  const { error } = await supabase.from("ai_plans").update(updates).eq("id", planId);
  if (error) return { success: false, error: error.message };
  return { success: true, markdown, json: validation.data };
};

/**
 * Insert a brand-new workout plan from a validated v2 JSON.
 * Same guarantees as saveWorkoutPlanJSON: never persists invalid data,
 * never inserts with conteudo_json null when JSON is valid.
 */
export const createWorkoutPlanJSON = async (
  studentId: string,
  json: WorkoutPlan,
  extras: SaveExtras & { tipo?: string; cycle_status?: string } = {},
): Promise<CreateResult> => {
  const validation = validateWorkoutPlan(json);
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
    fase: extras.fase ?? null,
    fase_inicio_data: extras.fase_inicio_data ?? null,
  };
  const { data, error } = await supabase
    .from("ai_plans")
    .insert(insertPayload as any)
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id, markdown, json: validation.data };
};

/**
 * Save a markdown-edited plan WITHOUT destroying `conteudo_json`.
 * Strategy:
 *   - Parse markdown -> v2 JSON. If it produces at least one valid day,
 *     persist BOTH markdown and JSON (JSON becomes the new source of truth).
 *   - If parsing fails, persist only markdown, keep existing `conteudo_json`,
 *     and flag the row for manual review. Never write null to `conteudo_json`.
 */
export const saveWorkoutPlanFromMarkdown = async (
  planId: string,
  markdown: string,
  extras: SaveExtras = {},
): Promise<SaveResult> => {
  const days = parseTrainingSections(markdown || "").flatMap((s) => s.days || []);
  if (days.length > 0) {
    const json = parsedDaysToWorkoutPlan(days);
    const validation = validateWorkoutPlan(json);
    if (validation.success) {
      const derivedMarkdown = workoutPlanToMarkdown(validation.data);
      // We persist the user's edited markdown verbatim (preserves their
      // surrounding notes/tips) but JSON reflects the parsed structure.
      const { error } = await supabase
        .from("ai_plans")
        .update({
          conteudo: markdown,
          conteudo_json: validation.data as unknown as Json,
          migration_status: "completed",
          ...extras,
        })
        .eq("id", planId);
      if (error) return { success: false, error: error.message };
      void derivedMarkdown; // kept for parity / future PDF use
      return { success: true, markdown, json: validation.data };
    }
  }

  // Fallback: parse failed -> save markdown only, KEEP conteudo_json as-is.
  const { error } = await supabase
    .from("ai_plans")
    .update({
      conteudo: markdown,
      migration_status: "manual_fix_needed",
      ...extras,
    })
    .eq("id", planId);
  if (error) return { success: false, error: error.message };
  return {
    success: false,
    error:
      "Não foi possível extrair estrutura JSON a partir do markdown. Markdown salvo, JSON anterior preservado.",
  };
};