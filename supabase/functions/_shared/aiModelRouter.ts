/**
 * Shared AI Model Router for MAROMBIEW.
 * Centralizes model selection and environment overrides.
 */

export const AI_MODELS = {
  primary: Deno.env.get("AI_PRIMARY_MODEL") ?? "gpt-5.6-luna",
  fallback: Deno.env.get("AI_FALLBACK_MODEL") ?? "gpt-5.6-terra",
};

export type AIRoutingMetadata = {
  primaryModel: string;
  finalModel: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  fallbackReasons?: string[];
  attempts: number;
};

export type AIAttemptMetadata = {
  model: string;
  durationMs: number;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
  reason?: string | null;
};

export type AIUsageMetadata = {
  attempts: AIAttemptMetadata[];
  totalPromptTokens: number | null;
  totalCompletionTokens: number | null;
  totalTokens: number | null;
};

export type AIRouterResponse = {
  routing: AIRoutingMetadata;
  usage: AIUsageMetadata;
};

export type ModelCallFailure = {
  code:
    | "upstream_error"
    | "empty_response"
    | "invalid_json"
    | "plan_validation_failed"
    | "daily_adjustments_invalid"
    | "nutrition_invalid"
    | "high_similarity"
    | "internal_redundancy"
    | "catalog_mismatch"
    | "portion_only"
    | "high_quantity_overlap"
    | "source_repetition"
    | "critical_failure";
  retryable: boolean;
  status?: number;
};

export function createRoutingMetadata(
  attempts: AIAttemptMetadata[],
  fallbackReason: string | null,
  fallbackReasons?: string[]
): AIRouterResponse {
  if (attempts.length === 0) {
    throw new Error("createRoutingMetadata: attempts array cannot be empty");
  }
  const fallbackUsed = attempts.length > 1;
  const finalAttempt = attempts[attempts.length - 1];
  
  const totalPrompt = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage?.promptTokens === null || curr.usage?.promptTokens === undefined) ? null : acc + (curr.usage?.promptTokens || 0), 0 as number | null);
  const totalCompletion = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage?.completionTokens === null || curr.usage?.completionTokens === undefined) ? null : acc + (curr.usage?.completionTokens || 0), 0 as number | null);
  const totalTokens = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage?.totalTokens === null || curr.usage?.totalTokens === undefined) ? null : acc + (curr.usage?.totalTokens || 0), 0 as number | null);

  return {
    routing: {
      primaryModel: AI_MODELS.primary,
      finalModel: finalAttempt ? finalAttempt.model : AI_MODELS.primary,
      fallbackUsed,
      fallbackReason,
      fallbackReasons,
      attempts: attempts.length,
    },
    usage: {
      attempts,
      totalPromptTokens: totalPrompt,
      totalCompletionTokens: totalCompletion,
      totalTokens: totalTokens,
    },
  };
}
