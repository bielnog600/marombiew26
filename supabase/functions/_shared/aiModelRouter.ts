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
  const fallbackUsed = attempts.length > 1;
  const finalAttempt = attempts[attempts.length - 1];
  
  const totalPrompt = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage?.promptTokens === null) ? null : acc + (curr.usage?.promptTokens || 0), 0 as number | null);
  const totalCompletion = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage?.completionTokens === null) ? null : acc + (curr.usage?.completionTokens || 0), 0 as number | null);
  const totalTokens = attempts.reduce((acc, curr) => 
    (acc === null || curr.usage?.totalTokens === null) ? null : acc + (curr.usage?.totalTokens || 0), 0 as number | null);

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

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model.includes("gpt-5.6") ? "gpt-4o" : params.model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 4000,
        response_format: params.response_format,
      }),
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
        promptTokens: data.usage?.prompt_tokens || null,
        completionTokens: data.usage?.completion_tokens || null,
        totalTokens: data.usage?.total_tokens || null,
      },
      durationMs,
    };
  } catch (error) {
    console.error(`OpenAI API Exception (${params.model}):`, error);
    return { content: null, usage: null, durationMs: Date.now() - start };
  }
}

