import {
  AI_MODELS,
  AIAttemptMetadata,
  AIRouterResponse,
  createRoutingMetadata,
} from "./aiModelRouter.ts";

/**
 * Enhanced AI call with routing and fallback logic.
 * Ensures usage is tracked and errors are handled uniformly.
 */
export async function callAI(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string | null; usage: AIAttemptMetadata["usage"]; durationMs: number }> {
  const start = Date.now();
  const apiToken = Deno.env.get("LOVABLE_AI_API_KEY");
  const gatewayUrl = Deno.env.get("LOVABLE_AI_GATEWAY_URL") || "https://ai-gateway.lovable.app/v1";

  try {
    const response = await fetch(`${gatewayUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 4000,
      }),
    });

    const durationMs = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      console.error(`AI Gateway Error (${params.model}):`, data);
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
    console.error(`AI Gateway Exception (${params.model}):`, error);
    return { content: null, usage: null, durationMs: Date.now() - start };
  }
}
