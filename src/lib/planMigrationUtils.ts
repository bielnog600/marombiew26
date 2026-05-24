import { Json } from "@/integrations/supabase/types";
import { ParsedTrainingDay, parseTrainingSections } from "./trainingResultParser";

export type MigrationStatus = 'pending' | 'completed' | 'failed' | 'manual_fix_needed';

export interface WorkoutDataJSON {
  version: string;
  type: 'workout';
  metadata: {
    goal?: string;
    frequency?: number;
    notes?: string;
  };
  days: ParsedTrainingDay[];
}

export interface PlanData {
  id: string;
  conteudo: string;
  conteudo_json: Json | null;
  migration_status: MigrationStatus | string;
  fase: string | null;
  fase_inicio_data: string | null;
  tipo: string;
}

/**
 * Hook logic or utility for safe plan reading with fallback
 */
export const getSafeWorkoutDays = (plan: PlanData): { days: ParsedTrainingDay[], isFromJSON: boolean } => {
  const status = plan.migration_status as string;
  // 1. Try JSON if status is 'completed'
  if (status === 'completed' && plan.conteudo_json) {
    try {
      const data = plan.conteudo_json as unknown as WorkoutDataJSON;
      if (data && data.type === 'workout' && Array.isArray(data.days)) {
        return { days: data.days, isFromJSON: true };
      }
    } catch (e) {
      console.error("Failed to parse workout JSON for plan", plan.id, e);
    }
  }

  // 2. Fallback to Markdown
  const sections = parseTrainingSections(plan.conteudo);
  const days = sections.flatMap(s => s.days ?? []);
  
  return { days, isFromJSON: false };
};

/**
 * Validates a workout plan structure and returns a typed object
 */
export const validateWorkoutJSON = (content: string | object): { success: boolean, data?: WorkoutDataJSON, error?: string } => {
  try {
    let raw: any;
    
    // If it's markdown, try to parse it first to test the validator (hibrid check)
    if (typeof content === 'string') {
      const days = parseTrainingSections(content).flatMap(s => s.days ?? []);
      if (days.length === 0) return { success: false, error: "Nenhum dia de treino encontrado no conteúdo" };
      
      raw = {
        version: "1.0",
        type: "workout",
        metadata: { goal: "Generated from Markdown" },
        days: days
      };
    } else {
      raw = content;
    }

    if (!raw || raw.type !== 'workout' || !Array.isArray(raw.days)) {
      return { success: false, error: "Estrutura JSON inválida para treino" };
    }

    // Min validation: check if exercises exist
    const hasExercises = raw.days.some((d: any) => d.exercises && d.exercises.length > 0);
    if (!hasExercises) return { success: false, error: "Plano sem exercícios válidos" };

    return { success: true, data: raw as WorkoutDataJSON };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido na validação" };
  }

/**
 * Telemetry helper for monitoring migration health
 */
export const trackPlanAccess = (plan: PlanData, isFromJSON: boolean) => {
  // In a real scenario, this would send to an analytics service (like PostHog or Sentry)
  // For now we log to console which will show up in developer logs
  console.log(`[PlanAccess] ID: ${plan.id} | Type: ${plan.tipo} | JSON: ${isFromJSON} | Status: ${plan.migration_status}`);
};

