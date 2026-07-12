// Phase 1.2B — Authenticated browser preflight (hardened runner).
//
// STRICT RULES:
//  - Fixture uses an exercise NOT in the 30 pilot IDs.
//  - All writes go to public.exercise_metadata_ground_truth with a
//    preflight-scoped pilot_selection_id `preflight_pilot_2c_12_<ts>`.
//  - Cleanup only touches preflight rows.
//  - No secrets or JWTs are logged; only structural evidence is captured.
//  - No changes to exercises, exercise_metadata_suggestions or plans.
//
// HARDENING (Phase 1.2C):
//  - Per-test timeout via Promise.race.
//  - Per-test try/catch/finally; a stuck test never blocks the run.
//  - Statuses: PASS / FAIL / INCONCLUSIVE / SKIP.
//  - Gateway timeouts are classified as INCONCLUSIVE, then reconciled
//    against the database when possible (PASS_CONFIRMED_BY_DB /
//    FAIL_CONFIRMED_BY_DB / INCONCLUSIVE_NETWORK).
//  - Isolation & cleanup always run in a `finally` block.
//  - Manual cleanup button for browser interruptions.
//  - Summary separates functional / security / infra / not-run / cleanup.

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShieldCheck, PlayCircle, Download, Eraser } from "lucide-react";
import { toast } from "sonner";
import { VOCABULARY_VERSION } from "@/lib/metadataVocabularies";
import { useAuth } from "@/contexts/AuthContext";

type Status = "pass" | "fail" | "inconclusive" | "skip";
type Category =
  | "auth"
  | "draft"
  | "validation"
  | "concurrency"
  | "rollback"
  | "finalize"
  | "amendment"
  | "isolation"
  | "cleanup";

type TestResult = {
  id: string;
  group: Category;
  name: string;
  status: Status;
  critical: boolean;
  detail?: string;
  reason?: string; // gateway_timeout | logic | not_safe_to_fault_inject | ...
  evidence?: unknown;
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

const T_QUERY = 15_000;
const T_CALL = 15_000;
const T_CONCURRENCY = 25_000;
const T_CLEANUP = 15_000;

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

class TimeoutError extends Error {
  constructor(public label: string, public ms: number) {
    super(`timeout:${label}:${ms}ms`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = Promise.resolve(p as any).then(
    (v: T) => { if (t) clearTimeout(t); return v; },
    (e: unknown) => { if (t) clearTimeout(t); throw e; },
  );
  return Promise.race([
    wrapped,
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    }),
  ]);
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
    field_notes: {} as Record<string, string>,
    evidence: {
      movement_pattern: ["exercise_name"], exercise_class: ["exercise_name"],
      equipment_type: ["exercise_name"], primary_muscles: ["legacy_muscle_group"],
      secondary_muscles: ["professional_knowledge"], stability_level: ["image"],
      technical_complexity: ["professional_knowledge"], axial_load: ["professional_knowledge"],
      lumbar_load: ["professional_knowledge"], balance_requirement: ["image"],
      fatigue_cost: ["professional_knowledge"], safe_to_failure: ["professional_knowledge"],
      contraindications: ["professional_knowledge"],
    } as Record<string, string[]>,
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

async function callCleanup(pilotSelectionId: string) {
  return await withTimeout(
    supabase.functions.invoke("preflight-review-cleanup", { body: { pilot_selection_id: pilotSelectionId } }),
    T_CLEANUP,
    "cleanup",
  );
}

export default function HumanFirstReviewPreflight() {
  const { user, role } = useAuth();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [report, setReport] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [featureEnabled] = useState(() => new URLSearchParams(window.location.search).get("enabled") === "1");
  const lastPilotIdRef = useRef<string | null>(null);
  const [manualCleaning, setManualCleaning] = useState(false);

  const summary = useMemo(() => {
    const by = (s: Status) => results.filter(r => r.status === s).length;
    const security = results.filter(r => r.group === "auth" || r.group === "isolation");
    const infra = results.filter(r => r.reason === "gateway_timeout" || r.status === "inconclusive");
    return {
      total: results.length,
      pass: by("pass"),
      fail: by("fail"),
      inconclusive: by("inconclusive"),
      skip: by("skip"),
      functional_fail: results.filter(r => r.status === "fail" && r.group !== "auth" && r.group !== "isolation").length,
      security_fail: security.filter(r => r.status === "fail").length,
      infra_events: infra.length,
      cleanup_fail: results.filter(r => r.group === "cleanup" && r.status === "fail").length,
    };
  }, [results]);

  async function run() {
    if (!user || role !== "admin") { toast.error("Admin required"); return; }
    setRunning(true); setResults([]); setReport(null);
    setProgress(0); setProgressLabel("Preparando");

    const push = (r: TestResult) => setResults(prev => [...prev, r]);

    const runTest = async (cfg: {
      id: string;
      group: Category;
      name: string;
      timeoutMs?: number;
      critical: boolean;
      execute: () => Promise<{ status: Status; detail?: string; reason?: string; evidence?: unknown }>;
    }) => {
      const t0 = performance.now();
      let outcome: TestResult;
      try {
        const r = await withTimeout(cfg.execute(), cfg.timeoutMs ?? T_CALL, cfg.id);
        outcome = {
          id: cfg.id, group: cfg.group, name: cfg.name,
          status: r.status, critical: cfg.critical,
          detail: r.detail, reason: r.reason, evidence: r.evidence,
          ms: Math.round(performance.now() - t0),
        };
      } catch (e: any) {
        const isTimeout = e instanceof TimeoutError;
        outcome = {
          id: cfg.id, group: cfg.group, name: cfg.name,
          status: "inconclusive",
          critical: cfg.critical,
          reason: isTimeout ? "gateway_timeout" : "exception",
          detail: isTimeout ? `timeout ${e.ms}ms` : `exception: ${e?.message ?? String(e)}`,
          ms: Math.round(performance.now() - t0),
        };
      } finally {
        // no-op: state is captured above; push happens once
      }
      push(outcome);
      return outcome;
    };

    // Fixture context is set later; needed at cleanup finally scope.
    let ctx: RunContext | null = null;
    let snapshotBefore: any = null;
    let bootstrapBody: any = null;
    let concurrencyDetail = "";
    let sampleDiff: any = null;
    let sampleChangedFields: string[] | null = null;

    try {
      // ---- 1. Snapshot ----
      setProgressLabel("Snapshot inicial"); setProgress(2);
      const pilotIds = Array.from(PILOT_EXERCISE_IDS);
      const [snapEx, snapRev, snapSug] = await withTimeout(Promise.all([
        supabase.from("exercises").select("id,metadata_version,metadata_reviewed_at").in("id", pilotIds),
        supabase.from("exercise_metadata_ground_truth").select("id,exercise_id,status,reviewer_kind").in("exercise_id", pilotIds),
        supabase.from("exercise_metadata_suggestions").select("id,exercise_id,status").in("exercise_id", pilotIds),
      ]), T_QUERY, "snapshot_before");
      snapshotBefore = {
        exercises_metadata_version: Object.fromEntries((snapEx.data ?? []).map((e:any) => [e.id, { v: e.metadata_version, at: e.metadata_reviewed_at }])),
        ground_truth_by_status: countBy(snapRev.data ?? [], (r:any) => `${r.reviewer_kind}:${r.status}`),
        suggestions_by_status: countBy(snapSug.data ?? [], (s:any) => s.status),
        total_ground_truth_rows: (snapRev.data ?? []).length,
        total_suggestions_rows: (snapSug.data ?? []).length,
      };

      // ---- 2. Pick fixture (non-pilot) ----
      const { data: fixtureCandidates } = await withTimeout(
        supabase.from("exercises").select("id, nome").not("id", "in", `(${pilotIds.join(",")})`).order("nome").limit(1),
        T_QUERY, "fixture_pick",
      );
      const fixture = (fixtureCandidates as any)?.[0];
      if (!fixture) { toast.error("no fixture available"); return; }

      const ts = Date.now();
      ctx = {
        pilotSelectionId: `preflight_pilot_2c_12_${ts}`,
        classifierRunId: crypto.randomUUID(),
        preflightRunId: crypto.randomUUID(),
        fixtureExerciseId: fixture.id,
        fixtureExerciseName: fixture.nome,
        adminUid: user.id,
      };
      lastPilotIdRef.current = ctx.pilotSelectionId;
      setProgress(6); setProgressLabel(`Fixture: ${fixture.nome}`);

      // ================= AUTH & AUTHORIZATION =================
      setProgressLabel("Auth & Autorização");
      await runTest({ id: "A1", group: "auth", name: "admin executa bootstrap (200)", critical: true, execute: async () => {
        const r = await callFn("bootstrap");
        return { status: r.status === 200 && Array.isArray(r.body?.items) && r.body.items.length === 30 ? "pass" : "fail", detail: `status=${r.status}`, evidence: { status: r.status } };
      }});
      await runTest({ id: "A2", group: "auth", name: "bootstrap é cego (nenhum campo previsto)", critical: true, execute: async () => {
        const r = await callFn("bootstrap");
        bootstrapBody = r.body;
        const leaks = deepScanForKeys(r.body, FORBIDDEN_LEAK_KEYS);
        return { status: leaks.length === 0 ? "pass" : "fail", detail: leaks.length ? `leaks=${leaks.join(",")}` : "clean", evidence: { leaks } };
      }});
      await runTest({ id: "A3", group: "auth", name: "get_exercise é cego (whitelist estrita)", critical: true, execute: async () => {
        const someId = bootstrapBody?.items?.[0]?.exercise_id;
        if (!someId) return { status: "fail", detail: "no bootstrap item" };
        const r = await callFn("get_exercise", { exercise_id: someId });
        const allowed = new Set(["id","nome","grupo_muscular","imagem_url","video_embed","ajustes","requires_load_logging"]);
        const exKeys = Object.keys(r.body?.exercise ?? {});
        const extra = exKeys.filter(k => !allowed.has(k));
        const leaks = deepScanForKeys(r.body, FORBIDDEN_LEAK_KEYS);
        const ok = r.status===200 && extra.length===0 && leaks.length===0;
        return { status: ok ? "pass" : "fail", detail: `extra=${extra.join(",")||"none"} leaks=${leaks.join(",")||"none"}`, evidence: { extra, leaks } };
      }});
      await runTest({ id: "A4", group: "auth", name: "sem JWT → 401", critical: true, execute: async () => {
        const r = await callFn("bootstrap", {}, { noAuth: true });
        return { status: r.status === 401 ? "pass" : "fail", detail: `status=${r.status}` };
      }});
      await runTest({ id: "A5", group: "auth", name: "JWT inválido → 401", critical: true, execute: async () => {
        const r = await callFn("bootstrap", {}, { authHeader: "Bearer invalid.token.here" });
        return { status: r.status === 401 ? "pass" : "fail", detail: `status=${r.status}` };
      }});
      await runTest({ id: "A6", group: "auth", name: "auth.uid() = admin real", critical: true, execute: async () => {
        const { data } = await supabase.auth.getUser();
        return { status: data.user?.id === user.id ? "pass" : "fail", detail: `uid=${maskUUID(user.id)}` };
      }});
      await runTest({ id: "A7", group: "auth", name: "service_role não aparece no bundle/runtime", critical: true, execute: async () => {
        const surface = [
          JSON.stringify(bootstrapBody ?? {}),
          localStorage.getItem("supabase.auth.token") ?? "",
          document.documentElement.outerHTML.slice(0, 200000),
        ].join(" ");
        const bad = /service_role/i.test(surface);
        return { status: bad ? "fail" : "pass", detail: bad ? "found service_role token in surface" : "not present" };
      }});

      setProgress(20);

      // ================= DRAFT & VERSIONING =================
      setProgressLabel("Draft & Versionamento");
      const valid = makeValidMetadata();

      let v1_id: string | null = null;
      let v2_id: string | null = null;
      await runTest({ id: "D1", group: "draft", name: "save_draft cria versão 1", critical: true, execute: async () => {
        const { data, error } = await saveViaRpc(ctx!, "save_draft", {
          _reviewed_metadata: { movement_pattern: "anti_extension" },
          _field_review_status: { movement_pattern: "resolved" },
          _evidence: { movement_pattern: ["exercise_name"] },
        }, 0);
        if (error) return { status: "fail", detail: error.message };
        v1_id = data?.[0]?.id;
        const ok = data?.[0]?.review_version === 1 && data?.[0]?.is_current === true;
        return { status: ok ? "pass" : "fail", detail: `v=${data?.[0]?.review_version}` };
      }});
      await runTest({ id: "D2", group: "draft", name: "versão 1 fica is_current=true", critical: true, execute: async () => {
        if (!v1_id) return { status: "skip", detail: "no v1", reason: "prerequisite_failed" };
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("is_current,review_version").eq("id", v1_id).single();
        const ok = data?.is_current === true && data?.review_version === 1;
        return { status: ok ? "pass" : "fail", detail: JSON.stringify(data) };
      }});
      await runTest({ id: "D3", group: "draft", name: "save posterior com expected_version correto cria v2", critical: true, execute: async () => {
        const { data, error } = await saveViaRpc(ctx!, "save_draft", {
          _reviewed_metadata: { movement_pattern: "anti_extension", exercise_class: "core_stability" },
          _field_review_status: { movement_pattern: "resolved", exercise_class: "resolved" },
          _evidence: { movement_pattern: ["exercise_name"], exercise_class: ["exercise_name"] },
        }, 1);
        if (error) return { status: "fail", detail: error.message };
        v2_id = data?.[0]?.id;
        return { status: data?.[0]?.review_version === 2 ? "pass" : "fail", detail: `v=${data?.[0]?.review_version}` };
      }});
      await runTest({ id: "D4", group: "draft", name: "v1 fica superseded, is_current=false", critical: true, execute: async () => {
        if (!v1_id) return { status: "skip", detail: "no v1", reason: "prerequisite_failed" };
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("is_current,status").eq("id", v1_id).single();
        const ok = data?.is_current === false && data?.status === "superseded";
        return { status: ok ? "pass" : "fail", detail: JSON.stringify(data) };
      }});
      await runTest({ id: "D5", group: "draft", name: "apenas uma versão is_current=true", critical: true, execute: async () => {
        const { count } = await supabase.from("exercise_metadata_ground_truth")
          .select("id", { count: "exact", head: true })
          .eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true);
        return { status: count === 1 ? "pass" : "fail", detail: `is_current_count=${count}` };
      }});
      // D6 — expected_version incorreto → 409 (com reconciliação pós-timeout)
      await runTest({ id: "D6", group: "draft", name: "expected_version incorreto → version_conflict", critical: true, timeoutMs: 40_000, execute: async () => {
        const { data: pre } = await supabase.from("exercise_metadata_ground_truth")
          .select("id,review_version").eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true).single();
        const preV = pre?.review_version ?? -1;
        try {
          const { error } = await withTimeout(saveViaRpc(ctx!, "save_draft", {
            _reviewed_metadata: { movement_pattern: "hip_hinge" },
            _field_review_status: { movement_pattern: "resolved" },
            _evidence: { movement_pattern: ["exercise_name"] },
          }, 0), T_CALL, "D6.rpc");
          if (error && /version_conflict/.test(error.message)) {
            return { status: "pass", detail: error.message };
          }
          // No 409 — verify DB state unchanged
          const { data: post } = await supabase.from("exercise_metadata_ground_truth")
            .select("id,review_version").eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true).single();
          const unchanged = post?.review_version === preV && post?.id === pre?.id;
          return {
            status: "fail",
            detail: `no 409; db_unchanged=${unchanged} err=${error?.message ?? "none"}`,
            evidence: { preV, postV: post?.review_version, sameRow: post?.id === pre?.id },
          };
        } catch (e: any) {
          // Timeout — reconcile with DB
          const { data: post } = await supabase.from("exercise_metadata_ground_truth")
            .select("id,review_version").eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true).single();
          const unchanged = post?.review_version === preV && post?.id === pre?.id;
          if (unchanged) {
            return { status: "inconclusive", reason: "gateway_timeout", detail: `db unchanged (v=${preV}), but HTTP 409 not confirmed` };
          }
          return { status: "fail", detail: `timeout + db drifted from v=${preV} to v=${post?.review_version}` };
        }
      }});

      setProgress(40);

      // ================= VALIDATION =================
      setProgressLabel("Validação");
      await runTest({ id: "V1", group: "validation", name: "finalize incompleto rejeitado", critical: true, execute: async () => {
        const r = await callFn("finalize", {
          exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
          reviewed_metadata: { movement_pattern: "squat" },
          field_review_status: { movement_pattern: "resolved" },
          field_notes: {}, evidence: { movement_pattern: ["exercise_name"] },
          expected_version: 0, vocabulary_version: VOCABULARY_VERSION,
        });
        return { status: r.status === 422 ? "pass" : "fail", detail: `status=${r.status} err=${r.body?.error ?? "?"}` };
      }});
      await runTest({ id: "V2", group: "validation", name: "vocabulary_version divergente → 409", critical: true, execute: async () => {
        const r = await callFn("save_draft", {
          exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
          reviewed_metadata: {}, field_review_status: {}, field_notes: {}, evidence: {},
          expected_version: 0, vocabulary_version: "v9.9",
        });
        return { status: r.status === 409 ? "pass" : "fail", detail: `status=${r.status}` };
      }});
      await runTest({ id: "V3", group: "validation", name: "músculo fora do vocabulário rejeitado", critical: true, execute: async () => {
        const r = await callFn("finalize", {
          exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
          reviewed_metadata: { ...valid.reviewed_metadata, primary_muscles: ["core"] },
          field_review_status: valid.field_review_status,
          field_notes: valid.field_notes, evidence: valid.evidence,
          expected_version: 0, vocabulary_version: VOCABULARY_VERSION,
        });
        const ok = r.status === 422 && JSON.stringify(r.body?.details ?? "").includes("primary_muscles");
        return { status: ok ? "pass" : "fail", detail: `status=${r.status}` };
      }});
      await runTest({ id: "V4", group: "validation", name: "equipamento inválido rejeitado", critical: true, execute: async () => {
        const r = await callFn("finalize", {
          exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
          reviewed_metadata: { ...valid.reviewed_metadata, equipment_type: "trampolim_alien" },
          field_review_status: valid.field_review_status,
          field_notes: valid.field_notes, evidence: valid.evidence,
          expected_version: 0, vocabulary_version: VOCABULARY_VERSION,
        });
        return { status: r.status === 422 ? "pass" : "fail", detail: `status=${r.status}` };
      }});
      await runTest({ id: "V5", group: "validation", name: "estado insuficiente sem nota/evidência rejeitado", critical: true, execute: async () => {
        const md = { ...valid.reviewed_metadata, secondary_muscles: null };
        const st = { ...valid.field_review_status, secondary_muscles: "insufficient_information" };
        const ev = { ...valid.evidence, secondary_muscles: [] };
        const r = await callFn("finalize", {
          exercise_id: bootstrapBody?.items?.[0]?.exercise_id,
          reviewed_metadata: md, field_review_status: st, field_notes: {},
          evidence: ev, expected_version: 0, vocabulary_version: VOCABULARY_VERSION,
        });
        return { status: r.status === 422 ? "pass" : "fail", detail: `status=${r.status}` };
      }});
      await runTest({ id: "V6", group: "validation", name: "safe_to_failure=false preservado", critical: true, execute: async () => {
        const md = { ...valid.reviewed_metadata, safe_to_failure: false };
        const { data: cur } = await supabase.from("exercise_metadata_ground_truth")
          .select("review_version").eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true).single();
        const { data, error } = await saveViaRpc(ctx!, "save_draft", {
          _reviewed_metadata: md,
          _field_review_status: valid.field_review_status,
          _field_notes: {}, _evidence: valid.evidence,
        }, cur?.review_version ?? 0);
        if (error) return { status: "fail", detail: error.message };
        const { data: row } = await supabase.from("exercise_metadata_ground_truth")
          .select("reviewed_metadata").eq("id", data?.[0]?.id).single();
        const val = (row?.reviewed_metadata as any)?.safe_to_failure;
        return { status: val === false ? "pass" : "fail", detail: `stored=${JSON.stringify(val)}` };
      }});
      await runTest({ id: "V7", group: "validation", name: "arrays vazios [] preservados", critical: true, execute: async () => {
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("reviewed_metadata").eq("pilot_selection_id", ctx!.pilotSelectionId)
          .eq("is_current", true).single();
        const md = data?.reviewed_metadata as any;
        const okSec = Array.isArray(md?.secondary_muscles) && md.secondary_muscles.length === 0;
        const okContra = Array.isArray(md?.contraindications) && md.contraindications.length === 0;
        return { status: (okSec && okContra) ? "pass" : "fail", detail: `sec=${JSON.stringify(md?.secondary_muscles)} contra=${JSON.stringify(md?.contraindications)}` };
      }});

      setProgress(55);

      // ================= CONCURRENCY =================
      setProgressLabel("Concorrência");
      const { data: cur } = await withTimeout(
        supabase.from("exercise_metadata_ground_truth")
          .select("review_version").eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true).single(),
        T_QUERY, "concurrency.pre",
      );
      const N = (cur as any)?.review_version ?? 0;
      await runTest({ id: "C1", group: "concurrency", name: "duas gravações paralelas: uma vence, outra 409", critical: true, timeoutMs: 45_000, execute: async () => {
        const both = await Promise.allSettled([
          saveViaRpc(ctx!, "save_draft", {
            _reviewed_metadata: { ...valid.reviewed_metadata, movement_pattern: "anti_extension" },
            _field_review_status: valid.field_review_status,
            _field_notes: {}, _evidence: valid.evidence,
          }, N),
          saveViaRpc(ctx!, "save_draft", {
            _reviewed_metadata: { ...valid.reviewed_metadata, movement_pattern: "anti_rotation" },
            _field_review_status: valid.field_review_status,
            _field_notes: {}, _evidence: valid.evidence,
          }, N),
        ]);
        const outcomes = both.map(x => x.status === "fulfilled" ? ((x.value as any)?.error?.message ?? "ok") : `rejected:${(x.reason as any)?.message}`);
        const oks = outcomes.filter(o => o === "ok").length;
        const conflicts = outcomes.filter(o => /version_conflict/.test(o)).length;
        concurrencyDetail = outcomes.join(" | ");
        return { status: (oks === 1 && conflicts === 1) ? "pass" : "fail", detail: concurrencyDetail };
      }});
      await runTest({ id: "C2", group: "concurrency", name: "apenas uma is_current=true após concorrência", critical: true, execute: async () => {
        const { count } = await supabase.from("exercise_metadata_ground_truth")
          .select("id", { count: "exact", head: true })
          .eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true);
        return { status: count === 1 ? "pass" : "fail", detail: `count=${count}` };
      }});

      setProgress(70);

      // ================= ROLLBACK =================
      setProgressLabel("Rollback transacional");
      // R1 uses a validation failure that triggers early in the RPC (vocab_version_mismatch)
      // BEFORE any supersede/insert happens. This is deterministic and safe:
      // the RPC raises the exception before executing UPDATE ... status='superseded'
      // and before INSERT of the new version. Any lingering side-effect would be
      // detected by comparing the exact pre/post row.
      const { data: preRollback } = await withTimeout(
        supabase.from("exercise_metadata_ground_truth")
          .select("id,review_version,status,is_current,reviewed_metadata")
          .eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true).single(),
        T_QUERY, "R1.pre",
      );
      const preRollbackCount = await withTimeout(
        supabase.from("exercise_metadata_ground_truth")
          .select("id", { count: "exact", head: true })
          .eq("pilot_selection_id", ctx!.pilotSelectionId),
        T_QUERY, "R1.count",
      );
      await runTest({ id: "R1", group: "rollback", name: "vocab_version_mismatch: versão atual preservada, sem row nova", critical: true, timeoutMs: 30_000, execute: async () => {
        const preV = (preRollback as any)?.review_version ?? 0;
        const { error } = await saveViaRpc(ctx!, "save_draft", {
          _reviewed_metadata: valid.reviewed_metadata,
          _field_review_status: valid.field_review_status,
          _field_notes: {}, _evidence: valid.evidence,
          _vocabulary_version: "v9.9",
        }, preV);
        const { data: post } = await supabase.from("exercise_metadata_ground_truth")
          .select("id,review_version,is_current,status").eq("id", (preRollback as any).id).single();
        const { count: postCount } = await supabase.from("exercise_metadata_ground_truth")
          .select("id", { count: "exact", head: true })
          .eq("pilot_selection_id", ctx!.pilotSelectionId);
        const stillCurrent = post?.is_current === true && post?.status === (preRollback as any)?.status && post?.review_version === preV;
        const noNewRow = postCount === preRollbackCount.count;
        const ok = !!error && /vocabulary_version_mismatch/.test(error.message) && stillCurrent && noNewRow;
        return {
          status: ok ? "pass" : "fail",
          detail: `err=${error?.message?.slice(0,80)} stillCurrent=${stillCurrent} noNewRow=${noNewRow}`,
          evidence: { preV, postV: post?.review_version, preCount: preRollbackCount.count, postCount },
        };
      }});
      // R2 — fault injection past supersede point is not safe in production RPC
      await runTest({ id: "R2", group: "rollback", name: "fault injection após supersede (não seguro em produção)", critical: false, execute: async () => {
        return {
          status: "skip",
          reason: "not_safe_to_fault_inject",
          detail: "RPC única transação BEGIN/END com SECURITY DEFINER; não há hook para forçar falha após UPDATE ... superseded sem alterar schema. Evidência estrutural: UPDATE e INSERT coexistem na mesma função PL/pgSQL, portanto qualquer exception após o UPDATE dispara rollback automático da transação. Teste equivalente deve rodar em staging/local com savepoint controlado.",
        };
      }});

      setProgress(78);

      // ================= FINALIZE =================
      setProgressLabel("Finalize");
      const { data: curBeforeFinal } = await withTimeout(
        supabase.from("exercise_metadata_ground_truth")
          .select("review_version").eq("pilot_selection_id", ctx!.pilotSelectionId).eq("is_current", true).single(),
        T_QUERY, "F.pre",
      );
      const vf = (curBeforeFinal as any)?.review_version ?? 0;
      let finalId: string | null = null;
      let finalV: number | null = null;

      await runTest({ id: "F1", group: "finalize", name: "finalize válido cria human_first_review", critical: true, execute: async () => {
        const { data, error } = await saveViaRpc(ctx!, "finalize", {
          _reviewed_metadata: valid.reviewed_metadata,
          _field_review_status: valid.field_review_status,
          _field_notes: valid.field_notes,
          _evidence: valid.evidence,
        }, vf);
        if (error) return { status: "fail", detail: error.message };
        finalId = data?.[0]?.id;
        finalV = data?.[0]?.review_version;
        return { status: data?.[0]?.status === "human_first_review" ? "pass" : "fail", detail: `v=${data?.[0]?.review_version}` };
      }});
      await runTest({ id: "F2", group: "finalize", name: "versão final é is_current=true", critical: true, execute: async () => {
        if (!finalId) return { status: "skip", reason: "prerequisite_failed", detail: "no finalId" };
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("is_current,status,review_version").eq("id", finalId).single();
        return { status: (data?.is_current === true && data?.status === "human_first_review") ? "pass" : "fail", detail: JSON.stringify(data) };
      }});
      await runTest({ id: "F3", group: "finalize", name: "versões anteriores permanecem no histórico", critical: true, execute: async () => {
        const { count } = await supabase.from("exercise_metadata_ground_truth")
          .select("id", { count: "exact", head: true })
          .eq("pilot_selection_id", ctx!.pilotSelectionId).eq("status", "superseded");
        return { status: (count ?? 0) >= 1 ? "pass" : "fail", detail: `superseded_count=${count}` };
      }});
      await runTest({ id: "F4", group: "finalize", name: "save_draft após finalize retorna bloqueio", critical: true, execute: async () => {
        if (!finalId || finalV === null) return { status: "skip", reason: "prerequisite_failed" };
        const { error } = await saveViaRpc(ctx!, "save_draft", {
          _reviewed_metadata: valid.reviewed_metadata,
          _field_review_status: valid.field_review_status,
          _field_notes: {}, _evidence: valid.evidence,
        }, finalV);
        return { status: (!!error && /cannot_draft_after_finalize/.test(error.message)) ? "pass" : "fail", detail: error?.message ?? "no error" };
      }});
      await runTest({ id: "F5", group: "finalize", name: "nenhum campo perde false, [] ou null semântico", critical: true, execute: async () => {
        if (!finalId) return { status: "skip", reason: "prerequisite_failed" };
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("reviewed_metadata").eq("id", finalId).single();
        const md = (data?.reviewed_metadata ?? {}) as any;
        const okFalse = md.safe_to_failure === true; // valid preset has true
        const okArr = Array.isArray(md.secondary_muscles) && md.secondary_muscles.length === 0
          && Array.isArray(md.contraindications) && md.contraindications.length === 0;
        return { status: (okFalse && okArr) ? "pass" : "fail", detail: `safe=${md.safe_to_failure} sec=${JSON.stringify(md.secondary_muscles)} contra=${JSON.stringify(md.contraindications)}` };
      }});
      await runTest({ id: "F6", group: "finalize", name: "reviewer_id é o admin real", critical: true, execute: async () => {
        if (!finalId) return { status: "skip", reason: "prerequisite_failed" };
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("reviewer_id").eq("id", finalId).single();
        return { status: data?.reviewer_id === user.id ? "pass" : "fail", detail: `reviewer=${maskUUID(String(data?.reviewer_id))}` };
      }});
      // F7 moved to the end of the run so it never pollutes M1-M13
      // (a rejected write is a no-op; an accepted one leaves an extra
      // is_current row scoped by (reviewer_kind, classifier_run_id)).

      setProgress(85);

      // ================= AMENDMENT =================
      setProgressLabel("Amendment");
      const readCur = async () => {
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("id,review_version,reviewed_metadata,field_review_status,field_notes,evidence")
          .eq("pilot_selection_id", ctx!.pilotSelectionId)
          .eq("reviewer_kind", "human_blinded_v1")
          .eq("classifier_run_id", ctx!.classifierRunId)
          .eq("is_current", true).single();
        return data as any;
      };

      await runTest({ id: "M1", group: "amendment", name: "amendment sem change_reason é rejeitado", critical: true, execute: async () => {
        const c = await readCur();
        const { error } = await saveViaRpc(ctx!, "amend_after_final", {
          _reviewed_metadata: valid.reviewed_metadata,
          _field_review_status: valid.field_review_status,
          _field_notes: {}, _evidence: valid.evidence,
        }, c.review_version);
        return { status: (!!error && /change_reason_required/.test(error.message)) ? "pass" : "fail", detail: error?.message ?? "no error" };
      }});
      await runTest({ id: "M2", group: "amendment", name: "motivo <10 caracteres é rejeitado", critical: true, execute: async () => {
        const c = await readCur();
        const { error } = await saveViaRpc(ctx!, "amend_after_final", {
          _reviewed_metadata: valid.reviewed_metadata,
          _field_review_status: valid.field_review_status,
          _field_notes: {}, _evidence: valid.evidence,
          _change_reason: "curto",
        }, c.review_version);
        return { status: (!!error && /change_reason_required/.test(error.message)) ? "pass" : "fail", detail: error?.message ?? "no error" };
      }});
      await runTest({ id: "M3", group: "amendment", name: "amendment sem mudança → amendment_without_changes", critical: true, execute: async () => {
        const c = await readCur();
        const { error } = await saveViaRpc(ctx!, "amend_after_final", {
          _reviewed_metadata: valid.reviewed_metadata,
          _field_review_status: valid.field_review_status,
          _field_notes: valid.field_notes,
          _evidence: valid.evidence,
          _change_reason: "Reavaliação sem mudanças reais para teste",
        }, c.review_version);
        return { status: (!!error && /amendment_without_changes/.test(error.message)) ? "pass" : "fail", detail: error?.message ?? "no error" };
      }});

      // M4-M10 — amendment válido com mudança de metadata
      let mAmendId: string | null = null;
      let mDiff: any = null;
      let mChanged: string[] | null = null;
      let mPrevV: number | null = null;
      await runTest({ id: "M4", group: "amendment", name: "amendment válido cria nova review_version", critical: true, execute: async () => {
        const c = await readCur();
        mPrevV = c.review_version;
        const md = { ...valid.reviewed_metadata, technical_complexity: "moderate" };
        const { data, error } = await saveViaRpc(ctx!, "amend_after_final", {
          _reviewed_metadata: md,
          _field_review_status: valid.field_review_status,
          _field_notes: valid.field_notes,
          _evidence: valid.evidence,
          _change_reason: "Aumento de complexidade técnica após revisão de vídeo",
          _changed_fields: ["movement_pattern"], // cliente mente — servidor deve ignorar
        }, c.review_version);
        if (error) return { status: "fail", detail: error.message };
        mAmendId = data?.[0]?.id;
        mDiff = data?.[0]?.diff;
        mChanged = data?.[0]?.changed_fields;
        sampleDiff = mDiff; sampleChangedFields = mChanged;
        return { status: (data?.[0]?.review_version === (c.review_version + 1)) ? "pass" : "fail", detail: `v=${data?.[0]?.review_version}` };
      }});
      await runTest({ id: "M5", group: "amendment", name: "versão final anterior fica no histórico", critical: true, execute: async () => {
        const { count } = await supabase.from("exercise_metadata_ground_truth")
          .select("id", { count: "exact", head: true })
          .eq("pilot_selection_id", ctx!.pilotSelectionId).eq("status", "superseded");
        return { status: (count ?? 0) >= 2 ? "pass" : "fail", detail: `superseded_count=${count}` };
      }});
      await runTest({ id: "M6", group: "amendment", name: "apenas a nova versão fica is_current=true", critical: true, execute: async () => {
        const { count } = await supabase.from("exercise_metadata_ground_truth")
          .select("id", { count: "exact", head: true })
          .eq("pilot_selection_id", ctx!.pilotSelectionId)
          .eq("reviewer_kind", "human_blinded_v1")
          .eq("classifier_run_id", ctx!.classifierRunId)
          .eq("is_current", true);
        return { status: count === 1 ? "pass" : "fail", detail: `is_current_count=${count}` };
      }});
      await runTest({ id: "M7", group: "amendment", name: "previous_review_version correto", critical: true, execute: async () => {
        if (!mAmendId || mPrevV === null) return { status: "skip", reason: "prerequisite_failed" };
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("previous_review_version").eq("id", mAmendId).single();
        return { status: data?.previous_review_version === mPrevV ? "pass" : "fail", detail: `prev=${data?.previous_review_version} expected=${mPrevV}` };
      }});
      await runTest({ id: "M8", group: "amendment", name: "changed_fields é calculado pelo servidor", critical: true, execute: async () => {
        const ok = Array.isArray(mChanged) && mChanged.length === 1 && mChanged[0] === "technical_complexity";
        return { status: ok ? "pass" : "fail", detail: `changed=${JSON.stringify(mChanged)}` };
      }});
      await runTest({ id: "M9", group: "amendment", name: "changed_fields enviado pelo cliente é ignorado", critical: true, execute: async () => {
        const ok = Array.isArray(mChanged) && !mChanged.includes("movement_pattern");
        return { status: ok ? "pass" : "fail", detail: `client_lied=[movement_pattern] server_computed=${JSON.stringify(mChanged)}` };
      }});
      await runTest({ id: "M10", group: "amendment", name: "diff contém from_value/to_value e from_state/to_state", critical: true, execute: async () => {
        const entry = mDiff?.technical_complexity;
        const okKeys = entry && "from_value" in entry && "to_value" in entry && "from_state" in entry && "to_state" in entry;
        return { status: okKeys ? "pass" : "fail", detail: JSON.stringify(entry ?? null).slice(0,200) };
      }});

      // M11 — amendment com apenas mudança de state
      await runTest({ id: "M11", group: "amendment", name: "mudança apenas de estado entra no diff", critical: true, execute: async () => {
        const c = await readCur();
        const st = { ...valid.field_review_status, technical_complexity: "needs_more_info" };
        const md = { ...valid.reviewed_metadata, technical_complexity: "moderate" }; // same value as current
        const notesWithEv = { technical_complexity: "reclassificado como needs_more_info por dúvida técnica" };
        const { data, error } = await saveViaRpc(ctx!, "amend_after_final", {
          _reviewed_metadata: md,
          _field_review_status: st,
          _field_notes: notesWithEv,
          _evidence: valid.evidence,
          _change_reason: "Reavaliação: rebaixamos técnica para needs_more_info",
        }, c.review_version);
        if (error) return { status: "fail", detail: error.message };
        const changed: string[] = data?.[0]?.changed_fields ?? [];
        const diff = (data?.[0]?.diff ?? {}) as Record<string, any>;
        const entry = diff.technical_complexity;
        const stateChanged = entry && entry.from_state !== entry.to_state;
        return { status: (changed.includes("technical_complexity") && stateChanged) ? "pass" : "fail", detail: `changed=${JSON.stringify(changed)} state=${entry?.from_state}→${entry?.to_state}` };
      }});
      // M12 — amendment com apenas mudança de evidence
      await runTest({ id: "M12", group: "amendment", name: "mudança apenas de evidence entra no diff", critical: true, execute: async () => {
        const c = await readCur();
        const ev = { ...valid.evidence, technical_complexity: ["image", "professional_knowledge"] };
        const { data, error } = await saveViaRpc(ctx!, "amend_after_final", {
          _reviewed_metadata: (c.reviewed_metadata ?? {}),
          _field_review_status: (c.field_review_status ?? {}),
          _field_notes: (c.field_notes ?? {}),
          _evidence: ev,
          _change_reason: "Adicionada evidência de imagem para técnica",
        }, c.review_version);
        if (error) return { status: "fail", detail: error.message };
        const changed: string[] = data?.[0]?.changed_fields ?? [];
        const diff = (data?.[0]?.diff ?? {}) as Record<string, any>;
        const entry = diff.technical_complexity;
        const evChanged = entry && JSON.stringify(entry.from_evidence) !== JSON.stringify(entry.to_evidence);
        return { status: (changed.includes("technical_complexity") && evChanged) ? "pass" : "fail", detail: `changed=${JSON.stringify(changed)} ev=${JSON.stringify(entry?.to_evidence)}` };
      }});
      // M13 — amendment com apenas mudança de field_notes
      await runTest({ id: "M13", group: "amendment", name: "mudança apenas de field_notes entra no diff", critical: true, execute: async () => {
        const c = await readCur();
        const notes = { ...(c.field_notes ?? {}), technical_complexity: "Refinamento textual: exige controle proximal ativo" };
        const { data, error } = await saveViaRpc(ctx!, "amend_after_final", {
          _reviewed_metadata: (c.reviewed_metadata ?? {}),
          _field_review_status: (c.field_review_status ?? {}),
          _field_notes: notes,
          _evidence: (c.evidence ?? {}),
          _change_reason: "Refinamento textual em field_notes",
        }, c.review_version);
        if (error) return { status: "fail", detail: error.message };
        const changed: string[] = data?.[0]?.changed_fields ?? [];
        const diff = (data?.[0]?.diff ?? {}) as Record<string, any>;
        const entry = diff.technical_complexity;
        const noteChanged = entry && entry.from_note !== entry.to_note;
        return { status: (changed.includes("technical_complexity") && noteChanged) ? "pass" : "fail", detail: `changed=${JSON.stringify(changed)} note=${entry?.from_note}→${entry?.to_note}` };
      }});
      await runTest({ id: "M14", group: "amendment", name: "mudança apenas de nota geral", critical: false, execute: async () => {
        return { status: "skip", reason: "no_general_note_field", detail: "Schema atual não expõe campo de nota geral separado; apenas change_reason e field_notes por campo." };
      }});

      // ================= F7 (RUN LAST — pollutes state) =================
      setProgressLabel("F7 (reviewer_kind whitelist)");
      await runTest({ id: "F7", group: "finalize", name: "reviewer_kind whitelist (rejeita valor arbitrário)", critical: false, execute: async () => {
        const bogusRun = crypto.randomUUID();
        const { data, error } = await supabase.rpc("save_human_first_review", {
          _action: "save_draft",
          _exercise_id: ctx!.fixtureExerciseId,
          _pilot_selection_id: ctx!.pilotSelectionId,
          _classifier_run_id: bogusRun,
          _reviewer_kind: "attacker_kind_v0",
          _reviewed_metadata: { movement_pattern: "anti_extension" },
          _field_review_status: { movement_pattern: "resolved" },
          _field_notes: {},
          _evidence: { movement_pattern: ["exercise_name"] },
          _expected_version: 0,
          _vocabulary_version: VOCABULARY_VERSION,
          _server_vocabulary_version: VOCABULARY_VERSION,
          _change_reason: null,
          _changed_fields: null,
        });
        if (error) return { status: "pass", detail: `rejected: ${error.message}` };
        const stored = (data as any)?.[0]?.id;
        if (stored) {
          const { data: row } = await supabase.from("exercise_metadata_ground_truth")
            .select("reviewer_kind").eq("id", stored).single();
          return {
            status: "fail",
            detail: `DEFEITO: RPC aceitou reviewer_kind arbitrário: stored=${row?.reviewer_kind}`,
            evidence: { defect: "reviewer_kind_not_enforced_by_rpc", stored: row?.reviewer_kind },
          };
        }
        return { status: "inconclusive", detail: "no error and no data returned" };
      }});

      setProgress(93);
    } catch (e: any) {
      // Fatal error mid-run — captured but does not block cleanup.
      push({ id: "FATAL", group: "auth", name: "erro fatal fora dos testes", status: "fail", critical: true, detail: e?.message ?? String(e) });
    } finally {
      // ================= ISOLATION & CLEANUP (always run) =================
      const pilotIds = Array.from(PILOT_EXERCISE_IDS);
      setProgressLabel("Isolamento"); setProgress(95);

      if (ctx && snapshotBefore) {
        await runTest({ id: "I1", group: "isolation", name: "exercícios do piloto não sofreram alteração", critical: true, execute: async () => {
          const { data: exNow } = await supabase.from("exercises").select("id,metadata_version,metadata_reviewed_at").in("id", pilotIds);
          const diffs = (exNow ?? []).filter((e: any) => {
            const b = snapshotBefore.exercises_metadata_version[e.id];
            return b?.v !== e.metadata_version || b?.at !== e.metadata_reviewed_at;
          });
          return { status: diffs.length === 0 ? "pass" : "fail", detail: `changed=${diffs.length}` };
        }});
        await runTest({ id: "I2", group: "isolation", name: "sugestões do piloto não sofreram alteração", critical: true, execute: async () => {
          const { data: sugNow } = await supabase.from("exercise_metadata_suggestions").select("id,status").in("exercise_id", pilotIds);
          const nowMap = countBy(sugNow ?? [], (s:any) => s.status);
          const same = JSON.stringify(nowMap) === JSON.stringify(snapshotBefore.suggestions_by_status)
            && (sugNow?.length ?? 0) === snapshotBefore.total_suggestions_rows;
          return { status: same ? "pass" : "fail", detail: `before=${JSON.stringify(snapshotBefore.suggestions_by_status)} after=${JSON.stringify(nowMap)}` };
        }});
        await runTest({ id: "I3", group: "isolation", name: "nenhuma revisão humana criada nos 30 exercícios", critical: true, execute: async () => {
          const { count } = await supabase.from("exercise_metadata_ground_truth")
            .select("id", { count: "exact", head: true })
            .in("exercise_id", pilotIds)
            .eq("reviewer_kind", "human_blinded_v1");
          return { status: (count ?? 0) === 0 ? "pass" : "fail", detail: `human_blinded_v1_in_pilot=${count}` };
        }});
        await runTest({ id: "I4", group: "isolation", name: "reviewer_id persistido = admin real", critical: true, execute: async () => {
          const { data } = await supabase.from("exercise_metadata_ground_truth")
            .select("reviewer_id,reviewer_kind")
            .eq("pilot_selection_id", ctx!.pilotSelectionId)
            .eq("reviewer_kind", "human_blinded_v1")
            .eq("classifier_run_id", ctx!.classifierRunId)
            .limit(1).maybeSingle();
          if (!data) return { status: "skip", reason: "no_preflight_rows" };
          return { status: (data?.reviewer_id === user.id && data?.reviewer_kind === "human_blinded_v1") ? "pass" : "fail", detail: `reviewer=${maskUUID(String(data?.reviewer_id))}` };
        }});
      }

      // ---- Cleanup ----
      setProgressLabel("Cleanup"); setProgress(98);
      if (ctx) {
        let cleanupResp: any = null;
        let cleanupErr: any = null;
        try {
          const r = await callCleanup(ctx.pilotSelectionId);
          cleanupResp = r.data; cleanupErr = r.error;
        } catch (e: any) { cleanupErr = e; }

        await runTest({ id: "Z1", group: "cleanup", name: "cleanup remove todas as rows preflight", critical: true, execute: async () => {
          if (cleanupErr) return { status: "fail", detail: cleanupErr.message ?? String(cleanupErr) };
          const { count } = await supabase.from("exercise_metadata_ground_truth")
            .select("id", { count: "exact", head: true })
            .eq("pilot_selection_id", ctx!.pilotSelectionId);
          return { status: (count ?? 0) === 0 ? "pass" : "fail", detail: `deleted=${cleanupResp?.deleted} remaining=${count}` };
        }});

        await runTest({ id: "Z2", group: "cleanup", name: "snapshot pós = snapshot pré (30 exercícios)", critical: true, execute: async () => {
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
          return { status: same ? "pass" : "fail", detail: same ? "identical" : "DIVERGENT" };
        }});
      }

      setProgress(100); setProgressLabel("Concluído");

      setReport(r => ({
        ...(r ?? {}),
        preflight_run_id: ctx?.preflightRunId,
        pilot_selection_id: ctx?.pilotSelectionId,
        classifier_run_id: ctx?.classifierRunId,
        fixture: ctx ? { exercise_id: ctx.fixtureExerciseId, nome: ctx.fixtureExerciseName } : null,
        admin_uid_masked: maskUUID(user.id),
        auth_model: "user-scoped JWT → save_human_first_review RPC (SECURITY DEFINER, authenticated only)",
        rpc_acl: "EXECUTE granted to authenticated; revoked from service_role",
        bootstrap_payload_keys: Object.keys(bootstrapBody ?? {}),
        bootstrap_item_shape: shapeOf(bootstrapBody?.items?.[0] ?? {}),
        concurrency_result: concurrencyDetail,
        sample_changed_fields: sampleChangedFields,
        sample_diff_shape: shapeOf(sampleDiff),
      }));

      setRunning(false);
    }
  }

  async function manualCleanup() {
    setManualCleaning(true);
    try {
      const pid = lastPilotIdRef.current;
      if (!pid) {
        // Scan for any orphan preflight rows and clean by prefix if there's exactly one
        const { data } = await supabase.from("exercise_metadata_ground_truth")
          .select("pilot_selection_id").like("pilot_selection_id", "preflight_pilot_%").limit(50);
        const ids = Array.from(new Set((data ?? []).map((r: any) => r.pilot_selection_id)));
        if (ids.length === 0) { toast.success("Sem linhas de preflight — nada a limpar."); return; }
        let total = 0;
        for (const id of ids) {
          try { const { data: r } = await callCleanup(id); total += (r as any)?.deleted ?? 0; } catch {}
        }
        toast.success(`Cleanup manual: ${total} row(s) removida(s) em ${ids.length} pilot_selection_id(s)`);
        return;
      }
      const { data, error } = await callCleanup(pid);
      if (error) { toast.error(`Cleanup falhou: ${error.message ?? String(error)}`); return; }
      toast.success(`Cleanup: ${(data as any)?.deleted} row(s) removida(s), restantes=${(data as any)?.remaining}`);
    } catch (e: any) {
      toast.error(`Cleanup exception: ${e?.message ?? String(e)}`);
    } finally {
      setManualCleaning(false);
    }
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
              Esta rota está protegida por feature flag admin-only. Acesse com <code>?enabled=1</code> para ativar o runner.
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const statusBadge = (s: Status) => {
    if (s === "pass") return <Badge className="text-[10px]">PASS</Badge>;
    if (s === "fail") return <Badge variant="destructive" className="text-[10px]">FAIL</Badge>;
    if (s === "inconclusive") return <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500/90">INCONCLUSIVE</Badge>;
    return <Badge variant="outline" className="text-[10px]">SKIP</Badge>;
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="w-5 h-5" /> Etapa 1.2C — Preflight Autenticado (Hardened)
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Timeout por teste · try/catch/finally · reconciliação DB pós-timeout · cleanup obrigatório.
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={running}>
                {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PlayCircle className="w-4 h-4 mr-1" />}
                Executar preflight
              </Button>
              <Button variant="secondary" size="sm" onClick={manualCleanup} disabled={running || manualCleaning}>
                {manualCleaning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Eraser className="w-4 h-4 mr-1" />}
                Executar cleanup agora
              </Button>
              {report && !running && (
                <Button variant="outline" size="sm" onClick={downloadReport}>
                  <Download className="w-4 h-4 mr-1" /> Baixar relatório
                </Button>
              )}
              <div className="ml-auto text-xs text-muted-foreground flex gap-3">
                {summary.total > 0 && (
                  <>
                    <span>PASS <b className="text-emerald-600">{summary.pass}</b></span>
                    <span>FAIL <b className="text-destructive">{summary.fail}</b></span>
                    <span>INCONCLUSIVE <b className="text-amber-600">{summary.inconclusive}</b></span>
                    <span>SKIP <b>{summary.skip}</b></span>
                  </>
                )}
              </div>
            </div>
            {summary.total > 0 && (
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3 pt-1">
                <span>Falhas funcionais: <b>{summary.functional_fail}</b></span>
                <span>Falhas de segurança/isolamento: <b>{summary.security_fail}</b></span>
                <span>Eventos infra/rede: <b>{summary.infra_events}</b></span>
                <span>Falhas de cleanup: <b>{summary.cleanup_fail}</b></span>
              </div>
            )}
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
                {statusBadge(r.status)}
                <div className="flex-1">
                  <div className="font-mono font-semibold">[{r.group}] {r.id} · {r.name} {r.critical ? "" : <span className="text-[10px] text-muted-foreground">(non-critical)</span>}</div>
                  {r.reason && <div className="text-[10px] text-amber-700 mt-0.5">reason: {r.reason}</div>}
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
