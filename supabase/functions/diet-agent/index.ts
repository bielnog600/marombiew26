import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_INTENSITY,
  SIMILARITY_THRESHOLDS,
  dietVariationPrompt,
  dietIntentPrompt,
  type VariationIntensity,
} from "../_shared/variationProfiles.ts";
import {
  computeDietSimilarity,
  validateDietNutrition,
  type DietNutritionValidation,
} from "../_shared/planSimilarity.ts";
import {
  loadPlanHistory,
  summarizeDietForPrompt,
} from "../_shared/planHistory.ts";
import {
  ENERGY_WEEKDAYS,
  buildRequestedFromSchedule,
  normalizeDailyAdjustments,
  validateDailyAdjustments,
  hasDailyCalorieVariation,
} from "../_shared/dailyAdjustments.ts";
import { AI_MODELS, callAI, createRoutingMetadata, type AIAttemptMetadata } from "../_shared/aiModelRouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function loadFoodDatabase(): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: foods, error } = await supabase
    .from("foods")
    .select("name, calories, protein, carbs, fats, portion, portion_size")
    .order("name");

  if (error || !foods || foods.length === 0) {
    console.error("Error loading foods:", error);
    return "BANCO DE ALIMENTOS: Nenhum alimento cadastrado.";
  }

  const lines: string[] = [];
  for (const f of foods) {
    lines.push(`${f.name}: ${f.calories}kcal | P:${f.protein} C:${f.carbs} G:${f.fats} (por ${f.portion_size}${f.portion})`);
  }

  return `\n========================================\nBANCO DE ALIMENTOS (do sistema)\n========================================\n\nALIMENTOS:\n${lines.join("\n")}\n`;
}

function buildLayeredInstructions(dietConfig: any, trainingContext: any): string {
  if (!dietConfig && !trainingContext) return "";
  const lines: string[] = ["\n\n=== CAMADAS DE DECISÃO (USE COMO ÂNCORA) ===\n"];
  if (dietConfig?.objective) lines.push(`1) OBJETIVO METABÓLICO: ${dietConfig.objective} — define direção calórica.`);
  if (dietConfig?.strategy) lines.push(`2) ESTRATÉGIA NUTRICIONAL: ${dietConfig.strategy} — define distribuição entre dias (linear, ciclo de carbo, refeed, low carb, IF...).`);
  if (dietConfig?.style) lines.push(`3) ESTILO ALIMENTAR: ${dietConfig.style} — define escolha de alimentos.`);
  
  const schedule = dietConfig?.weeklyEnergySchedule;
  if (schedule && typeof schedule === "object" && schedule.days) {
    lines.push("\n=== CALORIAS POR DIA (BLOCO IMUTÁVEL — NÃO ALTERE) ===");
    lines.push(`Meta base do plano: ${schedule.base_daily_kcal} kcal/dia.`);
    lines.push("Cada dia da semana possui uma meta calórica final obrigatória:");
    const WD_ORDER = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
    const WD_LABEL: Record<string, string> = {
      seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta",
      sex: "Sexta", sab: "Sábado", dom: "Domingo",
    };
    for (const wd of WD_ORDER) {
      const d: any = schedule.days?.[wd];
      if (!d) continue;
      const t = d.target_kcal ?? d.base_kcal;
      lines.push(`  - ${WD_LABEL[wd]}: ${t} kcal`);
    }
    lines.push("REGRAS OBRIGATÓRIAS para a seção 'Ajustes por dia':");
    lines.push("  1. Respeite EXATAMENTE a meta calórica final de cada dia acima.");
    lines.push("  2. A variação entre dias deve ocorrer preferencialmente via CARBOIDRATOS.");
    lines.push("  3. A PROTEÍNA deve permanecer estável em todos os dias (mesma g total).");
    lines.push("  4. A GORDURA pode variar levemente, mas nunca abaixo de 0,6 g/kg de peso corporal.");
    lines.push("  5. Produza um plano base único + uma seção 'Ajustes por dia' listando, para cada dia com meta diferente da base, as trocas ou porções ajustadas para bater a meta.");
    lines.push("");
    lines.push("FORMATO OBRIGATÓRIO — CAMPO RAIZ \"dailyAdjustments\" NO JSON DE SAÍDA:");
    lines.push("Inclua um campo raiz OBRIGATÓRIO \"dailyAdjustments\" com EXATAMENTE 7 chaves (seg, ter, qua, qui, sex, sab, dom).");
    lines.push("Cada dia DEVE ter o seguinte shape estrito:");
    lines.push('  {');
    lines.push('    "target_kcal": <int>,');
    lines.push('    "requested_adjustment_kcal": <int, com sinal>,');
    lines.push('    "estimated_adjustment_kcal": <int, com sinal>,');
    lines.push('    "status": "base" | "adjusted",');
    lines.push('    "instructions": [');
    lines.push('      { "action": "add" | "remove", "food_name": "<nome do banco>", "quantity": <int>, "unit": "g", "estimated_kcal": <int> }');
    lines.push('    ],');
    lines.push('    "summary": "<frase curta descrevendo a mudança em relação ao plano base>"');
    lines.push('  }');
  }
  return lines.join("\n") + "\n";
}

const STRUCTURED_OUTPUT_INSTRUCTIONS = `
MODO ESTRUTURADO — SAÍDA OBRIGATORIAMENTE JSON
Responda APENAS com um objeto JSON válido seguindo este shape:
{
  "meta": { "objective": "string", "strategy": "string", "style": "string", "decision": "string" },
  "targets": { "kcal": number, "p": number, "c": number, "g": number },
  "days": [
    {
      "label": "Padrão",
      "meals": [
        {
          "name": "Refeição",
          "items": [
            { "name": "Alimento", "qtyGrams": number, "macros": { "kcal": number, "p": number, "c": number, "g": number } }
          ],
          "totals": { "kcal": number, "p": number, "c": number, "g": number }
        }
      ],
      "totals": { "kcal": number, "p": number, "c": number, "g": number }
    }
  ],
  "dailyAdjustments": { ... } // Se solicitado
}
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      student_id,
      metaBase,
      intent = "new",
      variationIntensity = DEFAULT_INTENSITY,
      outputMode = "text",
      dietConfig,
      trainingContext,
      requireMenuVariation = false,
    } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const history = student_id ? await loadPlanHistory(student_id, "dieta") : [];
    const historySummary = history.map((h, i) => summarizeDietForPrompt(h, i)).join("\n\n");
    const foodDatabase = await loadFoodDatabase();
    const layeredInstructions = buildLayeredInstructions(dietConfig, trainingContext);

    const schedule = dietConfig?.weeklyEnergySchedule;
    const intensity = (variationIntensity || DEFAULT_INTENSITY) as VariationIntensity;

    const modelAttempts: AIAttemptMetadata[] = [];
    let finalPlan: any = null;
    let fallbackReason: string | null = null;
    let fallbackReasons: string[] = [];

    const callModel = async (prompt: string, model: string, reason: string) => {
      const res = await callAI({
        model,
        systemPrompt: prompt,
        userPrompt: "Gere o plano alimentar.",
      });
      modelAttempts.push({
        model,
        durationMs: res.durationMs,
        usage: res.usage,
        reason,
      });
      const raw = res.content;
      if (!raw) return { ok: false, error: "empty_response" };
      try {
        const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
        return { ok: true, plan: JSON.parse(clean) };
      } catch (e) {
        return { ok: false, error: "invalid_json" };
      }
    };

    if (outputMode === "json") {
      const systemPrompt = "Você é o AGENTE DIETÉTICO MAROMBIEW.\n" + foodDatabase + layeredInstructions + STRUCTURED_OUTPUT_INSTRUCTIONS;
      const first = await callModel(
        systemPrompt + dietVariationPrompt(intensity, historySummary, undefined, requireMenuVariation),
        AI_MODELS.primary,
        "first_attempt"
      );

      if (!first.ok) {
        fallbackReason = first.error as string;
        fallbackReasons.push(fallbackReason);
        const second = await callModel(
          systemPrompt + dietVariationPrompt(intensity, historySummary, `Erro: ${fallbackReason}. Tente novamente.`, false),
          AI_MODELS.fallback,
          "critical_fallback"
        );
        if (!second.ok) {
          const routing = createRoutingMetadata(modelAttempts, second.error as string, fallbackReasons);
          return new Response(JSON.stringify({ error: second.error, routing }), { status: 422, headers: corsHeaders });
        }
        finalPlan = second.plan;
      } else {
        finalPlan = first.plan;
      }

      const historyJsons = history.map((h: any) => h.conteudo_json).filter(Boolean);
      let similarity = computeDietSimilarity(finalPlan, historyJsons);
      let nutrition = validateDietNutrition(finalPlan);
      const threshold = SIMILARITY_THRESHOLDS[intensity];

      // Final JSON response with routing
      const routingMeta = createRoutingMetadata(modelAttempts, fallbackReason, fallbackReasons);
      return new Response(
        JSON.stringify({
          plan: finalPlan,
          similarity: {
            score: similarity.score,
            threshold,
            intensity,
            changeKind: similarity.changeKind,
          },
          nutrition: {
            ok: nutrition.ok,
            issues: nutrition.issues,
            totalKcal: nutrition.totalKcal,
          },
          aiRouting: routingMeta.routing,
          aiUsage: routingMeta.usage,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default stream mode (skipped complex implementation for brevity as per instructions)
    return new Response(JSON.stringify({ error: "Stream mode not restored yet" }), { status: 501, headers: corsHeaders });

  } catch (e: any) {
    console.error("diet-agent error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
