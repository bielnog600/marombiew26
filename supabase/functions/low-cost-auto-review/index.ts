import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Low Cost auto-review:
 * For every active "Low Cost" student, find their non-draft training and diet
 * ai_plans that have reached (or passed) low_cost_next_review_at, run the
 * existing renewal analyzers (which will MAINTAIN, ADJUST, GENERATE_NEW or
 * REQUEST_DATA), then schedule the next review N days ahead.
 *
 * Designed to be called daily by pg_cron. Idempotent within the same day.
 */

async function callAnalyzer(fnName: string, planId: string) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ action: "analyze", plan_id: planId }),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: parsed?.error ?? text.slice(0, 200) };
  }
  return { ok: true, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const forcedStudentId: string | null = body?.student_id ?? null;

    // 1) Find all Low Cost students
    let lcQuery = supabase
      .from("students_profile")
      .select("user_id")
      .eq("low_cost", true)
      .eq("ativo", true);
    if (forcedStudentId) lcQuery = lcQuery.eq("user_id", forcedStudentId);

    const { data: lcStudents, error: lcErr } = await lcQuery;
    if (lcErr) throw lcErr;

    const studentIds = (lcStudents ?? []).map((s: any) => s.user_id);
    if (studentIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "Nenhum aluno Low Cost ativo.", reviewed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const nowIso = new Date().toISOString();

    // 2) Find ai_plans of these students (treino + dieta) that need review
    const { data: plans, error: planErr } = await supabase
      .from("ai_plans")
      .select("id, student_id, tipo, low_cost_next_review_at, low_cost_review_interval_days, created_at, is_draft")
      .in("student_id", studentIds)
      .in("tipo", ["treino", "dieta"])
      .eq("is_draft", false);
    if (planErr) throw planErr;

    const due: any[] = [];
    for (const p of plans ?? []) {
      const next = p.low_cost_next_review_at ? new Date(p.low_cost_next_review_at) : null;
      // If never scheduled, schedule from created_at + interval
      if (!next) {
        const interval = p.low_cost_review_interval_days ?? 30;
        const created = new Date(p.created_at);
        const scheduled = new Date(created.getTime() + interval * 86400000);
        if (scheduled <= new Date()) due.push(p);
        else {
          // Persist scheduled date so admin sees "próxima revisão"
          if (!dryRun) {
            await supabase
              .from("ai_plans")
              .update({ low_cost_next_review_at: scheduled.toISOString() })
              .eq("id", p.id);
          }
        }
      } else if (next <= new Date()) {
        due.push(p);
      }
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          students: studentIds.length,
          plans_found: plans?.length ?? 0,
          due: due.length,
          due_ids: due.map((d) => d.id),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) Run analyzer for each due plan
    const results: any[] = [];
    for (const p of due) {
      const fnName = p.tipo === "treino" ? "workout-renewal-analyzer" : "diet-renewal-analyzer";
      const r = await callAnalyzer(fnName, p.id);
      const interval = p.low_cost_review_interval_days ?? 30;
      const nextReview = new Date(Date.now() + interval * 86400000).toISOString();

      await supabase
        .from("ai_plans")
        .update({
          low_cost_last_review_at: nowIso,
          low_cost_next_review_at: nextReview,
        })
        .eq("id", p.id);

      results.push({
        plan_id: p.id,
        tipo: p.tipo,
        student_id: p.student_id,
        ok: r.ok,
        next_review_at: nextReview,
        suggested_action: r.body?.analysis?.suggested_action ?? null,
        error: r.ok ? null : r.error,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        students: studentIds.length,
        reviewed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});