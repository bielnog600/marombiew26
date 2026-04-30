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

// ---------- Parser de treino + detecção de grupos musculares ----------
interface DayBlock { day: string; exercises: string[] }

function parseTrainingDays(markdown: string): DayBlock[] {
  const days: DayBlock[] = [];
  const lines = (markdown || "").split("\n");
  let lastDay = "";
  let current: DayBlock | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.replace(/\*\*/g, "").trim());
    if (cells.length < 2) continue;
    const first = cells[0].toLowerCase();
    if (first.includes("treino do dia") || first.includes("exercício") || first.includes("exercicio")) continue;
    const dayCell = cells[0];
    const exCell = cells[1];
    if (dayCell && dayCell !== "-" && dayCell.toLowerCase() !== lastDay.toLowerCase()) {
      if (current && current.exercises.length) days.push(current);
      current = { day: dayCell, exercises: [] };
      lastDay = dayCell;
    }
    if (!current) current = { day: lastDay || "Treino", exercises: [] };
    if (exCell && !exCell.toLowerCase().includes("exerc")) current.exercises.push(exCell);
  }
  if (current && current.exercises.length) days.push(current);
  return days;
}

const MUSCLE_KEYWORDS: Record<string, string[]> = {
  peito: ["supino", "crucifixo", "peck", "peitoral", "crossover", "flexão", "flexao"],
  costas: ["remada", "puxada", "pulldown", "pull-down", "pull up", "pull-up", "barra fixa", "levantamento terra", "deadlift"],
  ombros: ["desenvolvimento", "elevação lateral", "elevacao lateral", "arnold", "shoulder", "encolhimento", "crucifixo inverso", "elevação frontal"],
  bíceps: ["rosca", "biceps", "bíceps", "curl"],
  tríceps: ["tríceps", "triceps", "francês", "frances", "pulley triceps", "corda triceps", "testa", "mergulho"],
  quadríceps: ["agachamento", "leg press", "cadeira extensora", "extensora", "hack", "afundo", "avanço", "avanco", "búlgaro", "bulgaro"],
  posteriores: ["stiff", "mesa flexora", "flexora", "good morning", "romeno", "rdl"],
  glúteos: ["glúteo", "gluteo", "hip thrust", "elevação pélvica", "cadeira abdutora", "abdutora", "coice", "kickback"],
  panturrilha: ["panturrilha", "gêmeo", "gemeo", "calf"],
  abdômen: ["abdominal", "abdomen", "prancha", "crunch", "oblíquo", "obliquo"],
  cardio: ["esteira", "bike", "elíptico", "eliptico", "corrida", "caminhada"],
};

function detectMuscleGroups(exercises: string[]): string[] {
  const found = new Set<string>();
  for (const ex of exercises) {
    const lower = ex.toLowerCase();
    for (const [group, kws] of Object.entries(MUSCLE_KEYWORDS)) {
      if (kws.some((kw) => lower.includes(kw))) found.add(group);
    }
  }
  return [...found];
}

const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const WEEKDAY_ALIASES: Record<string, string[]> = {
  domingo: ["domingo", "dom"],
  segunda: ["segunda", "seg"],
  terça: ["terça", "terca", "ter"],
  quarta: ["quarta", "qua"],
  quinta: ["quinta", "qui"],
  sexta: ["sexta", "sex"],
  sábado: ["sábado", "sabado", "sab"],
};

function pickTodayBlock(days: DayBlock[], todayWeekday: number): DayBlock | null {
  if (days.length === 0) return null;
  const todayName = WEEKDAY_NAMES[todayWeekday];
  const aliases = WEEKDAY_ALIASES[todayName];
  const byWeekday = days.find((d) => {
    const lower = d.day.toLowerCase();
    return aliases.some((a) => lower.includes(a));
  });
  if (byWeekday) return byWeekday;
  if (todayWeekday === 0 && days.length <= 6) return null;
  const workIndex = todayWeekday === 0 ? 6 : todayWeekday - 1;
  return days[workIndex % days.length] ?? null;
}

const MOTIVATION_TEMPLATES: Array<(name: string, focus: string) => string> = [
  (n, f) => `Vamos com tudo, ${n}! Hoje é ${f}. Foca na amplitude e cadência. 💥`,
  (n, f) => `${n}, dia de ${f}! Cada repetição te aproxima da sua melhor versão. 🔥`,
  (n, f) => `${n}, daqui a pouco é ${f}. Mente forte, técnica perfeita. 💪`,
  (n, f) => `${n}, hoje vamos atacar ${f}! Conexão mente-músculo no máximo. ⚡`,
  (n, f) => `Bora, ${n}! ${f} no foco. Você não vai treinar, você vai dominar. 🏋️`,
  (n, f) => `${n}, é dia de ${f}! Capricha na execução, o resultado vem certo. ✨`,
  (n, f) => `Show, ${n}! Treino de ${f} chegando. Respira, contrai, executa. 🎯`,
  (n, f) => `${n}, ${f} te chamando! Sem desculpa, com foco. Bora! 🚀`,
  (n, f) => `E aí, ${n}? Logo é ${f}. Cada série conta — entrega o seu melhor. 💯`,
  (n, f) => `${n}, dia de ativar ${f}! Carga controlada, técnica afiada. 🔝`,
  (n, f) => `${n}, treino de ${f} se aproximando! Foco total nos primeiros 5 minutos. 🧠`,
];

function buildWorkoutMessage(name: string, muscles: string[], dayLabel: string): { title: string; body: string } {
  const focus = muscles.length > 0 ? muscles.join(" e ") : dayLabel;
  const tpl = MOTIVATION_TEMPLATES[Math.floor(Math.random() * MOTIVATION_TEMPLATES.length)];
  return {
    title: `Treino se aproximando 💪 ${dayLabel}`,
    body: tpl(name, focus),
  };
}

// Calcula o horário médio (0-23) que o aluno costuma treinar, no fuso local dele.
// Retorna null se não houver dados suficientes.
async function getUsualWorkoutHour(userId: string, tz: string): Promise<number | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sessions } = await supabase
    .from("workout_sessions")
    .select("completed_at")
    .eq("student_id", userId)
    .eq("status", "completed")
    .gte("completed_at", since)
    .limit(50);
  const times = (sessions ?? []).map((s) => s.completed_at).filter(Boolean) as string[];
  if (times.length < 3) return null; // precisa de ao menos 3 sessões

  // Converte cada timestamp para hora no fuso local e tira a média circular.
  const hours: number[] = [];
  for (const ts of times) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(ts));
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    hours.push(h + m / 60);
  }
  // Média circular (24h)
  const sumSin = hours.reduce((a, h) => a + Math.sin((h / 24) * 2 * Math.PI), 0);
  const sumCos = hours.reduce((a, h) => a + Math.cos((h / 24) * 2 * Math.PI), 0);
  let avg = (Math.atan2(sumSin, sumCos) / (2 * Math.PI)) * 24;
  if (avg < 0) avg += 24;
  return Math.round(avg); // hora cheia
}
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
