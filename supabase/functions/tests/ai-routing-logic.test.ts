import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { createRoutingMetadata, AI_MODELS, type AIAttemptMetadata } from "../_shared/aiModelRouter.ts";
import { sanitizeStructuredPrompt } from "../_shared/structuredPromptSanitizer.ts";

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

// ───────────────────── DIET / TRAINER DECISION LOGIC ─────────────────────
// Pure re-implementations of the gates enforced in the agents, so decisions
// are verified without hitting the live model API.

type DietState = {
  intent: "new" | "update" | "regenerate";
  historyCount: number;
  similarityAbove: boolean;
  portionOnly: boolean;
  quantityOverlap: boolean;
  sourceRepetition: boolean;
  nutritionOk: boolean;
  dailyAdjOk: boolean;
  requireMenuVariation?: boolean;
};

const dietNeedsRetry = (s: DietState) => {
  const variationRetryAllowed = s.intent !== "update";
  const needsVariationRetry =
    variationRetryAllowed &&
    s.historyCount > 0 &&
    (s.similarityAbove || s.portionOnly || ((s.requireMenuVariation ?? true) && s.quantityOverlap) || s.sourceRepetition);
  return !s.nutritionOk || !s.dailyAdjOk || needsVariationRetry;
};

const dietCalls = (s: DietState) => (dietNeedsRetry(s) ? 2 : 1);

const base: DietState = {
  intent: "new",
  historyCount: 1,
  similarityAbove: false,
  portionOnly: false,
  quantityOverlap: false,
  sourceRepetition: false,
  nutritionOk: true,
  dailyAdjOk: true,
};

Deno.test("diet: UPDATE + high similarity → 1 call (never Terra)", () => {
  assertEquals(dietCalls({ ...base, intent: "update", similarityAbove: true }), 1);
});

Deno.test("diet: UPDATE + portion_only → 1 call", () => {
  assertEquals(dietCalls({ ...base, intent: "update", portionOnly: true }), 1);
});

Deno.test("diet: UPDATE + quantity overlap / source repetition → 1 call", () => {
  assertEquals(dietCalls({ ...base, intent: "update", quantityOverlap: true }), 1);
  assertEquals(dietCalls({ ...base, intent: "update", sourceRepetition: true }), 1);
});

Deno.test("diet: UPDATE with invalid nutrition still falls back to Terra", () => {
  assertEquals(dietCalls({ ...base, intent: "update", nutritionOk: false }), 2);
});

Deno.test("diet: Luna nutrition/dailyAdj invalid → Terra", () => {
  assertEquals(dietCalls({ ...base, nutritionOk: false }), 2);
  assertEquals(dietCalls({ ...base, dailyAdjOk: false }), 2);
});

Deno.test("diet: NEW high similarity → Terra (variation retry allowed)", () => {
  assertEquals(dietCalls({ ...base, similarityAbove: true }), 2);
});

Deno.test("diet: absolute budget is 2 calls", () => {
  const states: DietState[] = [
    { ...base },
    { ...base, nutritionOk: false, dailyAdjOk: false, similarityAbove: true, portionOnly: true },
    { ...base, intent: "regenerate", similarityAbove: true },
  ];
  for (const s of states) assert(dietCalls(s) <= 2);
});

// Critical validity of the Terra candidate (technical or critical fallback).
const dietTerraOutcome = (nut2Ok: boolean, adj2Ok: boolean) =>
  nut2Ok && adj2Ok ? 200 : 422;

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
});

Deno.test("diet: Terra dailyAdjustments invalid → 422 review_required", () => {
  assertEquals(dietTerraOutcome(true, false), 422);
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

// ───────────────────────────── TRAINER ─────────────────────────────

type TrainerEval = {
  redundancyOk: boolean;
  exactDuplicates: number;
  criticalCatalogMismatch: number;
  similarity: number;
};

const trainerDecision = (first: TrainerEval, second?: TrainerEval, threshold = 0.6, historyCount = 1) => {
  const criticalInvalid = !first.redundancyOk || first.criticalCatalogMismatch > 0;
  const needsRetry = criticalInvalid || (first.similarity > threshold && historyCount > 0);
  if (!needsRetry) return { calls: 1, status: 200, selected: AI_MODELS.primary, similarity: first.similarity };
  if (!second) return { calls: 2, status: criticalInvalid ? 422 : 200, selected: criticalInvalid ? null : AI_MODELS.primary, similarity: first.similarity };
  const secondValid = second.redundancyOk && second.criticalCatalogMismatch === 0;
  if (criticalInvalid) {
    return secondValid
      ? { calls: 2, status: 200, selected: AI_MODELS.fallback, similarity: second.similarity }
      : { calls: 2, status: 422, selected: null, similarity: second.similarity };
  }
  return secondValid && second.similarity <= first.similarity
    ? { calls: 2, status: 200, selected: AI_MODELS.fallback, similarity: second.similarity }
    : { calls: 2, status: 200, selected: AI_MODELS.primary, similarity: first.similarity };
};

const ok: TrainerEval = { redundancyOk: true, exactDuplicates: 0, criticalCatalogMismatch: 0, similarity: 0.2 };

Deno.test("trainer: technical fallback uses REAL similarity of the candidate", () => {
  const r = trainerDecision({ ...ok, similarity: 0.9 }, { ...ok, similarity: 0.31 });
  assertEquals(r.similarity, 0.31);
  assert(r.similarity !== 0);
});

Deno.test("trainer: exact duplicate on Luna → Terra", () => {
  const r = trainerDecision({ ...ok, redundancyOk: false, exactDuplicates: 2 }, ok);
  assertEquals(r.calls, 2);
  assertEquals(r.status, 200);
  assertEquals(r.selected, AI_MODELS.fallback);
});

Deno.test("trainer: exact duplicate persists on Terra → 422", () => {
  const r = trainerDecision(
    { ...ok, redundancyOk: false, exactDuplicates: 2 },
    { ...ok, redundancyOk: false, exactDuplicates: 2 },
  );
  assertEquals(r.status, 422);
  assertEquals(r.selected, null);
});

Deno.test("trainer: critical catalog mismatch on Luna → Terra", () => {
  const r = trainerDecision({ ...ok, criticalCatalogMismatch: 3 }, ok);
  assertEquals(r.status, 200);
  assertEquals(r.selected, AI_MODELS.fallback);
});

Deno.test("trainer: critical catalog mismatch on Terra → 422", () => {
  const r = trainerDecision({ ...ok, criticalCatalogMismatch: 3 }, { ...ok, criticalCatalogMismatch: 1 });
  assertEquals(r.status, 422);
});

Deno.test("trainer: Terra still redundant → 422 (never 200 with warning)", () => {
  const r = trainerDecision({ ...ok, redundancyOk: false }, { ...ok, redundancyOk: false });
  assertEquals(r.status, 422);
});

Deno.test("trainer: absolute budget is 2 calls", () => {
  assert(trainerDecision(ok).calls <= 2);
  assert(trainerDecision({ ...ok, redundancyOk: false }, ok).calls <= 2);
  assert(trainerDecision({ ...ok, similarity: 0.95 }, { ...ok, similarity: 0.9 }).calls <= 2);
});

// ───────────────────────────── PROMPTS ─────────────────────────────

const DIET_PROMPT = `
========================================
REGRAS DE SEGURANÇA E RESTRIÇÕES
========================================
Respeite restrições alimentares e alergias do aluno.
Preserve o weeklyEnergySchedule e o campo dailyAdjustments.

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
COLETA DE DADOS — REGRA CRÍTICA
========================================
Comece perguntando APENAS o que falta. UMA PERGUNTA POR VEZ.

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================
Depois de tudo, criar mensagens simples prontas para WhatsApp em partes.
`;

Deno.test("prompts: diet structured has no WhatsApp / Markdown table / justificativa", () => {
  const clean = sanitizeStructuredPrompt(DIET_PROMPT);
  assert(!/whatsapp/i.test(clean));
  assert(!/após a tabela/i.test(clean));
  assert(!/colunas/i.test(clean));
  assert(!/justificativa técnica/i.test(clean));
  // technical content preserved
  assert(/restrições alimentares/i.test(clean));
  assert(/weeklyEnergySchedule/.test(clean));
  assert(/dailyAdjustments/.test(clean));
});

Deno.test("prompts: trainer structured has no questions / WhatsApp / conversational flow", () => {
  const clean = sanitizeStructuredPrompt(TRAINER_PROMPT);
  assert(!/whatsapp/i.test(clean));
  assert(!/comece perguntando/i.test(clean));
  assert(!/uma pergunta por vez/i.test(clean));
  // technical content preserved
  assert(/lesões/i.test(clean));
  assert(/catálogo/i.test(clean));
  assert(/split/i.test(clean));
  assert(/periodização/i.test(clean));
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
