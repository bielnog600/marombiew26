// Edge function para enviar push via OneSignal REST API
// Aceita: { user_ids?: string[], title, message, data?, url? }
// Se user_ids vazio = envia para todos os admins
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { user_ids, title, message, data = {}, url, send_to_admins } = body ?? {};

    if (!title || !message) {
      return new Response(JSON.stringify({ error: "title e message obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve targets → OneSignal external_ids (o app faz login no OneSignal com o user.id)
    let targetUserIds: string[] = Array.isArray(user_ids) ? user_ids.filter(Boolean) : [];

    if (send_to_admins) {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      targetUserIds = [...new Set([...targetUserIds, ...(admins?.map((a) => a.user_id) ?? [])])];
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum destinatário" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: [...new Set(targetUserIds)] },
      target_channel: "push",
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      data,
    };
    if (url) payload.url = url;

    const resp = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await resp.json();

    await supabase.from("push_notification_log").insert({
      recipient_user_id: targetUserIds[0],
      title, message, data,
      onesignal_id: result?.id ?? null,
      status: resp.ok ? "sent" : "error",
      error: resp.ok ? null : JSON.stringify(result),
    });

    return new Response(JSON.stringify({ ok: resp.ok, delivered: targetUserIds.length, result }), {
      status: resp.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});