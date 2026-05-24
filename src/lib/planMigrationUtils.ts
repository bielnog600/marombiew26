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
    muscleGroups?: string[];
  };
  days: ParsedTrainingDay[];
}

export interface DietDataJSON {
  version: string;
  type: 'diet';
  metadata: {
    strategy?: string;
    style?: string;
    totalKcal?: number;
    totalP?: number;
    totalC?: number;
    totalG?: number;
    decision?: 'manter' | 'ajustar' | 'nova' | 'pedir_dados';
    rationale?: string;
    confidence?: number;
  };
  meals: any[]; // ParsedMeal structure
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
};

/**
 * Validates a diet plan structure and returns a typed object
 */
export const validateDietJSON = (content: string | object): { success: boolean, data?: DietDataJSON, error?: string } => {
  try {
    let raw: any;
    // We import dynamically to avoid circular dependencies if any
    const { parseSections } = require('./dietResultParser');

    if (typeof content === 'string') {
      const sections = parseSections(content);
      const meals = sections.flatMap((s: any) => s.meals ?? []);
      
      if (meals.length === 0) return { success: false, error: "Nenhuma refeição encontrada no conteúdo" };

      // Try to extract totals from markdown if possible
      const grab = (re: RegExp) => {
        const m = content.match(re);
        return m ? Number(m[1].replace(/[^\d.]/g, '')) || 0 : 0;
      };

      raw = {
        version: "1.0",
        type: "diet",
        metadata: {
          totalKcal: grab(/calorias?\s*(?:totais|alvo|consumo)?[:\s]+(\d{3,5})/i),
          totalP: grab(/prote[íi]na[^\n]*?(\d{2,4})\s*g/i),
          totalC: grab(/carboidrato[^\n]*?(\d{2,4})\s*g/i),
          totalG: grab(/gordura[^\n]*?(\d{2,4})\s*g/i),
          decision: content.toLowerCase().includes('manter') ? 'manter' : 'ajustar',
          confidence: 0.9,
          rationale: "Validado a partir de Markdown"
        },
        meals: meals
      };
    } else {
      raw = content;
    }

    if (!raw || raw.type !== 'diet' || !Array.isArray(raw.meals)) {
      return { success: false, error: "Estrutura JSON inválida para dieta" };
    }

    // Min validation
    if (raw.meals.length === 0) return { success: false, error: "Dieta sem refeições válidas" };
    
    const hasItems = raw.meals.some((m: any) => m.foods && m.foods.length > 0);
    if (!hasItems) return { success: false, error: "Refeições sem itens/alimentos" };

    return { success: true, data: raw as DietDataJSON };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido na validação" };
  }
};

/**
 * Telemetry helper for monitoring migration health
 */
export const trackPlanAccess = (plan: PlanData, isFromJSON: boolean) => {
  // In a real scenario, this would send to an analytics service (like PostHog or Sentry)
  // For now we log to console which will show up in developer logs
  console.log(`[PlanAccess] ID: ${plan.id} | Type: ${plan.tipo} | JSON: ${isFromJSON} | Status: ${plan.migration_status}`);
};

/**
 * Deep compare two workout JSONs and return structured differences
 */
export const compareWorkoutVersions = (v1: WorkoutDataJSON, v2: WorkoutDataJSON) => {
  const changes = {
    divisionChanged: v1.days.length !== v2.days.length || v1.days.some((d, i) => d.day !== v2.days[i]?.day),
    addedExercises: [] as string[],
    removedExercises: [] as string[],
    modifiedExercises: [] as { name: string, field: string, old: string, new: string }[],
    volumeChange: 0 // percentage
  };

  const v1Ex = new Set(v1.days.flatMap(d => d.exercises.map(e => e.exercise.toUpperCase().trim())));
  const v2Ex = new Set(v2.days.flatMap(d => d.exercises.map(e => e.exercise.toUpperCase().trim())));

  changes.addedExercises = Array.from(v2Ex).filter(x => !v1Ex.has(x));
  changes.removedExercises = Array.from(v1Ex).filter(x => !v2Ex.has(x));

  // Volume calc (total sets)
  const v1Sets = v1.days?.reduce((acc, d) => acc + (d.exercises?.reduce((a, e) => a + (parseInt(e.series) || 3), 0) || 0), 0) || 0;
  const v2Sets = v2.days?.reduce((acc, d) => acc + (d.exercises?.reduce((a, e) => a + (parseInt(e.series) || 3), 0) || 0), 0) || 0;
  changes.volumeChange = v1Sets > 0 ? ((v2Sets - v1Sets) / v1Sets) * 100 : 0;

  return changes;
};
