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
  finalModel: string | null;
  lastAttemptModel: string;
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

/**
 * Creates routing and usage metadata for AI responses.
 * @param attempts List of model attempts made.
 * @param fallbackReason The primary reason for fallback.
 * @param fallbackReasons All reasons that triggered retries.
 * @param selectedModel The model that produced the final accepted candidate.
 */
export function createRoutingMetadata(
  attempts: AIAttemptMetadata[],
  fallbackReason: string | null,
  fallbackReasons?: string[],
  selectedModel: string | null = null
): AIRouterResponse {
  if (attempts.length === 0) {
    throw new Error("createRoutingMetadata: zero attempts provided (invariant error)");
  }

  const fallbackUsed = attempts.length > 1;
  const lastAttempt = attempts[attempts.length - 1];
  
  const totalPrompt = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage == null || curr.usage.promptTokens == null) ? null : acc + (curr.usage.promptTokens || 0), 0 as number | null);
  const totalCompletion = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage == null || curr.usage.completionTokens == null) ? null : acc + (curr.usage.completionTokens || 0), 0 as number | null);
  const totalTokens = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage == null || curr.usage.totalTokens == null) ? null : acc + (curr.usage.totalTokens || 0), 0 as number | null);

  return {
    routing: {
      primaryModel: AI_MODELS.primary,
      finalModel: selectedModel,
      lastAttemptModel: lastAttempt.model,
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

/**
 * Enhanced AI call with routing and fallback logic.
 * USES OFFICIAL OPENAI API as requested.
 */
export async function callAI(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  response_format?: any;
}): Promise<{ content: string | null; usage: AIAttemptMetadata["usage"]; durationMs: number }> {
  const start = Date.now();
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    console.error("callAI: OPENAI_API_KEY not found");
    return { content: null, usage: null, durationMs: 0 };
  }

  // GPT-5.x models reject `max_tokens` and non-default `temperature`.
  const isNextGen = /^gpt-5/.test(params.model);
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    response_format: params.response_format,
  };
  if (isNextGen) {
    body.max_completion_tokens = params.maxTokens ?? 4000;
  } else {
    body.max_tokens = params.maxTokens ?? 4000;
    body.temperature = params.temperature ?? 0.7;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });


    const durationMs = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      console.error(`OpenAI API Error (${params.model}):`, data);
      return { content: null, usage: null, durationMs };
    }

    return {
      content: data.choices[0]?.message?.content || null,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? null,
        completionTokens: data.usage?.completion_tokens ?? null,
        totalTokens: data.usage?.total_tokens ?? null,
      },
      durationMs,
    };
  } catch (error) {
    console.error(`OpenAI API Exception (${params.model}):`, error);
    return { content: null, usage: null, durationMs: Date.now() - start };
  }
}
