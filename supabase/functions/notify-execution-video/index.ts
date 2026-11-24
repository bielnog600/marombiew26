// Avisa os admins (push OneSignal) quando um aluno envia um vídeo de execução.
// Chamado pelo app do aluno logo após salvar o vídeo. Verifica o chamador:
// só o dono do vídeo, só vídeo pendente e recente, e no máximo um push por vídeo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_authorization" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await userClient.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);

  let videoId = "";
  try { videoId = String((await req.json())?.video_id ?? ""); } catch { /* */ }
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) return json({ error: "video_id inválido" }, 400);

  const admin = createClient(url, service);
  const { data: video } = await admin.from("exercise_execution_videos")
    .select("id, student_id, exercise_name, status, created_at").eq("id", videoId).maybeSingle();
  if (!video || video.student_id !== userId) return json({ error: "not_found" }, 404);
  if (video.status !== "pending_review") return json({ ok: true, skipped: "not_pending" });

  const { count } = await admin.from("push_notification_log").select("id", { count: "exact", head: true })
    .eq("data->>execution_video_id", videoId);
  if ((count ?? 0) > 0) return json({ ok: true, skipped: "already_sent" });

  const [{ data: prof }, { data: admins }] = await Promise.all([
    admin.from("profiles").select("nome").eq("user_id", userId).maybeSingle(),
    admin.from("user_roles").select("user_id").eq("role", "admin"),
  ]);
  const ids = [...new Set((admins ?? []).map((a) => a.user_id))];
  if (!ids.length) return json({ ok: true, skipped: "no_admins" });

  const title = "Vídeo de execução";
  const message = `${prof?.nome ?? "Aluno"} enviou vídeo de execução: ${video.exercise_name}`;
  const data = { execution_video_id: videoId, type: "execution_video" };
  const resp = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Deno.env.get("ONESIGNAL_REST_API_KEY")}` },
    body: JSON.stringify({
      app_id: Deno.env.get("ONESIGNAL_APP_ID"),
      include_aliases: { external_id: ids },
      target_channel: "push",
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      data,
      url: `/dashboard?video=${videoId}`,
    }),
  });
  const result = await resp.json().catch(() => ({}));
  await admin.from("push_notification_log").insert({
    recipient_user_id: ids[0], title, message, data,
    onesignal_id: result?.id ?? null, status: resp.ok ? "sent" : "error", error: resp.ok ? null : JSON.stringify(result),
  });
  return json({ ok: resp.ok });
});
