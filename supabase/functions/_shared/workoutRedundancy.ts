/**
 * Trainer Redundancy Validator for MAROMBIEW.
 * Detects excessive concentration of functionally similar exercises.
 * Uses patterns from exerciseClassifier.ts to ensure consistency.
 */

import { normalizeName } from "../_shared/planSimilarity.ts";

// Movement Pattern / Family Taxonomy (Reusing/extending existing categories)
const EXERCISE_FAMILIES: Record<string, string[]> = {
  knee_dominant_heavy: [
    "agachamento livre", "agachamento barra", "agachamento smith",
    "hack machine", "agachamento hack", "leg press 45", "leg press horizontal",
    "leg press 90", "leg press 180", "agachamento búlgaro", "afundo", "avanço"
  ],
  knee_dominant_iso: [
    "cadeira extensora", "extensora", "extensao de joelhos"
  ],
  hip_dominant_heavy: [
    "levantamento terra", "deadlift", "stiff", "bom dia", "good morning",
    "meio terra", "rdl", "elevação pélvica", "hip thrust"
  ],
  hip_dominant_iso: [
    "mesa flexora", "cadeira flexora", "flexora vertical", "flexora deitado"
  ],
  push_horizontal: [
    "supino reto", "supino inclinado", "supino declinado", "supino articulado",
    "supino com halteres", "push up", "flexao de bracos", "fly", "crucifixo", "peck deck", "voador"
  ],
  pull_horizontal: [
    "remada curvada", "remada cavalinho", "remada baixa", "remada unilateral",
    "remada articulada", "row", "t-bar row", "face pull"
  ],
  push_vertical: [
    "desenvolvimento", "shoulder press", "military press", "overhead press", "arnold press"
  ],
  pull_vertical: [
    "puxada alta", "lat pulldown", "barra fixa", "chin up", "pull up", "pulldown"
  ],
  shoulder_lateral: [
    "elevacao lateral"
  ],
  shoulder_front: [
    "elevacao frontal"
  ],
  shoulder_rear: [
    "crucifixo inverso", "remada alta"
  ],
  biceps: [
    "rosca direta", "rosca martelo", "rosca concentrada", "rosca scott"
  ],
  triceps: [
    "tríceps testa", "tríceps corda", "tríceps pulley", "tríceps coice", "tríceps francês"
  ],
  mobility_hip: [
    "mobilidade quadril", "abertura quadril", "90/90", "frog stretch"
  ],
  mobility_thoracic: [
    "mobilidade toracica", "cat cow", "thoracic bridge"
  ],
  mobility_ankle: [
    "mobilidade tornozelo"
  ]
};

function getExerciseFamily(name: string): string | null {
  const norm = normalizeName(name);
  if (!norm) return null;
  
  for (const [family, terms] of Object.entries(EXERCISE_FAMILIES)) {
    if (terms.some(t => {
      const termNorm = normalizeName(t);
      return termNorm && norm.includes(termNorm);
    })) return family;
  }
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
      if (family.startsWith("mobility_") && exercises.length >= 2) {
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
