import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AI_MODELS,
  callAI,
  createRoutingMetadata,
  type AIAttemptMetadata,
} from "../_shared/aiModelRouter.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TRAINER_CORE_PROMPT = `Você é o AGENTE DE TREINAMENTO MAROMBIEW.`;

const WORKOUT_PLAN_JSON_SCHEMA = `
{
  "meta": { "objective": "string", "split": "string" },
  "days": [
    {
      "label": "Dia A",
      "exercises": [
        { "exercise": "Nome", "sets": number, "reps": "string", "rir": number }
      ]
    }
  ]
}
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { student_id, outputMode = "text" } = await req.json();
    const attempts: AIAttemptMetadata[] = [];

    if (outputMode === "json") {
      const res = await callAI({
        model: AI_MODELS.primary,
        systemPrompt: TRAINER_CORE_PROMPT + "\nJSON Schema:\n" + WORKOUT_PLAN_JSON_SCHEMA,
        userPrompt: `Gere um treino para o aluno ${student_id}.`,
      });
      attempts.push({
        model: AI_MODELS.primary,
        durationMs: res.durationMs,
        usage: res.usage,
        reason: "first_attempt",
      });

      if (!res.content) throw new Error("empty_response");
      const plan = JSON.parse(res.content.replace(/```json\n?|\n?```/g, "").trim());
      const routing = createRoutingMetadata(attempts, null);

      return new Response(
        JSON.stringify({ plan, routing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Stream mode not restored" }), { status: 501, headers: corsHeaders });
  } catch (e: any) {
    console.error("trainer-agent error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
