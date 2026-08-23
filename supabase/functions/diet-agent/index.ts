import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  AI_MODELS,
  callAI,
  createRoutingMetadata,
  type AIRouterResponse,
} from "../_shared/aiModelRouter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  normalizeDailyAdjustments,
  validateDailyAdjustments,
  hasDailyCalorieVariation,
} from "../_shared/dailyAdjustments.ts";
import {
  computeDietSimilarity,
  SIMILARITY_THRESHOLDS,
  validateDietNutrition,
  type VariationIntensity,
  type DietNutritionValidation,
} from "../_shared/planSimilarity.ts";

const DIET_CORE_PROMPT = `Você é o AGENTE DIETÉTICO MAROMBIEW, um sistema especialista em nutrição esportiva e clínica focado em hipertrofia, emagrecimento e performance.
Seu objetivo é gerar planos alimentares matematicamente precisos, variados e práticos.

ORDEM DE PRIORIDADE:
1. Restrições e Alergias (NUNCA ignore).
2. Metas Calóricas e Macros.
3. Preferências e Praticidade do Aluno.
4. Variedade (Evite repetir o que o aluno já comeu recentemente).`;

const DIET_STRUCTURED_PROMPT = `Gere o plano alimentar EXCLUSIVAMENTE no formato JSON solicitado.
Você deve calcular as calorias de cada alimento e garantir que a soma diária respeite a meta (tolerância de ±75 kcal).
Use o banco de alimentos fornecido sempre que possível.

O JSON deve seguir rigorosamente a estrutura DietPlan.`;

interface AIAttempt {
  content: string | null;
  usage: any;
  durationMs: number;
  model: string;
}

export async function evaluateDietCandidate(
  content: string | null,
  intent: string,
  metaBase: number,
  history: any[],
  intensity: VariationIntensity,
): Promise<{ ok: boolean; reason?: string; plan?: any; similarity?: any; nutrition?: DietNutritionValidation }> {
  if (!content) return { ok: false, reason: "empty_content" };

  let plan: any;
  try {
    const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
    plan = JSON.parse(cleanContent);
  } catch (e) {
    return { ok: false, reason: "invalid_json" };
  }

  // 1. Basic Structure
  if (!plan.meals || !Array.isArray(plan.meals)) return { ok: false, reason: "missing_meals" };

  // 2. Nutrition Guardrails
  const nutrition = validateDietNutrition(plan);
  if (!nutrition.ok) {
    return { ok: false, reason: "nutrition_failed", plan, nutrition };
  }

  // 3. Goal Adherence (±75 kcal)
  const diff = Math.abs(nutrition.totalKcal - metaBase);
  if (diff > 75) {
    return { ok: false, reason: "kcal_out_of_range", plan, nutrition };
  }

  // 4. Similarity History (Skip for 'update' intent)
  let similarity;
  if (intent !== "update") {
    similarity = computeDietSimilarity(plan, history);
    const threshold = SIMILARITY_THRESHOLDS[intensity as VariationIntensity];
    if (similarity.score > threshold) {
      return { ok: false, reason: "too_similar", plan, similarity };
    }
  }

  return { ok: true, plan, similarity, nutrition };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      student_id,
      intent = "create",
      metaBase = 2000,
      variationIntensity = "media",
      history = [],
      preferences = "",
      restrictions = "",
      outputMode = "json",
    } = await req.json();

    if (!student_id) throw new Error("student_id is required");

    const attempts: AIAttempt[] = [];
    let finalCandidate: any = null;
    let finalModel = AI_MODELS.primary;

    // ATTEMPT 1: Luna (Primary)
    const lunaStart = Date.now();
    const lunaRes = await callAI({
      model: AI_MODELS.primary,
      systemPrompt: DIET_CORE_PROMPT + "\n" + DIET_STRUCTURED_PROMPT,
      userPrompt: `Aluno ID: ${student_id}\nMeta: ${metaBase} kcal\nPreferências: ${preferences}\nRestrições: ${restrictions}\nHistórico: ${JSON.stringify(history)}`,
    });
    attempts.push({ ...lunaRes, model: AI_MODELS.primary });

    const lunaEval = await evaluateDietCandidate(
      lunaRes.content,
      intent,
      metaBase,
      history,
      variationIntensity as VariationIntensity,
    );

    if (lunaEval.ok) {
      finalCandidate = lunaEval;
    } else {
      // ATTEMPT 2: Terra (Fallback)
      finalModel = AI_MODELS.fallback;
      const terraRes = await callAI({
        model: AI_MODELS.fallback,
        systemPrompt: DIET_CORE_PROMPT + "\n" + DIET_STRUCTURED_PROMPT + "\nAJUSTE: O candidato anterior falhou por: " + lunaEval.reason,
        userPrompt: `Aluno ID: ${student_id}\nMeta: ${metaBase} kcal\nPreferências: ${preferences}\nRestrições: ${restrictions}\nHistórico: ${JSON.stringify(history)}`,
      });
      attempts.push({ ...terraRes, model: AI_MODELS.fallback });

      const terraEval = await evaluateDietCandidate(
        terraRes.content,
        intent,
        metaBase,
        history,
        variationIntensity as VariationIntensity,
      );

      if (terraEval.ok) {
        finalCandidate = terraEval;
      } else {
        // Critical Failure
        const routing = createRoutingMetadata(attempts);
        return new Response(
          JSON.stringify({
            error: "review_required",
            reason: terraEval.reason,
            routing,
            attempts: attempts.length
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const routing = createRoutingMetadata(attempts);
    return new Response(
      JSON.stringify({
        plan: finalCandidate.plan,
        similarity: finalCandidate.similarity,
        nutrition: finalCandidate.nutrition,
        routing,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
