// Cron diário de lembretes push: treino, água, refeição, reavaliação
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function sendPush(userIds: string[], title: string, message: string, data: Record<string, unknown> = {}) {
  if (userIds.length === 0) return;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("player_id")
    .in("user_id", userIds)
    .eq("active", true);
  const playerIds = [...new Set((subs ?? []).map((s) => s.player_id).filter(Boolean))];
  if (playerIds.length === 0) return;

  await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      data,
    }),
  });
}

async function alreadyRan(reminder_key: string, user_id: string | null = null): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const q = supabase
    .from("push_reminder_runs")
    .select("id")
    .eq("reminder_key", reminder_key)
    .eq("run_date", today);
  const { data } = user_id ? await q.eq("user_id", user_id).maybeSingle() : await q.is("user_id", null).maybeSingle();
  return !!data;
}

async function markRan(reminder_key: string, user_id: string | null = null) {
  await supabase.from("push_reminder_runs").insert({ reminder_key, user_id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const now = new Date();
    const hour = now.getUTCHours() - 3; // Brasília UTC-3
    const adjustedHour = ((hour % 24) + 24) % 24;
    const today = now.toISOString().slice(0, 10);

    const results: Record<string, number> = {};

    // Pega todos os alunos ativos
    const { data: students } = await supabase
      .from("students_profile")
      .select("user_id, data_nascimento")
      .eq("ativo", true);
    const allStudentIds = (students ?? []).map((s) => s.user_id);

    // 1. LEMBRETE DE TREINO — 09h Brasília, se não treinou hoje
    if (adjustedHour === 9 && !(await alreadyRan("workout_reminder_global"))) {
      const { data: completedToday } = await supabase
        .from("daily_tracking")
        .select("student_id")
        .eq("date", today)
        .eq("workout_completed", true);
      const completedIds = new Set((completedToday ?? []).map((c) => c.student_id));
      const targets = allStudentIds.filter((id) => !completedIds.has(id));
      await sendPush(targets, "Hora de treinar 💪", "Bora movimentar o corpo? Seu treino te espera no app!", { type: "workout_reminder" });
      await markRan("workout_reminder_global");
      results.workout = targets.length;
    }

    // 2. LEMBRETE DE ÁGUA — 14h Brasília
    if (adjustedHour === 14 && !(await alreadyRan("water_reminder_global"))) {
      const { data: tracking } = await supabase
        .from("daily_tracking")
        .select("student_id, water_glasses")
        .eq("date", today);
      const map = new Map((tracking ?? []).map((t) => [t.student_id, t.water_glasses ?? 0]));
      const targets = allStudentIds.filter((id) => (map.get(id) ?? 0) < 4);
      await sendPush(targets, "Hidrate-se 💧", "Que tal um copo de água agora? Sua meta diária agradece!", { type: "water_reminder" });
      await markRan("water_reminder_global");
      results.water = targets.length;
    }

    // 3. LEMBRETE DE REFEIÇÃO — 12h e 19h Brasília
    if ((adjustedHour === 12 || adjustedHour === 19) && !(await alreadyRan(`meal_reminder_${adjustedHour}`))) {
      await sendPush(allStudentIds, "Hora da refeição 🍽️", "Não esqueça de marcar sua refeição no app quando concluir!", { type: "meal_reminder" });
      await markRan(`meal_reminder_${adjustedHour}`);
      results.meal = allStudentIds.length;
    }

    // 4. REAVALIAÇÃO — 10h, alunos com >60 dias sem avaliação
    if (adjustedHour === 10 && !(await alreadyRan("reassessment_reminder_global"))) {
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("assessments")
        .select("student_id, created_at")
        .gte("created_at", sixtyDaysAgo);
      const recentIds = new Set((recent ?? []).map((r) => r.student_id));
      const targets = allStudentIds.filter((id) => !recentIds.has(id));
      // Notifica admins, não alunos diretamente
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = (admins ?? []).map((a) => a.user_id);
      if (targets.length > 0 && adminIds.length > 0) {
        await sendPush(adminIds, "Reavaliações pendentes 📊", `${targets.length} aluno(s) sem avaliação há mais de 60 dias.`, { type: "reassessment_admin" });
      }
      await markRan("reassessment_reminder_global");
      results.reassessment = targets.length;
    }

    return new Response(JSON.stringify({ ok: true, hour: adjustedHour, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("push-reminders-cron error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});