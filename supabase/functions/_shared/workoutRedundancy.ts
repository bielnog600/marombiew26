/**
 * Trainer Redundancy Validator for MAROMBIEW.
 * Detects excessive concentration of functionally similar exercises.
 * Uses patterns from exerciseClassifier.ts to ensure consistency.
 */

import { normalizeName } from "../_shared/planSimilarity.ts";

// Movement Pattern / Family Taxonomy (Reusing/extending existing categories)
import { CLASSIFIER_VERSION } from "../_shared/exerciseClassifier.ts";

function getExerciseFamily(name: string): string | null {
  const norm = normalizeName(name);
  if (!norm) return null;

  // Reusing patterns logic from exerciseClassifier to ensure consistency.
  // We check for tokens that match specific functional families.
  const name_norm = norm;

  if (name_norm.includes("agachamento") || name_norm.includes("leg press") || name_norm.includes("hack machine") || name_norm.includes("agachamento hack") || name_norm.includes("afundo") || name_norm.includes("avanco")) return "squat_family";
  if (name_norm.includes("stiff") || name_norm.includes("levantamento terra") || name_norm.includes("good morning") || name_norm.includes("romanian") || name_norm.includes("elevacao pelvica") || name_norm.includes("hip thrust")) return "hinge_family";
  if (name_norm.includes("cadeira extensora") || name_norm.includes("extensao de joelho")) return "knee_extension";
  if (name_norm.includes("mesa flexora") || name_norm.includes("flexora deitado") || name_norm.includes("flexora sentado")) return "knee_flexion";
  if (name_norm.includes("supino") || name_norm.includes("chest press") || name_norm.includes("flexao de braco")) return "horizontal_push";
  if (name_norm.includes("desenvolvimento") || name_norm.includes("military press") || name_norm.includes("overhead press") || name_norm.includes("arnold")) return "vertical_push";
  if (name_norm.includes("remada")) return "horizontal_pull";
  if (name_norm.includes("puxada") || name_norm.includes("pull up") || name_norm.includes("chin up") || name_norm.includes("barra fixa")) return "vertical_pull";
  if (name_norm.includes("rosca")) return "elbow_flexion";
  if (name_norm.includes("triceps") || name_norm.includes("kickback") || name_norm.includes("frances")) return "elbow_extension";
  if (name_norm.includes("elevacao lateral")) return "shoulder_abduction";
  if (name_norm.includes("panturrilha") || name_norm.includes("calf raise")) return "calf_raise";
  if (name_norm.includes("mobilidade") || name_norm.includes("alongamento") || name_norm.includes("stretch") || name_norm.includes("90/90") || name_norm.includes("cat cow")) return "mobility_family";

  return null;
}

export type RedundancyIssue = {
  day: string;
  family: string;
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
    const dayLabel = day.day || day.focus || "Dia";
    const familyCounts = new Map<string, string[]>();

    for (const ex of day.exercises || []) {
      const family = getExerciseFamily(ex.exercise);
      if (family) {
        const list = familyCounts.get(family) || [];
        list.push(ex.exercise);
        familyCounts.set(family, list);
      }
    }

    for (const [family, exercises] of familyCounts.entries()) {
      // 3 or more exercises of the same family in a single day is usually redundant
      if (exercises.length >= 3) {
        issues.push({
          day: dayLabel,
          family,
          exercises,
          severity: exercises.length >= 4 ? "high" : "medium"
        });
      }
      
      // Special case: mobility exercises shouldn't be duplicated unless very different
      if (family === "mobility_family" && exercises.length >= 2) {
        const uniqueNames = new Set(exercises.map(normalizeName));
        if (uniqueNames.size < exercises.length) {
          issues.push({
            day: dayLabel,
            family,
            exercises,
            severity: "medium"
          });
        }
      }
    }
  }

  // A plan is considered redundant if it has medium/high severity issues
  const ok = !issues.some(i => i.severity === "medium" || i.severity === "high");
  return { ok, issues };
}
