import type { WorkoutPlan } from "./workoutSchema";
import { workoutPlanToParsedDays } from "./workoutSchema";

/**
 * JSON -> markdown serializer. The markdown is a derived artifact used for
 * display fallback, PDF export, and legacy code paths. The source of truth
 * stays in `conteudo_json`.
 */

const cell = (v?: string | number | null): string => {
  if (v == null) return "-";
  const s = String(v).trim();
  return s.length === 0 ? "-" : s.replace(/\|/g, "/");
};

const restCell = (restSeconds?: number, pause?: string): string => {
  if (typeof restSeconds === "number" && restSeconds > 0) return `${restSeconds}s`;
  return cell(pause);
};

/** Serialize per-set reps as "12 / 10 / 6" for markdown retro-compatibility. */
const repsForMarkdown = (ex: WorkoutPlan["days"][number]["exercises"][number]): string => {
  if (ex.setScheme?.mode === "per_set" && ex.setScheme.sets.length > 0) {
    return ex.setScheme.sets.map((s) => s.target_reps).join(" / ");
  }
  return cell(ex.reps);
};

const seriesForMarkdown = (ex: WorkoutPlan["days"][number]["exercises"][number]): string => {
  if (ex.setScheme?.mode === "per_set" && ex.setScheme.sets.length > 0) {
    return String(ex.setScheme.sets.length);
  }
  return cell(ex.series);
};

export const workoutPlanToMarkdown = (plan: WorkoutPlan): string => {
  const lines: string[] = [];
  if (plan.metadata?.goal) {
    lines.push(`**Objetivo:** ${plan.metadata.goal}`);
    lines.push("");
  }
  lines.push(
    "| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      lines.push(
        `| ${cell(day.day)} | ${cell(ex.exercise)} | ${seriesForMarkdown(ex)} | ${cell(ex.series2)} | ${repsForMarkdown(ex)} | ${cell(ex.rir)} | ${restCell(ex.restSeconds, ex.pause)} | ${cell(ex.description)} | ${cell(ex.variation)} |`,
      );
    }
  }
  lines.push("");
  if (plan.metadata?.notes) {
    lines.push("");
    lines.push(`> ${plan.metadata.notes}`);
  }
  return lines.join("\n");
};

/** Back-compat helper for callers that still consume ParsedTrainingDay[]. */
export const workoutPlanDaysAsParsed = (plan: WorkoutPlan) => workoutPlanToParsedDays(plan);