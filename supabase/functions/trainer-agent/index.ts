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
const TRAINER_LEGACY_TABLE_PROMPT = `
A tabela do TREINO deve ter exatamente 9 colunas com estes títulos, nessa ordem:
TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO
`;
const TRAINER_RIR_PROMPT = `REGRA CRÍTICA — REPETIÇÕES vs RIR.`;
const TRAINER_RIR_RULES = `RIR deve ser de 0 a 4.`;
const TRAINER_EXAMPLES_PROMPT = `Exemplos de tabelas.`;
const TRAINER_SET_RULES_PROMPT = `Regras de série 1 e 2.`;
const TRAINER_VARIATION_PROMPT = `Regras de variação.`;
const TRAINER_TECHNIQUES_PROMPT = `Técnicas avançadas.`;
const TRAINER_MOBILITY_PROMPT = `Regras de mobilidade.`;
const TRAINER_MOBILITY_REVISION = `Revisão de mobilidade.`;
const TRAINER_VOLUME_PROMPT = `Regras de volume.`;
const TRAINER_EVOLUTION_PROMPT = `Regras de evolução.`;
const TRAINER_SAFETY_PROMPT = `Regras de segurança.`;
const TRAINER_SAFETY_FILTER_PROMPT = `Filtro de segurança.`;
const TRAINER_SAFETY_FILTER_RULES = `Regras do filtro.`;
const TRAINER_SAFETY_ACTION_PLAN = `Plano de ação de segurança.`;
const TRAINER_SAFETY_FILTER_LOGIC = `Lógica do filtro.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  try {
    const { student_id, outputMode = "json" } = await req.json();
    
    const attempts = [];
    const res = await callAI({
      model: AI_MODELS.primary,
      systemPrompt: TRAINER_CORE_PROMPT + TRAINER_STRUCTURED_PROMPT,
      userPrompt: `Aluno: ${student_id}`
    });
    attempts.push({ ...res, model: AI_MODELS.primary });
    
    const routing = createRoutingMetadata(attempts);
    return new Response(
      JSON.stringify({ content: res.content, routing }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
