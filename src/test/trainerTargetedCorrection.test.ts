import { describe, expect, it } from "vitest";
import { mergeCorrectedDays, buildTargetedCorrectionPrompt } from "../../supabase/functions/trainer-agent/targetedCorrection";

const base = {
  version: "2.0", type: "workout", metadata: { goal: "x", frequency: 3, notes: null },
  days: [
    { id: "a", day: "Segunda", focus: "Pernas", exercises: [{ exercise: "LEG PRESS" }, { exercise: "LEG PRESS 45" }] },
    { id: "b", day: "Quarta", focus: "Peito", exercises: [{ exercise: "SUPINO" }] },
  ],
};

describe("trainer targeted correction", () => {
  it("replaces only the corrected day and keeps the others intact", () => {
    const merged = mergeCorrectedDays(base, { days: [{ id: "a", day: "Segunda", focus: "Pernas", exercises: [{ exercise: "LEG PRESS" }, { exercise: "CADEIRA EXTENSORA" }] }] });
    expect(merged.days[0].exercises.map((e: any) => e.exercise)).toEqual(["LEG PRESS", "CADEIRA EXTENSORA"]);
    expect(merged.days[1]).toEqual(base.days[1]);
    expect(base.days[0].exercises[1].exercise).toBe("LEG PRESS 45");
  });

  it("matches by day label when the id differs and never adds new days", () => {
    const merged = mergeCorrectedDays(base, { days: [
      { id: "zz", day: "quarta", focus: "Peito", exercises: [{ exercise: "CRUCIFIXO" }] },
      { id: "new", day: "Sábado", focus: "Extra", exercises: [] },
    ] });
    expect(merged.days).toHaveLength(2);
    expect(merged.days[1].id).toBe("b");
    expect(merged.days[1].exercises[0].exercise).toBe("CRUCIFIXO");
  });

  it("sends the violations and asks only for changed days", () => {
    const prompt = buildTargetedCorrectionPrompt("excessive_volume_redundancy em Segunda");
    expect(prompt).toContain("excessive_volume_redundancy em Segunda");
    expect(prompt).toContain("APENAS os dias alterados");
  });
});
