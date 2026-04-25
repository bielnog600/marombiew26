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
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

/**
 * Build a rich student context (similar to DietaIA front-end) so diet-agent
 * has enough data to produce a coherent renewed diet.
 */
async function buildStudentContextForAgent(supabase: any, studentId: string) {
  const [{ data: profile }, { data: sp }, { data: assessment }] = await Promise.all([
    supabase.from("profiles").select("nome").eq("user_id", studentId).maybeSingle(),
    supabase
      .from("students_profile")
      .select("data_nascimento, sexo, altura, objetivo, observacoes, restricoes, lesoes, raca")
      .eq("user_id", studentId)
      .maybeSingle(),
    supabase
      .from("assessments")
      .select("id")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let antro: any = null;
  let comp: any = null;
  let questionario: any = null;

  if (assessment?.id) {
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from("anthropometrics").select("*").eq("assessment_id", assessment.id).maybeSingle(),
      supabase.from("composition").select("*").eq("assessment_id", assessment.id).maybeSingle(),
    ]);
    antro = a;
    comp = c;
  }

  const { data: q } = await supabase
    .from("diet_questionnaires")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  questionario = q;

  return {
    nome: profile?.nome,
    sexo: sp?.sexo,
    data_nascimento: sp?.data_nascimento,
    altura: sp?.altura,
    objetivo: sp?.objetivo,
    observacoes: sp?.observacoes,
    restricoes: sp?.restricoes,
    lesoes: sp?.lesoes,
    raca: sp?.raca,
    peso: antro?.peso,
    imc: antro?.imc,
    cintura: antro?.cintura,
    quadril: antro?.quadril,
    rcq: antro?.rcq,
    antropometria_completa: antro,
    percentual_gordura: comp?.percentual_gordura,
    massa_magra: comp?.massa_magra,
    massa_gorda: comp?.massa_gorda,
    composicao_obs: comp?.observacoes,
    questionario_dieta: questionario,
  };
}

/**
 * Calls the diet-agent (which streams SSE) and accumulates the final markdown.
 */
async function callDietAgent(prompt: string, studentContext: any): Promise<string> {
  const url = `${SUPABASE_URL}/functions/v1/diet-agent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      studentContext,
    }),
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    throw new Error(`diet-agent error ${resp.status}: ${text.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let accumulated = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, idx);
      textBuffer = textBuffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) accumulated += content;
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  return accumulated.trim();
}

/**
 * Generate a renewed-diet draft using diet-agent + the latest renewal analysis.
 * Saves a snapshot of the current plan to diet_plan_versions and creates a new
 * ai_plans row with is_draft=true and parent_plan_id pointing to the live plan.
 */
async function generateDraft(
  supabase: any,
  planId: string,
  source: "manual" | "auto",
) {
  const { data: plan, error } = await supabase
    .from("ai_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error || !plan) throw new Error("Plan not found");
  if (plan.is_draft) throw new Error("Source plan is already a draft");

  // If a draft already exists for this plan, return it instead of duplicating
  const { data: existingDraft } = await supabase
    .from("ai_plans")
    .select("*")
    .eq("parent_plan_id", planId)
    .eq("is_draft", true)
    .maybeSingle();
  if (existingDraft) {
    return { draft: existingDraft, reused: true };
  }

  // Latest analysis for context
  const { data: latestAnalysis } = await supabase
    .from("diet_renewal_analysis")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const studentContext = await buildStudentContextForAgent(supabase, plan.student_id);

  const ctxBlock = latestAnalysis
    ? `\n\n=== ANÁLISE DE RENOVAÇÃO DA IA ===\n` +
      `Sugestão: ${latestAnalysis.suggested_action}\n` +
      `Aderência: ${latestAnalysis.adherence_score ?? "—"}\n` +
      `Frequência registro: ${latestAnalysis.meal_log_frequency ?? "—"}\n` +
      `Tendência peso: ${latestAnalysis.weight_trend ?? "—"}\n` +
      `Justificativa: ${latestAnalysis.rationale}\n` +
      `=== FIM ANÁLISE ===\n`
    : "";

  const previousExcerpt = (plan.conteudo ?? "").slice(0, 1500);

  const prompt = `Você está RENOVANDO o ciclo alimentar de 45 dias deste aluno.${ctxBlock}

OBJETIVO DA RENOVAÇÃO:
- Considere a aderência, evolução de peso e justificativa da IA acima
- Aumente variedade e evite repetir EXATAMENTE os mesmos alimentos do plano anterior
- Mantenha o objetivo do aluno e a fase atual
- Ajuste calorias/macros conforme tendência (peso subindo em cutting → reduzir; peso descendo em bulking → aumentar)

TRECHO DO PLANO ATUAL (referência do que NÃO repetir 100%):
${previousExcerpt}

ENTREGUE OBRIGATORIAMENTE:
1) Tabela de TMB e escolha justificada
2) GET e Consumo Energético com ajuste pela tendência observada
3) Distribuição de macros (P, C, G)
4) EXATAMENTE 3 opções de cardápio completas e diferentes entre si, em tabela:
   Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição
5) Total de cada refeição e do dia
6) Timing nutricional pré/pós-treino
7) Mensagens prontas para WhatsApp explicando a nova fase`;

  const draftContent = await callDietAgent(prompt, studentContext);
  if (!draftContent || draftContent.length < 200) {
    throw new Error("Conteúdo do rascunho insuficiente — tente novamente");
  }

  // Snapshot current plan into versions
  await supabase.from("diet_plan_versions").insert({
    plan_id: plan.id,
    student_id: plan.student_id,
    version: plan.version ?? 1,
    titulo: plan.titulo,
    conteudo: plan.conteudo,
    fase: plan.fase,
    source: source === "manual" ? "manual_draft" : "auto_renewal",
    archived_at: new Date().toISOString(),
  });

  const reason =
    latestAnalysis?.rationale?.slice(0, 500) ??
    (source === "manual" ? "Rascunho gerado manualmente pelo admin." : "Rascunho gerado automaticamente.");

  const { data: draft, error: draftErr } = await supabase
    .from("ai_plans")
    .insert({
      student_id: plan.student_id,
      tipo: "dieta",
      titulo: `${plan.titulo} (rascunho v${(plan.version ?? 1) + 1})`,
      conteudo: draftContent,
      fase: plan.fase,
      cycle_days: plan.cycle_days,
      cycle_status: "rascunho_gerado",
      renewal_mode: plan.renewal_mode,
      parent_plan_id: plan.id,
      version: (plan.version ?? 1) + 1,
      is_draft: true,
      draft_source: source,
      draft_reason: reason,
      draft_analysis_id: latestAnalysis?.id ?? null,
    })
    .select()
    .single();
  if (draftErr) throw draftErr;

  // Update parent status + link analysis
  await supabase
    .from("ai_plans")
    .update({ cycle_status: "rascunho_gerado" })
    .eq("id", plan.id);

  if (latestAnalysis?.id) {
    await supabase
      .from("diet_renewal_analysis")
      .update({ draft_plan_id: draft.id })
      .eq("id", latestAnalysis.id);
  }

  return { draft, reused: false };
}

async function discardDraft(supabase: any, draftId: string) {
  const { data: draft } = await supabase
    .from("ai_plans")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || !draft.is_draft) throw new Error("Draft not found");

  const parentId = draft.parent_plan_id;
  await supabase.from("ai_plans").delete().eq("id", draftId);

  if (parentId) {
    // Revert parent to "renovacao_sugerida" if there is an analysis, else pre_renovacao
    const { data: latest } = await supabase
      .from("diet_renewal_analysis")
      .select("suggested_action")
      .eq("plan_id", parentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newStatus = latest ? actionToCycleStatus(latest.suggested_action) : "pre_renovacao";
    await supabase.from("ai_plans").update({ cycle_status: newStatus }).eq("id", parentId);
  }

  return { ok: true };
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
      // Find all active diet plans whose remaining days <= 15 and analyze
      const { data: plans } = await supabase
        .from("ai_plans")
        .select("id, created_at, cycle_days, cycle_status, is_draft")
        .eq("tipo", "dieta")
        .eq("is_draft", false);
      const now = Date.now();
      const due = (plans ?? []).filter((p: any) => {
        const elapsed = Math.floor((now - new Date(p.created_at).getTime()) / 86400000);
        const remaining = (p.cycle_days ?? 45) - elapsed;
        return remaining <= 15;
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

    if (action === "generate_draft") {
      const planId = body.plan_id;
      const source = (body.source as "manual" | "auto") ?? "manual";
      if (!planId) throw new Error("plan_id required");
      const { draft, reused } = await generateDraft(supabase, planId, source);
      return new Response(JSON.stringify({ ok: true, draft_id: draft.id, reused }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "discard_draft") {
      const draftId = body.draft_id;
      if (!draftId) throw new Error("draft_id required");
      const r = await discardDraft(supabase, draftId);
      return new Response(JSON.stringify(r), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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