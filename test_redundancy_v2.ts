import { validateWorkoutRedundancy } from "./supabase/functions/_shared/workoutRedundancy.ts";

const cases = [
  {
    name: "User case: Leg Press variants + Gemeos",
    plan: {
      days: [
        {
          day: "TERÇA-FEIRA",
          exercises: [
            { exercise: "LEG PRESS 45 ART" },
            { exercise: "LEG PRESS" },
            { exercise: "LEG 180" },
            { exercise: "GÊMEOS LEG PRESS" }
          ]
        }
      ]
    },
    expectedOk: true
  },
  {
    name: "Real duplicate: Same angle",
    plan: {
      days: [
        {
          day: "D1",
          exercises: [
            { exercise: "LEG PRESS 45" },
            { exercise: "LEG PRESS 45 ART" }
          ]
        }
      ]
    },
    expectedOk: false
  },
  {
    name: "Grip regression check",
    plan: {
      days: [
        {
          day: "D2",
          exercises: [
            { exercise: "PUXADA ALTA PRONADA" },
            { exercise: "PUXADA ALTA SUPINADA" }
          ]
        }
      ]
    },
    expectedOk: true
  }
];

for (const c of cases) {
  const result = validateWorkoutRedundancy(c.plan);
  console.log(`Test: ${c.name}`);
  console.log(`Result OK: ${result.ok} (Expected: ${c.expectedOk})`);
  if (result.ok !== c.expectedOk) {
    console.log(JSON.stringify(result.issues, null, 2));
  }
}
