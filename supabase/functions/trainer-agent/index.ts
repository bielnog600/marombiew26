import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  AI_MODELS,
  callAI,
  createRoutingMetadata,
  type AIRouterResponse,
} from "../_shared/aiModelRouter.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Prompt constants
const TRAINER_CORE_PROMPT = `Você é o AGENTE DE TREINAMENTO MAROMBIEW.`;
const TRAINER_STRUCTURED_PROMPT = `Gere treinos em formato JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  try {
    const { student_id } = await req.json();
    
    const attempts = [];
    const res = await callAI({
      model: AI_MODELS.primary,
      systemPrompt: TRAINER_CORE_PROMPT + TRAINER_STRUCTURED_PROMPT,
      userPrompt: `Aluno: ${student_id}`
    });
    attempts.push({ ...res, model: AI_MODELS.primary });
    
    // Hardening: Explicitly passing null for fallbackReason and false for reviewRequired
    const routing = createRoutingMetadata(attempts, null);
    return new Response(
      JSON.stringify({ content: res.content, routing }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
