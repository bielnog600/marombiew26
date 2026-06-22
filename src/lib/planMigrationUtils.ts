import { Json } from "@/integrations/supabase/types";
import { ParsedTrainingDay, parseTrainingSections } from "./trainingResultParser";
import {
  normalizeWorkoutPlan,
  parsedDaysToWorkoutPlan,
  workoutPlanToParsedDays,
  type WorkoutPlan,
} from "./workoutSchema";

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
 * Read a workout plan as ParsedTrainingDay[] with JSON-first priority.
 *
 * Rules:
 * - JSON in `conteudo_json` is the source of truth whenever it is parseable,
 *   regardless of `migration_status` (status is telemetry, never a gate).
 * - If JSON is missing/invalid, fall back to parsing the markdown.
 * - We never throw and never drop existing JSON.
 */
export const getSafeWorkoutDays = (plan: PlanData): { days: ParsedTrainingDay[], isFromJSON: boolean } => {
  // 1. JSON-first (no migration_status gate).
  if (plan.conteudo_json) {
    const normalized = normalizeWorkoutPlan(plan.conteudo_json);
    if (normalized && normalized.days.length > 0) {
      return { days: workoutPlanToParsedDays(normalized), isFromJSON: true };
    }
  }
  // 2. Markdown fallback (legacy plans).
  const markdownDays = parseTrainingSections(plan.conteudo || "").flatMap((s) => s.days ?? []);
  return { days: markdownDays, isFromJSON: false };
};

/**
 * Get the full v2 workout plan for editing. Always returns a WorkoutPlan:
 *  - if `conteudo_json` is valid -> normalize and return it
 *  - else parse markdown -> convert to v2 with fresh stable IDs
 *  - else return an empty plan (never null)
 *
 * `source` is `'json' | 'markdown' | 'empty'` for telemetry/UI hints.
 */
export const getEditableWorkoutPlan = (
  plan: PlanData,
): { plan: WorkoutPlan; source: 'json' | 'markdown' | 'empty' } => {
  if (plan.conteudo_json) {
    const normalized = normalizeWorkoutPlan(plan.conteudo_json);
    if (normalized && normalized.days.length > 0) {
      return { plan: normalized, source: 'json' };
    }
  }
  const days = parseTrainingSections(plan.conteudo || "").flatMap((s) => s.days ?? []);
  if (days.length > 0) {
    return { plan: parsedDaysToWorkoutPlan(days), source: 'markdown' };
  }
  return {
    plan: { version: '2.0', type: 'workout', metadata: {}, days: [] },
    source: 'empty',
  };
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
