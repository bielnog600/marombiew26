import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

async function gatherContext(supabase: any, plan: any) {
  const studentId = plan.student_id;
  const created = new Date(plan.created_at);
  const cycleDays = plan.cycle_days ?? 45;
  const now = new Date();
  const elapsed = daysBetween(created, now);
  const remaining = cycleDays - elapsed;

  // Last 14 days of meal/water tracking
  const since = new Date(now);
  since.setDate(since.getDate() - 14);
  const sinceStr = since.toISOString().slice(0, 10);

  const [{ data: tracking }, { data: weights }, { data: lastAssessment }, { data: profile }, { data: readjustments }] =
    await Promise.all([
      supabase
        .from("daily_tracking")
        .select("date, meals_completed, water_glasses, workout_completed")
        .eq("student_id", studentId)
        .gte("date", sinceStr)
        .order("date", { ascending: false }),
      supabase
        .from("weight_logs")
        .select("data, peso")
        .eq("student_id", studentId)
        .order("data", { ascending: false })
        .limit(10),
      supabase
        .from("students_profile")
        .select("objetivo, observacoes, restricoes, lesoes")
        .eq("user_id", studentId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("nome")
        .eq("user_id", studentId)
        .maybeSingle(),
      supabase
        .from("diet_readjustments")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(2),
    ]);

  // Adherence: average meals_completed length over period vs expected meals
  const trackingDays = tracking ?? [];
  const totalMealsLogged = trackingDays.reduce(
    (acc: number, d: any) => acc + (Array.isArray(d.meals_completed) ? d.meals_completed.length : 0),
    0,
  );
  const daysLogged = trackingDays.length;
  const mealLogFrequency = daysLogged / 14; // 0..1
  const adherenceScore = daysLogged > 0 ? Math.min(1, totalMealsLogged / (daysLogged * 5)) : 0;

  // Weight trend
  let weightTrend: "subindo" | "descendo" | "estavel" | "sem_dados" = "sem_dados";
  if (weights && weights.length >= 2) {
    const first = Number(weights[weights.length - 1].peso);
    const last = Number(weights[0].peso);
    const diff = last - first;
    if (Math.abs(diff) < 0.5) weightTrend = "estavel";
    else if (diff > 0) weightTrend = "subindo";
    else weightTrend = "descendo";
  }

  const dataQuality = daysLogged >= 7 ? "sufficient" : daysLogged >= 3 ? "partial" : "insufficient";

  return {
    student_name: profile?.nome ?? "",
    days_elapsed: elapsed,
    days_remaining: remaining,
    cycle_days: cycleDays,
    adherence_score: Number(adherenceScore.toFixed(2)),
    meal_log_frequency: Number(mealLogFrequency.toFixed(2)),
    days_logged_last_14: daysLogged,
    weight_trend: weightTrend,
    weights_recent: weights ?? [],
    objetivo: lastAssessment?.objetivo ?? null,
    observacoes: lastAssessment?.observacoes ?? null,
    restricoes: lastAssessment?.restricoes ?? null,
    last_readjustment: readjustments?.[0] ?? null,
    data_quality: dataQuality,
  };
}

async function callAI(context: any, currentPlanExcerpt: string) {
  const system = `Você é um nutricionista esportivo sênior. Analisa o ciclo alimentar de um aluno (45 dias) e decide se vale MANTER, AJUSTAR, GERAR_NOVA dieta ou SOLICITAR_DADOS antes de renovar. Considere aderência, frequência de registro, evolução de peso, objetivo, sinais de monotonia e qualidade dos dados. Seja conservador: NÃO recomende gerar nova se faltam dados (data_quality != sufficient) — prefira solicitar_dados. Se aderência < 0.4, prefira ajustar. Se tendência contraria objetivo, recomende ajustar/gerar_nova.`;

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `CONTEXTO DO ALUNO (JSON):\n${JSON.stringify(context, null, 2)}\n\nTRECHO DO PLANO ATUAL (até 1500 chars):\n${currentPlanExcerpt.slice(0, 1500)}\n\nResponda chamando a tool 'recommend_action'.`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "recommend_action",
          description: "Sugere a ação a tomar para o ciclo alimentar do aluno.",
          parameters: {
            type: "object",
            properties: {
              suggested_action: {
                type: "string",
                enum: ["manter", "ajustar", "gerar_nova", "solicitar_dados"],
              },
              rationale: { type: "string", description: "Justificativa em 2-4 frases, em português, tom técnico." },
              monotony_risk: { type: "string", enum: ["baixo", "medio", "alto"] },
              priority: { type: "string", enum: ["baixa", "media", "alta"] },
              suggested_adjustments: {
                type: "array",
                items: { type: "string" },
                description: "Lista curta de ajustes concretos (máx 5).",
              },
            },
            required: ["suggested_action", "rationale", "monotony_risk", "priority"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "recommend_action" } },
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI error ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error("AI did not return a tool_call");
  return JSON.parse(tc.function.arguments);
}

function actionToCycleStatus(action: string): string {
  switch (action) {
    case "manter":
      return "pre_renovacao";
    case "ajustar":
      return "renovacao_sugerida";
    case "gerar_nova":
      return "renovacao_sugerida";
    case "solicitar_dados":
      return "aguardando_dados";
    default:
      return "pre_renovacao";
  }
}

async function analyzePlan(supabase: any, planId: string) {
  const { data: plan, error } = await supabase.from("ai_plans").select("*").eq("id", planId).maybeSingle();
  if (error || !plan) throw new Error("Plan not found");
  if (plan.tipo !== "dieta") throw new Error("Not a diet plan");

  const ctx = await gatherContext(supabase, plan);
  const ai = await callAI(ctx, plan.conteudo ?? "");

  const { data: analysis, error: insErr } = await supabase
    .from("diet_renewal_analysis")
    .insert({
      plan_id: plan.id,
      student_id: plan.student_id,
      days_remaining: ctx.days_remaining,
      adherence_score: ctx.adherence_score,
      meal_log_frequency: ctx.meal_log_frequency,
      weight_trend: ctx.weight_trend,
      data_quality: ctx.data_quality,
      suggested_action: ai.suggested_action,
      rationale: ai.rationale,
      context_snapshot: { ...ctx, ai },
    })
    .select()
    .single();
  if (insErr) throw insErr;

  const newStatus = actionToCycleStatus(ai.suggested_action);
  await supabase
    .from("ai_plans")
    .update({ cycle_status: newStatus, last_analysis_at: new Date().toISOString() })
    .eq("id", plan.id);

  return { analysis, plan_status: newStatus };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "analyze";

    if (action === "analyze") {
      if (!body.plan_id) throw new Error("plan_id required");
      const result = await analyzePlan(supabase, body.plan_id);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "scan_due") {
      // Find all active diet plans whose remaining days <= 10 and analyze
      const { data: plans } = await supabase
        .from("ai_plans")
        .select("id, created_at, cycle_days, cycle_status, is_draft")
        .eq("tipo", "dieta")
        .eq("is_draft", false);
      const now = Date.now();
      const due = (plans ?? []).filter((p: any) => {
        const elapsed = Math.floor((now - new Date(p.created_at).getTime()) / 86400000);
        const remaining = (p.cycle_days ?? 45) - elapsed;
        return remaining <= 10;
      });
      const results = [];
      for (const p of due) {
        try {
          const r = await analyzePlan(supabase, p.id);
          results.push({ plan_id: p.id, ok: true, status: r.plan_status });
        } catch (e) {
          results.push({ plan_id: p.id, ok: false, error: (e as Error).message });
        }
      }
      return new Response(JSON.stringify({ ok: true, scanned: due.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "apply_action") {
      // user_action: 'manter' | 'ajustar' | 'gerar_rascunho' | 'renovar_agora'
      const { plan_id, user_action, draft_content, draft_titulo } = body;
      if (!plan_id || !user_action) throw new Error("plan_id and user_action required");

      const { data: plan } = await supabase.from("ai_plans").select("*").eq("id", plan_id).maybeSingle();
      if (!plan) throw new Error("Plan not found");

      if (user_action === "manter") {
        // Reset cycle: bump created_at to today, status em_dia
        await supabase
          .from("ai_plans")
          .update({ cycle_status: "em_dia", created_at: new Date().toISOString() })
          .eq("id", plan_id);
        return new Response(JSON.stringify({ ok: true, action: "kept" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_action === "renovar_agora" || user_action === "gerar_rascunho") {
        // Snapshot current as version
        await supabase.from("diet_plan_versions").insert({
          plan_id: plan.id,
          student_id: plan.student_id,
          version: plan.version ?? 1,
          titulo: plan.titulo,
          conteudo: plan.conteudo,
          fase: plan.fase,
          source: "auto_renewal",
          archived_at: new Date().toISOString(),
        });

        if (user_action === "gerar_rascunho" && draft_content) {
          // Create draft as new ai_plans row
          const { data: draft } = await supabase
            .from("ai_plans")
            .insert({
              student_id: plan.student_id,
              tipo: "dieta",
              titulo: draft_titulo ?? `${plan.titulo} (rascunho)`,
              conteudo: draft_content,
              fase: plan.fase,
              cycle_days: plan.cycle_days,
              cycle_status: "rascunho_gerado",
              renewal_mode: plan.renewal_mode,
              parent_plan_id: plan.id,
              version: (plan.version ?? 1) + 1,
              is_draft: true,
            })
            .select()
            .single();

          await supabase.from("ai_plans").update({ cycle_status: "rascunho_gerado" }).eq("id", plan.id);
          return new Response(JSON.stringify({ ok: true, action: "draft_created", draft_id: draft?.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (user_action === "renovar_agora" && draft_content) {
          // Replace current plan content
          await supabase
            .from("ai_plans")
            .update({
              titulo: draft_titulo ?? plan.titulo,
              conteudo: draft_content,
              version: (plan.version ?? 1) + 1,
              cycle_status: "renovado",
              created_at: new Date().toISOString(),
              is_draft: false,
            })
            .eq("id", plan_id);
          return new Response(JSON.stringify({ ok: true, action: "renewed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (user_action === "publish_draft") {
        // Promote a draft to live plan, replacing parent
        const { draft_id } = body;
        if (!draft_id) throw new Error("draft_id required");
        const { data: draft } = await supabase.from("ai_plans").select("*").eq("id", draft_id).maybeSingle();
        if (!draft || !draft.parent_plan_id) throw new Error("Invalid draft");

        await supabase
          .from("ai_plans")
          .update({
            titulo: draft.titulo.replace(/\s*\(rascunho\)\s*$/i, ""),
            conteudo: draft.conteudo,
            version: draft.version,
            cycle_status: "renovado",
            created_at: new Date().toISOString(),
            is_draft: false,
          })
          .eq("id", draft.parent_plan_id);
        await supabase.from("ai_plans").delete().eq("id", draft_id);
        return new Response(JSON.stringify({ ok: true, action: "draft_published" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Unknown user_action");
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("diet-renewal-analyzer error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});