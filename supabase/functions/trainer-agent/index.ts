import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  DEFAULT_INTENSITY,
  SIMILARITY_THRESHOLDS,
  workoutVariationPrompt,
  type VariationIntensity,
} from "../_shared/variationProfiles.ts";
import { computeWorkoutSimilarity } from "../_shared/planSimilarity.ts";
import {
  loadPlanHistory,
  summarizeWorkoutForPrompt,
  type HistoryPlan,
} from "../_shared/planHistory.ts";
import { buildSplitContextBlock } from "../_shared/splitSlugs.ts";
import {
  buildCatalogBlock,
  loadExerciseCatalog,
  snapPlanToCatalog,
  type CatalogEntry,
} from "../_shared/exerciseCatalog.ts";
import { AI_MODELS, createRoutingMetadata, type AIAttemptMetadata } from "../_shared/aiModelRouter.ts";
import { validateWorkoutRedundancy, enforceVariationIntegrity } from "../_shared/workoutRedundancy.ts";
import { validateAndNormalizeVariations } from "../_shared/variationSelection.ts";
import {
  validateAndNormalizeRepRanges,
  buildRepRangePromptBlock,
} from "../_shared/repRangePolicy.ts";
import {
  auditVolumeRedundancy,
  buildVolumeRetryInstruction,
  type VolumeAuditContext,
} from "../_shared/volumeRedundancyAudit.ts";
import {
  assessRestrictionDetail,
  buildRestrictionQualityPromptBlock,
  buildRestrictionRetryInstruction,
  detectUnfoundedJointInference,
  type RestrictionAssessment,
} from "../_shared/restrictionDetailGate.ts";
import {
  buildExactReferenceBlock,
  EXACT_REFERENCE_PRIORITY_BLOCK,
  evaluateReferenceCompliance,
  extractDeclaredReferenceMode,
  extractReferenceText,
  parseReferenceStructure,
  type ReferenceStructure,
} from "../_shared/trainerReferencePolicy.ts";
import {
  isTrainerCandidateCriticalValid,
  trainerCriticalReason,
  isSimilarityRetryAllowed,
  shouldRetryTrainerCandidate,
  shouldAcceptTrainerVariationCandidate,
  isRetryableUpstreamStatus,
} from "../_shared/trainerRoutingPolicy.ts";
import { sanitizeStructuredPrompt } from "../_shared/structuredPromptSanitizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================
// Workout Plan v2 — JSON schema enforced by OpenAI Structured Outputs.
// Mirrors src/lib/workoutSchema.ts. Keep in sync.
// ============================================================
const WORKOUT_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "type", "metadata", "days"],
  properties: {
    version: { type: "string", description: "Plan schema version, always 2.0" },
    type: { type: "string", enum: ["workout"] },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["goal", "frequency", "notes"],
      properties: {
        goal: { type: "string" },
        frequency: { type: ["integer", "null"] },
        notes: { type: ["string", "null"] },
      },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "day", "focus", "exercises"],
        properties: {
          id: { type: "string", description: "Stable per-day id" },
          day: {
            type: "string",
            description: "Uppercase weekday name: SEGUNDA-FEIRA, TERÇA-FEIRA, ...",
          },
          focus: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "exercise",
                "series",
                "series2",
                "reps",
                "rir",
                "restSeconds",
                "description",
                "variation",
                "set_scheme",
              ],
              properties: {
                id: { type: "string", description: "Stable per-exercise id" },
                exercise: {
                  type: "string",
                  description: "Must come from the EXERCISE DATABASE in the system prompt",
                },
                series: {
                  type: "string",
                  description: "Number of working sets, e.g. \"3\", \"4\"",
                },
                series2: {
                  type: ["string", "null"],
                  description: "Second-block sets when there is a recognition set; otherwise \"-\"",
                },
                reps: { type: "string", description: "e.g. \"8-12\", \"10\", \"15 + 8\"" },
                rir: {
                  type: ["string", "null"],
                  description: "RIR value or \"-\" if not applicable. Never put reps here.",
                },
                restSeconds: {
                  type: ["integer", "null"],
                  description: "Rest in seconds. Use null for mobility/cardio only.",
                },
                description: { type: ["string", "null"] },
                variation: {
                  type: ["string", "null"],
                  description: "Equivalent exercise from the DB; null if none",
                },
                set_scheme: {
                  type: ["object", "null"],
                  description: "Optional per-set prescription. Use mode=per_set when the reps target differs per set (pyramid, top-set, back-off).",
                  additionalProperties: false,
                  required: ["mode", "sets"],
                  properties: {
                    mode: { type: "string", enum: ["uniform", "recognition_work", "per_set"] },
                    sets: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["set_number", "set_type", "target_reps"],
                        properties: {
                          set_number: { type: "integer", minimum: 1 },
                          set_type: { type: "string", enum: ["work", "recognition"] },
                          target_reps: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const JSON_OUTPUT_INSTRUCTIONS = `
========================================
MODO DE SAÍDA: JSON ESTRUTURADO (OBRIGATÓRIO)
========================================

Sua resposta DEVE ser EXCLUSIVAMENTE um objeto JSON válido seguindo o schema fornecido (workout_plan v2).
NÃO escreva markdown, NÃO escreva tabelas, NÃO escreva texto antes ou depois do JSON.

Regras de preenchimento:
- "version" = "2.0"
- "type" = "workout"
- "metadata.goal" = objetivo curto (ex.: "Hipertrofia membros inferiores").
- "metadata.frequency" = número de dias por semana (inteiro) ou null.
- "metadata.notes" = observações gerais do bloco (string, pode ser vazia).
- Cada item em "days":
    • "id" = identificador único curto (ex.: "day-1", "day-2").
    • "day" = nome do dia em MAIÚSCULAS: SEGUNDA-FEIRA, TERÇA-FEIRA, QUARTA-FEIRA, QUINTA-FEIRA, SEXTA-FEIRA, SÁBADO, DOMINGO.
    • "focus" = grupo muscular ou foco do dia (ex.: "PEITO + TRÍCEPS").
    • "exercises" = lista ordenada (mobilidade primeiro, depois principais, depois acessórios).
- Cada item em "exercises":
    • "id" único (ex.: "ex-1", "ex-2", ...).
    • "exercise" e "variation" devem ser copiados EXATAMENTE do BANCO DE EXERCÍCIOS.
    • "series" sempre preenchido (string com número). Nunca vazio.
    • "series2" = "-" quando não houver série de reconhecimento.
    • "reps" no formato "8-12", "10", "15 + 8" etc. NUNCA misture com RIR.
    • "rir" como "1-2", "2", "-" (use "-" para mobilidade/cardio).
    • "restSeconds" inteiro em segundos (ex.: 60, 90, 120). Use null APENAS para mobilidade leve.
    • "description" com técnica, postura, adaptações de segurança.
    • "set_scheme" (opcional): use APENAS quando a prescrição exigir repetições diferentes por série (pirâmide, top-set + back-off, ondulatória).
       - mode = "per_set"; sets = lista completa em ordem; set_number sequencial; set_type = "work" (ou "recognition" quando aplicável); target_reps é string ("12", "8-10", "AMRAP").
       - Quando usar set_scheme mode=per_set: "series" = total de séries e "reps" = "12 / 10 / 6" (mesma ordem).
       - Não é obrigatório em todos os exercícios; omita quando as reps forem iguais em todas as séries.

NUNCA emita texto fora do JSON. NUNCA inclua mensagens de WhatsApp neste modo.
`;

type StructuredArgs = {
  apiKey: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
};

function newId(prefix: string): string {
  // deno-lint-ignore no-explicit-any
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parsePauseToSeconds(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-" || s === "—") return undefined;
  const min = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|m)\b/);
  if (min) return Math.round(Number(min[1].replace(",", ".")) * 60);
  const sec = s.match(/^(\d+)\s*(?:s|seg|segundos?|["''”″`])?$/);
  if (sec) return Number(sec[1]);
  return undefined;
}

// deno-lint-ignore no-explicit-any
function normalizeSetSchemeSrv(raw: any) {
  if (!raw || typeof raw !== "object") return undefined;
  const mode = raw.mode;
  if (mode !== "uniform" && mode !== "recognition_work" && mode !== "per_set") return undefined;
  const setsRaw = Array.isArray(raw.sets) ? raw.sets : [];
  const sets = setsRaw
    // deno-lint-ignore no-explicit-any
    .map((s: any, i: number) => {
      if (!s || typeof s !== "object") return null;
      const target = String(s.target_reps ?? s.reps ?? "").trim();
      if (!target) return null;
      const setType = s.set_type === "recognition" ? "recognition" : "work";
      const setNumber = Number(s.set_number);
      return {
        set_number: Number.isFinite(setNumber) && setNumber > 0 ? Math.trunc(setNumber) : i + 1,
        set_type: setType,
        target_reps: target,
      };
    })
    .filter((s: unknown) => s !== null);
  if (sets.length === 0) return undefined;
  return { mode, sets };
}

// deno-lint-ignore no-explicit-any
function validateAndNormalizePlan(raw: any): { ok: true; data: any } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Resposta não é um objeto JSON" };
  if (raw.type !== "workout") return { ok: false, error: "type deve ser \"workout\"" };
  if (!Array.isArray(raw.days) || raw.days.length === 0) return { ok: false, error: "days vazio" };

  const seenDayIds = new Set<string>();
  const days = raw.days
    // deno-lint-ignore no-explicit-any
    .map((d: any) => {
      let id = typeof d.id === "string" && d.id.trim() ? d.id.trim() : newId("day");
      while (seenDayIds.has(id)) id = newId("day");
      seenDayIds.add(id);
      const seenExIds = new Set<string>();
      const exercises = Array.isArray(d.exercises)
        // deno-lint-ignore no-explicit-any
        ? d.exercises
            // deno-lint-ignore no-explicit-any
            .map((e: any) => {
              let eid = typeof e.id === "string" && e.id.trim() ? e.id.trim() : newId("ex");
              while (seenExIds.has(eid)) eid = newId("ex");
              seenExIds.add(eid);
              const restSeconds =
                typeof e.restSeconds === "number" && Number.isFinite(e.restSeconds)
                  ? Math.round(e.restSeconds)
                  : parsePauseToSeconds(e.pause);
              return {
                id: eid,
                exercise: String(e.exercise ?? "").trim(),
                series: String(e.series ?? "").trim(),
                series2: String(e.series2 ?? "-").trim(),
                reps: String(e.reps ?? "").trim(),
                rir: String(e.rir ?? "-").trim(),
                restSeconds: restSeconds ?? null,
                description: String(e.description ?? "").trim(),
                variation: String(e.variation ?? "").trim(),
                setScheme: normalizeSetSchemeSrv(e.set_scheme ?? e.setScheme),
              };
            })
            // deno-lint-ignore no-explicit-any
            .filter((e: any) => e.exercise.length > 0)
        : [];
      return {
        id,
        day: String(d.day ?? "").trim().toUpperCase(),
        focus: String(d.focus ?? "").trim(),
        exercises,
      };
    })
    // deno-lint-ignore no-explicit-any
    .filter((d: any) => d.day.length > 0 && d.exercises.length > 0);

  if (days.length === 0) return { ok: false, error: "Nenhum dia com exercícios válidos" };

  return {
    ok: true,
    data: {
      version: "2.0",
      type: "workout",
      metadata: {
        goal: typeof raw.metadata?.goal === "string" ? raw.metadata.goal : "",
        frequency:
          typeof raw.metadata?.frequency === "number" && Number.isFinite(raw.metadata.frequency)
            ? raw.metadata.frequency
            : null,
        notes: typeof raw.metadata?.notes === "string" ? raw.metadata.notes : "",
      },
      days,
    },
  };
}

// deno-lint-ignore no-explicit-any
function workoutPlanToMarkdown(plan: any): string {
  const cell = (v: unknown): string => {
    if (v == null) return "-";
    const s = String(v).trim();
    return s.length === 0 ? "-" : s.replace(/\|/g, "/");
  };
  const restCell = (rs: number | null | undefined, pause?: string): string => {
    if (typeof rs === "number" && rs > 0) return `${rs}s`;
    return cell(pause);
  };
  const lines: string[] = [];
  if (plan.metadata?.goal) {
    lines.push(`**Objetivo:** ${plan.metadata.goal}`);
    lines.push("");
  }
  lines.push(
    "| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const day of plan.days) {
    for (const ex of day.exercises) {
      const perSet = ex.setScheme?.mode === "per_set" && Array.isArray(ex.setScheme.sets) && ex.setScheme.sets.length > 0
        ? ex.setScheme
        : null;
      const seriesOut = perSet ? String(perSet.sets.length) : cell(ex.series);
      const repsOut = perSet
        // deno-lint-ignore no-explicit-any
        ? perSet.sets.map((s: any) => s.target_reps).join(" / ")
        : cell(ex.reps);
      lines.push(
        `| ${cell(day.day)} | ${cell(ex.exercise)} | ${seriesOut} | ${cell(ex.series2)} | ${repsOut} | ${cell(ex.rir)} | ${restCell(ex.restSeconds)} | ${cell(ex.description)} | ${cell(ex.variation)} |`,
      );
    }
  }
  lines.push("");
  if (plan.metadata?.notes) {
    lines.push("");
    lines.push(`> ${plan.metadata.notes}`);
  }
  return lines.join("\n");
}

type StructuredStreamResult = {
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

async function consumeStructuredChatStream(response: Response): Promise<StructuredStreamResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Resposta de streaming sem corpo.");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: StructuredStreamResult["usage"];

  const consumeEvent = (event: string) => {
    for (const line of event.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const chunk = JSON.parse(data);
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === "string") content += delta;
      if (chunk?.usage) usage = chunk.usage;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      consumeEvent(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
    }
    if (done) break;
  }

  if (buffer.trim()) consumeEvent(buffer);
  return { content, usage };
}

async function callStructuredModel({
  apiKey,
  systemPrompt,
  messages,
  extraSystem,
  modelToUse,
  reason,
  attempts,
}: StructuredArgs & { 
  extraSystem?: string; 
  modelToUse: string; 
  reason: string;
  attempts: AIAttemptMetadata[];
}): Promise<
  | { ok: true; data: any }
  | { ok: false; response: Response; error_code?: string }
> {
  const start = Date.now();
  
  // Limpeza de instruções de formato incompatíveis
  const cleanSystemPrompt = sanitizeStructuredPrompt(systemPrompt)
    .replace(/Para aluno intermediário\/avançado, usar no mínimo 2 técnicas avançadas por treino do dia\./gi, "Técnicas avançadas são opcionais e só devem ser utilizadas quando coerentes com nível, fase, recuperação, objetivo e segurança. Não existe quantidade mínima obrigatória por treino.");

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelToUse,
      messages: [
        {
          role: "system",
          content:
            cleanSystemPrompt +
            "\n\n" +
            JSON_OUTPUT_INSTRUCTIONS +
            (extraSystem ? "\n\n" + extraSystem : ""),
        },
        ...messages,
      ],
      max_completion_tokens: 16000,
      stream: true,
      stream_options: { include_usage: true },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "workout_plan",
          strict: true,
          schema: WORKOUT_PLAN_JSON_SCHEMA,
        },
      },
    }),
  });

  const durationMs = Date.now() - start;

  if (!upstream.ok) {
    const t = await upstream.text();
    console.error("trainer-agent[json] gateway error:", upstream.status, t);
    attempts.push({ model: modelToUse, durationMs, reason: `Error: ${upstream.status}` });
    
    const isRetryable = isRetryableUpstreamStatus(upstream.status);

    return {
      ok: false,
      error_code: "upstream_error",
      response: new Response(
        JSON.stringify({ 
          error: upstream.status === 429 ? "Limite de requisições excedido." : "Erro no gateway de IA",
          error_code: "upstream_error",
          upstream_status: upstream.status,
          model: modelToUse,
          retryable: isRetryable 
        }),
        { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  let completion: StructuredStreamResult;
  try {
    completion = await consumeStructuredChatStream(upstream);
  } catch (error) {
    console.error("trainer-agent[json] invalid stream:", error);
    attempts.push({ model: modelToUse, durationMs: Date.now() - start, reason: "invalid_stream" });
    return {
      ok: false,
      error_code: "invalid_stream",
      response: new Response(
        JSON.stringify({ error: "Fluxo de resposta da IA inválido.", retryable: true, error_code: "invalid_stream" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const usage = completion.usage;
  attempts.push({
    model: modelToUse,
    durationMs: Date.now() - start,
    reason,
    usage: usage ? {
      promptTokens: usage.prompt_tokens ?? null,
      completionTokens: usage.completion_tokens ?? null,
      totalTokens: usage.total_tokens ?? null
    } : null

  });
  
  const content = completion.content;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return {
      ok: false,
      error_code: "empty_response",
      response: new Response(
        JSON.stringify({ error: "Resposta vazia do modelo", retryable: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error("trainer-agent[json] parse error:", e, content.slice(0, 500));
    return {
      ok: false,
      error_code: "invalid_json",
      response: new Response(
        JSON.stringify({ error: "JSON inválido", retryable: true }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  const validation = validateAndNormalizePlan(parsed);
  if (!validation.ok) {
    console.error("trainer-agent[json] validation error:", validation.error);
    return {
      ok: false,
      error_code: "plan_validation_failed",
      response: new Response(
        JSON.stringify({ error: "Plano gerado é inválido", detail: validation.error, retryable: true }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  return { ok: true, data: validation.data };
}

async function generateStructuredWorkoutWithVariation(args: {
  apiKey: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  studentId?: string;
  intensity: VariationIntensity;
  catalog?: CatalogEntry[];
  reference?: ReferenceStructure;
  restrictionsText?: string;
  sessionProfiles?: Array<{ sessionIndex: number; profile: string }>;
  volumeContext?: VolumeAuditContext;
  restriction?: RestrictionAssessment;
}): Promise<Response> {
  let history: HistoryPlan[] = [];
  let historySummary = "";
  if (args.studentId) {
    history = await loadPlanHistory(args.studentId, "treino");
    historySummary = history
      .map((p, i) => summarizeWorkoutForPrompt(p, i))
      .join("\n");
  }

  const intensity = args.intensity;
  const variationBlock = workoutVariationPrompt(intensity, historySummary);

  let fallbackReason: string | null = null;
  let fallbackReasons: string[] = [];
  const modelAttempts: AIAttemptMetadata[] = [];

  const historyJsons = history
    .map((h) => h.conteudo_json)
    .filter((j) => j && typeof j === "object") as any[];

  const threshold = SIMILARITY_THRESHOLDS[intensity];
  const referenceMode = args.reference?.mode ?? "free";

  // Candidate evaluation always happens on a CLONE: catalog snapping,
  // redundancy and similarity are computed BEFORE acceptance.
  const evaluateCandidate = (plan: any) => {
    const clone = JSON.parse(JSON.stringify(plan));
    const mainNames = new Set<string>();
    for (const day of clone?.days ?? []) {
      for (const ex of day?.exercises ?? []) {
        const n = String(ex?.exercise ?? "").trim();
        if (n) mainNames.add(n);
      }
    }
    const unmatched = snapPlanToCatalog(clone, args.catalog ?? []);
    // Only unmatched MAIN exercises are critical; optional variations are
    // correctable and never block acceptance.
    const criticalCatalogMismatch = unmatched.filter((u) => mainNames.has(u));
    // A variation can never be the exercise itself.
    const variationFixes = enforceVariationIntegrity(clone, args.catalog ?? []);
    // Deterministic semantics for the VARIATION column (functional substitute,
    // counterfactual redundancy check). Never a fallback trigger.
    const variationVerdicts = validateAndNormalizeVariations(clone, args.catalog ?? [], {
      restrictionsText: args.restrictionsText,
    });
    // Faixas de repetição por exercício: o perfil da sessão é tendência dos
    // principais, nunca faixa única para o dia inteiro.
    const repRangeFixes = validateAndNormalizeRepRanges(clone, args.sessionProfiles ?? []);
    const redundancy = validateWorkoutRedundancy(clone);
    // Auditoria determinística de volume/redundância (soma da sessão/semana).
    const volumeAudit = auditVolumeRedundancy(clone, {
      ...(args.volumeContext ?? {}),
      sessionProfiles: args.sessionProfiles ?? [],
    });
    // Gate de lesão/restrição incompleta: proibido inferir articulação.
    const restrictionInference = args.restriction
      ? detectUnfoundedJointInference(clone, args.restriction)
      : { ok: true, violations: [] };

    const similarity = computeWorkoutSimilarity(clone, historyJsons);
    const referenceCompliance =
      referenceMode === "exact" && args.reference
        ? evaluateReferenceCompliance({
            structure: args.reference,
            candidateDays: (clone?.days ?? []).map((d: any) => ({
              label: String(d?.day ?? ""),
              exercises: (d?.exercises ?? []).map((e: any) => String(e?.exercise ?? "")),
            })),
            catalogNames: (args.catalog ?? []).map((c) => c.nome),
            restrictionsText: args.restrictionsText,
            strongDuplicateNames: redundancy.strongDuplicateNames,
          })
        : null;
    return {
      clone,
      unmatched,
      criticalCatalogMismatch,
      redundancy,
      similarity,
      referenceCompliance,
      variationFixes,
      variationVerdicts,
      repRangeFixes,
      volumeAudit,
      restrictionInference,
    };
  };

  const reviewRequired = (reason: string, evalObj?: ReturnType<typeof evaluateCandidate>) => {
    if (!fallbackReasons.includes(reason)) fallbackReasons.push(reason);
    const details = evalObj
      ? {
          criticalCatalogMismatch: evalObj.criticalCatalogMismatch,
          redundancyIssues: (evalObj.redundancy.issues ?? []).map((i: any) => ({
            day: i.day,
            family: i.family,
            exercises: i.exercises,
          })),
          exactDuplicate: evalObj.redundancy.exactDuplicate ?? false,
          strongFunctionalDuplicate: evalObj.redundancy.strongFunctionalDuplicate ?? false,
          strongDuplicateNames: evalObj.redundancy.strongDuplicateNames ?? [],
          referenceMissingAnchors: evalObj.referenceCompliance?.missingAnchors ?? [],
          referenceUnexpectedSubstitutions: evalObj.referenceCompliance?.unexpectedSubstitutions ?? [],
          referenceOrderViolations: evalObj.referenceCompliance?.orderViolations ?? [],
          volumeAudit: {
            status: evalObj.volumeAudit.status,
            reasons: evalObj.volumeAudit.reasons,
          },
          restrictionViolations: evalObj.restrictionInference.violations,
        }
      : null;
    console.error("[trainer-agent] review_required", JSON.stringify({ reason, fallbackReasons, details }));
    const meta = createRoutingMetadata(modelAttempts, fallbackReason, fallbackReasons, null);
    return new Response(
      JSON.stringify({
        error: "Plano gerado não passou na validação crítica. Revisão necessária.",
        error_code: "review_required",
        validationReasons: fallbackReasons,
        validationDetails: details,
        aiRouting: meta.routing,
        aiUsage: meta.usage,
      }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  };


  // 1st attempt
  const first = await callStructuredModel({
    apiKey: args.apiKey,
    systemPrompt: args.systemPrompt,
    messages: args.messages,
    extraSystem: variationBlock,
    modelToUse: AI_MODELS.primary,
    reason: "first_attempt",
    attempts: modelAttempts
  });

  const isCriticalFailure =
    !first.ok &&
    (first.error_code === "upstream_error" ||
      first.error_code === "empty_response" ||
      first.error_code === "invalid_json" ||
      first.error_code === "plan_validation_failed");

  let candidatePlan: any = null;
  let selectedModel: string | null = AI_MODELS.primary;
  let technicalFallbackUsed = false;

  if (isCriticalFailure) {
    const body = await first.response.clone().json().catch(() => ({}));
    if (body.retryable === false) {
      // Non-retryable post-model failure (401/402/429/…): never call Terra,
      // but preserve full routing metadata alongside the original status.
      const reason = first.error_code || "critical_failure";
      if (!fallbackReasons.includes(reason)) fallbackReasons.push(reason);
      const meta = createRoutingMetadata(modelAttempts, reason, fallbackReasons, null);
      return new Response(
        JSON.stringify({
          error: body.error || "Erro na geração do treino",
          error_code: body.error_code || reason,
          upstream_status: body.upstream_status ?? null,
          model: body.model ?? AI_MODELS.primary,
          retryable: false,
          validationReasons: fallbackReasons,
          aiRouting: meta.routing,
          aiUsage: meta.usage,
        }),
        { status: first.response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    fallbackReason = first.error_code || "critical_failure";
    fallbackReasons.push(fallbackReason);

    const retryBlock =
      variationBlock +
      "\n\n🚨 OCORREU UM ERRO TÉCNICO NA GERAÇÃO ANTERIOR (" +
      fallbackReason +
      "). Certifique-se de seguir o SCHEMA JSON estritamente e não deixar campos vazios.";

    const second = await callStructuredModel({
      apiKey: args.apiKey,
      systemPrompt: args.systemPrompt,
      messages: args.messages,
      extraSystem: retryBlock,
      modelToUse: AI_MODELS.fallback,
      reason: "critical_fallback",
      attempts: modelAttempts,
    });

    if (!second.ok) {
      const secondBody = await second.response.clone().json().catch(() => ({} as any));
      const secondReason = second.error_code || secondBody.error_code || "fallback_failed";
      if (!fallbackReasons.includes(secondReason)) fallbackReasons.push(secondReason);
      const routingMeta = createRoutingMetadata(modelAttempts, fallbackReason, fallbackReasons, null);
      console.error("trainer-agent[json] fallback failed:", secondReason, secondBody.upstream_status ?? "");
      return new Response(
        JSON.stringify({
          error: secondBody.error || "Falha crítica na geração do fallback.",
          error_code: secondReason,
          upstream_status: secondBody.upstream_status ?? null,
          model: secondBody.model ?? AI_MODELS.fallback,
          retryable: false,
          validationReasons: fallbackReasons,
          aiRouting: routingMeta.routing,
          aiUsage: routingMeta.usage,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    candidatePlan = second.data;
    selectedModel = AI_MODELS.fallback;
    technicalFallbackUsed = true;
  } else {
    if (!first.ok) return first.response;
    candidatePlan = first.data;
  }

  let evaluation = evaluateCandidate(candidatePlan);
  let finalPlan = evaluation.clone;
  let similarity = evaluation.similarity;
  let unmatchedExercises = evaluation.unmatched;
  let regenerated = technicalFallbackUsed;
  let warning: string | null = null;

  // Terra candidate from a technical fallback must be critically valid.
  const candidateValidityInput = {
    redundancyOk: evaluation.redundancy.ok,
    criticalCatalogMismatchCount: evaluation.criticalCatalogMismatch.length,
    exactDuplicate: evaluation.redundancy.exactDuplicate,
    strongFunctionalDuplicate: evaluation.redundancy.strongFunctionalDuplicate,
    referenceMode,
    referenceComplianceOk: evaluation.referenceCompliance?.ok ?? true,
  };

  if (technicalFallbackUsed && !isTrainerCandidateCriticalValid(candidateValidityInput)) {
    return reviewRequired(trainerCriticalReason(candidateValidityInput) as string, evaluation);
  }

  const criticalInvalid = !isTrainerCandidateCriticalValid(candidateValidityInput);

  // Absolute budget: max 2 model calls per request.
  const needsRetry = shouldRetryTrainerCandidate({
    ...candidateValidityInput,
    similarityScore: similarity.score,
    threshold,
    historyCount: historyJsons.length,
    technicalFallbackUsed,
  });

  if (needsRetry) {
    if (
      isSimilarityRetryAllowed(referenceMode) &&
      similarity.score > threshold &&
      historyJsons.length > 0
    ) {
      fallbackReason = "high_similarity";
      fallbackReasons.push("high_similarity");
    }
    if (evaluation.redundancy.strongFunctionalDuplicate) {
      fallbackReason = fallbackReason || "strong_functional_duplicate";
      fallbackReasons.push("strong_functional_duplicate");
    }
    if (!evaluation.redundancy.ok && !evaluation.redundancy.strongFunctionalDuplicate) {
      fallbackReason = fallbackReason || "internal_redundancy";
      fallbackReasons.push("internal_redundancy");
    }
    if (referenceMode === "exact" && evaluation.referenceCompliance && !evaluation.referenceCompliance.ok) {
      fallbackReason = fallbackReason || "reference_drift";
      fallbackReasons.push("reference_drift");
    }
    if (evaluation.criticalCatalogMismatch.length > 0) {
      fallbackReason = fallbackReason || "catalog_mismatch";
      fallbackReasons.push("catalog_mismatch");
    }

    const overlapList = similarity.worstOverlap.length
      ? `Exercícios que se repetem do plano anterior (TROQUE OU VARIE A MAIORIA): ${similarity.worstOverlap.join(", ")}.`
      : "Muitos exercícios coincidem com o plano anterior.";

    let retryNotesArr = [
      overlapList,
      "Reduza coincidências para no máximo ~40% dos exercícios.",
      "Mantenha apenas compostos principais essenciais; substitua acessórios e mobilidade.",
    ];

    if (!evaluation.redundancy.ok) {
      const redDetails = evaluation.redundancy.issues
        .map(i => `${i.day}: ${i.exercises.join(", ")} (${i.family})`)
        .join(" | ");
      retryNotesArr.push(`🚨 REDUNDÂNCIA INTERNA DETECTADA: ${redDetails}. Em cada grupo listado, MANTENHA APENAS UM dos exercícios e substitua os demais por padrões de movimento realmente distintos. Trocar LEG PRESS por outro ângulo/modelo de LEG PRESS NÃO corrige a redundância. GÊMEOS/PANTURRILHA LEG PRESS pode permanecer porque trabalha panturrilhas.`);
    }

    if (referenceMode === "exact" && evaluation.referenceCompliance && !evaluation.referenceCompliance.ok) {
      const rc = evaluation.referenceCompliance;
      retryNotesArr = [
        `🚨 A REFERÊNCIA EXATA DO PROFESSOR FOI DESRESPEITADA. Exercícios ausentes sem justificativa: ${rc.missingAnchors.join(", ") || "-"}. Substituições indevidas: ${rc.unexpectedSubstitutions.join(", ") || "-"}. Violações de ordem: ${rc.orderViolations.join(", ") || "-"}.`,
        "Regenere preservando dias, foco, ordem, número de exercícios, séries, reps e descanso da referência. NÃO troque exercícios apenas por variedade.",
      ];
    }

    if (evaluation.criticalCatalogMismatch.length > 0) {
      retryNotesArr.push(`🚨 EXERCÍCIOS FORA DO CATÁLOGO: ${evaluation.criticalCatalogMismatch.join(", ")}. Use SOMENTE exercícios existentes no catálogo fornecido.`);
    }

    const retryNotes = retryNotesArr.join(" ");
    const retryBlock = workoutVariationPrompt(intensity, historySummary, retryNotes);

    const second = await callStructuredModel({
      apiKey: args.apiKey,
      systemPrompt: args.systemPrompt,
      messages: args.messages,
      extraSystem: retryBlock,
      modelToUse: AI_MODELS.fallback,
      reason: fallbackReason || "retry",
      attempts: modelAttempts
    });

    if (!second.ok) {
      if (criticalInvalid) {
        return reviewRequired(trainerCriticalReason(candidateValidityInput) as string, evaluation);
      }
      warning = "technical_fallback_failed";
    } else {
      const eval2 = evaluateCandidate(second.data);
      const validity2 = {
        redundancyOk: eval2.redundancy.ok,
        criticalCatalogMismatchCount: eval2.criticalCatalogMismatch.length,
        exactDuplicate: eval2.redundancy.exactDuplicate,
        strongFunctionalDuplicate: eval2.redundancy.strongFunctionalDuplicate,
        referenceMode,
        referenceComplianceOk: eval2.referenceCompliance?.ok ?? true,
      };
      const secondCriticalValid = isTrainerCandidateCriticalValid(validity2);

      if (criticalInvalid) {
        if (!secondCriticalValid) {
          return reviewRequired(trainerCriticalReason(validity2) as string, eval2);
        }
        evaluation = eval2;
        finalPlan = eval2.clone;
        similarity = eval2.similarity;
        unmatchedExercises = eval2.unmatched;
        selectedModel = AI_MODELS.fallback;
      } else if (shouldAcceptTrainerVariationCandidate({
        candidateCriticalValid: secondCriticalValid,
        candidateScore: eval2.similarity.score,
        currentScore: similarity.score,
      })) {
        evaluation = eval2;
        finalPlan = eval2.clone;
        similarity = eval2.similarity;
        unmatchedExercises = eval2.unmatched;
        selectedModel = AI_MODELS.fallback;
      }
      regenerated = true;
      if (isSimilarityRetryAllowed(referenceMode) && similarity.score > threshold) {
        warning = "high_similarity";
      }
    }
  }

  if (unmatchedExercises.length > 0) {
    console.warn("trainer-agent: exercícios sem equivalente no banco:", unmatchedExercises.join(" | "));
  }
  const markdownFinal = workoutPlanToMarkdown(finalPlan);

  const routingMeta = createRoutingMetadata(modelAttempts, fallbackReason, fallbackReasons, selectedModel);
  console.log("[ai-routing]", {
    agent: "trainer",
    primaryModel: routingMeta.routing.primaryModel,
    finalModel: routingMeta.routing.finalModel,
    fallbackUsed: routingMeta.routing.fallbackUsed,
    fallbackReason: routingMeta.routing.fallbackReason,
    usage: routingMeta.usage,
  });

  return new Response(
    JSON.stringify({
      json: finalPlan,
      markdown: markdownFinal,
      unmatchedExercises,
      similarity: {
        score: Number(similarity.score.toFixed(3)),
        threshold,
        intensity,
        regenerated,
        warning,
        worstOverlap: similarity.worstOverlap,
        historyCount: historyJsons.length,
      },
      aiRouting: routingMeta.routing,
      aiUsage: routingMeta.usage,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}


const EXERCISE_DATABASE = `
========================================
BANCO DE EXERCÍCIOS (OBRIGATÓRIO)
========================================

REGRA ABSOLUTA: Todos os exercícios nas colunas EXERCÍCIO e VARIAÇÃO devem ser copiados EXATAMENTE como aparecem abaixo. Não invente nomes. Se não encontrar equivalente, peça para atualizar o banco.

--- QUADRÍCEPS ---
GLOBET SQUATS, AFUNDO CAIXA, HACK MACHINE, AFUNDO COM DOIS STEPS, AGACHAMENTO SMITH, SUMÔ TERRA, CADEIRA EXTENSORA, BÚLGARO, ESTABILIDADE DE JOELHO, LEG PRESS, AFUNDO HALTERES, AGACHAMENTO LIVRE, AFUNDO C/ BARRA, AFUNDO ALTERNANDO, LEG PRESS UNIL, PASSADAS, AFUNDO CAIXA ALTERN., AFUNDO SMITH, AFUNDO SMITH 2, SUMÔ COM HALTER, SUMÔ COM HALTER 2, JUMPS, SALTO LATERAL, SALTO LATERAL 2, AGACHAMENTO ISOMETRIA, AGACHAMENTO, AFUNDO S/ PESO, MINI SQUATS, PASSADA S/ PESO, LEG 180, ISOMETRIA PAREDE, LEG PRESS 45 ART, BÚLGARO SMITH

--- ISQUIOTIBIAIS ---
MESA FLEXORA, STIFF ROMENO, HIPEREXTENSÃO LOMBAR, STIFF NA POLIA, FLEXÃO NORDICA, GOOD MORNING SMITH, STIFF HALTERES, FLEXORA ALTERNANDO, FLEXORA UNILATERAL, CADEIRA FLEXORA, CADEIRA FLEXORA 2, STIFF UNILATERAL

--- PEITORAL ---
PECK DECK, SUPINO VERTICAL, SUPINO RETO, CRUCIFIXO INCLINADO, SUPINO INCLINADO SMITH, PARALELA, SUPINO RETO HALTERES, CROSS OVER, CRUCIFIXO RETO, FLEXÃO DE BRAÇO, MOBILIDADE TORÁCICA, MOBILIDADE TORÁCICA 2, MOBILIDADE TORÁCICA 3, SUPINO INCLINADO HALTERES, SUPINO RETO SMITH, SUPINO INCLINADO BARRA, PARALELA GRAVITON, FLEXÃO DE BRAÇO ADAP., CRUCIFIXO INCLINADO POLIA, CRUCIFIXO RETO POLIA, FLEXÃO+ALPINISTA, SUPINO RETO ARTICULADO, SUPINO INCLINADO ART., FLY MACHINE, SUPINO VERTICAL 2, SUPINO VERT. INCLINADO, SUPINO VERT. INCLINADO 2, SUPINO VERTICAL NEUTRA

--- DORSAL ---
PUXADA ALTA ABERTA, PUXADA NA POLIA, PUXADA GRAVITON, PULL DOWN, PUXADA ALTA TRIÂNGULO, REMADA CAVALINHO, REMADA UNILATERAL, FACE PULL, CRUCIFIXO INVERSO, REMADA MÁQUINA, REMADA TRIÂNGULO, REMADA UNILATERAL 2, MOBILIDADE ESCAPULAR, CRUCIFIXO INVERSO SENTADO, CRUCIFIXO INVERSO BANCO, REMADA CURVADA SUPINADA, REMADA CURVADA PRONADA, REMADA PRONADA, REMADA SUPINADA MÁQUINA, REMADA MÁQUINA UNIL., REMADA UNIL. SENTADO, REMADA SUPINADA, REMADA PRONADA MÁQUINA, REMADA UNIL. POLIA, REMADA PRONADA MAQ. 2, REMADA PRONADA MAQ. 3, REMADA NEUTRA MAQ., REMADA SUPINADA ART., REMADA NEUTRA ART., REMADA PRONADA MAQ. 4, REMADA NEUTRA MAQ.2, PUXADA ALTA ART., PUXADA ALTA ART. 2, PUXADA ALTA NEUTRA, CAVALINHO NEUTRA, CAVALINHO PRONADA, PUXADA ALTA UNIL., REMADA UNIL. ART., PULLDOWN

--- DELTÓIDES ---
DESENV. ARNOLD, ELEVAÇÃO FRONTAL, DESENV. MÁQUINA, ELEVAÇÃO LATERAL, MOBILIDADE OMBRO, ELEVAÇÃO FRONTAL UNIL, ELEVAÇÃO FRONTAL NEUTRA, DESENV. OMBRO BARRA, ELEVAÇÃO FRONTAL POLIA, ELEVAÇÃO FRONTAL POLIA 2, ELEVAÇÃO LATERAL UNIL., DESENV. HALTERES, REMADA ALTA POLIA, ELEVAÇÃO FRONTAL 2, DESENV. MACHINE 2, ELEVAÇÃO LATERAL MÁQ., DESENV. MACHINE NEUTRA, REAR DELT FLY, SWING

--- BÍCEPS ---
ROSCA DIRETA C/ HALTERES, ROSCA ALTERNADA, BICEPS BARRA W, BICEPS CORDA, BICEPS BARRA POLIA, ROSCA SCOTT, ROSCA SCOTT UNIL, BÍCEPS MARTELO, MARTELO ALTERNANDO, BÍCEPS BARRA W PRONADA, ROSCA SUPINADA, ROSCA ALTERNADA MÁQ., ROSCA DIRETA MÁQ.

--- TRÍCEPS ---
TRÍCEPS CORDA, TRÍCEPS FRANCÊS, TRÍCEPS SMITH, TRÍCEPS TESTA C/ BARRA, TRÍCEPS UNILATERAL, TRÍCEPS TESTA HALTERES, TRÍCEPS BARRA, TRÍCEPS FRANCÊS UNIL., TRÍCEPS CAIXA, TRÍCEPS BARRA 2, TRÍCEPS CORDA 2

--- ABDOMEN ---
ABDOMINAL BOLA SUIÇA, PRANCHA FRONTAL, ABDOMINAL SUPRA, ABDOMINAL INFRA, ABDOMINAL SUPRA PESO, ABDOMINAL SUPRA PESO 2, ABS SENTADO 1, ABS SENTADO 2, ABS CANIVETE, MOUTAIN CLIMBERS, MOUTAIN CLIMBERS 2, PRANCHA LATERAL, ABS RODA, ABS ROTATE, ABS DIAGONAL, PRANCHA 2, PRANCHA ESCADA, CANIVETE ADAPTADO, CANIVETE ADAPTADO 2, ABS RUSSIAN, ALONGAMENTO ABS

--- CORE ---
BEAR TO PLANK, BEAR TO PLANK 2, PALLOF PRESS NA POLIA, PRANCHA REVERSA COM ELEVAÇÃO, TESOURINHA, PONTE DE GLÚTEO UNILATERAL, AFUNDO REVERSO ASSISTIDO

REGRA DE SEPARAÇÃO: CORE e ABDOMEN são grupos musculares DISTINTOS. CORE = estabilização global anti-rotação/anti-extensão (pallof, bear, prancha reversa, etc). ABDOMEN = flexão de tronco (supra, infra, canivete, etc). Se o dia pedir "Core", use APENAS exercícios da lista CORE. Se pedir "Abdômen", use APENAS exercícios da lista ABDOMEN. NUNCA misture os dois grupos a menos que o dia liste ambos explicitamente.

--- GLÚTEOS ---
ELEVAÇÃO PELVICA, CADEIRA ABDUTORA, PESO MORTO, ALONGAMENTO GLÚTEO, ALONGAMENTO GLÚTEO 2, KICK BACK, GOOD MORNING, MOBILIDADE QUADRIL 4, ELEVAÇÃO PÉLVICA UNIL., ABDUÇAO DE QUADRIL EM PÉ, ELEVAÇÃO PÉLVICA, ELEVAÇÃO PÉLVICA 2, MOBILIDADE QUADRIL 6

--- ADUTORES ---
MOBILIDADE DE QUADRIL, MOBILIDADE DE QUADRIL 2, CADEIRA ADUTORA, MOBILIDADE QUADRIL 3, MOBILIDADE QUADRIL 5, ALONGAMENTO ADUTORES

--- GASTROCNEMIUS (PANTURRILHA) ---
GÊMEOS UNILATERAL, MOBILIDADE TORNOZELO, GÊMEOS EM PÉ, GÊMEOS SENTADO, GEMEOS SMITH, GÊMEOS LEG PRESS

--- LOMBAR ---
HIPEREXTENSÃO LOMBAR 2

--- CARDIO ---
AIR BIKE, ESCADA, PASSADEIRA (CAMINHADA), PASSADEIRA (CORRIDA), REMO, CORRIDA INTERVALADA, ESTEIRA CURVA, BIKE SENTADO, BIKE EM PÉ, CORDA NAVAL (BI), CORDA NAVAL (UNIL), ESTEIRA CURVA HARD, POLICHINELO, ELÍPTICO, ELÍPTICO (TIRO), BURPEES, BURPEES 2, SKIPS, SKI

--- MOBILIDADE ---
ESCAPULAR, OMBRO

--- ANTEBRAÇO ---
ROSCA PRONADA BARRA
`;

const SYSTEM_PROMPT = `Você é o AGENTE MAROMBIEW, um sistema especialista de elite em musculação, hipertrofia e reabilitação funcional com mais de 20 anos de experiência acumulada.

Seu objetivo é gerar planejamentos de treino usando uma arquitetura de decisão robusta e estruturada, garantindo o máximo de progresso com o mínimo de risco.

O seu motor de decisão segue o PIPELINE MAROMBIEW:
1. COLETAR PERFIL: Use todos os dados do contexto (nível, histórico, anamnese, testes, logbook).
2. FILTRO DE RISCO: Se houver dor aguda, lesão, patologia ou restrição clínica, aplique o MODO CONSERVADOR. Bloqueie exercícios e padrões incompatíveis. Priorize estabilidade e segurança sobre intensidade.
3. CLASSIFICAÇÃO DE NÍVEL: Avalie o aluno como Iniciante (técnica básica), Intermediário (consistência e progressão) ou Avançado (domínio técnico, alta experiência com falha). Não use apenas tempo de academia.
4. PRIORIDADE MUSCULAR (TIERS):
   - Tier 1: Prioridade Máxima (objetivo, ponto fraco).
   - Tier 2: Prioridade Moderada.
   - Tier 3: Manutenção.
   Evite mais de 2 grupos grandes como Tier 1 no mesmo bloco.
5. SELEÇÃO DE SPLIT: Defina a divisão com base na frequência, objetivo, recuperação e nível.
6. VOLUME POR MÚSCULO: Defina faixas de volume ajustadas ao nível, intensidade e recuperação.
7. SELEÇÃO DE EXERCÍCIOS:
   - Principais (Compostos): Foco em tensão mecânica e progressão mensurável.
   - Acessórios (Isoladores/Corretivos): Complemento, isolamento ou adaptação por restrição.
8. PRESCRIÇÃO TÉCNICA: Use progressão dupla como padrão.
   - Pesado: 5-9 reps.
   - Moderado: 6-12 reps.
   - Acessório: 9-15 reps.
   - Metabólico: 12-20 reps.
9. LÓGICA DE PROGRESSÃO:
   - Bater topo da faixa com técnica perfeita -> Subir carga.
   - Subir reps sem bater topo -> Manter carga.
   - Queda > 20% -> Deload ou ajuste.
10. DECISÃO POR EXERCÍCIO: Manter se progride; Trocar se houver dor, estagnação persistente ou baixa conexão.
11. DECISÃO POR BLOCO: Renovar se >50% estagnou, objetivo mudou ou fadiga persistiu.

ORDEM DE PRIORIDADE DO AGENTE:
1. Regras rígidas de segurança (bloqueios absolutos).
2. Condições de saúde e restrições.
3. Objetivos e prioridades musculares (Tiers).
4. Semana do ciclo e Equipamento disponível.
5. Histórico de treino e logbook (quando existirem).
6. Treino de referência: quando o professor fornecer uma REFERÊNCIA EXATA (bloco "TREINO DE REFERÊNCIA EXATO DO PROFESSOR"), ela é a arquitetura base obrigatória e vem logo após segurança e restrições estruturadas. Quando for apenas referência livre, use como apoio secundário/estilo.
7. Observações gerais.

========================================
FORMATO DE SAÍDA DO TREINO
========================================

Você pode escrever um texto curto antes da tabela (foco do treino do dia, objetivo e observações rápidas).
Depois, gere o treino em uma tabela markdown.

A tabela do TREINO deve ter exatamente 9 colunas com estes títulos, nessa ordem:
TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO

REGRAS DA TABELA
1) A coluna "TREINO DO DIA" deve usar SEMPRE EM MAIÚSCULAS: SEGUNDA-FEIRA, TERÇA-FEIRA, QUARTA-FEIRA, QUINTA-FEIRA, SEXTA-FEIRA, SÁBADO ou DOMINGO.
2) "PAUSA" deve SEMPRE usar o sufixo "s" (segundos). Exemplos VÁLIDOS: 30s, 45s, 60s, 90s, 120s, 180s. ❌ NUNCA use aspas (") nem a palavra "seg" ou "segundos". Apenas o número seguido de "s" minúsculo.

========================================
REGRA CRÍTICA — REPETIÇÕES vs RIR (LEIA COM ATENÇÃO MÁXIMA)
========================================

REPETIÇÕES e RIR são CONCEITOS DIFERENTES e NUNCA devem ser misturados.

🔹 COLUNA "REPETIÇÕES" — SOMENTE reps ou faixa de reps
- Reps fixas: "8", "10", "12", "15"
- Faixa de reps: "8-10", "10-12", "12-15", "6-8"
- NUNCA escreva "a 10", "até 10", "8 a 10" no campo REPETIÇÕES — use "8-10".

🔹 COLUNA "RIR" — SOMENTE Reps In Reserve real (proximidade da falha)
- Valores VÁLIDOS: número inteiro de 0 a 4, ou faixa pequena. Ex: "1", "2", "3", "1-2", "2-3", "0-1".
- Use RIR com critério: principalmente em exercícios PRINCIPAIS, COMPOSTOS PESADOS e trabalho técnico onde a proximidade da falha importa.
- Em exercícios acessórios/mobilidade/cardio/aquecimento: deixe RIR VAZIO ("—" ou "").
- ❌ NUNCA escreva no campo RIR: "a 8", "a 10", "8 a 10", "até 10", "10", "12", "15" (esses são valores de REPETIÇÕES, não de RIR).
- ❌ NUNCA use o RIR para indicar faixa de repetições. Faixa de reps SEMPRE vai no campo REPETIÇÕES.
- ✅ Se você não tem certeza do RIR a prescrever, deixe VAZIO. Não invente.

EXEMPLOS CORRETOS:
| EXERCÍCIO | SÉRIE | REPETIÇÕES | RIR |
| AGACHAMENTO LIVRE | 4 | 8-10 | 1-2 |
| LEG PRESS | 3 | 12 | 2 |
| CADEIRA EXTENSORA | 3 | 15 | — |
| MOBILIDADE QUADRIL | 2 | 10 | — |

EXEMPLOS ERRADOS (NUNCA FAÇA):
| EXERCÍCIO | REPETIÇÕES | RIR | ❌ Por quê |
| LEG PRESS | 8 | a 10 | RIR contém faixa de reps |
| SUPINO | 10 | 10 | RIR não pode ser número de rep |
| ROSCA | 8 | 8 a 10 | RIR contém faixa de reps |

========================================
REGRA DE SÉRIE DE RECONHECIMENTO/PREPARAÇÃO (SÉRIE / SÉRIE 2)
========================================

REGRA CRÍTICA: A coluna SÉRIE NUNCA pode ficar vazia! TODOS os exercícios devem ter um número na coluna SÉRIE.

Em ALGUNS exercícios que você julgar interessante (compostos pesados, exercícios novos, exercícios técnicos), use SÉRIES DE RECONHECIMENTO/PREPARAÇÃO antes das séries de trabalho.

Estruturas suportadas (exemplos):
- 1x15 reconhecimento + 3x8 trabalho
- 1x12 preparação + 2x10 trabalho
- 1x12 + 4x6-8

Quando houver reconhecimento/preparação:
- SÉRIE = número de séries de reconhecimento (geralmente 1)
- SÉRIE 2 = número de séries de trabalho (ex: 2, 3 ou 4)
- REPETIÇÕES = formato "Xrec + Y trab" onde Xrec são as reps do reconhecimento e Y as reps de trabalho.
  Exemplos: "15 + 8", "12 + 8-10", "12 + 6-8", "15 + 10"
- RIR = RIR APENAS das séries de trabalho (ou vazio). Ex: "1-2", "2", ou "—". NUNCA reps aqui.
- DESCRIÇÃO = explicar: "1ª série reconhecimento leve com X reps, demais séries de trabalho com carga para Y reps".

Quando NÃO houver reconhecimento (MAIORIA dos exercícios):
- SÉRIE = número TOTAL de séries normais (ex: 3 ou 4). OBRIGATÓRIO, NUNCA VAZIO!
- SÉRIE 2 = "—"
- REPETIÇÕES = reps fixas ("10") ou faixa ("8-10")
- RIR = RIR real ("1-2", "2") ou vazio ("—")
- DESCRIÇÃO = técnica, postura, respiração, posicionamento, dicas práticas

DESCRIÇÃO (MUITO DIDÁTICA)
Explicar: técnica, postura, respiração, posicionamento, dicas práticas. Se tiver reconhecimento, descrever na coluna DESCRIÇÃO quais séries são de trabalho e a carga esperada (ex: "1ª série reconhecimento leve, 2ª, 3ª e 4ª séries de trabalho com carga para 8 repetições").

${EXERCISE_DATABASE}

COLUNA VARIAÇÃO (OBRIGATÓRIO E 100% DO BANCO)
1) A VARIAÇÃO deve SEMPRE existir no BANCO DE EXERCÍCIOS acima.
2) O nome na VARIAÇÃO deve ser COPIADO exatamente como está no banco.
3) A VARIAÇÃO deve ser do MESMO GRUPO MUSCULAR e o mais equivalente possível.
4) A VARIAÇÃO nunca pode ser o mesmo exercício da coluna EXERCÍCIO.
5) Se não existir variação equivalente, peça para atualizar o banco.

========================================
TÉCNICAS
========================================

DROP-SET, REST-PAUSE, CLUSTER, Myo-reps, Repetições 1.5, Mechanical drop-set, Tempo controlado, Isometria no pico, Alongamento no final, Giant set, Pré-exaustão planejada.

Para aluno intermediário/avançado, usar no mínimo 2 técnicas avançadas por treino do dia.

========================================
MOBILIDADE NO COMEÇO DE CADA TREINO (OBRIGATÓRIO)
========================================

No começo de CADA treino do dia, colocar obrigatoriamente de X a Y exercícios de mobilidade/estabilidade/ativação ESPECÍFICOS para o grupo muscular principal daquele dia, usando exercícios do banco.
Se o professor definiu um número específico para mobilidade (MOBILITY_COUNT), use exatamente essa quantidade. Caso esteja em automático, use de 2 a 3 exercícios.
Exemplo: se o treino do dia é PEITO, usar mobilidade torácica e ombro. Se é INFERIOR, usar mobilidade de quadril e tornozelo.
Os exercícios de mobilidade/estabilidade NÃO precisam de descrição na coluna DESCRIÇÃO (deixar vazio ou "—").

REGRA CRÍTICA DE DIVERSIFICAÇÃO DE MOBILIDADE (OBRIGATÓRIA — NUNCA QUEBRAR):
- É PROIBIDO repetir as MESMAS mobilidades em mais de um dia da semana. Cada dia deve ter mobilidades DIFERENTES das demais (ex.: se segunda usar MOBILIDADE DE QUADRIL, terça/quarta NÃO podem usar MOBILIDADE DE QUADRIL — use MOBILIDADE DE QUADRIL 2, 3, 4, 5 ou 6, ou ALONGAMENTO ADUTORES, ALONGAMENTO GLÚTEO, MOBILIDADE TORNOZELO, etc.).
- Use AO MÁXIMO toda a variedade do banco: o banco tem MOBILIDADE TORÁCICA / TORÁCICA 2 / 3, MOBILIDADE ESCAPULAR, MOBILIDADE OMBRO, MOBILIDADE DE QUADRIL / QUADRIL 2 / 3 / 4 / 5 / 6, MOBILIDADE TORNOZELO, ALONGAMENTO GLÚTEO / 2, ALONGAMENTO ADUTORES, GOOD MORNING, SWING, FACE PULL, CRUCIFIXO INVERSO (SENTADO/BANCO), REAR DELT FLY. ROTACIONE entre TODAS elas — não fique fixado em 2 ou 3 opções.
- Sempre escolha mobilidades coerentes com o GRUPO MUSCULAR do dia:
  • INFERIORES / PERNAS / POSTERIOR / GLÚTEO / QUADRÍCEPS → quadril (variações 2/3/4/5/6), tornozelo, lombar, glúteo (alongamentos), adutor (alongamento adutores, cadeira adutora leve), isquio (good morning leve).
  • SUPERIORES PUXAR / COSTAS / DORSAL → torácica (1/2/3), escapular, latíssimo (face pull, crucifixo inverso, rear delt fly).
  • SUPERIORES EMPURRAR / PEITO → torácica (1/2/3), ombro, peitoral (cross over leve de aquecimento).
  • OMBRO → mobilidade ombro, escapular, manguito rotador (face pull, rear delt fly, crucifixo inverso).
  • BRAÇO → mobilidade ombro/escapular + ativação leve do cotovelo/punho.
  • FULL BODY → mobilidade global rotacionando torácica + quadril + ombro + tornozelo.
- Se houver TREINO ANTERIOR no contexto, NÃO repita as mesmas mobilidades da semana passada — escolha variações diferentes para fugir da monotonia.
- Antes de fechar a semana, REVISE: cada uma das mobilidades escolhidas só pode aparecer no MÁXIMO em 1 dia. Se você usou a mesma mobilidade em 2 dias diferentes, TROQUE uma delas por outra do banco.

========================================
REGRA DE VOLUME
========================================

Mais volume para INFERIORES e DORSAL. Variar ângulos, pegadas e variações.

========================================
ANTI REPETIÇÃO E EVOLUÇÃO
========================================

1) Variação inteligente de ângulo, pegada, base
2) Progressão real
3) Periodização de 4 semanas (perguntar qual semana)
4) Evitar repetir mais de 40% dos exercícios se houver treino anterior

========================================
SEGURANÇA E CONTRAINDICAÇÕES (REGRA CRÍTICA — PRIORIDADE MÁXIMA)
========================================

ANTES de montar o treino, analise TODOS os dados do aluno: lesões, dores, cirurgias, restrições, desvios posturais, histórico de saúde, medicação, mobilidade e testes de performance. Cruze essas informações com CADA exercício selecionado.

REGRAS ABSOLUTAS:
1) NUNCA prescreva exercícios que agravem lesões ou condições reportadas.
2) Para cada lesão/restrição, identifique os MOVIMENTOS CONTRAINDICADOS e exclua-os.

EXEMPLOS DE CONTRAINDICAÇÕES (não exaustivo — aplique raciocínio clínico):
- Tendão de Aquiles (tendinite, ruptura, dor): PROIBIDO exercícios de alto impacto (PASSADAS, SALTO LATERAL, JUMPS, BURPEES, CORRIDA, SKIPS, POLICHINELO, AFUNDO com salto). PREFERIR: exercícios sem impacto (LEG PRESS, HACK MACHINE, CADEIRA EXTENSORA/FLEXORA, BIKE SENTADO, ELÍPTICO).
- Ombro (tendinite, impingement, bursite, luxação): EVITAR supinos pesados com barra, elevação lateral acima de 90°, pull-up com pegada larga agressiva. PREFERIR: exercícios com pegada neutra, amplitude controlada, máquinas guiadas.
- Joelho (condromalácia, menisco, LCA): EVITAR agachamento profundo, LEG PRESS com amplitude excessiva, exercícios com impacto. PREFERIR: amplitude parcial, cadeira extensora com carga leve, isometria.
- Lombar (hérnia, protusão, dor crônica): EVITAR stiff pesado, good morning com carga alta, exercícios com flexão lombar sob carga. PREFERIR: exercícios com suporte lombar, hiperextensão controlada.
- Punho/Cotovelo (tendinite, epicondilite): EVITAR pegada pronada pesada, rosca com barra reta. PREFERIR: pegada neutra, halteres, máquinas.

3) Se o aluno tem QUALQUER lesão ou dor, ADICIONE 1-2 exercícios de reabilitação/fortalecimento específicos para a região afetada (com carga leve e controle).
4) Inclua exercícios corretivos para TODOS os desvios posturais detectados.
5) Adapte VOLUME e INTENSIDADE: alunos com lesões, sono ruim, stress alto ou tabagismo precisam de volume menor e recuperação maior.
6) Na coluna DESCRIÇÃO, SEMPRE mencione adaptações de amplitude/carga quando o exercício for próximo de uma região lesionada.

SE HOUVER DÚVIDA SOBRE A SEGURANÇA DE UM EXERCÍCIO PARA UMA CONDIÇÃO ESPECÍFICA, NÃO INCLUA O EXERCÍCIO. Opte pela alternativa mais segura.

========================================
FILTRO RÍGIDO DE SEGURANÇA (PRIORIDADE ABSOLUTA — ACIMA DE TUDO)
========================================

As informações em RESTRIÇÕES, LESÕES, OBSERVAÇÕES DO PROFESSOR e principalmente no bloco "🚨 REGRAS RÍGIDAS DE SEGURANÇA ESTRUTURADAS" (quando presente no prompt do usuário) NÃO SÃO sugestões nem observações soltas — são REGRAS OBRIGATÓRIAS DE SEGURANÇA que TÊM PRIORIDADE MÁXIMA sobre QUALQUER outra regra deste prompt (volume, variedade, intensidade, técnicas avançadas, divisão padrão, periodização, etc).

Quando o prompt do usuário contiver um bloco "🚨 REGRAS RÍGIDAS DE SEGURANÇA ESTRUTURADAS" com campos como CASO_ADAPTADO, OBJETIVOS_TERAPEUTICOS_OBRIGATORIOS, EXERCICIOS_PROIBIDOS, PADROES_DE_MOVIMENTO_PROIBIDOS, EXERCICIOS_PERMITIDOS_OU_PRIORITARIOS e REGRAS_DE_CARGA_E_EXECUCAO — esse bloco é a FONTE PRIMÁRIA de regras. Leia-o ANTES de qualquer outra coisa, aplique todos os filtros antes de escolher exercícios, e mencione na coluna DESCRIÇÃO de cada exercício a adaptação concreta exigida pelas REGRAS_DE_CARGA_E_EXECUCAO.

ANTES de montar QUALQUER treino, você DEVE:

1) EXTRAIR das RESTRIÇÕES/LESÕES/OBSERVAÇÕES, de forma explícita:
   a) EXERCÍCIOS PROIBIDOS (lista nominal — ex: "smith", "stiff", "hack", "agachamento livre", "goblet squat", "supino inclinado", "elevação frontal", "desenvolvimento", "hiperextensão lombar", "sumô terra", "abdominal canivete", "elevação pélvica", "unilateral exceto X", etc).
   b) PADRÕES DE MOVIMENTO PROIBIDOS (ex: "sobrecarga axial", "hinge pesado", "flexão lombar dinâmica", "movimentos acima da cabeça", "compressão cervical/ombros", "instabilidade excessiva", "exercícios explosivos", "alto impacto").
   c) OBJETIVOS TERAPÊUTICOS/FUNCIONAIS OBRIGATÓRIOS (ex: "fortalecimento cervical", "posteriores de ombro", "estabilização escapular", "tração cervical", "core", "alongamento isquiotibiais/iliopsoas", "isometria").
   d) REGRAS DE CARGA E EXECUÇÃO (ex: "priorizar isométricos", "carga baixa", "amplitude controlada", "sem peso quando possível", "evitar agressividade").

2) APLICAR O FILTRO ANTES DE ESCOLHER QUALQUER EXERCÍCIO:
   - Para CADA exercício candidato, verifique:
       (i) o nome bate com algum proibido? → REJEITAR.
       (ii) o padrão de movimento bate com algum padrão proibido? → REJEITAR.
       (iii) sinônimo ou variação que mantém o mesmo padrão proibido? → REJEITAR.
   - NÃO troque um exercício proibido por uma "variação parecida" que mantenha o mesmo padrão (ex: se "agachamento livre" está proibido por sobrecarga axial, NÃO substitua por "smith squat" ou "hack" — escolha um padrão diferente, como leg press com amplitude controlada ou agachamento isométrico).

3) MAPEAMENTO MÍNIMO DE PADRÕES → EXERCÍCIOS DO BANCO QUE GERALMENTE DEVEM SER EVITADOS:
   - "sobrecarga axial relevante" / "compressão cervical" → AGACHAMENTO LIVRE, AGACHAMENTO SMITH, BÚLGARO SMITH, AFUNDO C/ BARRA, AFUNDO SMITH, GOOD MORNING, GOOD MORNING SMITH.
   - "hinge pesado" / "flexão lombar dinâmica agressiva" → SUMÔ TERRA, PESO MORTO, STIFF ROMENO, STIFF NA POLIA, STIFF HALTERES, STIFF UNILATERAL, GOOD MORNING, HIPEREXTENSÃO LOMBAR, HIPEREXTENSÃO LOMBAR 2.
   - "movimentos acima da cabeça" / "compressão de ombros" → DESENV. ARNOLD, DESENV. MÁQUINA, DESENV. OMBRO BARRA, DESENV. HALTERES, DESENV. MACHINE 2, DESENV. MACHINE NEUTRA, ELEVAÇÃO FRONTAL (todas as variações).
   - "instabilidade excessiva" / "explosivos" / "alto impacto" → JUMPS, SALTO LATERAL, SALTO LATERAL 2, BURPEES, BURPEES 2, SKIPS, POLICHINELO, MOUTAIN CLIMBERS, FLEXÃO+ALPINISTA, CORRIDA INTERVALADA, ESTEIRA CURVA HARD.
   - "abdominal de flexão dinâmica agressiva" → ABS CANIVETE, CANIVETE ADAPTADO, CANIVETE ADAPTADO 2, ABS RUSSIAN, ABS DIAGONAL.
   - "elevação pélvica / extensão de quadril em hinge pesado" → ELEVAÇÃO PELVICA, ELEVAÇÃO PÉLVICA, ELEVAÇÃO PÉLVICA 2, ELEVAÇÃO PÉLVICA UNIL.
   - "unilateral proibido (exceto X)" → BÚLGARO, AFUNDO HALTERES, AFUNDO C/ BARRA, AFUNDO SMITH, PASSADAS, LEG PRESS UNIL, FLEXORA UNILATERAL, STIFF UNILATERAL, REMADA UNILATERAL, ROSCA SCOTT UNIL, TRÍCEPS UNILATERAL, ELEVAÇÃO LATERAL UNIL, ELEVAÇÃO FRONTAL UNIL, GÊMEOS UNILATERAL, REMADA UNIL. POLIA, REMADA UNIL. ART., PUXADA ALTA UNIL., REMADA UNIL. SENTADO, ELEVAÇÃO PÉLVICA UNIL., FLEXORA ALTERNANDO, MARTELO ALTERNANDO, ROSCA ALTERNADA, AFUNDO ALTERNANDO, AFUNDO CAIXA ALTERN. — exceções permitidas: SOMENTE as que o admin permitir explicitamente (ex: AFUNDO ALTERNANDO se "afundo alternado" estiver na lista de permitidos).

4) INCLUIR OBRIGATORIAMENTE os exercícios alinhados aos objetivos terapêuticos extraídos. Ex:
   - Cervical/posteriores de ombro/estabilização escapular: FACE PULL, CRUCIFIXO INVERSO (SENTADO/BANCO), REAR DELT FLY, MOBILIDADE ESCAPULAR, MOBILIDADE OMBRO, ESCAPULAR.
   - Core / isometria: PRANCHA FRONTAL, PRANCHA LATERAL, PRANCHA 2, ABDOMINAL BOLA SUIÇA, ABS SENTADO 1, ABS SENTADO 2.
   - Alongamento isquiotibiais/iliopsoas/glúteo: ALONGAMENTO GLÚTEO, ALONGAMENTO GLÚTEO 2, ALONGAMENTO ADUTORES, MOBILIDADE QUADRIL (todas).
   - Membro inferior seguro com baixa carga/isometria: AGACHAMENTO ISOMETRIA, ISOMETRIA PAREDE, MINI SQUATS, AFUNDO S/ PESO, LEG PRESS (com nota "carga baixa, amplitude controlada"), CADEIRA EXTENSORA (carga leve), CADEIRA FLEXORA (poucas séries, pouca carga).

5) NA COLUNA "DESCRIÇÃO" de cada exercício adaptado, ESCREVA EXPLICITAMENTE a adaptação aplicada (ex: "carga baixa, amplitude controlada", "isometria 20s", "sem peso", "amplitude parcial para proteger lombar/cervical").

REGRAS DE OURO (NÃO NEGOCIÁVEIS):
- Se um exercício conflita com QUALQUER restrição → NÃO inclua.
- NÃO substitua por sinônimos/variações que mantêm o mesmo padrão proibido.
- Segurança e adaptação têm PRIORIDADE MÁXIMA sobre variedade, intensidade, volume e padrão genérico de treino.
- Se o quadro for sério e não for possível montar um treino completo respeitando todas as restrições, monte um treino MENOR (menos exercícios) — NUNCA inclua um exercício duvidoso para "preencher".
- IGNORE as regras de "alta intensidade / alto volume / 2 técnicas avançadas obrigatórias / mais volume para inferiores e dorsal" SEMPRE que entrarem em conflito com o filtro de segurança.

========================================
COLETA DE DADOS — REGRA CRÍTICA
========================================

IMPORTANTE: Você receberá TODOS os dados do aluno já disponíveis no sistema (perfil, avaliação física, anamnese, composição corporal, sinais vitais, testes de performance, dobras cutâneas, etc).

USE ESSES DADOS DIRETAMENTE. NÃO pergunte informações que já foram fornecidas no contexto do aluno.

Dados que você pode precisar perguntar (SE não estiverem no contexto):
1) Nível (iniciante/intermediário/avançado)
2) Dias/semana de treino
3) Fotos do aluno (frente, lado, costas)
4) Gráfico de volume mensal
5) Treino anterior (últimas 1-2 semanas)
6) Semana do ciclo (1, 2, 3 ou 4)
7) Divisão desejada (ou "decida por mim")
8) Equipamentos (academia completa ou limitado)
9) Rotina fora da academia (ativo/sentado, passos/dia)
10) Quantas refeições/dia consegue manter
11) Preferências alimentares
12) Praticidade (cozinha, marmita, comer fora)
13) Dieta atual (se faz ou não)

NÃO pergunte: nome, idade, sexo, altura, peso, objetivo, restrições, lesões, observações, IMC, % gordura, massa magra/gorda, FC repouso, pressão, SpO2, glicemia, dobras cutâneas, histórico de saúde, medicação, suplementos, sono, stress, rotina, tabagismo, álcool, cirurgias, dores, treino atual — SE esses dados já estiverem no contexto.

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================

Depois de tudo, criar mensagens simples prontas para WhatsApp em partes.

REGRAS DO FLUXO
1) Só gere tabelas quando TODAS as respostas forem recebidas.
2) Pergunte apenas o que faltou (uma por vez).
3) Quando tiver tudo: resumo + tabela TREINO + resumo dieta + tabela DIETA + mensagens.`;

import {
  buildPeriodizationPromptBlock,
  resolvePeriodization,
  type PeriodizationSnapshot,
  type PeriodizationSelection,
  type WeekPhase,
} from "../_shared/periodization.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      messages,
      studentContext,
      outputMode,
      studentId,
      variationIntensity,
      // Phase 1 — additive, optional fields. Legacy callers omit these.
      split_slug,
      split_slug_legacy,
      days_available,
      requested_strength_days,
      // Camada de periodização — decisão determinística já resolvida pelo caller.
      periodization,
      periodizationSelection,
      periodizationContext,
      phase,
    } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    let contextMessage = "";
    if (studentContext) {
      contextMessage = "\n\n=== DADOS COMPLETOS DO ALUNO (JÁ DISPONÍVEIS NO SISTEMA — NÃO PERGUNTE NOVAMENTE) ===\n";
      
      // Profile
      if (studentContext.nome) contextMessage += `Nome: ${studentContext.nome}\n`;
      if (studentContext.email) contextMessage += `Email: ${studentContext.email}\n`;
      if (studentContext.sexo) contextMessage += `Sexo: ${studentContext.sexo}\n`;
      if (studentContext.data_nascimento) {
        const birth = new Date(studentContext.data_nascimento);
        const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        contextMessage += `Data de nascimento: ${studentContext.data_nascimento} (${age} anos)\n`;
      }
      if (studentContext.altura) contextMessage += `Altura: ${studentContext.altura} cm\n`;
      if (studentContext.objetivo) contextMessage += `Objetivo: ${studentContext.objetivo}\n`;

      // CRITICAL SAFETY DATA - highlighted for AI attention
      const safetyFields: string[] = [];
      if (studentContext.restricoes) safetyFields.push(`⚠️ RESTRIÇÕES: ${studentContext.restricoes}`);
      if (studentContext.lesoes) safetyFields.push(`🚨 LESÕES: ${studentContext.lesoes}`);
      if (studentContext.observacoes) safetyFields.push(`📋 OBSERVAÇÕES DO PROFESSOR: ${studentContext.observacoes}`);
      
      if (safetyFields.length > 0) {
        contextMessage += `\n========== ⚠️ DADOS CRÍTICOS DE SEGURANÇA — LEIA COM ATENÇÃO MÁXIMA ⚠️ ==========\n`;
        contextMessage += safetyFields.join('\n') + '\n';
        contextMessage += `==========================================================================\n`;
        contextMessage += `INSTRUÇÃO OBRIGATÓRIA — FILTRO RÍGIDO DE SEGURANÇA:

ANTES de gerar o treino, você DEVE executar internamente as seguintes etapas (em ordem):

ETAPA 1 — EXTRAÇÃO: leia RESTRIÇÕES, LESÕES e OBSERVAÇÕES DO PROFESSOR acima e MONTE 4 listas internas:
  • EXERCÍCIOS_PROIBIDOS = [todos os nomes de exercícios mencionados como proibidos / a evitar / contraindicados]
  • PADRÕES_PROIBIDOS = [padrões de movimento mencionados como proibidos: sobrecarga axial, hinge pesado, flexão lombar dinâmica, movimentos acima da cabeça, compressão cervical, instabilidade, explosivos, alto impacto, etc]
  • OBJETIVOS_OBRIGATORIOS = [objetivos terapêuticos/funcionais mencionados: cervical, posteriores de ombro, estabilização escapular, core, alongamento isquios/iliopsoas, isometria, etc]
  • REGRAS_EXECUCAO = [regras de carga/execução: priorizar isométricos, carga baixa, amplitude controlada, sem peso, evitar agressividade, etc]

ETAPA 2 — FILTRAGEM: para CADA exercício candidato do banco, REJEITE se:
  (a) o nome aparece (mesmo parcialmente) em EXERCÍCIOS_PROIBIDOS;
  (b) o padrão de movimento aparece em PADRÕES_PROIBIDOS;
  (c) é sinônimo/variação que mantém o mesmo padrão proibido (ex: smith squat ≡ agachamento livre quanto à sobrecarga axial; stiff halteres ≡ stiff barra quanto ao hinge pesado).

ETAPA 3 — INCLUSÃO OBRIGATÓRIA: garanta que o treino contempla os OBJETIVOS_OBRIGATORIOS (face pull, crucifixo inverso, mobilidade escapular/cervical, prancha, alongamentos, isometrias, etc).

ETAPA 4 — APLICAÇÃO DE REGRAS_EXECUCAO em cada exercício escolhido: descreva na coluna DESCRIÇÃO a adaptação concreta (carga baixa, amplitude controlada, isometria Xs, sem peso, etc).

REGRA DE OURO: as informações acima NÃO são observações soltas — são REGRAS RÍGIDAS. Segurança > variedade > volume > intensidade > divisão padrão. Se conflitar com qualquer outra regra deste prompt (alta intensidade, alto volume, técnicas avançadas, mais volume para inferiores/dorsal), o filtro de segurança VENCE sempre.

PROIBIDO: trocar um exercício proibido por uma variação/sinônimo que preserva o mesmo padrão proibido. PROIBIDO: incluir um exercício "duvidoso" para preencher volume — prefira um treino menor e seguro.

`;
      }
      if (studentContext.raca) contextMessage += `Raça/etnia: ${studentContext.raca}\n`;

      // Anthropometrics
      contextMessage += "\n--- Dados Antropométricos ---\n";
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.cintura) contextMessage += `Cintura: ${studentContext.cintura} cm\n`;
      if (studentContext.quadril) contextMessage += `Quadril: ${studentContext.quadril} cm\n`;
      if (studentContext.rcq) contextMessage += `RCQ: ${studentContext.rcq}\n`;
      if (studentContext.torax) contextMessage += `Tórax: ${studentContext.torax} cm\n`;
      if (studentContext.abdomen) contextMessage += `Abdômen: ${studentContext.abdomen} cm\n`;
      if (studentContext.ombro) contextMessage += `Ombro: ${studentContext.ombro} cm\n`;
      if (studentContext.pescoco) contextMessage += `Pescoço: ${studentContext.pescoco} cm\n`;
      if (studentContext.braco_direito) contextMessage += `Braço D: ${studentContext.braco_direito} cm\n`;
      if (studentContext.braco_esquerdo) contextMessage += `Braço E: ${studentContext.braco_esquerdo} cm\n`;
      if (studentContext.coxa_direita) contextMessage += `Coxa D: ${studentContext.coxa_direita} cm\n`;
      if (studentContext.coxa_esquerda) contextMessage += `Coxa E: ${studentContext.coxa_esquerda} cm\n`;
      if (studentContext.panturrilha_direita) contextMessage += `Panturrilha D: ${studentContext.panturrilha_direita} cm\n`;
      if (studentContext.panturrilha_esquerda) contextMessage += `Panturrilha E: ${studentContext.panturrilha_esquerda} cm\n`;

      // Composition
      contextMessage += "\n--- Composição Corporal ---\n";
      if (studentContext.percentual_gordura) contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.massa_magra) contextMessage += `Massa Magra: ${studentContext.massa_magra} kg\n`;
      if (studentContext.massa_gorda) contextMessage += `Massa Gorda: ${studentContext.massa_gorda} kg\n`;

      // Vitals
      contextMessage += "\n--- Sinais Vitais ---\n";
      if (studentContext.fc_repouso) contextMessage += `FC Repouso: ${studentContext.fc_repouso} bpm\n`;
      if (studentContext.pressao) contextMessage += `Pressão Arterial: ${studentContext.pressao}\n`;
      if (studentContext.spo2) contextMessage += `SpO2: ${studentContext.spo2}%\n`;
      if (studentContext.glicemia) contextMessage += `Glicemia: ${studentContext.glicemia} mg/dL\n`;

      // Skinfolds
      if (studentContext.skinfolds) {
        const sf = studentContext.skinfolds;
        contextMessage += "\n--- Dobras Cutâneas ---\n";
        if (sf.metodo) contextMessage += `Método: ${sf.metodo}\n`;
        if (sf.triceps) contextMessage += `Tríceps: ${sf.triceps} mm\n`;
        if (sf.peitoral) contextMessage += `Peitoral: ${sf.peitoral} mm\n`;
        if (sf.subescapular) contextMessage += `Subescapular: ${sf.subescapular} mm\n`;
        if (sf.axilar_media) contextMessage += `Axilar Média: ${sf.axilar_media} mm\n`;
        if (sf.suprailiaca) contextMessage += `Suprailíaca: ${sf.suprailiaca} mm\n`;
        if (sf.abdominal) contextMessage += `Abdominal: ${sf.abdominal} mm\n`;
        if (sf.coxa) contextMessage += `Coxa: ${sf.coxa} mm\n`;
      }

      // Anamnese
      if (studentContext.anamnese) {
        const an = studentContext.anamnese;
        contextMessage += "\n--- Anamnese ---\n";
        if (an.historico_saude) contextMessage += `Histórico de saúde: ${an.historico_saude}\n`;
        if (an.medicacao) contextMessage += `Medicação: ${an.medicacao}\n`;
        if (an.suplementos) contextMessage += `Suplementos: ${an.suplementos}\n`;
        if (an.cirurgias) contextMessage += `Cirurgias: ${an.cirurgias}\n`;
        if (an.dores) contextMessage += `Dores: ${an.dores}\n`;
        if (an.sono) contextMessage += `Sono: ${an.sono}\n`;
        if (an.stress) contextMessage += `Stress: ${an.stress}\n`;
        if (an.rotina) contextMessage += `Rotina: ${an.rotina}\n`;
        if (an.treino_atual) contextMessage += `Treino atual: ${an.treino_atual}\n`;
        if (an.tabagismo) contextMessage += `Tabagismo: Sim\n`;
        if (an.alcool) contextMessage += `Álcool: ${an.alcool}\n`;
      }

      // Performance
      if (studentContext.performance) {
        const pf = studentContext.performance;
        contextMessage += "\n--- Testes de Performance ---\n";
        if (pf.cooper_12min) contextMessage += `Cooper 12min: ${pf.cooper_12min} m\n`;
        if (pf.pushup) contextMessage += `Flexões: ${pf.pushup}\n`;
        if (pf.plank) contextMessage += `Prancha: ${pf.plank} seg\n`;
        if (pf.salto_vertical) contextMessage += `Salto vertical: ${pf.salto_vertical} cm\n`;
        if (pf.agachamento_score) contextMessage += `Score agachamento: ${pf.agachamento_score}\n`;
        if (pf.mobilidade_ombro) contextMessage += `Mobilidade ombro: ${pf.mobilidade_ombro}\n`;
        if (pf.mobilidade_quadril) contextMessage += `Mobilidade quadril: ${pf.mobilidade_quadril}\n`;
        if (pf.mobilidade_tornozelo) contextMessage += `Mobilidade tornozelo: ${pf.mobilidade_tornozelo}\n`;
      }

      // Posture analysis
      if (studentContext.posture) {
        const pos = studentContext.posture;
        contextMessage += "\n--- Avaliação Postural (Manual) ---\n";
        if (pos.vista_anterior) contextMessage += `Vista Anterior: ${JSON.stringify(pos.vista_anterior)}\n`;
        if (pos.vista_lateral) contextMessage += `Vista Lateral: ${JSON.stringify(pos.vista_lateral)}\n`;
        if (pos.vista_posterior) contextMessage += `Vista Posterior: ${JSON.stringify(pos.vista_posterior)}\n`;
        if (pos.observacoes) contextMessage += `Observações posturais: ${pos.observacoes}\n`;
      }

      // Posture scan (2D analysis)
      if (studentContext.posture_scan) {
        const ps = studentContext.posture_scan;
        contextMessage += "\n--- Análise Postural 2D (Automatizada) ---\n";
        if (ps.angles) contextMessage += `Ângulos medidos: ${JSON.stringify(ps.angles)}\n`;
        if (ps.attention_points) contextMessage += `Pontos de atenção: ${JSON.stringify(ps.attention_points)}\n`;
        if (ps.region_scores) contextMessage += `Scores por região: ${JSON.stringify(ps.region_scores)}\n`;
        if (ps.notes) contextMessage += `Notas da análise: ${ps.notes}\n`;
      }

      // Photos
      if (studentContext.fotos_avaliacao && studentContext.fotos_avaliacao.length > 0) {
        contextMessage += "\n--- Fotos da Avaliação ---\n";
        contextMessage += `O aluno possui ${studentContext.fotos_avaliacao.length} foto(s) registradas: ${studentContext.fotos_avaliacao.map((f: any) => f.tipo || 'sem tipo').join(', ')}.\n`;
      }
      if (studentContext.fotos_perfil && studentContext.fotos_perfil.length > 0) {
        contextMessage += `Fotos de perfil registradas: ${studentContext.fotos_perfil.length} foto(s).\n`;
      }

      contextMessage += "\n=== FIM DOS DADOS ===\n\nIMPORTANTE: Todos os dados acima já são conhecidos. Comece perguntando APENAS o que falta (nível, dias/semana, semana do ciclo, divisão, equipamentos, preferências alimentares, etc). UMA PERGUNTA POR VEZ.\n\nATENÇÃO MÁXIMA: ANTES de gerar o treino, releia TODOS os campos de lesões, dores, cirurgias, restrições, desvios posturais e histórico de saúde. CRUZE cada exercício escolhido contra essas condições. Se um exercício pode agravar qualquer condição reportada, SUBSTITUA por uma alternativa segura do banco de exercícios. Se houver dados de análise postural, CONSIDERE-OS ao montar o treino: priorize exercícios corretivos para desvios identificados, inclua mobilidade específica e evite exercícios que possam agravar problemas posturais detectados.";
    }

    // Phase 1 — Structured split context (additive, safe when fields are absent)
    const splitBlock = buildSplitContextBlock({
      split_slug,
      split_slug_legacy,
      days_available: typeof days_available === "number" ? days_available : null,
      requested_strength_days:
        typeof requested_strength_days === "number" ? requested_strength_days : null,
    });
    if (splitBlock) contextMessage += splitBlock;

    // ---- PERIODIZAÇÃO: o snapshot chega pronto do caller (fonte canônica).
    // Se não vier, resolvemos aqui com o MESMO resolver — nunca pedimos ao LLM
    // para escolher o modelo.
    let periodizationSnapshot: PeriodizationSnapshot | null = null;
    try {
      if (periodization && typeof periodization === "object" && periodization.week) {
        periodizationSnapshot = periodization as PeriodizationSnapshot;
      } else if (periodizationContext || periodizationSelection) {
        periodizationSnapshot = resolvePeriodization({
          selection: (periodizationSelection as PeriodizationSelection) ?? "automatica",
          context: periodizationContext ?? {
            level: studentContext?.nivel ?? null,
            daysPerWeek: typeof days_available === "number" ? days_available : null,
            objective: studentContext?.objetivo ?? null,
          },
          phase: ((phase as WeekPhase) ?? "semana_1"),
        });
      }
    } catch (err) {
      console.error("periodization_resolve_failed", err);
      periodizationSnapshot = null;
    }
    contextMessage += buildRepRangePromptBlock();
    if (periodizationSnapshot) {
      contextMessage += buildPeriodizationPromptBlock(periodizationSnapshot);
      console.log("periodization_applied", {
        model: periodizationSnapshot.model,
        block: periodizationSnapshot.block.blockType,
        week: periodizationSnapshot.week.weekNumber,
      });
    }

    // ============================================================
    // STRUCTURED MODE — JSON-FIRST (workout schema v2)
    // ============================================================
    if (outputMode === "json") {
      const intensity: VariationIntensity =
        variationIntensity === "baixa" || variationIntensity === "alta"
          ? variationIntensity
          : DEFAULT_INTENSITY;
      const catalog = await loadExerciseCatalog();
      const systemWithCatalog =
        catalog.length > 0
          ? SYSTEM_PROMPT.replace(EXERCISE_DATABASE, buildCatalogBlock(catalog))
          : SYSTEM_PROMPT;
      const referenceText = extractReferenceText(Array.isArray(messages) ? messages : []);
      const declaredReferenceMode = extractDeclaredReferenceMode(Array.isArray(messages) ? messages : []);
      const reference = parseReferenceStructure(referenceText, declaredReferenceMode);
      const exactReferenceBlock =
        reference.mode === "exact" && referenceText
          ? EXACT_REFERENCE_PRIORITY_BLOCK + buildExactReferenceBlock(referenceText)
          : "";
      const restrictionsText = [
        studentContext?.restricoes,
        studentContext?.lesoes,
        studentContext?.observacoes,
      ]
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .join("\n");

      return await generateStructuredWorkoutWithVariation({
        apiKey: OPENAI_API_KEY,
        systemPrompt: systemWithCatalog + contextMessage + exactReferenceBlock,
        messages,
        reference,
        restrictionsText,
        studentId: typeof studentId === "string" && studentId.length > 0 ? studentId : undefined,
        intensity,
        catalog,
        sessionProfiles: (periodizationSnapshot?.week?.sessionProfiles ?? []).map((p) => ({
          sessionIndex: p.sessionIndex,
          profile: p.profile,
        })),
      });
    }

    // Legacy path does not need metadata if zero attempts occurred
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + contextMessage },
          ...messages,
        ],
        stream: true,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes na sua conta OpenAI." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("OpenAI API error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro na API de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("trainer-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
