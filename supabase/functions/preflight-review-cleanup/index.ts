// Preflight cleanup for Phase 1.2B.
// Deletes rows from public.exercise_metadata_ground_truth that were created by
// the browser preflight runner. Hard-restricted to pilot_selection_id values
// that start with 'preflight_pilot_' — real pilot rows can never be touched.
//
// Auth: requires an authenticated admin JWT (validated against user_roles).
// service_role is used only server-side to perform the scoped DELETE.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return j(401, { error: "missing_auth" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return j(401, { error: "invalid_token" });
  const uid = userData.user.id;

  const admin = createClient(url, service);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", uid);
  if (!roles?.some((r) => r.role === "admin")) return j(403, { error: "not_admin" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const pilotSelectionId = String(body.pilot_selection_id ?? "");
  if (!pilotSelectionId.startsWith("preflight_pilot_")) {
    return j(400, { error: "invalid_pilot_selection_id", detail: "must start with preflight_pilot_" });
  }

  // Count first for reporting
  const { count: before } = await admin
    .from("exercise_metadata_ground_truth")
    .select("id", { count: "exact", head: true })
    .eq("pilot_selection_id", pilotSelectionId);

  const { error: delErr } = await admin
    .from("exercise_metadata_ground_truth")
    .delete()
    .eq("pilot_selection_id", pilotSelectionId);
  if (delErr) return j(500, { error: "delete_failed", detail: delErr.message });

  // Sanity: ensure zero rows remain matching the LIKE preflight prefix for this run
  const { count: after } = await admin
    .from("exercise_metadata_ground_truth")
    .select("id", { count: "exact", head: true })
    .eq("pilot_selection_id", pilotSelectionId);

  return j(200, { ok: true, deleted: before ?? 0, remaining: after ?? 0 });
});