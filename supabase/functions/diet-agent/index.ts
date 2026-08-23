import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  AI_MODELS,
  callAI,
  createRoutingMetadata,
  type AIRouterResponse,
} from "../_shared/aiModelRouter.ts";
import { corsHeaders } from "../_shared/cors.ts";

import {
  computeDietSimilarity,
  SIMILARITY_THRESHOLDS,
  validateDietNutrition,
  type VariationIntensity,
  type DietNutritionValidation,
} from "../_shared/planSimilarity.ts";


import {
  normalizeDailyAdjustments,
  validateDailyAdjustments,
  hasDailyCalorieVariation,
} from "../_shared/dailyAdjustments.ts";

const DIET_CORE_PROMPT = `Você é o AGENTE DIETÉTICO MAROMBIEW, um sistema especialista em nutrição esportiva e clínica focado em hipertrofia, emagrecimento e performance.
Seu objetivo é gerar planos alimentares matematicamente precisos, variados e práticos.

ORDEM DE PRIORIDADE:
1. Restrições e Alergias (NUNCA ignore).
2. Metas Calóricas e Macros.
3. Preferências e Praticidade do Aluno.
4. Variedade (Evite repetir o que o aluno já comeu recentemente).
5. Estrutura Nutricional (Distribuição de proteínas nas refeições).`;

const DIET_STRUCTURED_PROMPT = `
========================================
FORMATO DE SAÍDA (JSON ESTRUTURADO)
========================================
Gere o cardápio EXCLUSIVAMENTE no formato JSON solicitado.
PROIBIDO incluir:
- Tabelas Markdown
- Mensagens de WhatsApp
- Blocos de treino
- Perguntas ao usuário
- Instruções de "uma coisa por vez"

O JSON deve seguir exatamente a estrutura:
{
  "meals": [
    {
      "meal": "Nome da Refeição",
      "time": "HH:MM",
      "foods": [
        { "food": "Nome do Alimento", "amount": "100g", "calories": 150, "protein": 20, "carbs": 10, "fat": 2 }
      ],
      "total_calories": 150,
      "total_protein": 20,
      "total_carbs": 10,
      "total_fat": 2
    }
  ],
  "dailyAdjustments": [
    { "day": "SEGUNDA-FEIRA", "target_kcal": 2000, "instructions": "...", "adjustment_type": "fixed" }
  ]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const {
      student_id,
      intent = "new",
      intensity = "medium",
      requireMenuVariation = false,
      schedule,
      outputMode = "json",
    } = await req.json();

    if (!student_id) {
      return new Response(JSON.stringify({ error: "student_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: student } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", student_id)
      .single();

    const { data: history } = await supabaseClient
      .from("diet_plans")
      .select("*")
      .eq("student_id", student_id)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(3);

    const historySummary = history
      ?.map((h, i) => `PLANO ${i + 1}:\n${JSON.stringify(h.conteudo_json)}`)
      .join("\n\n");

    const modelAttempts: any[] = [];
    const variationRetryAllowed = intent !== "update";

    const callModel = async (prompt: string, model: string, reason: string) => {
      const systemPrompt = `${DIET_CORE_PROMPT}\n${outputMode === "json" ? DIET_STRUCTURED_PROMPT : ""}`;
      const res = await callAI({
        model,
        systemPrompt,
        userPrompt: prompt,
        temperature: 0.7,
      });

      modelAttempts.push({
        model,
        reason,
        usage: res.usage,
      });

      if (!res.content) {
        return { ok: false, error: "Empty response", retryable: true, error_code: "empty_response" };
      }

      if (outputMode === "json") {
        try {
          return { ok: true, plan: JSON.parse(res.content) };
        } catch (e) {
          console.error("diet-agent: invalid JSON", e, res.content.slice(0, 500));
          return { ok: false, error: "Invalid JSON", retryable: true, error_code: "invalid_json" };
        }
      }

      return { ok: true, content: res.content };
    };

    /** Unified evaluation pipeline for diet candidates. */
    const evaluateDietCandidate = (params: {
      plan: any;
      historyJsons: any[];
      schedule: any;
      intensity: VariationIntensity;
      threshold: number;
      variationRetryAllowed: boolean;
      requireMenuVariation: boolean;
    }) => {
      const similarity = computeDietSimilarity(params.plan, params.historyJsons);
      const nutrition = validateDietNutrition(params.plan);
      
      let normalizedAdj: any = null;
      let adjValidation = { ok: true, errors: [] as string[] };
      
      if (params.schedule && typeof params.schedule === "object" && params.schedule.days) {
        const { adjustments, missing } = normalizeDailyAdjustments(
          (params.plan as any).dailyAdjustments,
          params.schedule
        );
        normalizedAdj = adjustments;
        adjValidation = hasDailyCalorieVariation(params.schedule)
          ? validateDailyAdjustments(adjustments, missing)
          : { ok: true, errors: [] as string[] };
      }

      const qOnly = similarity.quantityOnlyRatio ?? 0;
      const isPortionOnly = similarity.changeKind === "portion_only";
      const protRepeat = similarity.primaryProteinRepeatRatio ?? 0;
      const carbRepeat = similarity.primaryCarbRepeatRatio ?? 0;
      const primarySourceTooRepetitive = Math.max(protRepeat, carbRepeat) >= 0.6;

      const variationFailure =
        params.variationRetryAllowed &&
        params.historyJsons.length > 0 &&
        (
          similarity.score > params.threshold ||
          isPortionOnly ||
          (params.requireMenuVariation && qOnly > 0.3) ||
          primarySourceTooRepetitive
        );

      const needsRetry = !nutrition.ok || !adjValidation.ok || variationFailure;

      return {
        plan: params.plan,
        similarity,
        nutrition,
        normalizedAdj,
        adjValidation,
        variationFailure,
        needsRetry,
        qOnly,
        isPortionOnly,
        protRepeat,
        carbRepeat,
        primarySourceTooRepetitive
      };
    };

    const threshold = SIMILARITY_THRESHOLDS[intensity as VariationIntensity];
    let fallbackReason: string | null = null;
    let fallbackReasons: string[] = [];

    const first = await callModel(
      `Gere um cardápio para o aluno ${student?.full_name || "Estudante"}. Histórico:\n${historySummary || "Sem histórico."}`,
      AI_MODELS.primary,
      "first_attempt"
    );

    if (!first.ok) {
      fallbackReason = first.error_code || "first_attempt_failed";
      fallbackReasons.push(fallbackReason);
      const second = await callModel(
        `Tente novamente respeitando o contrato JSON. Erro anterior: ${first.error}`,
        AI_MODELS.fallback,
        "critical_fallback"
      );
      if (!second.ok) {
        const routingMeta = createRoutingMetadata(modelAttempts, fallbackReason, fallbackReasons);
        return new Response(JSON.stringify({ 
          error: second.error, 
          error_code: second.error_code,
          aiRouting: routingMeta.routing,
          aiUsage: routingMeta.usage
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      first.plan = second.plan;
      first.ok = true;
    }

    const historyJsons = history
      ?.map((h) => h.conteudo_json)
      .filter((j) => j && typeof j === "object") as any[];

    const result1 = evaluateDietCandidate({
      plan: first.plan,
      historyJsons,
      schedule,
      intensity,
      threshold,
      variationRetryAllowed,
      requireMenuVariation
    });

    let finalPlan = result1.plan;
    let finalNormalizedAdj = result1.normalizedAdj;
    let finalSimilarity = result1.similarity;
    let finalNutrition = result1.nutrition;
    let finalAdjValidation = result1.adjValidation;
    let regenerated = false;

    if (result1.needsRetry && variationRetryAllowed) {
      fallbackReason = result1.variationFailure ? "high_similarity" : (!result1.nutrition.ok ? "nutrition_invalid" : "adj_invalid");
      fallbackReasons.push(fallbackReason);
      
      const second = await callModel(
        `O cardápio anterior teve problemas: ${fallbackReason}. Por favor, gere um cardápio melhor e mais variado.`,
        AI_MODELS.fallback,
        "retry_variation"
      );

      if (second.ok) {
        const result2 = evaluateDietCandidate({
          plan: second.plan,
          historyJsons,
          schedule,
          intensity,
          threshold,
          variationRetryAllowed,
          requireMenuVariation
        });

        // Simplified logic: accept Terra if it fixes a hard error or is less similar
        const fixesError = (!result1.nutrition.ok && result2.nutrition.ok) || (!result1.adjValidation.ok && result2.adjValidation.ok);
        const betterVariation = result2.similarity.score < result1.similarity.score;

        if (fixesError || betterVariation) {
          finalPlan = result2.plan;
          finalNormalizedAdj = result2.normalizedAdj;
          finalSimilarity = result2.similarity;
          finalNutrition = result2.nutrition;
          finalAdjValidation = result2.adjValidation;
          regenerated = true;
        }
      }
    }

    const routingMeta = createRoutingMetadata(modelAttempts, fallbackReason, fallbackReasons);
    return new Response(JSON.stringify({
      plan: finalPlan,
      dailyAdjustments: finalNormalizedAdj,
      similarity: {
        score: finalSimilarity.score,
        threshold,
        intensity,
        regenerated
      },
      nutrition: finalNutrition,
      adjValidation: finalAdjValidation,
      aiRouting: routingMeta.routing,
      aiUsage: routingMeta.usage
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("diet-agent error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
