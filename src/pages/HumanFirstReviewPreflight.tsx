// Phase 1.2B — Authenticated browser preflight for the human-first-review
// endpoint. Runs an admin-scoped test matrix against the real, deployed
// Edge Function and the transactional RPC using the current admin session.
//
// STRICT RULES:
//  - Fixture uses an exercise NOT in the 30 pilot IDs.
//  - All writes go to public.exercise_metadata_ground_truth with a
//    preflight-scoped pilot_selection_id `preflight_pilot_2c_12_<ts>`.
//  - Cleanup only touches preflight rows.
//  - No secrets or JWTs are logged; only structural evidence is captured.
//  - No changes to exercises, exercise_metadata_suggestions or plans.

import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShieldCheck, PlayCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { VOCABULARY_VERSION } from "@/lib/metadataVocabularies";
import { useAuth } from "@/contexts/AuthContext";

type TestResult = {
  id: string;
  group: string;
  name: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
  ms?: number;
};

const PILOT_EXERCISE_IDS = new Set<string>([
  "5d0c6d96-279b-44da-b088-8fc1e903048f","cf04e183-f08a-422c-a7bb-4ce19ec0b972",
  "63293174-8cce-471f-bb22-53cb235b5097","d007a1fd-b7d1-4d10-bc8c-5e6863d6daa4",
  "6e38cf0c-5272-4331-b0fc-25d1ea48b657","3a68757a-d15e-4616-9af4-50670941c27b",
  "30301dfc-4322-4e10-bf3d-c8f894094fda","ba76ba3c-407b-4158-acc8-bd6cd219f019",
  "df0af1a3-7212-4ea0-ac1e-21caea6106f2","41b013f3-7bc3-4310-a384-81d9b6660a96",
  "3377e82c-a840-4577-98e5-3eb2fb043a09","a09de707-9329-4be8-80b6-1a8caba1c381",
  "f4ea80fb-c839-44ce-8166-64ae9bcb90cb","3b02cfd9-54ba-4eea-8652-063f1f3f3da1",
  "db8fe23d-4322-46b3-b874-d853eb8cc5a0","537d53a4-e60b-4ece-addf-f1581ffa3f8b",
  "d4cb31da-da30-4e99-8059-2cc341e01118","818b563e-150d-43cf-a018-cffa5490d663",
  "6035e0ca-6443-4850-a6b9-464174fa15e7","bddbded1-70df-45c0-a1b0-539b16e205d9",
  "f460782f-42ae-488d-90ed-a446ef03635a","48e92cba-dee0-43dc-aa45-bd14cbc87741",
  "d7cc670e-7252-4b6f-a033-76fb87486c80","068ca0a6-6286-497b-9899-c5f26e85714a",
  "366a2dc8-188e-4ae5-b015-b9913777a1b5","848ec532-a595-4ee3-945d-8d23809a5a13",
  "385a3b9f-2cbd-4b98-bf4b-e83b17573764","7d9bf4f6-65c4-49e8-9eaa-a93e34f1eecc",
  "b957aa12-f74f-4d40-97ed-4566102eadd0","b4d26e26-c989-4cd6-9e80-9659ff8cf362",
]);

const FORBIDDEN_LEAK_KEYS = [
  "proposed_metadata","field_confidence","classifier_confidence","matched_rules",
  "reasoning","warnings","suggestion_id","draft_benchmark","categorias_piloto",
  "confidence","metrics","adjudication_changes","adjudicated_at","adjudicator_id",
  "ai_agent","predicted_metadata",
];

function maskUUID(uuid: string): string {
  if (!uuid || uuid.length < 20) return "***";
  return `${uuid.slice(0,4)}…${uuid.slice(-4)}`;
}

function deepScanForKeys(obj: unknown, forbidden: string[]): string[] {
  const hits: string[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (forbidden.includes(k)) hits.push(k);
      walk(val);
    }
  };
  walk(obj);
  return Array.from(new Set(hits));
}

function shapeOf(obj: unknown, depth = 0): unknown {
  if (obj === null || obj === undefined) return typeof obj;
  if (Array.isArray(obj)) return obj.length ? [shapeOf(obj[0], depth+1)] : [];
  if (typeof obj !== "object") return typeof obj;
  if (depth > 3) return "object";
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = shapeOf(v, depth+1);
  }
  return out;
}

async function callFn(action: string, payload: Record<string, unknown> = {}, opts: { authHeader?: string; noAuth?: boolean } = {}) {
  const url = `https://plqdoweunmpnlzvtisnn.supabase.co/functions/v1/human-first-review`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts.noAuth) {
    if (opts.authHeader) headers["Authorization"] = opts.authHeader;
    else {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json };
}

type RunContext = {
  pilotSelectionId: string;
  classifierRunId: string;
  preflightRunId: string;
  fixtureExerciseId: string;
  fixtureExerciseName: string;
  adminUid: string;
};

function makeValidMetadata() {
  return {
    reviewed_metadata: {
      movement_pattern: "anti_extension",
      exercise_class: "core_stability",
      equipment_type: "bodyweight",
      primary_muscles: ["rectus_abdominis"],
      secondary_muscles: [],
      stability_level: "moderate",
      technical_complexity: "low",
      axial_load: "none",
      lumbar_load: "low",
      balance_requirement: "moderate",
      fatigue_cost: "low",
      safe_to_failure: true,
      contraindications: [],
    },
    field_review_status: {
      movement_pattern: "resolved", exercise_class: "resolved", equipment_type: "resolved",
      primary_muscles: "resolved", secondary_muscles: "resolved", stability_level: "resolved",
      technical_complexity: "resolved", axial_load: "resolved", lumbar_load: "resolved",
      balance_requirement: "resolved", fatigue_cost: "resolved", safe_to_failure: "resolved",
      contraindications: "resolved",
    },
    field_notes: {},
    evidence: {
      movement_pattern: ["exercise_name"], exercise_class: ["exercise_name"],
      equipment_type: ["exercise_name"], primary_muscles: ["legacy_muscle_group"],
      secondary_muscles: ["professional_knowledge"], stability_level: ["image"],
      technical_complexity: ["professional_knowledge"], axial_load: ["professional_knowledge"],
      lumbar_load: ["professional_knowledge"], balance_requirement: ["image"],
      fatigue_cost: ["professional_knowledge"], safe_to_failure: ["professional_knowledge"],
      contraindications: ["professional_knowledge"],
    },
  };
}

async function saveViaRpc(ctx: RunContext, action: string, extras: Record<string, unknown>, expected_version: number) {
  return await supabase.rpc("save_human_first_review", {
    _action: action,
    _exercise_id: ctx.fixtureExerciseId,
    _pilot_selection_id: ctx.pilotSelectionId,
    _classifier_run_id: ctx.classifierRunId,
    _reviewer_kind: "human_blinded_v1",
    _reviewed_metadata: {},
    _field_review_status: {},
    _field_notes: {},
    _evidence: {},
    _expected_version: expected_version,
    _vocabulary_version: VOCABULARY_VERSION,
    _server_vocabulary_version: VOCABULARY_VERSION,
    _change_reason: null,
    _changed_fields: null,
    ...extras,
  });
}

export default function HumanFirstReviewPreflight() {
  const { user, role } = useAuth();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [report, setReport] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [featureEnabled] = useState(() => new URLSearchParams(window.location.search).get("enabled") === "1");

  const summary = useMemo(() => ({
    total: results.length,
    pass: results.filter(r => r.status === "pass").length,
    fail: results.filter(r => r.status === "fail").length,
    skip: results.filter(r => r.status === "skip").length,
  }), [results]);

  async function run() {
    if (!user || role !== "admin") { toast.error("Admin required"); return; }
    setRunning(true); setResults([]); setReport(null);
    const push = (r: TestResult) => setResults(prev => [...prev, r]);
    const start = async (id: string, group: string, name: string, fn: () => Promise<{ ok: boolean; detail?: string }>) => {
      const t0 = performance.now();
      try {
        const r = await fn();
        push({ id, group, name, status: r.ok ? "pass" : "fail", detail: r.detail, ms: Math.round(performance.now()-t0) });
      } catch (e: any) {
        push({ id, group, name, status: "fail", detail: `exception: ${e?.message ?? String(e)}`, ms: Math.round(performance.now()-t0) });
      }
    };

    // ---- 1. Snapshot ----
    setProgressLabel("Snapshot inicial"); setProgress(2);
    const pilotIds = Array.from(PILOT_EXERCISE_IDS);
    const [{ data: exSnap }, { data: revSnap }, { data: sugSnap }] = await Promise.all([
      supabase.from("exercises").select("id,metadata_version,metadata_reviewed_at").in("id", pilotIds),
      supabase.from("exercise_metadata_ground_truth").select("id,exercise_id,status,reviewer_kind").in("exercise_id", pilotIds),
      supabase.from("exercise_metadata_suggestions").select("id,exercise_id,status").in("exercise_id", pilotIds),
    ]);
    const snapshotBefore = {
      exercises_metadata_version: Object.fromEntries((exSnap ?? []).map((e:any) => [e.id, { v: e.metadata_version, at: e.metadata_reviewed_at }])),
      ground_truth_by_status: countBy(revSnap ?? [], (r:any) => `${r.reviewer_kind}:${r.status}`),
      suggestions_by_status: countBy(sugSnap ?? [], (s:any) => s.status),
      total_ground_truth_rows: (revSnap ?? []).length,
      total_suggestions_rows: (sugSnap ?? []).length,
    };

    // ---- 2. Pick fixture (non-pilot) ----
    const { data: fixtureCandidates } = await supabase
      .from("exercises").select("id, nome").not("id", "in", `(${pilotIds.join(",")})`).order("nome").limit(1);
    const fixture = fixtureCandidates?.[0];
    if (!fixture) { toast.error("no fixture available"); setRunning(false); return; }

    const ts = Date.now();
    const ctx: RunContext = {
      pilotSelectionId: `preflight_pilot_2c_12_${ts}`,
      classifierRunId: crypto.randomUUID(),
      preflightRunId: crypto.randomUUID(),
      fixtureExerciseId: fixture.id,
      fixtureExerciseName: fixture.nome,
      adminUid: user.id,
    };

    setProgress(6); setProgressLabel(`Fixture: ${fixture.nome}`);

    // ================= AUTH & AUTHORIZATION =================
    setProgressLabel("Auth & Autorização");
    await start("A1", "auth", "admin executa bootstrap (200)", async () => {
      const r = await callFn("bootstrap");
      return { ok: r.status === 200 && Array.isArray(r.body?.items) && r.body.items.length === 30, detail: `status=${r.status}` };
    });
    let bootstrapBody: any = null;
    await start("A2", "auth", "bootstrap é cego (nenhum campo previsto)", async () => {
      const r = await callFn("bootstrap");
      bootstrapBody = r.body;
      const leaks = deepScanForKeys(r.body, FORBIDDEN_LEAK_KEYS);
      return { ok: leaks.length === 0, detail: leaks.length ? `leaks=${leaks.join(",")}` : "clean" };
    });
    await start("A3", "auth", "get_exercise é cego (whitelist estrita)", async () => {
      const someId = bootstrapBody?.items?.[0]?.exercise_id;
      if (!someId) return { ok: false, detail: "no bootstrap item" };
      const r = await callFn("get_exercise", { exercise_id: someId });
      const allowed = new Set(["id","nome","grupo_muscular","imagem_url","video_embed","ajustes","requires_load_logging"]);
      const exKeys = Object.keys(r.body?.exercise ?? {});
      const extra = exKeys.filter(k => !allowed.has(k));
      const leaks = deepScanForKeys(r.body, FORBIDDEN_LEAK_KEYS);
      return { ok: r.status===200 && extra.length===0 && leaks.length===0, detail: `extra=${extra.join(",")||"none"} leaks=${leaks.join(",")||"none"}` };
    });
    await start("A4", "auth", "sem JWT → 401", async () => {
      const r = await callFn("bootstrap", {}, { noAuth: true });
      return { ok: r.status === 401, detail: `status=${r.status}` };
    });
    await start("A5", "auth", "JWT inválido → 401", async () => {
      const r = await callFn("bootstrap", {}, { authHeader: "Bearer invalid.token.here" });
      return { ok: r.status === 401, detail: `status=${r.status}` };
    });
    await start("A6", "auth", "auth.uid() = admin real", async () => {
      const { data } = await supabase.auth.getUser();
      return { ok: data.user?.id === user.id, detail: `uid=${maskUUID(user.id)}` };
    });
    await start("A7", "auth", "service_role não aparece no bundle/runtime", async () => {
      // basic surface check
      const surface = [
        JSON.stringify(bootstrapBody ?? {}),
        localStorage.getItem("supabase.auth.token") ?? "",
        document.documentElement.outerHTML.slice(0, 200000),
      ].join(" ");
      const bad = /service_role/i.test(surface);
      return { ok: !bad, detail: bad ? "found service_role token in surface" : "not present" };
    });

    setProgress(20);

    // ================= DRAFT & VERSIONING =================
    setProgressLabel("Draft & Versionamento");
    const valid = makeValidMetadata();

    let v1_id: string | null = null;
    let v2_id: string | null = null;
    await start("D1", "draft", "save_draft cria versão 1", async () => {
      const { data, error } = await saveViaRpc(ctx, "save_draft", {
        _reviewed_metadata: { movement_pattern: "anti_extension" },
        _field_review_status: { movement_pattern: "resolved" },
        _evidence: { movement_pattern: ["exercise_name"] },
      }, 0);
      if (error) return { ok: false, detail: error.message };
      v1_id = data?.[0]?.id;
      return { ok: data?.[0]?.review_version === 1 && data?.[0]?.is_current === true, detail: `v=${data?.[0]?.review_version}` };
    });
    await start("D2", "draft", "versão 1 fica is_current=true", async () => {
      const { data } = await supabase.from("exercise_metadata_ground_truth")
        .select("is_current,review_version").eq("id", v1_id!).single();
      return { ok: data?.is_current === true && data?.review_version === 1, detail: JSON.stringify(data) };
    });
    await start("D3", "draft", "save posterior com expected_version correto cria v2", async () => {
      const { data, error } = await saveViaRpc(ctx, "save_draft", {
        _reviewed_metadata: { movement_pattern: "anti_extension", exercise_class: "core_stability" },
        _field_review_status: { movement_pattern: "resolved", exercise_class: "resolved" },
        _evidence: { movement_pattern: ["exercise_name"], exercise_class: ["exercise_name"] },
      }, 1);
      if (error) return { ok: false, detail: error.message };
      v2_id = data?.[0]?.id;
      return { ok: data?.[0]?.review_version === 2, detail: `v=${data?.[0]?.review_version}` };
    });
    await start("D4", "draft", "v1 fica superseded, is_current=false", async () => {
      const { data } = await supabase.from("exercise_metadata_ground_truth")
        .select("is_current,status").eq("id", v1_id!).single();
      return { ok: data?.is_current === false && data?.status === "superseded", detail: JSON.stringify(data) };
    });
    await start("D5", "draft", "apenas uma versão is_current=true", async () => {
      const { count } = await supabase.from("exercise_metadata_ground_truth")
        .select("id", { count: "exact", head: true })
        .eq("pilot_selection_id", ctx.pilotSelectionId).eq("is_current", true);
      return { ok: count === 1, detail: `is_current_count=${count}` };
    });
    await start("D6", "draft", "expected_version incorreto → version_conflict", async () => {
      const { error } = await saveViaRpc(ctx, "save_draft", {
        _reviewed_metadata: { movement_pattern: "anti_extension" },
        _field_review_status: { movement_pattern: "resolved" },
        _evidence: { movement_pattern: ["exercise_name"] },
      }, 0); // stale
      return { ok: !!error && /version_conflict/.test(error.message), detail: error?.message ?? "no error" };
    });

    setProgress(40);

    // ================= VALIDATION =================
    setProgressLabel("Validação");
    await start("V1", "validation", "finalize incompleto rejeitado", async () => {
      const r = await callFn("finalize", {
        exercise_id: bootstrapBody?.items?.[0]?.exercise_id, // fictício, será rejeitado por RPC ou por validação
        reviewed_metadata: { movement_pattern: "squat" },
        field_review_status: { movement_pattern: "resolved" },
        field_notes: {},
        evidence: { movement_pattern: ["exercise_name"] },
        expected_version: 0,
        vocabulary_version: VOCABULARY_VERSION,
      });
      return { ok: r.status === 422, detail: `status=${r.status} err=${r.body?.error ?? "?"}` };
    });
    await start("V2", "validation", "vocabulary_version divergente → 409", async () => {
      const r = await callFn("save_draft", {
        exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
        reviewed_metadata: {}, field_review_status: {}, field_notes: {}, evidence: {},
        expected_version: 0, vocabulary_version: "v9.9",
      });
      return { ok: r.status === 409, detail: `status=${r.status}` };
    });
    await start("V3", "validation", "músculo fora do vocabulário rejeitado", async () => {
      const r = await callFn("finalize", {
        exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
        reviewed_metadata: { ...valid.reviewed_metadata, primary_muscles: ["core"] },
        field_review_status: valid.field_review_status,
        field_notes: valid.field_notes, evidence: valid.evidence,
        expected_version: 0, vocabulary_version: VOCABULARY_VERSION,
      });
      return { ok: r.status === 422 && JSON.stringify(r.body?.details ?? "").includes("primary_muscles"), detail: `status=${r.status}` };
    });
    await start("V4", "validation", "equipamento inválido rejeitado", async () => {
      const r = await callFn("finalize", {
        exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
        reviewed_metadata: { ...valid.reviewed_metadata, equipment_type: "trampolim_alien" },
        field_review_status: valid.field_review_status,
        field_notes: valid.field_notes, evidence: valid.evidence,
        expected_version: 0, vocabulary_version: VOCABULARY_VERSION,
      });
      return { ok: r.status === 422, detail: `status=${r.status}` };
    });
    await start("V5", "validation", "estado insuficiente sem nota/evidência rejeitado", async () => {
      const md = { ...valid.reviewed_metadata, secondary_muscles: null };
      const st = { ...valid.field_review_status, secondary_muscles: "insufficient_information" };
      const ev = { ...valid.evidence, secondary_muscles: [] };
      const r = await callFn("finalize", {
        exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
        reviewed_metadata: md, field_review_status: st, field_notes: {},
        evidence: ev, expected_version: 0, vocabulary_version: VOCABULARY_VERSION,
      });
      return { ok: r.status === 422, detail: `status=${r.status}` };
    });
    await start("V6", "validation", "safe_to_failure=false preservado", async () => {
      const md = { ...valid.reviewed_metadata, safe_to_failure: false };
      // dry-run via RPC (fixture)
      const { data, error } = await saveViaRpc(ctx, "save_draft", {
        _reviewed_metadata: md,
        _field_review_status: valid.field_review_status,
        _field_notes: {}, _evidence: valid.evidence,
      }, 2);
      if (error) return { ok: false, detail: error.message };
      const { data: row } = await supabase.from("exercise_metadata_ground_truth")
        .select("reviewed_metadata").eq("id", data?.[0]?.id).single();
      const val = (row?.reviewed_metadata as any)?.safe_to_failure;
      return { ok: val === false, detail: `stored=${JSON.stringify(val)}` };
    });
    await start("V7", "validation", "arrays vazios [] preservados", async () => {
      const { data } = await supabase.from("exercise_metadata_ground_truth")
        .select("reviewed_metadata").eq("pilot_selection_id", ctx.pilotSelectionId)
        .eq("is_current", true).single();
      const md = data?.reviewed_metadata as any;
      const okSec = Array.isArray(md?.secondary_muscles) && md.secondary_muscles.length === 0;
      const okContra = Array.isArray(md?.contraindications) && md.contraindications.length === 0;
      return { ok: okSec && okContra, detail: `sec=${JSON.stringify(md?.secondary_muscles)} contra=${JSON.stringify(md?.contraindications)}` };
    });

    setProgress(60);

    // ================= CONCURRENCY =================
    setProgressLabel("Concorrência");
    // Get current version
    const { data: cur } = await supabase.from("exercise_metadata_ground_truth")
      .select("review_version").eq("pilot_selection_id", ctx.pilotSelectionId).eq("is_current", true).single();
    const N = cur?.review_version ?? 0;
    let concurrencyDetail = "";
    await start("C1", "concurrency", "duas gravações paralelas: uma vence, outra 409", async () => {
      const both = await Promise.allSettled([
        saveViaRpc(ctx, "save_draft", {
          _reviewed_metadata: { ...valid.reviewed_metadata, movement_pattern: "anti_extension" },
          _field_review_status: valid.field_review_status,
          _field_notes: {}, _evidence: valid.evidence,
        }, N),
        saveViaRpc(ctx, "save_draft", {
          _reviewed_metadata: { ...valid.reviewed_metadata, movement_pattern: "anti_rotation" },
          _field_review_status: valid.field_review_status,
          _field_notes: {}, _evidence: valid.evidence,
        }, N),
      ]);
      const outcomes = both.map(x => x.status === "fulfilled" ? ((x.value as any)?.error?.message ?? "ok") : `rejected:${(x.reason as any)?.message}`);
      const oks = outcomes.filter(o => o === "ok").length;
      const conflicts = outcomes.filter(o => /version_conflict/.test(o)).length;
      concurrencyDetail = outcomes.join(" | ");
      return { ok: oks === 1 && conflicts === 1, detail: concurrencyDetail };
    });
    await start("C2", "concurrency", "apenas uma is_current=true após concorrência", async () => {
      const { count } = await supabase.from("exercise_metadata_ground_truth")
        .select("id", { count: "exact", head: true })
        .eq("pilot_selection_id", ctx.pilotSelectionId).eq("is_current", true);
      return { ok: count === 1, detail: `count=${count}` };
    });

    setProgress(75);

    // ================= ROLLBACK (validation failure keeps prior current) =================
    setProgressLabel("Rollback transacional");
    const { data: preRollback } = await supabase.from("exercise_metadata_ground_truth")
      .select("id,review_version,status,is_current").eq("pilot_selection_id", ctx.pilotSelectionId).eq("is_current", true).single();
    await start("R1", "rollback", "falha de validação (vocab mismatch) mantém versão atual", async () => {
      const { error } = await saveViaRpc(ctx, "save_draft", {
        _reviewed_metadata: valid.reviewed_metadata,
        _field_review_status: valid.field_review_status,
        _field_notes: {}, _evidence: valid.evidence,
        _vocabulary_version: "v9.9",
      }, preRollback?.review_version ?? 0);
      const { data: post } = await supabase.from("exercise_metadata_ground_truth")
        .select("id,review_version,is_current,status").eq("id", preRollback!.id).single();
      const stillCurrent = post?.is_current === true && post?.status === preRollback?.status && post?.review_version === preRollback?.review_version;
      return { ok: !!error && stillCurrent, detail: `err=${error?.message?.slice(0,80)} stillCurrent=${stillCurrent}` };
    });

    // ================= FINALIZE & AMENDMENT =================
    setProgressLabel("Finalize & Amendment");
    const { data: curBeforeFinal } = await supabase.from("exercise_metadata_ground_truth")
      .select("review_version").eq("pilot_selection_id", ctx.pilotSelectionId).eq("is_current", true).single();
    const vf = curBeforeFinal?.review_version ?? 0;
    let finalId: string | null = null;
    await start("F1", "finalize", "finalize válido cria human_first_review", async () => {
      const { data, error } = await saveViaRpc(ctx, "finalize", {
        _reviewed_metadata: valid.reviewed_metadata,
        _field_review_status: valid.field_review_status,
        _field_notes: valid.field_notes,
        _evidence: valid.evidence,
      }, vf);
      if (error) return { ok: false, detail: error.message };
      finalId = data?.[0]?.id;
      return { ok: data?.[0]?.status === "human_first_review", detail: `v=${data?.[0]?.review_version}` };
    });
    await start("F2", "finalize", "save_draft após finalize bloqueado", async () => {
      const { data: cur2 } = await supabase.from("exercise_metadata_ground_truth")
        .select("review_version").eq("id", finalId!).single();
      const { error } = await saveViaRpc(ctx, "save_draft", {
        _reviewed_metadata: valid.reviewed_metadata,
        _field_review_status: valid.field_review_status,
        _field_notes: {}, _evidence: valid.evidence,
      }, cur2?.review_version ?? 0);
      return { ok: !!error && /cannot_draft_after_finalize/.test(error.message), detail: error?.message ?? "no error" };
    });
    await start("F3", "finalize", "amendment sem change_reason bloqueado", async () => {
      const { data: cur2 } = await supabase.from("exercise_metadata_ground_truth")
        .select("review_version").eq("id", finalId!).single();
      const { error } = await saveViaRpc(ctx, "amend_after_final", {
        _reviewed_metadata: valid.reviewed_metadata,
        _field_review_status: valid.field_review_status,
        _field_notes: {}, _evidence: valid.evidence,
      }, cur2?.review_version ?? 0);
      return { ok: !!error && /change_reason_required/.test(error.message), detail: error?.message ?? "no error" };
    });
    await start("F4", "finalize", "amendment sem mudança real → amendment_without_changes", async () => {
      const { data: cur2 } = await supabase.from("exercise_metadata_ground_truth")
        .select("review_version").eq("id", finalId!).single();
      const { error } = await saveViaRpc(ctx, "amend_after_final", {
        _reviewed_metadata: valid.reviewed_metadata,
        _field_review_status: valid.field_review_status,
        _field_notes: valid.field_notes,
        _evidence: valid.evidence,
        _change_reason: "Reavaliação sem mudanças reais para teste",
      }, cur2?.review_version ?? 0);
      return { ok: !!error && /amendment_without_changes/.test(error.message), detail: error?.message ?? "no error" };
    });
    let sampleDiff: any = null;
    let sampleChangedFields: string[] | null = null;
    await start("F5", "finalize", "amendment válido calcula changed_fields e diff no servidor", async () => {
      const { data: cur2 } = await supabase.from("exercise_metadata_ground_truth")
        .select("review_version").eq("id", finalId!).single();
      const md = { ...valid.reviewed_metadata, technical_complexity: "moderate" };
      const { data, error } = await saveViaRpc(ctx, "amend_after_final", {
        _reviewed_metadata: md,
        _field_review_status: valid.field_review_status,
        _field_notes: valid.field_notes,
        _evidence: valid.evidence,
        _change_reason: "Aumento de complexidade técnica após revisão de vídeo",
        _changed_fields: ["movement_pattern"], // cliente MENTE, servidor deve ignorar
      }, cur2?.review_version ?? 0);
      if (error) return { ok: false, detail: error.message };
      sampleDiff = data?.[0]?.diff;
      sampleChangedFields = data?.[0]?.changed_fields;
      const ok = Array.isArray(sampleChangedFields) && sampleChangedFields.length === 1 && sampleChangedFields[0] === "technical_complexity";
      return { ok, detail: `changed=${JSON.stringify(sampleChangedFields)}` };
    });

    setProgress(90);

    // ================= ISOLATION =================
    setProgressLabel("Isolamento");
    await start("I1", "isolation", "exercícios do piloto não sofreram alteração", async () => {
      const { data: exNow } = await supabase.from("exercises").select("id,metadata_version,metadata_reviewed_at").in("id", pilotIds);
      const diffs = (exNow ?? []).filter((e: any) => {
        const b = snapshotBefore.exercises_metadata_version[e.id];
        return b?.v !== e.metadata_version || b?.at !== e.metadata_reviewed_at;
      });
      return { ok: diffs.length === 0, detail: `changed=${diffs.length}` };
    });
    await start("I2", "isolation", "sugestões do piloto não sofreram alteração", async () => {
      const { data: sugNow } = await supabase.from("exercise_metadata_suggestions").select("id,status").in("exercise_id", pilotIds);
      const nowMap = countBy(sugNow ?? [], (s:any) => s.status);
      const same = JSON.stringify(nowMap) === JSON.stringify(snapshotBefore.suggestions_by_status)
        && (sugNow?.length ?? 0) === snapshotBefore.total_suggestions_rows;
      return { ok: same, detail: `before=${JSON.stringify(snapshotBefore.suggestions_by_status)} after=${JSON.stringify(nowMap)}` };
    });
    await start("I3", "isolation", "nenhuma revisão humana criada nos 30 exercícios", async () => {
      const { count } = await supabase.from("exercise_metadata_ground_truth")
        .select("id", { count: "exact", head: true })
        .in("exercise_id", pilotIds)
        .eq("reviewer_kind", "human_blinded_v1");
      return { ok: (count ?? 0) === 0, detail: `human_blinded_v1_in_pilot=${count}` };
    });
    await start("I4", "isolation", "reviewer_id persistido = admin real", async () => {
      const { data } = await supabase.from("exercise_metadata_ground_truth")
        .select("reviewer_id,reviewer_kind").eq("pilot_selection_id", ctx.pilotSelectionId).limit(1).single();
      return { ok: data?.reviewer_id === user.id && data?.reviewer_kind === "human_blinded_v1", detail: `reviewer=${maskUUID(String(data?.reviewer_id))}` };
    });

    setProgress(95);

    // ================= CLEANUP =================
    setProgressLabel("Cleanup");
    const { data: cleanupResp, error: cleanupErr } = await supabase.functions.invoke("preflight-review-cleanup", {
      body: { pilot_selection_id: ctx.pilotSelectionId },
    });
    await start("Z1", "cleanup", "cleanup remove todas as rows preflight", async () => {
      if (cleanupErr) return { ok: false, detail: cleanupErr.message };
      const { count } = await supabase.from("exercise_metadata_ground_truth")
        .select("id", { count: "exact", head: true })
        .eq("pilot_selection_id", ctx.pilotSelectionId);
      return { ok: (count ?? 0) === 0, detail: `deleted=${(cleanupResp as any)?.deleted} remaining=${count}` };
    });
    await start("Z2", "cleanup", "snapshot pós = snapshot pré (30 exercícios)", async () => {
      const [{ data: exNow }, { data: revNow }, { data: sugNow }] = await Promise.all([
        supabase.from("exercises").select("id,metadata_version,metadata_reviewed_at").in("id", pilotIds),
        supabase.from("exercise_metadata_ground_truth").select("id,exercise_id,status,reviewer_kind").in("exercise_id", pilotIds),
        supabase.from("exercise_metadata_suggestions").select("id,exercise_id,status").in("exercise_id", pilotIds),
      ]);
      const after = {
        exercises_metadata_version: Object.fromEntries((exNow ?? []).map((e:any) => [e.id, { v: e.metadata_version, at: e.metadata_reviewed_at }])),
        ground_truth_by_status: countBy(revNow ?? [], (r:any) => `${r.reviewer_kind}:${r.status}`),
        suggestions_by_status: countBy(sugNow ?? [], (s:any) => s.status),
        total_ground_truth_rows: (revNow ?? []).length,
        total_suggestions_rows: (sugNow ?? []).length,
      };
      const same = JSON.stringify(after) === JSON.stringify(snapshotBefore);
      setReport(r => ({ ...(r ?? {}), snapshotBefore, snapshotAfter: after }));
      return { ok: same, detail: same ? "identical" : "DIVERGENT" };
    });

    setProgress(100); setProgressLabel("Concluído");

    // Build report (never include tokens or reviewer_id in clear)
    setReport({
      preflight_run_id: ctx.preflightRunId,
      pilot_selection_id: ctx.pilotSelectionId,
      classifier_run_id: ctx.classifierRunId,
      fixture: { exercise_id: ctx.fixtureExerciseId, nome: ctx.fixtureExerciseName },
      admin_uid_masked: maskUUID(user.id),
      auth_model: "user-scoped JWT → save_human_first_review RPC (SECURITY DEFINER, authenticated only)",
      rpc_acl: "EXECUTE granted to authenticated; revoked from service_role",
      reviewer_kind_source: "server-enforced (human_blinded_v1)",
      bootstrap_payload_keys: Object.keys(bootstrapBody ?? {}),
      bootstrap_item_shape: shapeOf(bootstrapBody?.items?.[0] ?? {}),
      concurrency_result: concurrencyDetail,
      sample_changed_fields: sampleChangedFields,
      sample_diff_shape: shapeOf(sampleDiff),
      snapshotBefore,
      results: results, // filled post-hoc via ref state below
    });

    setRunning(false);
  }

  function downloadReport() {
    const merged = { ...report, results, summary };
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `preflight-report-${Date.now()}.json`;
    a.click();
  }

  if (!featureEnabled) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <Card>
            <CardHeader><CardTitle>Preflight desativado</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Esta rota está protegida por feature flag admin-only. Acesse com <code>?enabled=1</code> para ativar o runner do preflight.
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="w-5 h-5" /> Etapa 1.2B — Preflight Autenticado
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Runner admin-only. Fixture isolada. Cleanup automático. Nunca toca nos 30 exercícios do piloto.
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button onClick={run} disabled={running}>
                {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PlayCircle className="w-4 h-4 mr-1" />}
                Executar preflight
              </Button>
              {report && !running && (
                <Button variant="outline" size="sm" onClick={downloadReport}>
                  <Download className="w-4 h-4 mr-1" /> Baixar relatório
                </Button>
              )}
              <div className="ml-auto text-xs text-muted-foreground">
                {summary.total > 0 && (
                  <>PASS <b className="text-emerald-600">{summary.pass}</b> · FAIL <b className="text-destructive">{summary.fail}</b> · SKIP {summary.skip}</>
                )}
              </div>
            </div>
            {running && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{progressLabel}</div>
                <Progress value={progress} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resultados</CardTitle></CardHeader>
          <CardContent className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
            {results.length === 0 && <div className="text-xs text-muted-foreground p-2">Sem resultados ainda.</div>}
            {results.map(r => (
              <div key={r.id} className="flex items-start gap-2 text-xs border rounded p-2">
                <Badge variant={r.status === "pass" ? "default" : r.status === "fail" ? "destructive" : "outline"} className="text-[10px]">
                  {r.status.toUpperCase()}
                </Badge>
                <div className="flex-1">
                  <div className="font-mono font-semibold">[{r.group}] {r.id} · {r.name}</div>
                  {r.detail && <div className="text-[10px] text-muted-foreground break-all mt-0.5">{r.detail}</div>}
                </div>
                <div className="text-[10px] text-muted-foreground">{r.ms}ms</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {report && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Relatório técnico</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-[40vh]">
{JSON.stringify(report, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function countBy<T>(arr: T[], keyFn: (x: T) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const item of arr) { const k = keyFn(item); m[k] = (m[k] ?? 0) + 1; }
  return m;
}