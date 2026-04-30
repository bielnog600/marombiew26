// Cron horário de lembretes push: treino, água, refeição, reavaliação
// Respeita fuso horário de cada aluno detectado pelo DDI do telefone (+55, +351, +33...).
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

// Mapa DDI -> IANA timezone. Fallback: America/Sao_Paulo.
const DDI_TZ: Record<string, string> = {
  "55": "America/Sao_Paulo",   // Brasil
  "351": "Europe/Lisbon",      // Portugal
  "33": "Europe/Paris",        // França
  "1": "America/New_York",     // EUA/Canadá (default leste)
  "44": "Europe/London",       // Reino Unido
  "34": "Europe/Madrid",       // Espanha
  "39": "Europe/Rome",         // Itália
  "49": "Europe/Berlin",       // Alemanha
  "351900": "Atlantic/Azores", // (não usado, exemplo)
};
const DEFAULT_TZ = "America/Sao_Paulo";

function tzFromPhone(phone: string | null | undefined): string {
  if (!phone) return DEFAULT_TZ;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return DEFAULT_TZ;
  // Tenta DDIs em ordem de tamanho (3 dígitos antes de 2 antes de 1)
  for (const len of [3, 2, 1]) {
    const ddi = digits.slice(0, len);
    if (DDI_TZ[ddi]) return DDI_TZ[ddi];
  }
  return DEFAULT_TZ;
}

// Retorna { hour: 0-23, dateStr: 'YYYY-MM-DD' } no fuso indicado
function localNow(tz: string): { hour: number; dateStr: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hourStr = get("hour");
  if (hourStr === "24") hourStr = "00";
  return { hour: parseInt(hourStr, 10), dateStr: `${year}-${month}-${day}` };
}

async function sendPushToUser(userId: string, title: string, message: string, data: Record<string, unknown> = {}) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("player_id")
    .eq("user_id", userId)
    .eq("active", true);
  const playerIds = [...new Set((subs ?? []).map((s) => s.player_id).filter(Boolean))];
  if (playerIds.length === 0) return false;

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
  return true;
}

async function alreadyRanForUser(reminder_key: string, user_id: string, run_date: string): Promise<boolean> {
  const { data } = await supabase
    .from("push_reminder_runs")
    .select("id")
    .eq("reminder_key", reminder_key)
    .eq("user_id", user_id)
    .eq("run_date", run_date)
    .maybeSingle();
  return !!data;
}

async function markRanForUser(reminder_key: string, user_id: string, run_date: string) {
  await supabase.from("push_reminder_runs").insert({ reminder_key, user_id, run_date });
}

const WATER_GOAL = 8;

function firstName(nome: string | null | undefined): string {
  if (!nome) return "campeão";
  return nome.trim().split(/\s+/)[0] || "campeão";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const results = { workout: 0, water_afternoon: 0, water_evening: 0, meal_lunch: 0, meal_dinner: 0, reassessment: 0 };

    // 1. Carrega alunos ativos + telefone + nome
    const { data: students } = await supabase
      .from("students_profile")
      .select("user_id")
      .eq("ativo", true);

    const studentIds = (students ?? []).map((s) => s.user_id);
    if (studentIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, results, note: "no active students" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nome, telefone")
      .in("user_id", studentIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    // Pré-carrega tracking de hoje (UTC date) para queries menores; mas como cada aluno
    // tem sua própria "data local", buscamos por aluno usando dateStr local.

    for (const userId of studentIds) {
      const prof = profileMap.get(userId);
      const tz = tzFromPhone(prof?.telefone);
      const { hour, dateStr } = localNow(tz);
      const name = firstName(prof?.nome);

      // Busca tracking do aluno na data LOCAL dele
      const { data: tracking } = await supabase
        .from("daily_tracking")
        .select("water_glasses, meals_completed, workout_completed")
        .eq("student_id", userId)
        .eq("date", dateStr)
        .maybeSingle();

      const water = tracking?.water_glasses ?? 0;
      const mealsDone = Array.isArray(tracking?.meals_completed) ? tracking!.meals_completed.length : 0;
      const workoutDone = !!tracking?.workout_completed;

      // ---------- 1. TREINO 09h local ----------
      if (hour === 9 && !workoutDone) {
        const key = "workout_reminder";
        if (!(await alreadyRanForUser(key, userId, dateStr))) {
          const sent = await sendPushToUser(
            userId,
            "Hora de treinar 💪",
            `${name}, bora movimentar o corpo? Seu treino te espera no app!`,
            { type: "workout_reminder" }
          );
          await markRanForUser(key, userId, dateStr);
          if (sent) results.workout++;
        }
      }

      // ---------- 2. ÁGUA 14h local (tarde) ----------
      if (hour === 14) {
        const key = "water_afternoon";
        if (!(await alreadyRanForUser(key, userId, dateStr))) {
          let title = "Hidrate-se 💧";
          let msg = "";
          if (water === 0) {
            msg = `${name}, você ainda não registrou nenhum copo de água hoje. Bora começar agora?`;
          } else if (water < WATER_GOAL) {
            const faltam = WATER_GOAL - water;
            msg = `${name}, faltam ${faltam} ${faltam === 1 ? "copo" : "copos"} para bater sua meta de ${WATER_GOAL} hoje 💧`;
          } else {
            // já bateu meta — pula, mas marca pra não tentar de novo
            await markRanForUser(key, userId, dateStr);
            continue;
          }
          const sent = await sendPushToUser(userId, title, msg, { type: "water_reminder" });
          await markRanForUser(key, userId, dateStr);
          if (sent) results.water_afternoon++;
        }
      }

      // ---------- 3. ÁGUA 21h local (noite, só se não bateu) ----------
      if (hour === 21 && water < WATER_GOAL) {
        const key = "water_evening";
        if (!(await alreadyRanForUser(key, userId, dateStr))) {
          const faltam = WATER_GOAL - water;
          const sent = await sendPushToUser(
            userId,
            "Última chamada da água 💧",
            `${name}, ainda dá tempo! Faltam ${faltam} ${faltam === 1 ? "copo" : "copos"} para fechar o dia com a meta batida.`,
            { type: "water_reminder_evening" }
          );
          await markRanForUser(key, userId, dateStr);
          if (sent) results.water_evening++;
        }
      }

      // ---------- 4. REFEIÇÃO almoço 12h local ----------
      if (hour === 12) {
        const key = "meal_lunch";
        if (!(await alreadyRanForUser(key, userId, dateStr))) {
          const sent = await sendPushToUser(
            userId,
            "Hora do almoço 🍽️",
            `${name}, não esqueça de marcar sua refeição no app quando concluir!`,
            { type: "meal_reminder" }
          );
          await markRanForUser(key, userId, dateStr);
          if (sent) results.meal_lunch++;
        }
      }

      // ---------- 5. REFEIÇÃO jantar 19h local ----------
      if (hour === 19) {
        const key = "meal_dinner";
        if (!(await alreadyRanForUser(key, userId, dateStr))) {
          let msg = "";
          if (mealsDone === 0) {
            msg = `${name}, você ainda não marcou nenhuma refeição hoje. Bora fechar o dia direitinho!`;
          } else {
            msg = `${name}, ${mealsDone} ${mealsDone === 1 ? "refeição registrada" : "refeições registradas"} hoje. Não esqueça de marcar o jantar! 🍽️`;
          }
          const sent = await sendPushToUser(userId, "Hora do jantar 🍽️", msg, { type: "meal_reminder_dinner" });
          await markRanForUser(key, userId, dateStr);
          if (sent) results.meal_dinner++;
        }
      }
    }

    // ---------- 6. REAVALIAÇÃO (admin) — global, 1x/dia em horário Brasília 10h ----------
    const brt = localNow("America/Sao_Paulo");
    if (brt.hour === 10) {
      const { data: alreadyRun } = await supabase
        .from("push_reminder_runs")
        .select("id")
        .eq("reminder_key", "reassessment_reminder_global")
        .eq("run_date", brt.dateStr)
        .is("user_id", null)
        .maybeSingle();

      if (!alreadyRun) {
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from("assessments")
          .select("student_id, created_at")
          .gte("created_at", sixtyDaysAgo);
        const recentIds = new Set((recent ?? []).map((r) => r.student_id));
        const targets = studentIds.filter((id) => !recentIds.has(id));

        const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
        const adminIds = (admins ?? []).map((a) => a.user_id);

        if (targets.length > 0 && adminIds.length > 0) {
          for (const adminId of adminIds) {
            await sendPushToUser(
              adminId,
              "Reavaliações pendentes 📊",
              `${targets.length} aluno(s) sem avaliação há mais de 60 dias.`,
              { type: "reassessment_admin" }
            );
          }
          results.reassessment = targets.length;
        }
        await supabase.from("push_reminder_runs").insert({
          reminder_key: "reassessment_reminder_global",
          user_id: null,
          run_date: brt.dateStr,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
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
