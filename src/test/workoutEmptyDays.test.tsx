import { describe, it, expect } from "vitest";
import { getSafeWorkoutDays } from "@/lib/planMigrationUtils";
import { findEmptyDays, removeEmptyDays } from "@/lib/workoutEmptyDays";
import { workoutPlanToMarkdown } from "@/lib/workoutMarkdownSerializer";

const ex = (id: string, exercise: string) => ({ id, exercise, series: "3", reps: "10" });
const plan: any = {
  version: "2.0", type: "workout", metadata: {},
  days: [
    { id: "d1", day: "SEGUNDA-FEIRA", exercises: [ex("e1", "Supino reto")] },
    { id: "d2", day: "SÁBADO", exercises: [] },
  ],
};

describe("dia de treino vazio", () => {
  it("leitura ignora o dia vazio (MinhaArea não indexa exercises[-1])", () => {
    const { days } = getSafeWorkoutDays({ conteudo: "", conteudo_json: plan, tipo: "treino" } as any);
    expect(days.map((d) => d.day)).toEqual(["SEGUNDA-FEIRA"]);
  });

  it("ignora itens nulos ou sem nome", () => {
    const p = { ...plan, days: [{ id: "d1", day: "TERÇA", exercises: [null, ex("x", " "), ex("e2", "Remada")] }] };
    const { days } = getSafeWorkoutDays({ conteudo: "", conteudo_json: p, tipo: "treino" } as any);
    expect(days[0].exercises.map((e) => e.exercise)).toEqual(["Remada"]);
  });

  it("salvar com dia vazio remove o dia do JSON e do markdown", () => {
    expect(findEmptyDays(plan.days)).toEqual(["SÁBADO"]);
    const saved = removeEmptyDays(plan);
    expect(saved.days.map((d: any) => d.day)).toEqual(["SEGUNDA-FEIRA"]);
    expect(workoutPlanToMarkdown(saved)).not.toContain("SÁBADO");
  });
});
