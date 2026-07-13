// Phase 2C.2B — Etapa 1: Blind Human First Review
//
// Actions (POST body { action, ... }):
//   - "bootstrap"       → vocabulary + list of 30 blinded exercises + progress
//   - "get_exercise"    → single whitelisted exercise + this-reviewer's latest draft/final
//   - "save_draft"      → upsert human_review_draft (optimistic lock by review_version)
//   - "finalize"        → validates and creates status=human_first_review row
//   - "amend_after_final" → creates a new version after a finalized row; requires
//                           change_reason + changed_fields; RPC computes structured diff.
//
// STRICT BLINDING RULES:
//   - Reads from public.exercises use an explicit whitelist of columns.
//     Predicted metadata columns (movement_pattern, exercise_class, primary_muscles,
//     etc.) are NEVER read here.
//   - Reads from public.exercise_metadata_suggestions and reviews with
//     reviewer_kind='ai-agent-blinded-v1' are FORBIDDEN in this function.
//   - reviewer_kind is ALWAYS set by the server (never trusted from client).
//   - reviewer_id is ALWAYS auth.uid() from the validated JWT.
//
// The 30 pilot exercise IDs (pilot-2c-2026-07-12-02) are hard-listed here so this
// endpoint cannot serve reviews on anything else.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const PILOT_SELECTION_ID = "pilot-2c-2026-07-12-02";
const CLASSIFIER_RUN_ID = "793c8800-a0c2-4acc-ac4d-2d374ecd2076";
const VOCABULARY_VERSION = "v1.0";
const REVIEWER_KIND = "human_blinded_v1"; // stored as reviewer_kind
const DRAFT_STATUS = "human_review_draft";
const FINAL_STATUS = "human_first_review";

// Fixture (final smoke test with a single non-pilot exercise). Fully isolated
// from the 30-exercise pilot by using a distinct pilot_selection_id.
const FIXTURE_PILOT_ID = "fixture-final-test-2026-07-13";

// Levels vocabulary (mirrors client LEVEL_OPTIONS)
const LEVEL_OPTIONS = ["none", "low", "moderate", "high", "very_high"] as const;
const EXERCISE_CLASS_OPTIONS = [
  "compound", "isolation", "cardio_cyclic", "metabolic_conditioning",
  "mobility", "core_stability", "plyometric", "other",
] as const;

const ALLOWED_EVIDENCE = new Set<string>([
  "exercise_name",
  "legacy_muscle_group",
  "image",
  "video",
  "adjustments",
  "professional_knowledge",
  "equipment_documentation",
  "insufficient_evidence",
]);
const NOTE_REQUIRED_STATES = new Set<string>([
  "insufficient_information",
  "requires_video_review",
  "requires_equipment_confirmation",
]);

const PILOT_EXERCISE_IDS = new Set<string>([
  "5d0c6d96-279b-44da-b088-8fc1e903048f",
  "cf04e183-f08a-422c-a7bb-4ce19ec0b972",
  "63293174-8cce-471f-bb22-53cb235b5097",
  "d007a1fd-b7d1-4d10-bc8c-5e6863d6daa4",
  "6e38cf0c-5272-4331-b0fc-25d1ea48b657",
  "3a68757a-d15e-4616-9af4-50670941c27b",
  "30301dfc-4322-4e10-bf3d-c8f894094fda",
  "ba76ba3c-407b-4158-acc8-bd6cd219f019",
  "df0af1a3-7212-4ea0-ac1e-21caea6106f2",
  "41b013f3-7bc3-4310-a384-81d9b6660a96",
  "3377e82c-a840-4577-98e5-3eb2fb043a09",
  "a09de707-9329-4be8-80b6-1a8caba1c381",
  "f4ea80fb-c839-44ce-8166-64ae9bcb90cb",
  "3b02cfd9-54ba-4eea-8652-063f1f3f3da1",
  "db8fe23d-4322-46b3-b874-d853eb8cc5a0",
  "537d53a4-e60b-4ece-addf-f1581ffa3f8b",
  "d4cb31da-da30-4e99-8059-2cc341e01118",
  "818b563e-150d-43cf-a018-cffa5490d663",
  "6035e0ca-6443-4850-a6b9-464174fa15e7",
  "bddbded1-70df-45c0-a1b0-539b16e205d9",
  "f460782f-42ae-488d-90ed-a446ef03635a",
  "48e92cba-dee0-43dc-aa45-bd14cbc87741",
  "d7cc670e-7252-4b6f-a033-76fb87486c80",
  "068ca0a6-6286-497b-9899-c5f26e85714a",
  "366a2dc8-188e-4ae5-b015-b9913777a1b5",
  "848ec532-a595-4ee3-945d-8d23809a5a13",
  "385a3b9f-2cbd-4b98-bf4b-e83b17573764",
  "7d9bf4f6-65c4-49e8-9eaa-a93e34f1eecc",
  "b957aa12-f74f-4d40-97ed-4566102eadd0",
  "b4d26e26-c989-4cd6-9e80-9659ff8cf362",
]);

// Whitelist of exercise columns the reviewer may see.
const EXERCISE_BLIND_COLUMNS =
  "id,nome,grupo_muscular,imagem_url,video_embed,ajustes,requires_load_logging";

// Fields the reviewer must fill (13). Same list used by validators + progress.
const REQUIRED_FIELDS = [
  "movement_pattern",
  "exercise_class",
  "equipment_type",
  "primary_muscles",
  "secondary_muscles",
  "stability_level",
  "technical_complexity",
  "axial_load",
  "lumbar_load",
  "balance_requirement",
  "fatigue_cost",
  "safe_to_failure",
  "contraindications",
] as const;

const FIELD_STATES = [
  "resolved",
  "not_applicable",
  "insufficient_information",
  "requires_video_review",
  "requires_equipment_confirmation",
] as const;

// not_applicable is allowed only for these fields (v1.0 rules)
const NA_ALLOWED = new Set<string>([
  "safe_to_failure",
  "primary_muscles",
  "secondary_muscles",
  "contraindications",
]);

const ARRAY_FIELDS = new Set(["primary_muscles", "secondary_muscles", "contraindications"]);
const BOOLEAN_FIELDS = new Set(["safe_to_failure"]);

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

type ReviewedMetadata = Record<string, unknown>;
type FieldStatusMap = Record<string, string>;

function validateFields(
  reviewed_metadata: ReviewedMetadata,
  field_review_status: FieldStatusMap,
  vocab: {
    equipment: Set<string>;
    muscles: Set<string>;
    forbidden_muscles: Set<string>;
    movement: Set<string>;
  },
  requireAll: boolean,
  field_notes: Record<string, string>,
  evidence: Record<string, unknown>,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const state = field_review_status[field];
    if (!state) {
      if (requireAll) errors.push(`${field}: missing state`);
      continue;
    }
    if (!FIELD_STATES.includes(state as typeof FIELD_STATES[number])) {
      errors.push(`${field}: invalid state "${state}"`);
      continue;
    }
    const has = Object.prototype.hasOwnProperty.call(reviewed_metadata, field);
    const value = has ? reviewed_metadata[field] : undefined;

    if (state === "resolved") {
      if (BOOLEAN_FIELDS.has(field)) {
        if (value !== true && value !== false) {
          errors.push(`${field}: resolved boolean requires true/false, got ${JSON.stringify(value)}`);
        }
      } else if (ARRAY_FIELDS.has(field)) {
        if (!Array.isArray(value)) {
          errors.push(`${field}: resolved array field requires an array (may be [])`);
        } else if (field === "primary_muscles" || field === "secondary_muscles") {
          for (const m of value) {
            if (typeof m !== "string") { errors.push(`${field}: non-string entry`); continue; }
            if (vocab.forbidden_muscles.has(m)) {
              errors.push(`${field}: "${m}" is an anatomical region, forbidden in muscle fields`);
            } else if (!vocab.muscles.has(m)) {
              errors.push(`${field}: "${m}" not in canonical muscles v1.0`);
            }
          }
        }
      } else {
        if (typeof value !== "string" || value.length === 0) {
          errors.push(`${field}: resolved requires non-empty string value`);
        } else if (field === "equipment_type" && !vocab.equipment.has(value)) {
          errors.push(`${field}: "${value}" not in equipment vocabulary v1.0`);
        } else if (field === "movement_pattern" && !vocab.movement.has(value)) {
          errors.push(`${field}: "${value}" not in movement_pattern vocabulary v1.0`);
        }
      }
    } else if (state === "not_applicable") {
      if (!NA_ALLOWED.has(field)) {
        errors.push(`${field}: not_applicable is not allowed for this field by vocabulary v1.0`);
      }
      // value should be null; if provided, reject
      if (has && value !== null) {
        errors.push(`${field}: not_applicable requires null value, got ${JSON.stringify(value)}`);
      }
    } else {
      // insufficient_information / requires_video_review / requires_equipment_confirmation
      if (has && value !== null) {
        errors.push(`${field}: unresolved states require null value`);
      }
    }

    // Evidence / note compliance
    const evList = Array.isArray(evidence?.[field]) ? (evidence[field] as unknown[]) : [];
    for (const e of evList) {
      if (typeof e !== "string" || !ALLOWED_EVIDENCE.has(e)) {
        errors.push(`${field}: invalid evidence "${String(e)}"`);
      }
    }
    if (NOTE_REQUIRED_STATES.has(state)) {
      const hasNote = typeof field_notes?.[field] === "string" && field_notes[field].trim().length > 0;
      const hasCompatibleEv = evList.some((e) =>
        e === "insufficient_evidence" ||
        (state === "requires_video_review" && e === "video") ||
        (state === "requires_equipment_confirmation" && e === "equipment_documentation")
      );
      if (!hasNote && !hasCompatibleEv) {
        errors.push(`${field}: state "${state}" requires a note or compatible evidence`);
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
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
  const action = String(body.action ?? "");

  // Load canonical vocabulary v1.0 (frozen)
  const { data: vocabRow, error: vocabErr } = await admin
    .from("metadata_vocabularies")
    .select("version,equipment_hierarchy,muscles_canonical,movement_patterns,not_applicable_rules,aliases")
    .eq("version", VOCABULARY_VERSION)
    .single();
  if (vocabErr || !vocabRow) return j(500, { error: "vocabulary_missing" });

  // Client-provided vocabulary_version must match, for save actions
  const clientVocab = body.vocabulary_version;
  if ((action === "save_draft" || action === "finalize") && clientVocab && clientVocab !== VOCABULARY_VERSION) {
    return j(409, { error: "vocabulary_version_mismatch", server: VOCABULARY_VERSION, client: clientVocab });
  }

  const equipmentSet = new Set<string>([
    ...(vocabRow.equipment_hierarchy?.roots ?? []),
    ...Object.values(vocabRow.equipment_hierarchy?.parents ?? {}).flat() as string[],
  ]);
  const musclesSet = new Set<string>(vocabRow.muscles_canonical?.canonical ?? []);
  const forbiddenMuscles = new Set<string>(vocabRow.muscles_canonical?.forbidden_in_muscle_fields ?? []);
  const movementSet = new Set<string>(vocabRow.movement_patterns ?? []);
  const vocab = { equipment: equipmentSet, muscles: musclesSet, forbidden_muscles: forbiddenMuscles, movement: movementSet };

  if (action === "bootstrap") {
    const ids = Array.from(PILOT_EXERCISE_IDS);
    // Whitelisted read only. NEVER include predicted columns.
    const { data: exercises, error: exErr } = await admin
      .from("exercises")
      .select(EXERCISE_BLIND_COLUMNS)
      .in("id", ids);
    if (exErr) return j(500, { error: "exercises_read_failed", detail: exErr.message });

    // Progress: latest human review row per exercise for this reviewer.
    // NEVER read ai-agent-blinded-v1 or draft_benchmark rows here.
    const { data: myReviews } = await admin
      .from("exercise_metadata_ground_truth")
      .select("exercise_id,status,review_version,reviewed_at,field_review_status")
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", PILOT_SELECTION_ID)
      .in("status", [DRAFT_STATUS, FINAL_STATUS])
      .order("review_version", { ascending: false });

    const latestByExercise = new Map<string, any>();
    for (const r of myReviews ?? []) {
      if (!latestByExercise.has(r.exercise_id)) latestByExercise.set(r.exercise_id, r);
    }

    const items = exercises!.map((ex: any) => {
      const rev = latestByExercise.get(ex.id);
      const status = rev?.status ?? "not_started";
      const fs = rev?.field_review_status ?? {};
      const resolvedCount = REQUIRED_FIELDS.filter((f) => fs[f] === "resolved").length;
      return {
        exercise_id: ex.id,
        nome: ex.nome,
        grupo_muscular: ex.grupo_muscular,
        imagem_url: ex.imagem_url,
        video_embed: ex.video_embed,
        ajustes: ex.ajustes,
        requires_load_logging: ex.requires_load_logging,
        review_status: status,
        review_version: rev?.review_version ?? 0,
        resolved_count: resolvedCount,
        total_fields: REQUIRED_FIELDS.length,
      };
    });

    return j(200, {
      pilot_selection_id: PILOT_SELECTION_ID,
      classifier_run_id: CLASSIFIER_RUN_ID,
      vocabulary_version: VOCABULARY_VERSION,
      reviewer_kind: REVIEWER_KIND,
      required_fields: REQUIRED_FIELDS,
      field_states: FIELD_STATES,
      na_allowed_fields: Array.from(NA_ALLOWED),
      array_fields: Array.from(ARRAY_FIELDS),
      boolean_fields: Array.from(BOOLEAN_FIELDS),
      vocabulary: {
        equipment_hierarchy: vocabRow.equipment_hierarchy,
        muscles_canonical: vocabRow.muscles_canonical,
        movement_patterns: vocabRow.movement_patterns,
        not_applicable_rules: vocabRow.not_applicable_rules,
        aliases: vocabRow.aliases,
      },
      items,
    });
  }

  if (action === "get_exercise") {
    const exercise_id = String(body.exercise_id ?? "");
    if (!PILOT_EXERCISE_IDS.has(exercise_id)) return j(404, { error: "not_in_pilot" });

    const { data: ex, error: exErr } = await admin
      .from("exercises")
      .select(EXERCISE_BLIND_COLUMNS)
      .eq("id", exercise_id)
      .single();
    if (exErr || !ex) return j(404, { error: "exercise_not_found" });

    // Latest own review only (draft or final) — NEVER benchmark or others
    const { data: rev } = await admin
      .from("exercise_metadata_ground_truth")
      .select("id,status,review_version,reviewed_metadata,field_review_status,field_notes,evidence,reviewed_at")
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", PILOT_SELECTION_ID)
      .eq("exercise_id", exercise_id)
      .in("status", [DRAFT_STATUS, FINAL_STATUS])
      .order("review_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    return j(200, {
      exercise: ex,
      review: rev ?? null,
      vocabulary_version: VOCABULARY_VERSION,
    });
  }

  if (action === "save_draft" || action === "finalize" || action === "amend_after_final") {
    const exercise_id = String(body.exercise_id ?? "");
    if (!PILOT_EXERCISE_IDS.has(exercise_id)) return j(404, { error: "not_in_pilot" });

    const reviewed_metadata = (body.reviewed_metadata ?? {}) as ReviewedMetadata;
    const field_review_status = (body.field_review_status ?? {}) as FieldStatusMap;
    const field_notes = (body.field_notes ?? {}) as Record<string, string>;
    const evidence = (body.evidence ?? {}) as Record<string, unknown>;
    const expected_version = Number(body.expected_version ?? 0);
    const change_reason = typeof body.change_reason === "string" ? body.change_reason : null;
    const changed_fields = Array.isArray(body.changed_fields)
      ? (body.changed_fields as unknown[]).filter((s) => typeof s === "string") as string[]
      : null;

    const requireAll = action === "finalize" || action === "amend_after_final";
    const v = validateFields(reviewed_metadata, field_review_status, vocab, requireAll, field_notes, evidence);
    if (!v.ok) return j(422, { error: "validation_failed", details: v.errors });

    // Delegate to the transactional RPC (SECURITY DEFINER, authenticated-only).
    // The RPC re-validates admin via auth.uid(), takes SELECT FOR UPDATE on the
    // current row, validates version + vocabulary, computes the diff and
    // changed_fields server-side, supersedes the previous version and inserts
    // the new one — all in one transaction. We call it with the user's JWT
    // (user-scoped client) so auth.uid() = the real admin. service_role is
    // NOT used for this call and has been revoked from the RPC ACL.
    const { data: rpcData, error: rpcErr } = await userClient.rpc(
      "save_human_first_review",
      {
        _action: action,
        _exercise_id: exercise_id,
        _pilot_selection_id: PILOT_SELECTION_ID,
        _classifier_run_id: CLASSIFIER_RUN_ID,
        _reviewer_kind: REVIEWER_KIND,
        _reviewed_metadata: reviewed_metadata,
        _field_review_status: field_review_status,
        _field_notes: field_notes,
        _evidence: evidence,
        _expected_version: expected_version,
        _vocabulary_version: String(clientVocab ?? VOCABULARY_VERSION),
        _server_vocabulary_version: VOCABULARY_VERSION,
        _change_reason: change_reason,
        _changed_fields: null, // server derives — client value is ignored
      },
    );

    if (rpcErr) {
      const msg = rpcErr.message ?? String(rpcErr);
      const status = /version_conflict|vocabulary_version_mismatch/i.test(msg)
        ? 409
        : /change_reason_required|changed_fields_required|cannot_draft_after_finalize/i.test(msg)
        ? 422
        : /not_authorized/.test(msg) ? 403
        : /not_authenticated/.test(msg) ? 401
        : 500;
      return j(status, { error: "rpc_failed", detail: msg });
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return j(200, {
      ok: true,
      review: row,
      new_version: row?.review_version,
      previous_version: row?.previous_review_version ?? 0,
      diff: row?.diff ?? {},
      changed_fields: row?.changed_fields ?? [],
      vocabulary_version: VOCABULARY_VERSION,
    });
  }

  // -------- FIXTURE FINAL TEST (isolated from pilot) --------
  if (action === "fixture_pick") {
    // Reuse existing fixture exercise for this reviewer, if any
    const { data: existing } = await admin
      .from("exercise_metadata_ground_truth")
      .select("exercise_id")
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", FIXTURE_PILOT_ID)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let exId: string | null = existing?.exercise_id ?? null;
    if (!exId) {
      const pilotIds = Array.from(PILOT_EXERCISE_IDS);
      const { data: candidates, error: cErr } = await admin
        .from("exercises")
        .select("id")
        .not("id", "in", `(${pilotIds.join(",")})`)
        .limit(500);
      if (cErr) return j(500, { error: "candidate_read_failed", detail: cErr.message });
      const pool = candidates ?? [];
      if (pool.length === 0) return j(404, { error: "no_candidate_outside_pilot" });
      exId = pool[Math.floor(Math.random() * pool.length)].id as string;
    }
    const { data: ex, error: exErr } = await admin
      .from("exercises").select(EXERCISE_BLIND_COLUMNS).eq("id", exId!).single();
    if (exErr || !ex) return j(404, { error: "exercise_not_found" });
    return j(200, {
      exercise: ex,
      pilot_selection_id: FIXTURE_PILOT_ID,
      reused: !!existing?.exercise_id,
    });
  }

  if (action === "fixture_get") {
    const exercise_id = String(body.exercise_id ?? "");
    if (PILOT_EXERCISE_IDS.has(exercise_id))
      return j(400, { error: "pilot_id_not_allowed_for_fixture" });
    const { data: ex, error: exErr } = await admin
      .from("exercises").select(EXERCISE_BLIND_COLUMNS).eq("id", exercise_id).single();
    if (exErr || !ex) return j(404, { error: "exercise_not_found" });
    const { data: rev } = await admin
      .from("exercise_metadata_ground_truth")
      .select("id,status,review_version,reviewed_metadata,field_review_status,field_notes,evidence,reviewed_at,changed_fields,diff,previous_review_version")
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", FIXTURE_PILOT_ID)
      .eq("exercise_id", exercise_id)
      .eq("is_current", true)
      .maybeSingle();
    return j(200, { exercise: ex, review: rev ?? null, vocabulary_version: VOCABULARY_VERSION });
  }

  if (
    action === "fixture_save_draft" ||
    action === "fixture_finalize" ||
    action === "fixture_amend_after_final"
  ) {
    const realAction = action.replace("fixture_", "");
    const exercise_id = String(body.exercise_id ?? "");
    if (PILOT_EXERCISE_IDS.has(exercise_id))
      return j(400, { error: "pilot_id_not_allowed_for_fixture" });

    const reviewed_metadata = (body.reviewed_metadata ?? {}) as ReviewedMetadata;
    const field_review_status = (body.field_review_status ?? {}) as FieldStatusMap;
    const field_notes = (body.field_notes ?? {}) as Record<string, string>;
    const evidence = (body.evidence ?? {}) as Record<string, unknown>;
    const expected_version = Number(body.expected_version ?? 0);
    const change_reason = typeof body.change_reason === "string" ? body.change_reason : null;

    const requireAll = realAction !== "save_draft";
    const v = validateFields(reviewed_metadata, field_review_status, vocab, requireAll, field_notes, evidence);
    if (!v.ok) return j(422, { error: "validation_failed", details: v.errors });

    const { data: rpcData, error: rpcErr } = await userClient.rpc(
      "save_human_first_review",
      {
        _action: realAction,
        _exercise_id: exercise_id,
        _pilot_selection_id: FIXTURE_PILOT_ID,
        _classifier_run_id: CLASSIFIER_RUN_ID,
        _reviewer_kind: REVIEWER_KIND,
        _reviewed_metadata: reviewed_metadata,
        _field_review_status: field_review_status,
        _field_notes: field_notes,
        _evidence: evidence,
        _expected_version: expected_version,
        _vocabulary_version: String(clientVocab ?? VOCABULARY_VERSION),
        _server_vocabulary_version: VOCABULARY_VERSION,
        _change_reason: change_reason,
        _changed_fields: null,
      },
    );
    if (rpcErr) {
      const msg = rpcErr.message ?? String(rpcErr);
      const status = /version_conflict|vocabulary_version_mismatch/i.test(msg) ? 409
        : /change_reason_required|changed_fields_required|cannot_draft_after_finalize|amendment_without_changes/i.test(msg) ? 422
        : /not_authorized/.test(msg) ? 403
        : /not_authenticated/.test(msg) ? 401
        : 500;
      return j(status, { error: "rpc_failed", detail: msg });
    }
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return j(200, {
      ok: true,
      review: row,
      new_version: row?.review_version,
      previous_version: row?.previous_review_version ?? 0,
      diff: row?.diff ?? {},
      changed_fields: row?.changed_fields ?? [],
    });
  }

  if (action === "fixture_isolation_check") {
    const exercise_id = String(body.exercise_id ?? "");
    if (PILOT_EXERCISE_IDS.has(exercise_id))
      return j(400, { error: "pilot_id_not_allowed_for_fixture" });
    const { data: ex } = await admin
      .from("exercises")
      .select("id,movement_pattern,exercise_class,equipment_type,primary_muscles,secondary_muscles,stability_level,technical_complexity,axial_load,lumbar_load,balance_requirement,fatigue_cost,safe_to_failure,contraindications,metadata_status,metadata_version,metadata_reviewed_at")
      .eq("id", exercise_id)
      .maybeSingle();
    const { count: suggestionCount } = await admin
      .from("exercise_metadata_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("exercise_id", exercise_id);
    const { count: fixtureCount } = await admin
      .from("exercise_metadata_ground_truth")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", FIXTURE_PILOT_ID)
      .eq("exercise_id", exercise_id);
    return j(200, {
      exercise_snapshot: ex,
      suggestion_count: suggestionCount ?? 0,
      fixture_review_count: fixtureCount ?? 0,
    });
  }

  if (action === "fixture_cleanup") {
    const { data: rows, error: delErr } = await admin
      .from("exercise_metadata_ground_truth")
      .delete()
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", FIXTURE_PILOT_ID)
      .select("id");
    if (delErr) return j(500, { error: "cleanup_failed", detail: delErr.message });
    const { count: remaining } = await admin
      .from("exercise_metadata_ground_truth")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", FIXTURE_PILOT_ID);
    return j(200, { deleted: rows?.length ?? 0, remaining: remaining ?? 0 });
  }

  if (action === "fixture_ai_fill") {
    const exercise_id = String(body.exercise_id ?? "");
    if (PILOT_EXERCISE_IDS.has(exercise_id))
      return j(400, { error: "pilot_id_not_allowed_for_fixture" });

    const { data: ex, error: exErr } = await admin
      .from("exercises")
      .select("id,nome,grupo_muscular,ajustes,requires_load_logging,imagem_url,video_embed")
      .eq("id", exercise_id).single();
    if (exErr || !ex) return j(404, { error: "exercise_not_found" });

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return j(500, { error: "missing_lovable_api_key" });

    const equipmentList = Array.from(equipmentSet);
    const musclesList = Array.from(musclesSet);
    const movementList = Array.from(movementSet);

    const systemPrompt = `Você é um classificador especializado de exercícios de musculação/treinamento.
Sua tarefa é preencher 13 metadados canónicos para um exercício, escolhendo APENAS valores dos vocabulários fornecidos abaixo (slugs em inglês).

Regras estritas:
- Retorne JSON exato no formato solicitado, sem texto adicional.
- Se você não tem confiança suficiente (< 0.6) para um campo, use null e liste em unresolved_fields.
- NUNCA invente valores fora dos vocabulários.
- Para músculos, use apenas slugs canônicos (nunca "knee", "core", "spine", "back" — são regiões proibidas).
- primary_muscles não pode ser vazio se você resolveu o campo (a menos que seja cardio genérico).
- Campos de segurança (safe_to_failure, contraindications, axial_load, lumbar_load, stability_level, technical_complexity) exigem cuidado extra. Se em dúvida, retorne null.
- Justificativas curtas em português (máx 200 chars).

Vocabulários canónicos v1.0:
movement_pattern: ${movementList.join(", ")}
exercise_class: ${EXERCISE_CLASS_OPTIONS.join(", ")}
equipment_type: ${equipmentList.join(", ")}
muscles (para primary_muscles e secondary_muscles): ${musclesList.join(", ")}
níveis (para stability_level, technical_complexity, axial_load, lumbar_load, balance_requirement, fatigue_cost): ${LEVEL_OPTIONS.join(", ")}
safe_to_failure: true | false | null
contraindications: array de strings livres (deixe [] se nenhuma) ou null se em dúvida

Formato de resposta (JSON):
{
  "metadata": { "movement_pattern": string|null, "exercise_class": string|null, "equipment_type": string|null,
    "primary_muscles": string[]|null, "secondary_muscles": string[]|null,
    "stability_level": string|null, "technical_complexity": string|null,
    "axial_load": string|null, "lumbar_load": string|null, "balance_requirement": string|null,
    "fatigue_cost": string|null, "safe_to_failure": boolean|null, "contraindications": string[]|null },
  "field_confidence": { "<field>": number (0..1) },
  "field_reasoning": { "<field>": string curta em pt-BR },
  "unresolved_fields": string[],
  "warnings": string[]
}`;

    const userPrompt = `Exercício:
- Nome: ${ex.nome}
- Grupo muscular cadastrado: ${ex.grupo_muscular}
- Ajustes / observações: ${ex.ajustes ?? "—"}
- requires_load_logging: ${ex.requires_load_logging}

Classifique os 13 campos conforme o formato JSON descrito.`;

    let aiJson: any = null;
    let aiError: string | null = null;
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": lovableKey,
        },
        body: JSON.stringify({
          model: "openai/gpt-5.5",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        return j(resp.status === 429 ? 429 : resp.status === 402 ? 402 : 502,
          { error: "ai_gateway_failed", status: resp.status, detail: detail.slice(0, 500) });
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? "{}";
      aiJson = JSON.parse(content);
    } catch (e: any) {
      aiError = e.message ?? String(e);
      return j(502, { error: "ai_parse_failed", detail: aiError });
    }

    // Validate against vocabulary; downgrade invalid fields to insufficient_information
    const proposedMeta: Record<string, unknown> = {};
    const proposedState: Record<string, string> = {};
    const proposedNotes: Record<string, string> = {};
    const proposedEvidence: Record<string, string[]> = {};
    const perFieldConfidence: Record<string, number | null> = {};
    const perFieldReasoning: Record<string, string> = {};
    const warnings: string[] = Array.isArray(aiJson.warnings) ? aiJson.warnings : [];

    const rawMeta = (aiJson.metadata ?? {}) as Record<string, unknown>;
    const rawConf = (aiJson.field_confidence ?? {}) as Record<string, unknown>;
    const rawReason = (aiJson.field_reasoning ?? {}) as Record<string, unknown>;

    for (const field of REQUIRED_FIELDS) {
      const rawVal = rawMeta[field];
      const conf = typeof rawConf[field] === "number" ? (rawConf[field] as number) : null;
      const reason = typeof rawReason[field] === "string" ? String(rawReason[field]).slice(0, 400) : "";
      perFieldConfidence[field] = conf;
      perFieldReasoning[field] = reason;

      let valid = false;
      let value: unknown = null;

      if (rawVal === null || rawVal === undefined) {
        valid = false;
      } else if (BOOLEAN_FIELDS.has(field)) {
        valid = typeof rawVal === "boolean";
        value = valid ? rawVal : null;
      } else if (ARRAY_FIELDS.has(field)) {
        if (Array.isArray(rawVal)) {
          if (field === "primary_muscles" || field === "secondary_muscles") {
            const arr = (rawVal as unknown[]).filter((m) =>
              typeof m === "string" && musclesSet.has(m) && !forbiddenMuscles.has(m)) as string[];
            value = arr;
            valid = true;
          } else {
            // contraindications: any string list
            value = (rawVal as unknown[]).filter((c) => typeof c === "string") as string[];
            valid = true;
          }
        }
      } else if (typeof rawVal === "string") {
        if (field === "equipment_type") {
          valid = equipmentSet.has(rawVal); value = rawVal;
        } else if (field === "movement_pattern") {
          valid = movementSet.has(rawVal); value = rawVal;
        } else if (field === "exercise_class") {
          valid = (EXERCISE_CLASS_OPTIONS as readonly string[]).includes(rawVal); value = rawVal;
        } else if (["stability_level","technical_complexity","axial_load","lumbar_load","balance_requirement","fatigue_cost"].includes(field)) {
          valid = (LEVEL_OPTIONS as readonly string[]).includes(rawVal); value = rawVal;
        }
        if (!valid && rawVal) warnings.push(`${field}: valor "${rawVal}" fora do vocabulário — ignorado.`);
      }

      if (valid && (conf === null || conf >= 0.6)) {
        proposedMeta[field] = value;
        proposedState[field] = "resolved";
        proposedEvidence[field] = ["professional_knowledge"];
        if (reason) proposedNotes[field] = `IA (conf ${((conf ?? 1) * 100).toFixed(0)}%): ${reason}`;
      } else {
        proposedMeta[field] = null;
        proposedState[field] = "insufficient_information";
        proposedEvidence[field] = ["insufficient_evidence"];
        proposedNotes[field] = reason
          ? `IA sem confiança (${conf !== null ? (conf * 100).toFixed(0) + "%" : "n/d"}): ${reason}`
          : "IA sem confiança suficiente para preencher este campo.";
      }
    }

    // Load current fixture review to get expected_version (if any)
    const { data: existing } = await admin
      .from("exercise_metadata_ground_truth")
      .select("review_version,status")
      .eq("reviewer_id", uid)
      .eq("reviewer_kind", REVIEWER_KIND)
      .eq("pilot_selection_id", FIXTURE_PILOT_ID)
      .eq("exercise_id", exercise_id)
      .eq("is_current", true)
      .maybeSingle();

    // Do not overwrite a finalized fixture automatically
    if (existing?.status === FINAL_STATUS) {
      return j(409, { error: "fixture_already_finalized", detail: "Execute cleanup antes de re-preencher com IA." });
    }
    const expected_version = existing?.review_version ?? 0;

    const evidenceObj: Record<string, unknown> = { ...proposedEvidence, _general: "Preenchimento inicial por IA (revisão obrigatória)." };
    const validation = validateFields(proposedMeta, proposedState, vocab, false, proposedNotes, evidenceObj);
    if (!validation.ok) {
      return j(422, { error: "ai_validation_failed", details: validation.errors, ai_output: aiJson });
    }

    const { data: rpcData, error: rpcErr } = await userClient.rpc(
      "save_human_first_review",
      {
        _action: "save_draft",
        _exercise_id: exercise_id,
        _pilot_selection_id: FIXTURE_PILOT_ID,
        _classifier_run_id: CLASSIFIER_RUN_ID,
        _reviewer_kind: REVIEWER_KIND,
        _reviewed_metadata: proposedMeta,
        _field_review_status: proposedState,
        _field_notes: proposedNotes,
        _evidence: evidenceObj,
        _expected_version: expected_version,
        _vocabulary_version: VOCABULARY_VERSION,
        _server_vocabulary_version: VOCABULARY_VERSION,
        _change_reason: null,
        _changed_fields: null,
      },
    );
    if (rpcErr) {
      const msg = rpcErr.message ?? String(rpcErr);
      return j(500, { error: "rpc_failed", detail: msg });
    }
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return j(200, {
      ok: true,
      review: row,
      new_version: row?.review_version,
      ai_summary: {
        field_confidence: perFieldConfidence,
        field_reasoning: perFieldReasoning,
        unresolved_fields: Object.entries(proposedState).filter(([, s]) => s !== "resolved").map(([f]) => f),
        resolved_fields: Object.entries(proposedState).filter(([, s]) => s === "resolved").map(([f]) => f),
        warnings,
      },
    });
  }

  return j(400, { error: "unknown_action", action });
});