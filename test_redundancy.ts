import { validateWorkoutRedundancy } from "./supabase/functions/_shared/workoutRedundancy.ts";

const plan = {
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
};

const result = validateWorkoutRedundancy(plan);
console.log(JSON.stringify(result, null, 2));
