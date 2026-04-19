// @ts-nocheck
import "https://deno.land/x/[email protected]/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify caller is admin
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roleOk } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!roleOk) {
      return new Response(JSON.stringify({ error: "Apenas admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch(url);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Falha ao baixar (${res.status})` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new Response(JSON.stringify({ error: "URL não é uma imagem" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
      : "jpg";
    const bytes = new Uint8Array(await res.arrayBuffer());

    if (bytes.byteLength > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Imagem maior que 10MB" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const path = `exercises/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("exercise-images")
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("exercise-images").getPublicUrl(path);
    return new Response(JSON.stringify({ url: pub.publicUrl, path }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
