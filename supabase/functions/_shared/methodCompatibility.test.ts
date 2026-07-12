import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateMethodCompatibility,
  METHOD_RULES_VERSION,
  type ExerciseInput,
  type MethodInput,
} from "./methodCompatibility.ts";

function mkMethod(overrides: Partial<MethodInput>): MethodInput {
  return {
    slug: "traditional_sets",
    category: "base",
    min_level: "beginner",
    active: true,
    requires_professional_supervision: false,
    requires_special_equipment: false,
    ...overrides,
  };
}

const approvedIsoMachine: ExerciseInput = {
  nome: "Cadeira Extensora",
  exercise_class: "isolation",
  equipment_type: "machine",
  stability_level: "high",
  technical_complexity: "low",
  axial_load: "none",
  lumbar_load: "low",
  balance_requirement: "none",
  fatigue_cost: "low",
  safe_to_failure: true,
  metadata_status: "approved",
};

const approvedFreeSquat: ExerciseInput = {
  nome: "Agachamento Livre",
  exercise_class: "compound",
  equipment_type: "barbell",
  stability_level: "moderate",
  technical_complexity: "high",
  axial_load: "high",
  lumbar_load: "high",
  balance_requirement: "moderate",
  fatigue_cost: "very_high",
  safe_to_failure: false,
  metadata_status: "approved",
};

const unclassified: ExerciseInput = { nome: "X", metadata_status: null };

Deno.test("rules version constant", () => {
  const r = evaluateMethodCompatibility(approvedIsoMachine, mkMethod({ slug: "traditional_sets" }));
  assertEquals(r.rulesVersion, METHOD_RULES_VERSION);
});

Deno.test("drop_set allowed on isolation machine", () => {
  const r = evaluateMethodCompatibility(approvedIsoMachine, mkMethod({ slug: "drop_set", min_level: "intermediate" }));
  assertEquals(r.status, "allowed");
});

Deno.test("drop_set blocked on free squat", () => {
  const r = evaluateMethodCompatibility(approvedFreeSquat, mkMethod({ slug: "drop_set", min_level: "intermediate" }));
  assertEquals(r.status, "blocked");
});

Deno.test("rest_pause blocked on deadlift (axial high)", () => {
  const dl: ExerciseInput = { ...approvedFreeSquat, nome: "Levantamento Terra" };
  const r = evaluateMethodCompatibility(dl, mkMethod({ slug: "rest_pause", min_level: "intermediate" }));
  assertEquals(r.status, "blocked");
});

Deno.test("unclassified exercise → review_required", () => {
  const r = evaluateMethodCompatibility(unclassified, mkMethod({ slug: "traditional_sets" }));
  assertEquals(r.status, "review_required");
});

Deno.test("inactive method → blocked", () => {
  const r = evaluateMethodCompatibility(approvedIsoMachine, mkMethod({ slug: "blood_flow_restriction", active: false, min_level: "professional_only" }));
  assertEquals(r.status, "blocked");
});

Deno.test("professional_only without override → blocked", () => {
  const r = evaluateMethodCompatibility(approvedIsoMachine, mkMethod({ slug: "eccentric_overload", active: true, min_level: "professional_only" }));
  assertEquals(r.status, "blocked");
});

Deno.test("VBT without equipment → blocked", () => {
  const r = evaluateMethodCompatibility(approvedFreeSquat, mkMethod({
    slug: "velocity_based_training",
    active: true,
    requires_special_equipment: true,
    min_level: "advanced",
  }), { studentLevel: "advanced" });
  assertEquals(r.status, "blocked");
});

Deno.test("cluster on compound → allowed", () => {
  const r = evaluateMethodCompatibility(
    { ...approvedFreeSquat, safe_to_failure: false },
    mkMethod({ slug: "cluster_set", min_level: "advanced" }),
    { studentLevel: "advanced" },
  );
  assertEquals(r.status, "allowed");
});

Deno.test("cluster on mobility → blocked", () => {
  const mob: ExerciseInput = { nome: "Alongamento", exercise_class: "mobility", stability_level: "high", technical_complexity: "low", metadata_status: "approved" };
  const r = evaluateMethodCompatibility(mob, mkMethod({ slug: "cluster_set", min_level: "advanced" }), { studentLevel: "advanced" });
  assertEquals(r.status, "blocked");
});

Deno.test("beginner blocked from top_set_backoff on high complexity", () => {
  const r = evaluateMethodCompatibility(
    approvedFreeSquat,
    mkMethod({ slug: "top_set_backoff", min_level: "intermediate" }),
    { studentLevel: "beginner" },
  );
  assertEquals(r.status, "blocked");
});

Deno.test("power method requires advanced student", () => {
  const r = evaluateMethodCompatibility(
    approvedFreeSquat,
    mkMethod({ slug: "complex_training", min_level: "advanced" }),
    { studentLevel: "intermediate" },
  );
  assertEquals(r.status, "blocked");
});