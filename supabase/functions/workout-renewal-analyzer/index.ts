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
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function trend(values: number[]): "subindo" | "descendo" | "estavel" | "sem_dados" {
  if (values.length < 3) return "sem_dados";
  const first = values.slice(0, Math.max(1, Math.floor(values.length / 3)));
  const last = values.slice(-Math.max(1, Math.floor(values.length / 3)));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const a = avg(first);
  const b = avg(last);
  const diff = b - a;
  const rel = a !== 0 ? diff / a : diff;
  if (Math.abs(rel) < 0.03) return "estavel";
  return rel > 0 ? "subindo" : "descendo";
}

async function gatherContext(supabase: any, plan: any) {
  const studentId = plan.student_id;
  const created = new Date(plan.created_at);
  const cycleDays = plan.cycle_days ?? 45;
  const now = new Date();
  const elapsed = daysBetween(created, now);
  const remaining = cycleDays - elapsed;

  // Look at the last 21 days of training activity
  const since = new Date(now);
  since.setDate(since.getDate() - 21);
  const sinceIso = since.toISOString();

  const [
    { data: sessions },
    { data: setLogs },
    { data: tracking },
    { data: profile },
    { data: sp },
    { data: alerts },
  ] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("id, status, completed_at, started_at, duration_minutes, exercises_completed, total_exercises, total_sets, total_volume_kg, avg_rpe, day_name, phase")
      .eq("student_id", studentId)
      .gte("completed_at", sinceIso)
      .order("completed_at", { ascending: false }),
    supabase
      .from("exercise_set_logs")
      .select("exercise_name, muscle_group, set_number, reps, weight_kg, rpe, performed_at")
      .eq("student_id", studentId)
      .gte("performed_at", sinceIso)
      .order("performed_at", { ascending: true }),
    supabase
      .from("daily_tracking")
      .select("date, workout_completed")
      .eq("student_id", studentId)
      .gte("date", since.toISOString().slice(0, 10)),
    supabase.from("profiles").select("nome").eq("user_id", studentId).maybeSingle(),
    supabase
      .from("students_profile")
      .select("objetivo, observacoes, restricoes, lesoes")
      .eq("user_id", studentId)
      .maybeSingle(),
    supabase
      .from("behavioral_alerts")
      .select("alert_key, priority, title, status, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const completedSessions = (sessions ?? []).filter((s: any) => s.status === "completed");
  const abandonedSessions = (sessions ?? []).filter((s: any) => s.status !== "completed");
  const sessionsCount = completedSessions.length;
  const sessionFrequency = sessionsCount / 3; // sessions per week (21 days)

  // Completion rate (exercises_completed / total_exercises)
  const compRates = completedSessions
    .filter((s: any) => (s.total_exercises ?? 0) > 0)
    .map((s: any) => Math.min(1, (s.exercises_completed ?? 0) / s.total_exercises));
  const completionRate = compRates.length
    ? compRates.reduce((a: number, b: number) => a + b, 0) / compRates.length
    : null;

  // Aderência geral: workout_completed days / 21 + completion mix
  const trackingDays = tracking ?? [];
  const workoutDays = trackingDays.filter((d: any) => d.workout_completed).length;
  const baseAdherence = workoutDays / 21;
  const adherenceScore = Math.min(
    1,
    completionRate != null ? baseAdherence * 0.6 + completionRate * 0.4 : baseAdherence,
  );

  // Load / reps / volume progressions across all sets
  const loads = (setLogs ?? [])
    .map((s: any) => Number(s.weight_kg))
    .filter((n: number) => !Number.isNaN(n) && n > 0);
  const reps = (setLogs ?? [])
    .map((s: any) => Number(s.reps))
    .filter((n: number) => !Number.isNaN(n) && n > 0);
  const volumePerSession = completedSessions
    .map((s: any) => Number(s.total_volume_kg))
    .filter((n: number) => !Number.isNaN(n) && n > 0)
    .reverse(); // oldest to newest

  const loadProgression = trend(loads);
  const repsProgression = trend(reps);
  const volumeTrend = trend(volumePerSession);

  const rpes = completedSessions
    .map((s: any) => Number(s.avg_rpe))
    .filter((n: number) => !Number.isNaN(n) && n > 0);
  const avgRpe = rpes.length ? rpes.reduce((a: number, b: number) => a + b, 0) / rpes.length : null;

  // Fatigue / monotony heuristics
  let fatigueSignal: "baixa" | "media" | "alta" = "baixa";
  if (avgRpe != null && avgRpe >= 9) fatigueSignal = "alta";
  else if (avgRpe != null && avgRpe >= 8) fatigueSignal = "media";

  // Monotony: same exercises every session, no load progression
  const distinctExercises = new Set((setLogs ?? []).map((s: any) => s.exercise_name)).size;
  let monotonyRisk: "baixo" | "medio" | "alto" = "baixo";
  if (distinctExercises > 0 && distinctExercises < 8 && loadProgression !== "subindo") monotonyRisk = "alto";
  else if (loadProgression === "estavel" && volumeTrend === "estavel") monotonyRisk = "medio";

  // Pain/injury alerts
  const painAlerts = (alerts ?? []).filter((a: any) =>
    /dor|lesao|lesão|restric/i.test(a.alert_key + " " + a.title),
  );

  const dataQuality = sessionsCount >= 6 ? "sufficient" : sessionsCount >= 3 ? "partial" : "insufficient";

  return {
    student_name: profile?.nome ?? "",
    days_elapsed: elapsed,
    days_remaining: remaining,
    cycle_days: cycleDays,
    sessions_last_21d: sessionsCount,
    abandoned_sessions: abandonedSessions.length,
    session_frequency: Number(sessionFrequency.toFixed(2)),
    completion_rate: completionRate != null ? Number(completionRate.toFixed(2)) : null,
    adherence_score: Number(adherenceScore.toFixed(2)),
    load_progression: loadProgression,
    reps_progression: repsProgression,
    volume_trend: volumeTrend,
    avg_rpe: avgRpe != null ? Number(avgRpe.toFixed(1)) : null,
    distinct_exercises: distinctExercises,
    fatigue_signal: fatigueSignal,
    monotony_risk: monotonyRisk,
    objetivo: sp?.objetivo ?? null,
    observacoes: sp?.observacoes ?? null,
    restricoes: sp?.restricoes ?? null,
    lesoes: sp?.lesoes ?? null,
    pain_alerts: painAlerts,
    fase_atual: plan.fase ?? null,
    data_quality: dataQuality,
  };
}

async function callAI(context: any, currentPlanExcerpt: string) {
  const system = `Você é um treinador físico sênior, especialista em periodização. Analisa o ciclo de treino de um aluno (45 dias) e decide se vale MANTER, AJUSTAR, GERAR_NOVO treino ou SOLICITAR_DADOS antes de renovar. Considere: aderência, frequência real, taxa de conclusão, evolução de cargas/reps/volume, RPE médio, sinais de fadiga ou platô, monotonia, alertas de dor/lesão, fase atual e objetivo. Seja conservador: se data_quality != sufficient, prefira solicitar_dados. Se houver dor/lesão ativa, recomende ajustar (não gerar novo). Se cargas/volume estão estagnados (estavel/descendo) e aderência boa, recomende gerar_novo (estímulo novo). Se aderência < 0.4, prefira ajustar para reduzir volume e aumentar consistência.`;

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `CONTEXTO DO ALUNO (JSON):\n${JSON.stringify(context, null, 2)}\n\nTRECHO DO TREINO ATUAL (até 1500 chars):\n${currentPlanExcerpt.slice(0, 1500)}\n\nResponda chamando a tool 'recommend_action'.`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "recommend_action",
          description: "Sugere a ação a tomar para o ciclo de treino do aluno.",
          parameters: {
            type: "object",
            properties: {
              suggested_action: {
                type: "string",
                enum: ["manter", "ajustar", "gerar_novo", "solicitar_dados"],
              },
              rationale: { type: "string", description: "Justificativa em 2-4 frases, em português, tom técnico." },
              monotony_risk: { type: "string", enum: ["baixo", "medio", "alto"] },
              fatigue_signal: { type: "string", enum: ["baixa", "media", "alta"] },
              priority: { type: "string", enum: ["baixa", "media", "alta"] },
              suggested_adjustments: {
                type: "array",
                items: { type: "string" },
                description: "Lista curta de ajustes concretos (máx 5).",
              },
            },
            required: ["suggested_action", "rationale", "monotony_risk", "fatigue_signal", "priority"],
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
    if (resp.status === 429) throw new Error("Limite de uso da IA atingido — tente novamente em alguns minutos.");
    if (resp.status === 402) throw new Error("Créditos da IA esgotados — recarregue para continuar.");
    throw new Error(`AI error ${resp.status}: ${text.slice(0, 200)}`);
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
    case "gerar_novo":
      return "renovacao_sugerida";
    case "solicitar_dados":
      return "aguardando_dados";
    default:
      return "pre_renovacao";
  }
}

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
  let anamnese: any = null;
  if (assessment?.id) {
    const [{ data: a }, { data: c }, { data: an }] = await Promise.all([
      supabase.from("anthropometrics").select("*").eq("assessment_id", assessment.id).maybeSingle(),
      supabase.from("composition").select("*").eq("assessment_id", assessment.id).maybeSingle(),
      supabase.from("anamnese").select("*").eq("assessment_id", assessment.id).maybeSingle(),
    ]);
    antro = a;
    comp = c;
    anamnese = an;
  }

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
    percentual_gordura: comp?.percentual_gordura,
    massa_magra: comp?.massa_magra,
    anamnese: anamnese
      ? {
          historico_saude: anamnese.historico_saude,
          medicacao: anamnese.medicacao,
          dores: anamnese.dores,
          sono: anamnese.sono,
          stress: anamnese.stress,
          treino_atual: anamnese.treino_atual,
        }
      : null,
  };
}

/**
 * Calls the trainer-agent (SSE) and accumulates the final markdown output.
 */
async function callTrainerAgent(prompt: string, studentContext: any): Promise<string> {
  const url = `${SUPABASE_URL}/functions/v1/trainer-agent`;
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
    throw new Error(`trainer-agent error ${resp.status}: ${text.slice(0, 300)}`);
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

async function snapshotPlan(supabase: any, plan: any, generatedBy: string, reason: string | null, status = "archived") {
  // Find previous version_id
  const { data: prev } = await supabase
    .from("workout_plan_versions")
    .select("id")
    .eq("plan_id", plan.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: snap, error } = await supabase
    .from("workout_plan_versions")
    .insert({
      plan_id: plan.id,
      student_id: plan.student_id,
      version_number: plan.version ?? 1,
      previous_version_id: prev?.id ?? null,
      status,
      generated_by: generatedBy,
      titulo: plan.titulo,
      conteudo: plan.conteudo,
      fase: plan.fase,
      snapshot_json: {
        cycle_days: plan.cycle_days,
        cycle_status: plan.cycle_status,
        renewal_mode: plan.renewal_mode,
      },
      reason_summary: reason,
      archived_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return snap;
}

async function generateDraft(supabase: any, planId: string, source: "manual" | "auto") {
  const { data: plan, error } = await supabase.from("ai_plans").select("*").eq("id", planId).maybeSingle();
  if (error || !plan) throw new Error("Plan not found");
  if (plan.is_draft) throw new Error("Source plan is already a draft");
  if (plan.tipo !== "treino") throw new Error("Not a workout plan");

  const { data: existingDraft } = await supabase
    .from("ai_plans")
    .select("*")
    .eq("parent_plan_id", planId)
    .eq("is_draft", true)
    .eq("tipo", "treino")
    .maybeSingle();
  if (existingDraft) return { draft: existingDraft, reused: true };

  const { data: latestAnalysis } = await supabase
    .from("workout_renewal_analysis")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const studentContext = await buildStudentContextForAgent(supabase, plan.student_id);

  const ctxBlock = latestAnalysis
    ? `\n\n=== ANÁLISE DE RENOVAÇÃO DA IA ===\nSugestão: ${latestAnalysis.suggested_action}\nAderência: ${latestAnalysis.adherence_score ?? "—"}\nFrequência semanal: ${latestAnalysis.session_frequency ?? "—"}\nProgressão de carga: ${latestAnalysis.load_progression ?? "—"}\nProgressão de reps: ${latestAnalysis.reps_progression ?? "—"}\nVolume: ${latestAnalysis.volume_trend ?? "—"}\nRPE médio: ${latestAnalysis.avg_rpe ?? "—"}\nFadiga: ${latestAnalysis.fatigue_signal ?? "—"}\nMonotonia: ${latestAnalysis.monotony_risk ?? "—"}\nJustificativa: ${latestAnalysis.rationale}\n=== FIM ANÁLISE ===\n`
    : "";

  const previousExcerpt = (plan.conteudo ?? "").slice(0, 1500);

  const prompt = `Você está RENOVANDO o ciclo de treino de 45 dias deste aluno.${ctxBlock}

OBJETIVO DA RENOVAÇÃO:
- Considere a aderência, progressão e fadiga acima
- Varie estímulos: troque exercícios estagnados, ajuste faixas de repetição e volume
- NÃO repita exatamente os mesmos exercícios do plano anterior
- Mantenha o objetivo do aluno e respeite restrições/lesões
- Se houver platô (load/volume estável), aumente intensidade ou troque variações

TRECHO DO TREINO ATUAL (referência do que NÃO repetir 100%):
${previousExcerpt}

ENTREGUE OBRIGATORIAMENTE:
1) Tabela completa do treino com TODAS as colunas: TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO
2) Divisão semanal clara
3) Periodização da nova fase (semana 1 a 6)
4) Notas de progressão e segurança`;

  const draftContent = await callTrainerAgent(prompt, studentContext);
  if (!draftContent || draftContent.length < 200) {
    throw new Error("Conteúdo do rascunho insuficiente — tente novamente");
  }

  // Snapshot current plan
  await snapshotPlan(supabase, plan, source === "manual" ? "manual" : "auto", `Snapshot antes do rascunho v${(plan.version ?? 1) + 1}`);

  const reason =
    latestAnalysis?.rationale?.slice(0, 500) ??
    (source === "manual" ? "Rascunho gerado manualmente pelo admin." : "Rascunho gerado automaticamente.");

  const { data: draft, error: draftErr } = await supabase
    .from("ai_plans")
    .insert({
      student_id: plan.student_id,
      tipo: "treino",
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

  await supabase.from("ai_plans").update({ cycle_status: "rascunho_gerado" }).eq("id", plan.id);

  // Also create a "draft" version row pointing to the new draft (not yet published)
  await supabase.from("workout_plan_versions").insert({
    plan_id: plan.id,
    student_id: plan.student_id,
    version_number: (plan.version ?? 1) + 1,
    status: "draft",
    generated_by: source === "manual" ? "manual" : "ia",
    titulo: draft.titulo,
    conteudo: draftContent,
    fase: plan.fase,
    snapshot_json: { draft_id: draft.id },
    reason_summary: reason,
  });

  if (latestAnalysis?.id) {
    await supabase
      .from("workout_renewal_analysis")
      .update({ draft_plan_id: draft.id })
      .eq("id", latestAnalysis.id);
  }

  return { draft, reused: false };
}

async function discardDraft(supabase: any, draftId: string) {
  const { data: draft } = await supabase.from("ai_plans").select("*").eq("id", draftId).maybeSingle();
  if (!draft || !draft.is_draft) throw new Error("Draft not found");

  const parentId = draft.parent_plan_id;
  await supabase.from("ai_plans").delete().eq("id", draftId);

  if (parentId) {
    const { data: latest } = await supabase
      .from("workout_renewal_analysis")
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
  if (plan.tipo !== "treino") throw new Error("Not a workout plan");

  const ctx = await gatherContext(supabase, plan);
  const ai = await callAI(ctx, plan.conteudo ?? "");

  const { data: analysis, error: insErr } = await supabase
    .from("workout_renewal_analysis")
    .insert({
      plan_id: plan.id,
      student_id: plan.student_id,
      days_remaining: ctx.days_remaining,
      adherence_score: ctx.adherence_score,
      session_frequency: ctx.session_frequency,
      completion_rate: ctx.completion_rate,
      load_progression: ctx.load_progression,
      reps_progression: ctx.reps_progression,
      volume_trend: ctx.volume_trend,
      avg_rpe: ctx.avg_rpe,
      fatigue_signal: ai.fatigue_signal ?? ctx.fatigue_signal,
      monotony_risk: ai.monotony_risk ?? ctx.monotony_risk,
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
      const { data: plans } = await supabase
        .from("ai_plans")
        .select("id, created_at, cycle_days, cycle_status, is_draft")
        .eq("tipo", "treino")
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
      const { plan_id, user_action, draft_id } = body;
      if (!plan_id || !user_action) throw new Error("plan_id and user_action required");

      const { data: plan } = await supabase.from("ai_plans").select("*").eq("id", plan_id).maybeSingle();
      if (!plan) throw new Error("Plan not found");

      if (user_action === "manter") {
        await supabase
          .from("ai_plans")
          .update({ cycle_status: "em_dia", created_at: new Date().toISOString() })
          .eq("id", plan_id);
        return new Response(JSON.stringify({ ok: true, action: "kept" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_action === "publish_draft") {
        if (!draft_id) throw new Error("draft_id required");
        const { data: draft } = await supabase.from("ai_plans").select("*").eq("id", draft_id).maybeSingle();
        if (!draft || !draft.parent_plan_id) throw new Error("Invalid draft");

        // Archive the parent first
        await snapshotPlan(supabase, plan, "ia", "Substituído por nova versão publicada", "archived");

        // Promote draft → parent
        await supabase
          .from("ai_plans")
          .update({
            titulo: draft.titulo.replace(/\s*\(rascunho v\d+\)\s*$/i, ""),
            conteudo: draft.conteudo,
            version: draft.version,
            cycle_status: "renovado",
            created_at: new Date().toISOString(),
            is_draft: false,
            draft_source: null,
            draft_reason: null,
            draft_analysis_id: null,
          })
          .eq("id", draft.parent_plan_id);
        await supabase.from("ai_plans").delete().eq("id", draft_id);

        // Mark the draft version row as published
        await supabase
          .from("workout_plan_versions")
          .update({ status: "published", published_at: new Date().toISOString() })
          .eq("plan_id", draft.parent_plan_id)
          .eq("version_number", draft.version)
          .eq("status", "draft");

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
    console.error("workout-renewal-analyzer error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});