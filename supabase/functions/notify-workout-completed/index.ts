// Endpoint estreito: aluno autenticado avisa os admins que concluiu o próprio treino.
// Não aceita destinatário, título nem mensagem arbitrários — tudo é construído no servidor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBearerToken } from "../_shared/authorizePrivilegedRequest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = getBearerToken(req);
  if (!token) return json({ error: "missing_authorization" }, 401);
  // Um anon token puro não identifica usuário: getUser() abaixo falha e devolve 401.
  if (SERVICE_ROLE && token === SERVICE_ROLE) return json({ error: "user_jwt_required" }, 401);

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: "invalid_token" }, 401);

  const body = await req.json().catch(() => ({}));
  const sessionId = isUuid(body?.session_id) ? body.session_id : null;
  if (body?.session_id != null && !sessionId) return json({ error: "invalid_session_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // A sessão precisa ser do próprio caller e estar concluída.
  let sessionQuery = admin
    .from("workout_sessions")
    .select("id, day_name, status, completed_at, student_id")
    .eq("student_id", user.id)
    .eq("status", "completed")
    .not("completed_at", "is", null);

  sessionQuery = sessionId
    ? sessionQuery.eq("id", sessionId)
    : sessionQuery.order("completed_at", { ascending: false }).limit(1);

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) return json({ error: "session_lookup_failed" }, 500);

  const session = sessions?.[0];
  if (!session) return json({ error: "session_not_found_or_not_completed" }, 403);

  const { data: profile } = await admin
    .from("profiles")
    .select("nome")
    .eq("user_id", user.id)
    .maybeSingle();

  const studentName = profile?.nome?.trim() || "Aluno";
  const dayName = typeof session.day_name === "string" ? session.day_name.trim() : "";
  const title = "Treino concluído 🏋️";
  const message = `${studentName} concluiu o treino${dayName ? ` (${dayName})` : ""}.`;

  const pushResp = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({
      send_to_admins: true,
      title,
      message,
      data: { type: "workout_completed", student_id: user.id, session_id: session.id },
    }),
  });

  if (!pushResp.ok) {
    const detail = await pushResp.text();
    console.error("notify-workout-completed push failed", pushResp.status, detail.slice(0, 200));
    return json({ ok: false, error: "push_failed" }, 502);
  }

  return json({ ok: true, session_id: session.id });
});
