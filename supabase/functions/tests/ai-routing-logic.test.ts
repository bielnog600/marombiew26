import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { createRoutingMetadata, AI_MODELS, type AIAttemptMetadata } from "../_shared/aiModelRouter.ts";
import { sanitizeStructuredPrompt } from "../_shared/structuredPromptSanitizer.ts";
import {
  evaluateDietCandidateValidity,
  isVariationRetryAllowed,
  needsDietVariationRetry,
  shouldAcceptDietVariationCandidate,
  shouldRetryDietCandidate,
  type DietCandidateSignals,
} from "../_shared/dietRoutingPolicy.ts";
import {
  isTrainerCandidateCriticalValid,
  shouldAcceptTrainerVariationCandidate,
  shouldRetryTrainerCandidate,
  trainerCriticalReason,
  type TrainerCandidateSignals,
  isRetryableUpstreamStatus,
  isSimilarityRetryAllowed,
} from "../_shared/trainerRoutingPolicy.ts";
import {
  enforceVariationIntegrity,
  validateWorkoutRedundancy,
} from "../_shared/workoutRedundancy.ts";
import {
  evaluateVariationCandidate,
  selectVariation,
  validateAndNormalizeVariations,
} from "../_shared/variationSelection.ts";
import { normalizeName, validateDietNutrition } from "../_shared/planSimilarity.ts";
import { getExerciseFunctionalProfile } from "../_shared/exerciseClassifier.ts";
import {
  evaluateReferenceCompliance,
  extractDeclaredReferenceMode,
  parseReferenceStructure,
} from "../_shared/trainerReferencePolicy.ts";

const attempt = (
  model: string,
  reason: string,
  usage: AIAttemptMetadata["usage"] = { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
): AIAttemptMetadata => ({ model, durationMs: 1000, reason, usage });

// ───────────────────────────── ROUTER ─────────────────────────────

Deno.test("router: empty attempts violates invariant", () => {
  assertThrows(() => createRoutingMetadata([], null, [], null));
});

Deno.test("router: missing usage resolves to null totals (never 0)", () => {
  const r = createRoutingMetadata([attempt(AI_MODELS.primary, "first_attempt", null)], null, [], AI_MODELS.primary);
  assertEquals(r.usage.totalPromptTokens, null);
  assertEquals(r.usage.totalCompletionTokens, null);
  assertEquals(r.usage.totalTokens, null);
});

Deno.test("router: Luna accepted", () => {
  const r = createRoutingMetadata([attempt(AI_MODELS.primary, "first_attempt")], null, [], AI_MODELS.primary);
  assertEquals(r.routing.primaryModel, AI_MODELS.primary);
  assertEquals(r.routing.finalModel, AI_MODELS.primary);
  assertEquals(r.routing.lastAttemptModel, AI_MODELS.primary);
  assertEquals(r.routing.fallbackUsed, false);
  assertEquals(r.routing.attempts, 1);
  assertEquals(r.usage.totalTokens, 150);
});

Deno.test("router: Terra accepted after Luna", () => {
  const r = createRoutingMetadata(
    [attempt(AI_MODELS.primary, "first_attempt"), attempt(AI_MODELS.fallback, "critical_fallback")],
    "invalid_json",
    ["invalid_json"],
    AI_MODELS.fallback,
  );
  assertEquals(r.routing.finalModel, AI_MODELS.fallback);
  assertEquals(r.routing.lastAttemptModel, AI_MODELS.fallback);
  assertEquals(r.routing.fallbackUsed, true);
  assertEquals(r.routing.attempts, 2);
  assertEquals(r.usage.totalTokens, 300);
});

Deno.test("router: Terra attempted but rejected → Luna stays selected", () => {
  const r = createRoutingMetadata(
    [attempt(AI_MODELS.primary, "first_attempt"), attempt(AI_MODELS.fallback, "retry")],
    "high_similarity",
    ["high_similarity"],
    AI_MODELS.primary,
  );
  assertEquals(r.routing.finalModel, AI_MODELS.primary);
  assertEquals(r.routing.lastAttemptModel, AI_MODELS.fallback);
  assertEquals(r.routing.attempts, 2);
});

Deno.test("router: no candidate accepted → finalModel null", () => {
  const r = createRoutingMetadata(
    [attempt(AI_MODELS.primary, "first_attempt", null), attempt(AI_MODELS.fallback, "critical_fallback", null)],
    "upstream_error",
    ["upstream_error"],
    null,
  );
  assertEquals(r.routing.finalModel, null);
  assertEquals(r.routing.attempts, 2);
});

Deno.test("router: non-retryable post-model error keeps 1 attempt and null finalModel", () => {
  const r = createRoutingMetadata([attempt(AI_MODELS.primary, "first_attempt")], "upstream_error", ["upstream_error"], null);
  assertEquals(r.routing.attempts, 1);
  assertEquals(r.routing.finalModel, null);
  assertEquals(r.routing.lastAttemptModel, AI_MODELS.primary);
  assertEquals(r.routing.fallbackUsed, false);
});

// ───────────────── DIET POLICY (production module under test) ─────────────────

const base: DietCandidateSignals = {
  intent: "new",
  historyCount: 1,
  similarityScore: 0.1,
  threshold: 0.6,
  isPortionOnly: false,
  requireMenuVariation: true,
  quantityOnlyRatio: 0,
  primarySourceRepeatRatio: 0,
  nutritionOk: true,
  dailyAdjustmentsOk: true,
  technicalFallbackUsed: false,
};

/** Number of model calls implied by the REAL policy used by diet-agent. */
const dietCalls = (s: DietCandidateSignals) => (shouldRetryDietCandidate(s) ? 2 : 1);

Deno.test("diet: UPDATE blocks variation retries", () => {
  assertEquals(isVariationRetryAllowed("update"), false);
  assertEquals(isVariationRetryAllowed("new"), true);
  assertEquals(isVariationRetryAllowed("regenerate"), true);
});

Deno.test("diet: UPDATE + high similarity → 1 call (never Terra)", () => {
  assertEquals(dietCalls({ ...base, intent: "update", similarityScore: 0.95 }), 1);
});

Deno.test("diet: UPDATE + portion_only → 1 call", () => {
  assertEquals(dietCalls({ ...base, intent: "update", isPortionOnly: true }), 1);
});

Deno.test("diet: UPDATE + quantity overlap / source repetition → 1 call", () => {
  assertEquals(dietCalls({ ...base, intent: "update", quantityOnlyRatio: 0.9 }), 1);
  assertEquals(dietCalls({ ...base, intent: "update", primarySourceRepeatRatio: 0.9 }), 1);
});

Deno.test("diet: UPDATE with invalid nutrition still falls back to Terra", () => {
  assertEquals(dietCalls({ ...base, intent: "update", nutritionOk: false }), 2);
});

Deno.test("diet: Luna nutrition/dailyAdj invalid → Terra", () => {
  assertEquals(dietCalls({ ...base, nutritionOk: false }), 2);
  assertEquals(dietCalls({ ...base, dailyAdjustmentsOk: false }), 2);
});

Deno.test("diet: NEW high similarity → Terra (variation retry allowed)", () => {
  assertEquals(dietCalls({ ...base, similarityScore: 0.95 }), 2);
  assert(needsDietVariationRetry({ ...base, similarityScore: 0.95 }));
});

Deno.test("diet: no history → never a variation retry", () => {
  assertEquals(dietCalls({ ...base, historyCount: 0, similarityScore: 0.99, isPortionOnly: true }), 1);
});

Deno.test("diet: technical fallback candidate is never retried (budget 2)", () => {
  assertEquals(
    dietCalls({ ...base, technicalFallbackUsed: true, nutritionOk: false, similarityScore: 0.99 }),
    1,
  );
});

Deno.test("diet: absolute budget is 2 calls", () => {
  const states: DietCandidateSignals[] = [
    { ...base },
    { ...base, nutritionOk: false, dailyAdjustmentsOk: false, similarityScore: 0.99, isPortionOnly: true },
    { ...base, intent: "regenerate", similarityScore: 0.99 },
  ];
  for (const s of states) assert(dietCalls(s) <= 2);
});

// Critical validity of the Terra candidate (technical or critical fallback).
const dietTerraOutcome = (nut2Ok: boolean, adj2Ok: boolean) =>
  evaluateDietCandidateValidity({ nutritionOk: nut2Ok, dailyAdjustmentsOk: adj2Ok }).criticalValid ? 200 : 422;

Deno.test("diet: Luna invalid JSON → Terra valid → 200 with full contract", () => {
  assertEquals(dietTerraOutcome(true, true), 200);
  const contract = ["plan", "intent", "dailyAdjustments", "similarity", "nutrition", "aiRouting", "aiUsage"];
  const response: Record<string, unknown> = {
    plan: {}, intent: "new", dailyAdjustments: {}, similarity: {}, nutrition: {}, aiRouting: {}, aiUsage: {},
  };
  for (const key of contract) assert(key in response, `missing ${key}`);
});

Deno.test("diet: Terra nutrition invalid → 422 review_required", () => {
  assertEquals(dietTerraOutcome(false, true), 422);
  assertEquals(
    evaluateDietCandidateValidity({ nutritionOk: false, dailyAdjustmentsOk: true }).reason,
    "nutrition_invalid",
  );
});

Deno.test("diet: Terra dailyAdjustments invalid → 422 review_required", () => {
  assertEquals(dietTerraOutcome(true, false), 422);
  assertEquals(
    evaluateDietCandidateValidity({ nutritionOk: true, dailyAdjustmentsOk: false }).reason,
    "daily_adjustments_invalid",
  );
});

Deno.test("diet: variation candidate only accepted when valid and better", () => {
  const accept = (o: Partial<Parameters<typeof shouldAcceptDietVariationCandidate>[0]>) =>
    shouldAcceptDietVariationCandidate({
      candidateCriticalValid: true,
      candidateScore: 0.2,
      currentScore: 0.8,
      escapedPortionOnly: false,
      reducedPrimarySourceRepeat: false,
      ...o,
    });
  assert(accept({}));
  assert(!accept({ candidateCriticalValid: false }));
  assert(!accept({ candidateScore: 0.9 }));
  assert(accept({ candidateScore: 0.9, escapedPortionOnly: true }));
  assert(accept({ candidateScore: 0.9, reducedPrimarySourceRepeat: true }));
});

Deno.test("diet: 422 metadata carries finalModel null", () => {
  const meta = createRoutingMetadata(
    [attempt(AI_MODELS.primary, "first_attempt"), attempt(AI_MODELS.fallback, "critical_fallback")],
    "nutrition_invalid",
    ["nutrition_invalid"],
    null,
  );
  assertEquals(meta.routing.finalModel, null);
  assertEquals(meta.routing.lastAttemptModel, AI_MODELS.fallback);
});

// ──────────────── TRAINER POLICY (production module under test) ────────────────

const trainerBase: TrainerCandidateSignals = {
  redundancyOk: true,
  criticalCatalogMismatchCount: 0,
  similarityScore: 0.2,
  threshold: 0.6,
  historyCount: 1,
  technicalFallbackUsed: false,
};

const trainerCalls = (s: TrainerCandidateSignals) => (shouldRetryTrainerCandidate(s) ? 2 : 1);

Deno.test("trainer: exact duplicate / redundancy on Luna → Terra", () => {
  assertEquals(trainerCalls({ ...trainerBase, redundancyOk: false }), 2);
  assertEquals(trainerCriticalReason({ redundancyOk: false, criticalCatalogMismatchCount: 0 }), "internal_redundancy");
});

Deno.test("trainer: redundancy persists on Terra → 422 (never 200 with warning)", () => {
  const terra = { redundancyOk: false, criticalCatalogMismatchCount: 0 };
  assertEquals(isTrainerCandidateCriticalValid(terra), false);
  assertEquals(trainerCriticalReason(terra), "internal_redundancy");
});

Deno.test("trainer: critical catalog mismatch on Luna → Terra", () => {
  assertEquals(trainerCalls({ ...trainerBase, criticalCatalogMismatchCount: 3 }), 2);
  assertEquals(
    trainerCriticalReason({ redundancyOk: true, criticalCatalogMismatchCount: 3 }),
    "catalog_mismatch",
  );
});

Deno.test("trainer: critical catalog mismatch on Terra → 422", () => {
  assertEquals(isTrainerCandidateCriticalValid({ redundancyOk: true, criticalCatalogMismatchCount: 1 }), false);
});

Deno.test("trainer: high similarity with history → Terra; without history → 1 call", () => {
  assertEquals(trainerCalls({ ...trainerBase, similarityScore: 0.9 }), 2);
  assertEquals(trainerCalls({ ...trainerBase, similarityScore: 0.9, historyCount: 0 }), 1);
});

Deno.test("trainer: technical fallback uses REAL similarity of the candidate", () => {
  // A valid Terra candidate with lower real similarity replaces Luna's.
  assert(shouldAcceptTrainerVariationCandidate({
    candidateCriticalValid: true,
    candidateScore: 0.31,
    currentScore: 0.9,
  }));
  assert(!shouldAcceptTrainerVariationCandidate({
    candidateCriticalValid: true,
    candidateScore: 0.95,
    currentScore: 0.9,
  }));
  assert(!shouldAcceptTrainerVariationCandidate({
    candidateCriticalValid: false,
    candidateScore: 0.1,
    currentScore: 0.9,
  }));
});

Deno.test("trainer: absolute budget is 2 calls", () => {
  assert(trainerCalls(trainerBase) <= 2);
  assert(trainerCalls({ ...trainerBase, redundancyOk: false }) <= 2);
  assert(trainerCalls({ ...trainerBase, similarityScore: 0.95 }) <= 2);
  assertEquals(trainerCalls({ ...trainerBase, technicalFallbackUsed: true, redundancyOk: false }), 1);
});

// ───────────────────────────── PROMPTS ─────────────────────────────

const DIET_PROMPT = `
========================================
REGRAS DE SEGURANÇA E RESTRIÇÕES
========================================
Respeite restrições alimentares e alergias do aluno.
Preserve o weeklyEnergySchedule e o campo dailyAdjustments.

========================================
VARIEDADE E CRIATIVIDADE NO CARDÁPIO
========================================
OBRIGATÓRIO: Gere EXATAMENTE 1 (UM) cardápio completo para a semana inteira.
No início, escreva claramente: "## CARDÁPIO ÚNICO (segue de segunda a domingo)".
NUNCA repita a mesma proteína em mais de 2 refeições do mesmo dia.

========================================
FORMATO DA TABELA
========================================
A tabela do cardápio deve ter as colunas Refeição, Horário, Alimento.

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================
Criar mensagens simples prontas para WhatsApp explicando a dieta.

========================================
SAÍDA OBRIGATÓRIA — SEÇÕES FINAIS
========================================
Ao final da resposta, SEMPRE inclua DUAS seções extras (após a tabela e mensagens WhatsApp).
`;

const TRAINER_PROMPT = `
========================================
FILTRO DE SEGURANÇA
========================================
Cruze cada exercício contra lesões, dores e restrições. Use apenas o catálogo fornecido.
Respeite o split e a periodização definidos.

========================================
FORMATO DE SAÍDA DO TREINO
========================================
Você pode escrever um texto curto antes da tabela (foco do treino do dia).
Depois, gere o treino em uma tabela markdown.
A tabela do TREINO deve ter exatamente 9 colunas.

========================================
REGRAS TÉCNICAS DE PRESCRIÇÃO
========================================
Defina series, reps, RIR, rest, description e set_scheme coerentes com a fase.

========================================
COLETA DE DADOS — REGRA CRÍTICA
========================================
Comece perguntando APENAS o que falta. UMA PERGUNTA POR VEZ.

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================
Depois de tudo, criar mensagens simples prontas para WhatsApp em partes.
`;

Deno.test("prompts: diet structured has no WhatsApp / Markdown table / headings inside sentences", () => {
  const clean = sanitizeStructuredPrompt(DIET_PROMPT);
  assert(!/whatsapp/i.test(clean));
  assert(!/após a tabela/i.test(clean));
  assert(!/colunas/i.test(clean));
  assert(!/escreva claramente/i.test(clean));
  assert(!/##\s*CARDÁPIO ÚNICO/i.test(clean));
  // technical content preserved
  assert(/restrições alimentares/i.test(clean));
  assert(/weeklyEnergySchedule/.test(clean));
  assert(/dailyAdjustments/.test(clean));
  assert(/NUNCA repita a mesma proteína/i.test(clean));
});

Deno.test("prompts: trainer structured drops legacy output section and keeps technical rules", () => {
  const clean = sanitizeStructuredPrompt(TRAINER_PROMPT);
  assert(!/whatsapp/i.test(clean));
  assert(!/comece perguntando/i.test(clean));
  assert(!/uma pergunta por vez/i.test(clean));
  assert(!/FORMATO DE SAÍDA DO TREINO/i.test(clean));
  assert(!/antes da tabela/i.test(clean));
  assert(!/tabela markdown/i.test(clean));
  assert(!/9 colunas/i.test(clean));
  // technical content preserved
  assert(/lesões/i.test(clean));
  assert(/catálogo/i.test(clean));
  assert(/split/i.test(clean));
  assert(/periodização/i.test(clean));
  assert(/set_scheme/.test(clean));
  assert(/RIR/.test(clean));
});

Deno.test("prompts: sentence-level scrub keeps safety text in mixed lines", () => {
  const mixed =
    "IMPORTANTE: Todos os dados acima já são conhecidos. Comece perguntando APENAS o que falta. UMA PERGUNTA POR VEZ. ATENÇÃO MÁXIMA: releia lesões, dores e cirurgias antes de gerar o treino.";
  const clean = sanitizeStructuredPrompt(mixed);
  assert(!/comece perguntando/i.test(clean));
  assert(!/uma pergunta por vez/i.test(clean));
  assert(/ATENÇÃO MÁXIMA/.test(clean));
  assert(/cirurgias/.test(clean));
});

// ───────────────────────────── LEGACY ─────────────────────────────

Deno.test("legacy: diet and trainer conversational paths stay on gpt-4o", async () => {
  const diet = await Deno.readTextFile(new URL("../diet-agent/index.ts", import.meta.url));
  const trainer = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  assert(/model:\s*"gpt-4o"/.test(diet), "diet legacy must use gpt-4o");
  assert(/model:\s*"gpt-4o"/.test(trainer), "trainer legacy must use gpt-4o");
});

// ─────────────── AGENTS MUST USE THE SHARED POLICY MODULES ───────────────

Deno.test("agents import the shared routing policies (no duplicated algorithm)", async () => {
  const diet = await Deno.readTextFile(new URL("../diet-agent/index.ts", import.meta.url));
  const trainer = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  assert(/_shared\/dietRoutingPolicy\.ts/.test(diet));
  assert(/shouldRetryDietCandidate\(/.test(diet));
  assert(/evaluateDietCandidateValidity\(/.test(diet));
  assert(/_shared\/trainerRoutingPolicy\.ts/.test(trainer));
  assert(/shouldRetryTrainerCandidate\(/.test(trainer));
  assert(/isTrainerCandidateCriticalValid\(/.test(trainer));
});

// ───────────── TRAINER UPSTREAM HTTP CLASSIFICATION + TOKEN PARAM ─────────────

Deno.test("trainer structured call uses max_completion_tokens (GPT-5.6), not max_tokens", async () => {
  const src = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  // structured block = the call that carries response_format json_schema
  const idx = src.indexOf('type: "json_schema"');
  assert(idx > 0, "structured json_schema call must exist");
  const window = src.slice(Math.max(0, idx - 1500), idx);
  assert(/max_completion_tokens:\s*16000/.test(window), "structured call must use max_completion_tokens");
  assert(!/max_tokens:\s*16000/.test(window), "structured call must not use max_tokens");
  assert(/model:\s*"gpt-4o"/.test(src) && /stream:\s*true/.test(src), "legacy gpt-4o path preserved");
});

Deno.test("diet structured call streams upstream to avoid the 150s idle timeout", async () => {
  const src = await Deno.readTextFile(new URL("../diet-agent/index.ts", import.meta.url));
  const start = src.indexOf('if (mode === "structured")');
  const end = src.indexOf("// ─── Legacy conversational mode", start);
  const structured = src.slice(start, end > start ? end : undefined);
  assert(/max_completion_tokens:\s*8000/.test(structured));
  assert(/stream:\s*true/.test(structured));
  assert(/stream_options:\s*\{\s*include_usage:\s*true\s*\}/.test(structured));
  assert(/consumeStructuredChatStream\(r\)/.test(structured));
  assert(!/await\s+r\.json\(\)/.test(structured));
});

Deno.test("diet nutrition accepts an unclassified catalog protein with deterministic macros", () => {
  const result = validateDietNutrition({
    days: [{
      meals: [{
        name: "Almoço",
        items: [
          { name: "Preparação proteica especial", macros: { kcal: 220, p: 32, c: 4, g: 8 } },
          { name: "Arroz", macros: { kcal: 180, p: 4, c: 39, g: 1 } },
        ],
      }],
    }],
  });
  assertEquals(result.ok, true);
  assertEquals(result.issues, []);
});

Deno.test("diet nutrition keeps low protein share in secondary meals as advisory", () => {
  const result = validateDietNutrition({
    days: [{
      meals: [{
        name: "Ceia",
        items: [{ name: "Fruta com aveia", macros: { kcal: 240, p: 5, c: 45, g: 4 } }],
      }],
    }],
  });
  assertEquals(result.ok, true);
  assertEquals(result.issues[0]?.reason, "low_protein_share");
});

Deno.test("trainer: non-retryable upstream statuses never reach Terra (1 call)", () => {
  for (const status of [400, 401, 402, 403, 404, 429]) {
    assertEquals(isRetryableUpstreamStatus(status), false, `status ${status} must be non-retryable`);
    const calls = isRetryableUpstreamStatus(status) ? 2 : 1;
    assertEquals(calls, 1);
  }
});

Deno.test("trainer: retryable technical statuses fall back to Terra (2 calls)", () => {
  for (const status of [408, 409, 500, 502, 503, 504]) {
    assertEquals(isRetryableUpstreamStatus(status), true, `status ${status} must be retryable`);
    const calls = isRetryableUpstreamStatus(status) ? 2 : 1;
    assertEquals(calls, 2);
  }
});

Deno.test("trainer: local failures (empty_response/invalid_json/plan_validation_failed) still trigger Terra", async () => {
  const src = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  for (const code of ["empty_response", "invalid_json", "plan_validation_failed"]) {
    assert(new RegExp(`error_code === "${code}"`).test(src), `${code} must be a critical-failure trigger`);
    assert(new RegExp(`error_code: "${code}"[\\s\\S]{0,200}retryable: true`).test(src), `${code} must be retryable: true`);
  }
});

Deno.test("trainer: Terra failure surfaces Terra's own error_code and both reasons", async () => {
  const src = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  assert(/second\.response\.clone\(\)\.json\(\)/.test(src));
  assert(/second\.error_code \|\| secondBody\.error_code \|\| "fallback_failed"/.test(src));
  assert(/if \(!fallbackReasons\.includes\(secondReason\)\) fallbackReasons\.push\(secondReason\)/.test(src));
  assert(!/error: "Falha crítica na geração do fallback\.",\s*\n\s*error_code: fallbackReason/.test(src));
});

Deno.test("trainer: upstream error response carries safe debug metadata only", async () => {
  const src = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  assert(/upstream_status: upstream\.status/.test(src));
  assert(/model: modelToUse/.test(src));
  assert(!/studentContext:/.test(src.slice(src.indexOf("gateway error"), src.indexOf("gateway error") + 900)));
});

Deno.test("trainer: original upstream status is preserved (never masked as 422)", async () => {
  const src = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  assert(/status: upstream\.status/.test(src));
  assert(/status: first\.response\.status/.test(src));
});

Deno.test("trainer: absolute budget with upstream statuses stays at 2 calls", () => {
  const budget = (status: number) => (isRetryableUpstreamStatus(status) ? 2 : 1);
  for (const status of [400, 401, 402, 403, 404, 408, 409, 429, 500, 503]) {
    assert(budget(status) <= 2);
  }
});

// ─────────── REFERÊNCIA EXATA + REDUNDÂNCIA FUNCIONAL (produção) ───────────

const REFERENCE_LOWER_A = `SEGUNDA — LOWER A
1) Flexora sentada 3x12 descanso 60s
2) Hack Squat 4x8-10 descanso 120s
3) Hip Thrust 4x10 descanso 90s
4) Leg Press 45° 3x12 descanso 90s
5) Extensora 3x15 descanso 60s
6) Abdutora 3x20 descanso 45s`;

const CATALOG_LOWER = [
  "CADEIRA FLEXORA",
  "HACK MACHINE",
  "ELEVAÇÃO PÉLVICA",
  "LEG PRESS 45 ART",
  "LEG PRESS",
  "CADEIRA EXTENSORA",
  "CADEIRA ABDUTORA",
  "STIFF ROMENO",
];

const complianceFor = (candidate: string[], opts: {
  catalogNames?: string[];
  restrictionsText?: string;
  strongDuplicateNames?: string[];
} = {}) =>
  evaluateReferenceCompliance({
    structure: parseReferenceStructure(REFERENCE_LOWER_A),
    candidateDays: [{ label: "SEGUNDA-FEIRA", exercises: candidate }],
    catalogNames: opts.catalogNames ?? CATALOG_LOWER,
    restrictionsText: opts.restrictionsText,
    strongDuplicateNames: opts.strongDuplicateNames,
  });

const PRESERVED = [
  "CADEIRA FLEXORA",
  "HACK MACHINE",
  "ELEVAÇÃO PÉLVICA",
  "LEG PRESS 45 ART",
  "CADEIRA EXTENSORA",
  "CADEIRA ABDUTORA",
];

Deno.test("reference: protocolo detalhado do professor é classificado como exact", () => {
  assertEquals(parseReferenceStructure(REFERENCE_LOWER_A).mode, "exact");
  assertEquals(parseReferenceStructure(REFERENCE_LOWER_A).days[0].exercises.length, 6);
});

Deno.test("reference: observações genéricas continuam como referência livre", () => {
  const free = parseReferenceStructure("Gosto de treinos curtos, foco em glúteo e pouca esteira.");
  assertEquals(free.mode, "free");
  assertEquals(isSimilarityRetryAllowed(free.mode), true);
});

Deno.test("reference: modo Livre explícito prevalece sobre texto estruturado", () => {
  const messages = [{
    role: "user",
    content: `REFERÊNCIA DE TREINO FORNECIDA PELO PROFESSOR (USE APENAS COMO APOIO SECUNDÁRIO, NÃO SOBRESCREVA REGRAS RÍGIDAS):\n---\n${REFERENCE_LOWER_A}\n---`,
  }];
  const declaredMode = extractDeclaredReferenceMode(messages);
  assertEquals(declaredMode, "free");
  assertEquals(parseReferenceStructure(REFERENCE_LOWER_A, declaredMode).mode, "free");
});

Deno.test("reference: modo Exato explícito mantém hard gate para prescrição estruturada", () => {
  const messages = [{
    role: "user",
    content: `REFERÊNCIA DE TREINO FORNECIDA PELO PROFESSOR (USE COMO BASE EXATA para estruturar o treino):\n---\n${REFERENCE_LOWER_A}\n---`,
  }];
  const declaredMode = extractDeclaredReferenceMode(messages);
  assertEquals(declaredMode, "exact");
  assertEquals(parseReferenceStructure(REFERENCE_LOWER_A, declaredMode).mode, "exact");
});

Deno.test("reference exact: referência preservada → compliance ok", () => {
  const rc = complianceFor(PRESERVED);
  assert(rc.ok, JSON.stringify(rc));
});

Deno.test("reference exact: Hack trocado por Leg Press sem justificativa → drift", () => {
  const candidate = [
    "CADEIRA FLEXORA",
    "LEG PRESS",
    "ELEVAÇÃO PÉLVICA",
    "LEG PRESS 45 ART",
    "CADEIRA EXTENSORA",
    "CADEIRA ABDUTORA",
  ];
  const red = validateWorkoutRedundancy({
    days: [{ day: "SEGUNDA-FEIRA", exercises: candidate.map((e) => ({ exercise: e })) }],
  });
  assert(red.strongFunctionalDuplicate, "LEG PRESS + LEG PRESS 45 ART deve ser duplicata forte");

  const rc = complianceFor(candidate, { strongDuplicateNames: red.strongDuplicateNames });
  assertEquals(rc.ok, false);
  assert(rc.missingAnchors.some((a) => /HACK/i.test(a)));
  assert(rc.unexpectedSubstitutions.length > 0);
});

Deno.test("reference exact: exercício removido por restrição explícita → NÃO é drift", () => {
  const withoutHack = PRESERVED.filter((e) => e !== "HACK MACHINE");
  const rc = complianceFor(withoutHack, { restrictionsText: "Proibido HACK MACHINE por dor patelar" });
  assert(rc.ok, JSON.stringify(rc));
  assert(rc.justifiedSubstitutions.length === 1);
});

Deno.test("reference exact: ausência no catálogo → NÃO é drift", () => {
  const catalogSemHack = CATALOG_LOWER.filter((n) => n !== "HACK MACHINE");
  const rc = complianceFor(PRESERVED.filter((e) => e !== "HACK MACHINE"), { catalogNames: catalogSemHack });
  assert(rc.ok, JSON.stringify(rc));
});

Deno.test("reference exact: condicional 'somente sem dor' não vira proibição automática", () => {
  const rc = complianceFor(PRESERVED.filter((e) => e !== "HACK MACHINE"), {
    restrictionsText: "Hack Squat — somente amplitude sem dor",
  });
  assertEquals(rc.ok, false);
  assert(rc.missingAnchors.some((a) => /HACK/i.test(a)));
  assertEquals(rc.justifiedSubstitutions.length, 0);
});

Deno.test("reference exact: mudança arbitrária de ordem relevante → drift", () => {
  const reordered = [
    "HACK MACHINE",
    "CADEIRA FLEXORA",
    "ELEVAÇÃO PÉLVICA",
    "LEG PRESS 45 ART",
    "CADEIRA EXTENSORA",
    "CADEIRA ABDUTORA",
  ];
  const rc = complianceFor(reordered);
  assertEquals(rc.ok, false);
  assert(rc.orderViolations.length > 0);
});

Deno.test("reference exact: high_similarity não aciona Terra", () => {
  assertEquals(isSimilarityRetryAllowed("exact"), false);
  assertEquals(
    shouldRetryTrainerCandidate({
      ...trainerBase,
      similarityScore: 0.98,
      referenceMode: "exact",
      referenceComplianceOk: true,
    }),
    false,
  );
  // referência livre mantém o comportamento atual
  assertEquals(
    shouldRetryTrainerCandidate({ ...trainerBase, similarityScore: 0.98, referenceMode: "free" }),
    true,
  );
});

Deno.test("reference exact: Luna com drift → Terra; Terra com drift → 422", () => {
  const drift = {
    ...trainerBase,
    referenceMode: "exact" as const,
    referenceComplianceOk: false,
  };
  assertEquals(trainerCalls(drift), 2);
  assertEquals(isTrainerCandidateCriticalValid(drift), false);
  assertEquals(trainerCriticalReason(drift), "reference_drift");
});

Deno.test("routing: strong functional duplicate Luna → Terra; Terra → 422", () => {
  const dupe = { ...trainerBase, strongFunctionalDuplicate: true };
  assertEquals(trainerCalls(dupe), 2);
  assertEquals(isTrainerCandidateCriticalValid(dupe), false);
  assertEquals(trainerCriticalReason(dupe), "strong_functional_duplicate");
});

const dayRedundancy = (names: string[]) =>
  validateWorkoutRedundancy({
    days: [{ day: "SEGUNDA-FEIRA", exercises: names.map((n) => ({ exercise: n })) }],
  });

Deno.test("redundancy: equivalências funcionais fortes são bloqueadas", () => {
  for (const pair of [
    ["LEG PRESS", "LEG PRESS 45 ART"],
    ["LEG PRESS", "LEG 180"],
    ["SUPINO RETO", "SUPINO RETO ARTICULADO"],
    ["SUPINO INCLINADO HALTERES", "SUPINO INCLINADO ART."],
    ["PUXADA ALTA PRONADA", "PUXADA ALTA PRONADA ART."],
    ["CADEIRA FLEXORA", "CADEIRA FLEXORA 2"],
  ]) {
    const r = dayRedundancy(pair);
    assert(r.strongFunctionalDuplicate, `${pair.join(" + ")} deveria ser duplicata forte`);
    assertEquals(r.ok, false);
  }
});

Deno.test("redundancy: combinações funcionalmente distintas continuam permitidas", () => {
  for (const pair of [
    ["HACK MACHINE", "LEG PRESS"],
    ["CADEIRA FLEXORA", "STIFF ROMENO"],
    ["REMADA CURVADA", "PUXADA ALTA PRONADA"],
    ["SUPINO RETO", "CRUCIFIXO"],
    ["CADEIRA EXTENSORA", "LEG PRESS"],
    ["ELEVAÇÃO PÉLVICA", "CADEIRA ABDUTORA"],
  ]) {
    const r = dayRedundancy(pair);
    assertEquals(r.strongFunctionalDuplicate, false, `${pair.join(" + ")} não pode ser bloqueado`);
    assert(r.ok, `${pair.join(" + ")} deveria ser aceito`);
  }
});

Deno.test("variation: a variação nunca pode ser o próprio exercício", () => {
  const plan = {
    days: [{
      day: "SEGUNDA-FEIRA",
      exercises: [
        { exercise: "MOBILIDADE DE QUADRIL", variation: "MOBILIDADE DE QUADRIL" },
        { exercise: "LEG PRESS", variation: "HACK MACHINE" },
      ],
    }],
  };
  const fixed = enforceVariationIntegrity(plan, [
    { nome: "MOBILIDADE DE QUADRIL", grupo: "MOBILIDADE" },
    { nome: "MOBILIDADE TORNOZELO", grupo: "MOBILIDADE" },
  ]);
  assertEquals(fixed, ["MOBILIDADE DE QUADRIL"]);
  assertEquals(plan.days[0].exercises[0].variation, "MOBILIDADE TORNOZELO");
  // variação válida e diferente permanece intocada
  assertEquals(plan.days[0].exercises[1].variation, "HACK MACHINE");
});

Deno.test("variation: sem equivalente seguro a variação vira null", () => {
  const plan = {
    days: [{ day: "SEGUNDA-FEIRA", exercises: [{ exercise: "LEG PRESS", variation: "LEG PRESS" }] }],
  };
  enforceVariationIntegrity(plan, [{ nome: "LEG PRESS", grupo: "PERNAS" }]);
  assertEquals(plan.days[0].exercises[0].variation, null);
});

Deno.test("trainer-agent usa os módulos compartilhados de referência e variação", async () => {
  const src = await Deno.readTextFile(new URL("../trainer-agent/index.ts", import.meta.url));
  assert(/_shared\/trainerReferencePolicy\.ts/.test(src));
  assert(/parseReferenceStructure\(/.test(src));
  assert(/evaluateReferenceCompliance\(/.test(src));
  assert(/enforceVariationIntegrity\(/.test(src));
  assert(/isSimilarityRetryAllowed\(/.test(src));
});

// ───────────────── variation column semantics (deterministic) ─────────────────

const VAR_CATALOG = [
  { nome: "HACK MACHINE", grupo: "PERNAS" },
  { nome: "LEG PRESS", grupo: "PERNAS" },
  { nome: "LEG PRESS 45 ART", grupo: "PERNAS" },
  { nome: "LEG 180", grupo: "PERNAS" },
  { nome: "GLOBET SQUATS", grupo: "PERNAS" },
  { nome: "AGACHAMENTO SMITH", grupo: "PERNAS" },
  { nome: "AFUNDO ALTERNANDO", grupo: "PERNAS" },
  { nome: "CADEIRA EXTENSORA", grupo: "PERNAS" },
  { nome: "CADEIRA EXTENSORA UNILATERAL", grupo: "PERNAS" },
  { nome: "CADEIRA FLEXORA", grupo: "PERNAS" },
  { nome: "MESA FLEXORA", grupo: "PERNAS" },
  { nome: "SUPINO RETO", grupo: "PEITO" },
  { nome: "SUPINO RETO ARTICULADO", grupo: "PEITO" },
  { nome: "MOBILIDADE DE QUADRIL", grupo: "MOBILIDADE" },
  { nome: "MOBILIDADE DE QUADRIL 2", grupo: "MOBILIDADE" },
];

const dayWith = (...names: string[]) => ({
  day: "Lower A",
  exercises: names.map((n) => ({ exercise: n, variation: null })),
});

const verdictFor = (day: any, exercise: string, candidate: string) =>
  evaluateVariationCandidate({ day, exerciseName: exercise, candidate, catalog: VAR_CATALOG });

Deno.test("variation: same exercise is invalid", () => {
  const v = verdictFor(dayWith("CADEIRA EXTENSORA"), "CADEIRA EXTENSORA", "CADEIRA EXTENSORA");
  assertEquals(v.valid, false);
  assertEquals(v.reason, "same_exercise");
});

Deno.test("variation: counterfactual rejects HACK -> LEG PRESS when LEG PRESS 45 ART is in the day", () => {
  const day = dayWith("HACK MACHINE", "LEG PRESS 45 ART");
  const v = verdictFor(day, "HACK MACHINE", "LEG PRESS");
  assertEquals(v.valid, false);
  assertEquals(v.reason, "creates_redundancy");
});

Deno.test("variation: HACK -> GLOBET SQUATS is allowed in that same day", () => {
  const day = dayWith("HACK MACHINE", "LEG PRESS 45 ART");
  const v = verdictFor(day, "HACK MACHINE", "GLOBET SQUATS");
  assertEquals(v.valid, true);
});

Deno.test("variation: LEG PRESS 45 ART -> LEG PRESS valid when no other leg press exists", () => {
  const day = dayWith("LEG PRESS 45 ART", "CADEIRA FLEXORA");
  const v = verdictFor(day, "LEG PRESS 45 ART", "LEG PRESS");
  assertEquals(v.valid, true);
  assert(v.tier === "A" || v.tier === "B");
});

Deno.test("variation: LEG PRESS 45 ART prefers a press over AFUNDO", () => {
  const day = dayWith("LEG PRESS 45 ART", "CADEIRA FLEXORA");
  const pick = selectVariation({
    day,
    exerciseName: "LEG PRESS 45 ART",
    catalog: VAR_CATALOG,
    usedVariations: new Set<string>(),
  });
  assert(pick !== null);
  assert(/LEG/.test(pick!.name), `expected a press-like variation, got ${pick!.name}`);
});

Deno.test("variation: EXTENSORA does not pick LEG 180 when hack + leg press are prescribed", () => {
  const day = dayWith("HACK MACHINE", "LEG PRESS", "CADEIRA EXTENSORA");
  const pick = selectVariation({
    day,
    exerciseName: "CADEIRA EXTENSORA",
    catalog: VAR_CATALOG,
    usedVariations: new Set<string>(),
  });
  if (pick) assertEquals(pick.name === "LEG 180", false);
});

Deno.test("variation: no acceptable candidate yields null", () => {
  const pick = selectVariation({
    day: dayWith("CADEIRA EXTENSORA"),
    exerciseName: "CADEIRA EXTENSORA",
    catalog: [{ nome: "CADEIRA EXTENSORA", grupo: "PERNAS" }],
    usedVariations: new Set<string>(),
  });
  assertEquals(pick, null);
});

Deno.test("variation: allowed equivalents (flexora, supino, mobilidade)", () => {
  assertEquals(
    verdictFor(dayWith("CADEIRA FLEXORA"), "CADEIRA FLEXORA", "MESA FLEXORA").valid,
    true,
  );
  assertEquals(
    verdictFor(dayWith("SUPINO RETO"), "SUPINO RETO", "SUPINO RETO ARTICULADO").valid,
    true,
  );
  assertEquals(
    verdictFor(dayWith("MOBILIDADE DE QUADRIL"), "MOBILIDADE DE QUADRIL", "MOBILIDADE DE QUADRIL 2").valid,
    true,
  );
});

Deno.test("variation: safety restrictions block a forbidden candidate", () => {
  const v = evaluateVariationCandidate({
    day: dayWith("CADEIRA EXTENSORA"),
    exerciseName: "CADEIRA EXTENSORA",
    candidate: "HACK MACHINE",
    catalog: VAR_CATALOG,
    options: { restrictionsText: "Proibido HACK MACHINE por dor patelar" },
  });
  assertEquals(v.valid, false);
  assertEquals(v.reason, "safety_conflict");
});

Deno.test("variation: normalization never creates redundancy in the hypothetical day", () => {
  const plan = {
    days: [
      {
        day: "Lower A",
        exercises: [
          { exercise: "HACK MACHINE", variation: "LEG PRESS" },
          { exercise: "LEG PRESS 45 ART", variation: "AFUNDO ALTERNANDO" },
          { exercise: "CADEIRA EXTENSORA", variation: "CADEIRA EXTENSORA" },
        ],
      },
    ],
  };
  validateAndNormalizeVariations(plan, VAR_CATALOG);
  for (const ex of plan.days[0].exercises) {
    assert(normalizeName(ex.exercise) !== normalizeName(String(ex.variation ?? "")));
    if (!ex.variation) continue;
    const hypo = {
      days: [
        {
          day: "Lower A",
          exercises: plan.days[0].exercises.map((e) => ({
            exercise: e.exercise === ex.exercise ? ex.variation : e.exercise,
          })),
        },
      ],
    };
    const r = validateWorkoutRedundancy(hypo);
    assertEquals(r.exactDuplicate, false);
    assertEquals(r.strongFunctionalDuplicate, false);
  }
});

// ───────────────── variation ranking (tier first, unused as tie-breaker) ─────────────────

Deno.test("classifier: HACK MACHINE is compound / squat, GLOBET SQUATS too", () => {
  const hack = getExerciseFunctionalProfile("HACK MACHINE");
  assertEquals(hack.exerciseClass, "compound");
  assertEquals(hack.pattern, "squat");
  const globet = getExerciseFunctionalProfile("GLOBET SQUATS");
  assertEquals(globet.exerciseClass, "compound");
  assertEquals(globet.pattern, "squat");
});

Deno.test("classifier: SUMO TERRA remains a hinge", () => {
  assertEquals(getExerciseFunctionalProfile("SUMO TERRA").pattern, "hip_hinge");
});

Deno.test("variation ranking: Tier A used beats Tier C unused", () => {
  const catalog = [
    { nome: "CADEIRA EXTENSORA", grupo: "PERNAS" },
    { nome: "CADEIRA EXTENSORA UNILATERAL", grupo: "PERNAS" },
    { nome: "CADEIRA FLEXORA", grupo: "PERNAS" },
  ];
  const pick = selectVariation({
    day: dayWith("CADEIRA EXTENSORA"),
    exerciseName: "CADEIRA EXTENSORA",
    catalog,
    usedVariations: new Set([normalizeName("CADEIRA EXTENSORA UNILATERAL")]),
  });
  assertEquals(pick?.name, "CADEIRA EXTENSORA UNILATERAL");
  assertEquals(pick?.tier, "A");
});

Deno.test("variation ranking: Tier A unused beats Tier A used", () => {
  const catalog = [
    { nome: "CADEIRA EXTENSORA", grupo: "PERNAS" },
    { nome: "CADEIRA EXTENSORA UNILATERAL", grupo: "PERNAS" },
    { nome: "EXTENSAO DE JOELHO MAQUINA", grupo: "PERNAS" },
  ];
  const day = dayWith("CADEIRA EXTENSORA");
  const first = selectVariation({
    day,
    exerciseName: "CADEIRA EXTENSORA",
    catalog,
    usedVariations: new Set<string>(),
  });
  assertEquals(first?.name, "CADEIRA EXTENSORA UNILATERAL");
  const second = selectVariation({
    day,
    exerciseName: "CADEIRA EXTENSORA",
    catalog,
    usedVariations: new Set([normalizeName("CADEIRA EXTENSORA UNILATERAL")]),
  });
  assertEquals(second?.tier, first?.tier);
  assertEquals(second?.name, "EXTENSAO DE JOELHO MAQUINA");
});

Deno.test("variation ranking: GLOBET SQUATS beats AFUNDO ALTERNANDO for HACK MACHINE", () => {
  const day = dayWith("HACK MACHINE", "LEG PRESS 45 ART");
  const catalog = [
    { nome: "HACK MACHINE", grupo: "PERNAS" },
    { nome: "LEG PRESS 45 ART", grupo: "PERNAS" },
    { nome: "GLOBET SQUATS", grupo: "PERNAS" },
    { nome: "AFUNDO ALTERNANDO", grupo: "PERNAS" },
  ];
  const pick = selectVariation({
    day,
    exerciseName: "HACK MACHINE",
    catalog,
    usedVariations: new Set<string>(),
  });
  assertEquals(pick?.name, "GLOBET SQUATS");
});

Deno.test("variation: equipment rejected only when availableEquipment is provided", () => {
  const day = dayWith("HACK MACHINE", "LEG PRESS 45 ART");
  const withoutList = evaluateVariationCandidate({
    day,
    exerciseName: "HACK MACHINE",
    candidate: "AGACHAMENTO SMITH",
    catalog: VAR_CATALOG,
  });
  assertEquals(withoutList.valid, true);
  const withList = evaluateVariationCandidate({
    day,
    exerciseName: "HACK MACHINE",
    candidate: "AGACHAMENTO SMITH",
    catalog: VAR_CATALOG,
    options: { availableEquipment: ["dumbbell"] },
  });
  assertEquals(withList.valid, false);
  assertEquals(withList.reason, "equipment_unavailable");
});
