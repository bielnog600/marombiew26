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
  migration_status: MigrationStatus;
  fase: string | null;
  fase_inicio_data: string | null;
  tipo: string;
}

/**
 * Hook logic or utility for safe plan reading with fallback
 */
export const getSafeWorkoutDays = (plan: PlanData): { days: ParsedTrainingDay[], isFromJSON: boolean } => {
  // 1. Try JSON if status is 'completed'
  if (plan.migration_status === 'completed' && plan.conteudo_json) {
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
 * Telemetry helper for monitoring migration health
 */
export const trackPlanAccess = (plan: PlanData, isFromJSON: boolean) => {
  // In a real scenario, this would send to an analytics service (like PostHog or Sentry)
  // For now we log to console which will show up in developer logs
  console.log(`[PlanAccess] ID: ${plan.id} | Type: ${plan.tipo} | JSON: ${isFromJSON} | Status: ${plan.migration_status}`);
};
