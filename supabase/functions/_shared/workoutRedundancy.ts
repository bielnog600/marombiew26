import { normalizeName } from "../_shared/planSimilarity.ts";
import { getExerciseFunctionalProfile } from "../_shared/exerciseClassifier.ts";

export type RedundancyIssue = {
  day: string;
  family: string | "exact_duplicate";
  exercises: string[];
  severity: "low" | "medium" | "high";
};

/**
 * Checks a workout plan for excessive redundancy within each day.
 */
export function validateWorkoutRedundancy(plan: any): { ok: boolean; issues: RedundancyIssue[] } {
  const issues: RedundancyIssue[] = [];
  
  if (!plan?.days || !Array.isArray(plan.days)) return { ok: true, issues: [] };

  for (const day of plan.days) {
    const dayLabel = day.day || day.label || day.focus || "Dia";
    const exercises = day.exercises || [];
    
    // 1. Exact nominal duplicate check (count >= 2 is hard reject)
    const nameCounts = new Map<string, string[]>();
    for (const ex of exercises) {
      const norm = normalizeName(ex.exercise);
      if (!norm) continue;
      const list = nameCounts.get(norm) || [];
      list.push(ex.exercise);
      nameCounts.set(norm, list);
    }

    for (const [normName, instances] of nameCounts.entries()) {
      if (instances.length >= 2) {
        issues.push({
          day: dayLabel,
          family: "exact_duplicate",
          exercises: instances,
          severity: "high"
        });
      }
    }

    // 2. Functional duplicate check (Pattern + Equipment)
    const functionalGroups = new Map<string, string[]>();
    for (const ex of exercises) {
      const profile = getExerciseFunctionalProfile(ex.exercise);
      if (profile.pattern) {
        const key = `${profile.pattern}_${profile.equipment || 'none'}`;
        const list = functionalGroups.get(key) || [];
        list.push(ex.exercise);
        functionalGroups.set(key, list);
      }
    }

    for (const [key, list] of functionalGroups.entries()) {
      if (list.length >= 3) {
        const pattern = key.split('_')[0];
        issues.push({
          day: dayLabel,
          family: pattern,
          exercises: list,
          severity: "medium"
        });
      }
    }
  }

  const ok = !issues.some(i => i.severity === "high");
  return { ok, issues };
}
