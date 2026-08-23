import { assertEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { createRoutingMetadata, AI_MODELS } from "../_shared/aiModelRouter.ts";

Deno.test("createRoutingMetadata - single attempt success", () => {
  const attempts = [{
    model: AI_MODELS.primary,
    durationMs: 1000,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    reason: "first_attempt"
  }];
  
  const result = createRoutingMetadata(attempts, null, [], AI_MODELS.primary);
  
  assertEquals(result.routing.primaryModel, AI_MODELS.primary);
  assertEquals(result.routing.finalModel, AI_MODELS.primary);
  assertEquals(result.routing.lastAttemptModel, AI_MODELS.primary);
  assertEquals(result.routing.fallbackUsed, false);
  assertEquals(result.routing.attempts, 1);
  assertEquals(result.usage.totalTokens, 150);
});

Deno.test("createRoutingMetadata - fallback success", () => {
  const attempts = [
    {
      model: AI_MODELS.primary,
      durationMs: 1000,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      reason: "first_attempt"
    },
    {
      model: AI_MODELS.fallback,
      durationMs: 1200,
      usage: { promptTokens: 110, completionTokens: 60, totalTokens: 170 },
      reason: "critical_fallback"
    }
  ];
  
  const result = createRoutingMetadata(attempts, "invalid_json", ["invalid_json"], AI_MODELS.fallback);
  
  assertEquals(result.routing.finalModel, AI_MODELS.fallback);
  assertEquals(result.routing.fallbackUsed, true);
  assertEquals(result.routing.fallbackReason, "invalid_json");
  assertEquals(result.routing.attempts, 2);
  assertEquals(result.usage.totalTokens, 320);
});

Deno.test("createRoutingMetadata - technical failure (no final model)", () => {
  const attempts = [
    {
      model: AI_MODELS.primary,
      durationMs: 500,
      usage: null,
      reason: "first_attempt"
    },
    {
      model: AI_MODELS.fallback,
      durationMs: 500,
      usage: null,
      reason: "critical_fallback"
    }
  ];
  
  const result = createRoutingMetadata(attempts, "upstream_error", ["upstream_error"], null);
  
  assertEquals(result.routing.finalModel, null);
  assertEquals(result.routing.fallbackUsed, true);
  assertEquals(result.routing.attempts, 2);
});
