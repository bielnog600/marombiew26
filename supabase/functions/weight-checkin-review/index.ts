/**
 * weight-checkin-review
 *
 * Chamada pelo ALUNO após registrar um peso.
 * Roda o WEIGHT REVIEW ENGINE determinístico no servidor e, SOMENTE quando
 * elegível, aciona a arquitetura de renovação já existente (diet-renewal-analyzer
 * → rascunho em ai_plans + snapshot em diet_plan_versions).
 *
 * A IA nunca decide elegibilidade e nunca sobrescreve a dieta ativa:
 * o resultado é sempre um RASCUNHO para revisão do admin (review_required).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateWeightReview,
  todayIso,
  type AdherenceSummary,
  type WeightEntry,
} from "../_shared/weightReviewPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ADHERENCE_WINDOW_DAYS = 14;
const EXPECTED_MEALS_PER_DAY = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return json({ error: "missing_authorization" }, 401);

    // student_id derivado EXCLUSIVAMENTE da sessão autenticada
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await authClient.auth.getUser();
    const studentId = userData?.user?.id;
    if (!studentId) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const today = todayIso();
    const since = new Date();
    since.setDate(since.getDate() - ADHERENCE_WINDOW_DAYS);
    const sinceStr = since.toISOString().slice(0, 10);

    const [{ data: logs }, { data: profile }, { data: plans }, { data: tracking }, { data: lastAuto }] =
      await Promise.all([
        supabase
          .from("weight_logs")
          .select("peso, data")
          .eq("student_id", studentId)
          .order("data", { ascending: false })
          .limit(10),
        supabase
          .from("students_profile")
          .select("objetivo")
          .eq("user_id", studentId)
          .maybeSingle(),
        supabase
          .from("ai_plans")
          .select("id, titulo, conteudo, fase, version, created_at")
          .eq("student_id", studentId)
          .eq("tipo", "dieta")
          .eq("is_draft", false)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("daily_tracking")
          .select("date, meals_completed, workout_completed")
          .eq("student_id", studentId)
          .gte("date", sinceStr),
        supabase
          .from("diet_plan_versions")
          .select("created_at")
          .eq("student_id", studentId)
          .eq("source", "weight_checkin")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const weights: WeightEntry[] = (logs ?? []).map((l: any) => ({
      date: String(l.data),
      kg: Number(l.peso),
    }));

    const days = tracking ?? [];
    const totalMeals = days.reduce(
      (acc: number, d: any) => acc + (Array.isArray(d.meals_completed) ? d.meals_completed.length : 0),
      0,
    );
    const adherence: AdherenceSummary = {
      daysLogged: days.length,
      mealAdherence: days.length
        ? Math.min(1, Number((totalMeals / (days.length * EXPECTED_MEALS_PER_DAY)).toFixed(2)))
        : null,
      workoutsCompleted: days.filter((d: any) => d.workout_completed).length,
    };

    const plan = plans?.[0] ?? null;

    const result = evaluateWeightReview({
      goal: profile?.objetivo ?? null,
      weights,
      hasActiveDiet: !!plan,
      lastAutoAdjustmentDate: lastAuto?.created_at ? String(lastAuto.created_at).slice(0, 10) : null,
      adherence,
      today,
    });

    if (!result.dietReviewRequired || !plan) {
      return json({ ok: true, applied: false, review: result });
    }

    // Preserva a versão atual ANTES de qualquer proposta da IA.
    await supabase.from("diet_plan_versions").insert({
      plan_id: plan.id,
      student_id: studentId,
      version: plan.version ?? 1,
      titulo: plan.titulo,
      conteudo: plan.conteudo,
      fase: plan.fase,
      source: "weight_checkin",
      archived_at: new Date().toISOString(),
    });

    // IA propõe o MENOR ajuste possível — sempre como rascunho (mode "adjust").
    let draftId: string | null = null;
    let draftError: string | null = null;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/diet-renewal-analyzer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ action: "generate_draft", plan_id: plan.id, source: "auto", mode: "adjust" }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) draftError = payload?.error ?? `status_${resp.status}`;
      else draftId = payload?.draft_id ?? null;
    } catch (e) {
      draftError = (e as Error).message;
    }

    const delta = result.deltaKg ?? 0;
    const deltaTxt = `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`;
    await supabase.from("admin_notifications").insert({
      student_id: studentId,
      title: "Revisão automática por peso",
      message:
        `Check-in de peso: ${result.previousWeightKg} → ${result.currentWeightKg} kg (${deltaTxt}) ` +
        `em ${result.daysBetween} dias. Objetivo cutting, adesão ${Math.round((adherence.mealAdherence ?? 0) * 100)}%. ` +
        (draftId
          ? "Rascunho de ajuste gerado para revisão."
          : `Rascunho NÃO gerado (${draftError ?? "erro"}) — revisão manual necessária.`),
      priority: "media",
      active: true,
    });

    return json({
      ok: true,
      applied: false,
      status: draftId ? "draft_created" : "review_required",
      draft_id: draftId,
      review: result,
    });
  } catch (e) {
    console.error("weight-checkin-review error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
