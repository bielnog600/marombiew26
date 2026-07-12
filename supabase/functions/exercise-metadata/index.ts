// Admin-only edge function for Phase 2B.
// Actions: classify_one | classify_group | classify_unclassified | compatibility
// Approval/rejection use RPCs (approve_exercise_metadata_suggestion,
// reject_exercise_metadata_suggestion) directly from the client with the user
// JWT — this function only handles classification + compatibility read.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  classifyExerciseByRules,
  CLASSIFIER_VERSION,
  type RawExercise,
} from "../_shared/exerciseClassifier.ts";
import {
  evaluateAllMethods,
  METHOD_RULES_VERSION,
  type MethodInput,
} from "../_shared/methodCompatibility.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return j(401, { error: "missing_auth" });

  // 1) Validate JWT + admin role using anon client with user token
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
  try {
    body = req.method === "GET" ? {} : await req.json();
  } catch {
    body = {};
  }
  const urlObj = new URL(req.url);
  const action =
    (body.action as string | undefined) ??
    urlObj.searchParams.get("action") ??
    "";

  // -------- COMPATIBILITY --------
  if (action === "compatibility") {
    const exerciseId =
      (body.exercise_id as string | undefined) ??
      urlObj.searchParams.get("exercise_id") ??
      "";
    if (!exerciseId) return j(400, { error: "exercise_id_required" });
    const { data: exercise, error: exErr } = await admin
      .from("exercises")
      .select("*")
      .eq("id", exerciseId)
      .maybeSingle();
    if (exErr || !exercise) return j(404, { error: "exercise_not_found" });
    const { data: methods } = await admin
      .from("training_methods")
      .select("slug,category,min_level,active,requires_professional_supervision,requires_special_equipment,fatigue_score,technical_risk_score");
    const res = evaluateAllMethods(exercise, (methods ?? []) as MethodInput[], {
      studentLevel: (body.studentLevel as never) ?? null,
      goal: (body.goal as never) ?? null,
      availableEquipment: (body.availableEquipment as never) ?? null,
      professionalOverride: Boolean(body.professionalOverride),
    });
    return j(200, {
      exercise: {
        id: exercise.id,
        nome: exercise.nome,
        grupo_muscular: exercise.grupo_muscular,
      },
      metadataStatus: exercise.metadata_status ?? "unclassified",
      rulesVersion: METHOD_RULES_VERSION,
      allowed: res.allowed,
      blocked: res.blocked,
      reviewRequired: res.reviewRequired,
    });
  }

  // -------- CLASSIFY --------
  if (
    action === "classify_one" ||
    action === "classify_group" ||
    action === "classify_unclassified"
  ) {
    let query = admin.from("exercises").select("id,nome,grupo_muscular,ajustes,requires_load_logging,imagem_url,video_embed");
    if (action === "classify_one") {
      const id = body.exercise_id as string | undefined;
      if (!id) return j(400, { error: "exercise_id_required" });
      query = query.eq("id", id);
    } else if (action === "classify_group") {
      const grupo = body.grupo_muscular as string | undefined;
      if (!grupo) return j(400, { error: "grupo_muscular_required" });
      query = query.eq("grupo_muscular", grupo);
    } else {
      query = query.is("metadata_status", null);
    }
    const { data: exercises, error } = await query;
    if (error) return j(500, { error: error.message });

    const runId = crypto.randomUUID();
    const rows: Array<Record<string, unknown>> = [];
    for (const ex of (exercises ?? []) as RawExercise[]) {
      const out = classifyExerciseByRules(ex);
      if (Object.keys(out.proposedMetadata).length === 0) continue;
      rows.push({
        exercise_id: ex.id,
        proposed_metadata: out.proposedMetadata,
        confidence: out.overallConfidence,
        source: "rule",
        status: "pending",
        reasoning: `matched: ${out.matchedRules.join(", ")} | unresolved: ${out.unresolvedFields.join(", ")}`,
        classifier_version: CLASSIFIER_VERSION,
        rules_version: METHOD_RULES_VERSION,
        field_confidence: out.fieldConfidence,
        classifier_run_id: runId,
        matched_rules: out.matchedRules,
      });
    }

    // Insert one at a time, ignoring duplicates from the partial unique index.
    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const { error: insErr } = await admin
        .from("exercise_metadata_suggestions")
        .insert(row);
      if (insErr) {
        if ((insErr as { code?: string }).code === "23505") skipped++;
        else skipped++;
      } else {
        inserted++;
      }
    }

    return j(200, {
      classifier_run_id: runId,
      classifier_version: CLASSIFIER_VERSION,
      rules_version: METHOD_RULES_VERSION,
      total_evaluated: (exercises ?? []).length,
      total_suggestions: rows.length,
      inserted,
      skipped,
    });
  }

  return j(400, { error: "unknown_action" });
});