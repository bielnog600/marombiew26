import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase BEFORE importing the repo
const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

beforeEach(() => {
  updateMock.mockReset();
  eqMock.mockReset();
  fromMock.mockReset();
  eqMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });
});

import {
  parsedDaysToWorkoutPlan,
  validateWorkoutPlan,
  normalizeWorkoutPlan,
  newId,
} from "@/lib/workoutSchema";
import { workoutPlanToMarkdown } from "@/lib/workoutMarkdownSerializer";
import {
  saveWorkoutPlanJSON,
  saveWorkoutPlanFromMarkdown,
} from "@/lib/workoutPlanRepo";
import { getSafeWorkoutDays, getEditableWorkoutPlan } from "@/lib/planMigrationUtils";

const LEGACY_MARKDOWN = `# Treino

| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |
|---|---|---|---|---|---|---|---|---|
| SEGUNDA | Supino reto | 3 | - | 8-12 | 2 | 60s | - | - |
| SEGUNDA | Remada curvada | 3 | - | 8-12 | 2 | 90s | - | - |
| QUARTA | Agachamento livre | 4 | - | 6-10 | 1 | 120s | - | - |
`;

const validJsonPlan = () => ({
  version: "2.0",
  type: "workout" as const,
  metadata: { goal: "Hipertrofia" },
  days: [
    {
      id: "day-1",
      day: "SEGUNDA",
      exercises: [
        {
          id: "ex-1",
          exercise: "Supino reto",
          series: "3",
          reps: "8-12",
          rir: "2",
          restSeconds: 60,
        },
      ],
    },
  ],
});

describe("workoutSchema", () => {
  it("validates a well-formed plan", () => {
    const res = validateWorkoutPlan(validJsonPlan());
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.days[0].exercises[0].restSeconds).toBe(60);
  });

  it("rejects empty/invalid plans", () => {
    expect(validateWorkoutPlan(null).success).toBe(false);
    expect(validateWorkoutPlan({ type: "diet", days: [] }).success).toBe(false);
    expect(validateWorkoutPlan({ type: "workout", days: [] }).success).toBe(false);
  });

  it("normalizes legacy v1 JSON without ids and fills stable ids", () => {
    const legacy = {
      version: "1.0",
      type: "workout",
      metadata: {},
      days: [
        {
          day: "SEGUNDA",
          exercises: [{ exercise: "Supino", series: "3", reps: "10", pause: "60s" }],
        },
      ],
    };
    const norm = normalizeWorkoutPlan(legacy);
    expect(norm).not.toBeNull();
    expect(norm!.days[0].id).toBeTruthy();
    expect(norm!.days[0].exercises[0].id).toBeTruthy();
    expect(norm!.days[0].exercises[0].restSeconds).toBe(60);
  });

  it("newId produces unique values", () => {
    expect(newId()).not.toEqual(newId());
  });
});

describe("workoutMarkdownSerializer", () => {
  it("roundtrips: parsedDays -> plan -> markdown -> parsedDays preserves exercises", () => {
    const plan = parsedDaysToWorkoutPlan([
      {
        day: "SEGUNDA",
        exercises: [
          { exercise: "Supino", series: "3", series2: "", reps: "8-12", rir: "2", pause: "60s", description: "", variation: "" },
        ],
      },
    ]);
    const md = workoutPlanToMarkdown(plan);
    expect(md).toContain("Supino");
    expect(md).toContain("60s");
    expect(md).toContain("SEGUNDA");
  });
});

describe("planMigrationUtils — JSON-first reads", () => {
  it("getSafeWorkoutDays uses JSON regardless of migration_status", () => {
    const plan = {
      id: "p1",
      conteudo: "should not be used",
      // status is 'pending' — must NOT gate JSON usage
      migration_status: "pending",
      conteudo_json: validJsonPlan() as any,
      fase: null,
      fase_inicio_data: null,
      tipo: "treino",
    };
    const res = getSafeWorkoutDays(plan);
    expect(res.isFromJSON).toBe(true);
    expect(res.days[0].exercises[0].exercise).toBe("Supino reto");
  });

  it("getSafeWorkoutDays falls back to markdown when JSON is missing", () => {
    const res = getSafeWorkoutDays({
      id: "p2",
      conteudo: LEGACY_MARKDOWN,
      migration_status: "completed", // status is 'completed' but JSON missing
      conteudo_json: null,
      fase: null,
      fase_inicio_data: null,
      tipo: "treino",
    });
    expect(res.isFromJSON).toBe(false);
    expect(res.days.length).toBeGreaterThanOrEqual(2);
  });

  it("getEditableWorkoutPlan reports correct source", () => {
    expect(
      getEditableWorkoutPlan({
        id: "p", conteudo: "", conteudo_json: validJsonPlan() as any,
        migration_status: "pending", fase: null, fase_inicio_data: null, tipo: "treino",
      }).source,
    ).toBe("json");
    expect(
      getEditableWorkoutPlan({
        id: "p", conteudo: LEGACY_MARKDOWN, conteudo_json: null,
        migration_status: "pending", fase: null, fase_inicio_data: null, tipo: "treino",
      }).source,
    ).toBe("markdown");
    expect(
      getEditableWorkoutPlan({
        id: "p", conteudo: "", conteudo_json: null,
        migration_status: "pending", fase: null, fase_inicio_data: null, tipo: "treino",
      }).source,
    ).toBe("empty");
  });
});

describe("workoutPlanRepo — persistence guarantees", () => {
  it("scenario 1: editing a JSON plan persists conteudo_json AND derived conteudo", async () => {
    const result = await saveWorkoutPlanJSON("plan-1", validJsonPlan() as any);
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][0];
    expect(payload.conteudo_json).toBeTruthy();
    expect(payload.conteudo_json.type).toBe("workout");
    expect(payload.conteudo).toContain("SEGUNDA");
    expect(payload.conteudo).toContain("Supino");
    expect(payload.migration_status).toBe("completed");
    // Critical guarantee: never null
    expect(payload.conteudo_json).not.toBeNull();
  });

  it("scenario 2: legacy markdown edit -> saves BOTH markdown and converted JSON", async () => {
    const result = await saveWorkoutPlanFromMarkdown("plan-2", LEGACY_MARKDOWN);
    expect(result.success).toBe(true);
    const payload = updateMock.mock.calls[0][0];
    expect(payload.conteudo).toBe(LEGACY_MARKDOWN);
    expect(payload.conteudo_json).toBeTruthy();
    expect(payload.conteudo_json.type).toBe("workout");
    expect(payload.conteudo_json.days.length).toBeGreaterThanOrEqual(2);
    expect(payload.migration_status).toBe("completed");
    expect(payload).not.toHaveProperty("conteudo_json", null);
  });

  it("scenario 3: markdown that can't be parsed -> keeps previous JSON, flags manual_fix_needed", async () => {
    const garbage = "Apenas texto livre sem tabela alguma.";
    const result = await saveWorkoutPlanFromMarkdown("plan-3", garbage);
    expect(result.success).toBe(false);
    const payload = updateMock.mock.calls[0][0];
    expect(payload.conteudo).toBe(garbage);
    // Most important: we NEVER write conteudo_json (so DB keeps previous JSON)
    expect(payload).not.toHaveProperty("conteudo_json");
    expect(payload.migration_status).toBe("manual_fix_needed");
  });
});