import Ajv from "npm:ajv@8";
import { createRoutingMetadata as originalRoutingMetadata } from "./aiModelRouter.ts";

// Only imported by prescription agents; the existing OpenAI router stays unchanged.
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
export const PRESCRIPTION_MODEL = "claude-sonnet-5";
export const AI_MODELS = { primary: PRESCRIPTION_MODEL, fallback: PRESCRIPTION_MODEL };
export const createRoutingMetadata: typeof originalRoutingMetadata = (...args) => {
  const result = originalRoutingMetadata(...args);
  return { ...result, routing: { ...result.routing, primaryModel: PRESCRIPTION_MODEL } };
};

export function anthropicError(status: number, body: string): Error & { status: number; upstreamStatus: number } {
  const credits = /credit|billing/i.test(body) || [401, 402, 403].includes(status);
  const message = status === 429 ? "Muitas solicitações agora. Tente de novo em instantes."
    : credits ? "Créditos de IA esgotados."
    : "Não foi possível consultar a IA agora.";
  return Object.assign(new Error(message), {
    status: status === 429 ? 429 : credits ? 402 : 500,
    upstreamStatus: status,
  });
}

export function anthropicErrorStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error && [402, 429, 500].includes(Number(error.status))) {
    return Number(error.status);
  }
  return 500;
}

type ChatBody = {
  model?: string;
  messages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }>;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  stream?: boolean;
  response_format?: { type: string; json_schema?: { schema: any; strict?: boolean } };
  tools?: Array<{ type: string; function: { name: string; description?: string; parameters: any; strict?: boolean } }>;
  tool_choice?: string | { type: string; function?: { name: string } };
};

const ajv = new Ajv({ strict: false, allErrors: true });
const JSON_TOOL = "return_json";

/** Anthropic's SDK performs this same transformation for unsupported bounds.
 * Keep the original schema for validation; do not weaken application constraints. */
function supportedSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(supportedSchema);
  const bounds = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems"];
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!bounds.includes(key)) result[key] = supportedSchema(value);
  }
  const constraints = bounds.filter((key) => key in schema).map((key) => `${key}: ${schema[key]}`);
  if (constraints.length) result.description = [schema.description, constraints.join(", ")].filter(Boolean).join(". ");
  return result;
}

function contentBlocks(content: any): any {
  if (!Array.isArray(content)) return content;
  return content.map((block: any) => {
    if (block.type !== "image_url") return block;
    const url = String(block.image_url?.url ?? "");
    const match = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    return match
      ? { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } }
      : { type: "image", source: { type: "url", url } };
  });
}

function buildRequest(chat: ChatBody) {
  const maxTokens = chat.max_completion_tokens ?? chat.max_tokens;
  if (!Number.isInteger(maxTokens) || Number(maxTokens) < 1) throw new Error("Limite de saída da IA não definido.");
  const system = chat.messages.filter((message) => message.role === "system").map((message) => {
    return typeof message.content === "string" ? [{ type: "text", text: message.content }] : contentBlocks(message.content);
  }).flat();
  const messages = chat.messages.filter((message) => message.role !== "system").map((message) => {
    if (message.role === "tool") {
      return { role: "user", content: [{ type: "tool_result", tool_use_id: message.tool_call_id, content: message.content }] };
    }
    if (message.tool_calls?.length) {
      return {
        role: message.role,
        content: [
          ...(message.content ? (typeof message.content === "string" ? [{ type: "text", text: message.content }] : contentBlocks(message.content)) : []),
          ...message.tool_calls.map((tool: any) => ({ type: "tool_use", id: tool.id, name: tool.function.name, input: JSON.parse(tool.function.arguments) })),
        ],
      };
    }
    return { role: message.role, content: contentBlocks(message.content) };
  });
  const jsonMode = chat.response_format?.type === "json_object";
  const schema = chat.response_format?.type === "json_schema" ? chat.response_format.json_schema?.schema : undefined;
  const body: Record<string, any> = { model: PRESCRIPTION_MODEL, max_tokens: maxTokens, messages, stream: chat.stream === true };
  if (system.length) body.system = system;
  if (chat.temperature !== undefined) body.temperature = chat.temperature;
  if (schema) body.output_config = { format: { type: "json_schema", schema: supportedSchema(schema) } };
  if (chat.tools?.length) {
    body.tools = chat.tools.map((tool) => ({
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      input_schema: tool.function.strict ? supportedSchema(tool.function.parameters) : tool.function.parameters,
      ...(tool.function.strict ? { strict: true } : {}),
    }));
    if (typeof chat.tool_choice === "object" && chat.tool_choice.function) {
      body.tool_choice = { type: "tool", name: chat.tool_choice.function.name };
    } else if (chat.tool_choice === "required") body.tool_choice = { type: "any" };
    else if (chat.tool_choice === "auto") body.tool_choice = { type: "auto" };
    else if (chat.tool_choice === "none") body.tool_choice = { type: "none" };
  } else if (jsonMode) {
    // Messages has no OpenAI json_object mode. Forced object tool retains the
    // existing prompt-defined shape without introducing a new restrictive schema.
    body.tools = [{ name: JSON_TOOL, input_schema: { type: "object" } }];
    body.tool_choice = { type: "tool", name: JSON_TOOL };
  }
  return { body, jsonMode, schema };
}

function usageEnvelope(usage: any) {
  const input = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
  const output = usage?.output_tokens ?? 0;
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
}

function finishReason(reason: string | undefined) {
  return reason === "max_tokens" ? "length" : reason === "tool_use" ? "tool_calls" : "stop";
}

function validateOutput(schema: any, content: string) {
  if (!schema) return;
  const validate = ajv.compile(schema);
  if (!validate(JSON.parse(content))) throw new Error("Resposta estruturada da IA inválida.");
}

function adaptStream(response: Response, jsonMode: boolean, schema: any): Response {
  if (!response.body) throw anthropicError(500, "missing response body");
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let text = "";
  let stopped = false;
  let reason: string | undefined;
  let usage: Record<string, number> = {};
  const blocks = new Map<number, any>();
  const send = (controller: TransformStreamDefaultController<Uint8Array>, chunk: any) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  };
  const event = (raw: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const data = raw.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) return;
    const chunk = JSON.parse(data);
    if (chunk.type === "error") {
      const body = JSON.stringify(chunk);
      console.error("Anthropic error", 200, body);
      const type = chunk.error?.type;
      const status = type === "rate_limit_error" ? 429 : type === "overloaded_error" ? 529
        : type === "authentication_error" ? 401 : type === "permission_error" ? 403 : 500;
      throw anthropicError(status, body);
    }
    if (chunk.type === "message_start") usage = chunk.message?.usage ?? {};
    if (chunk.type === "content_block_start") {
      const block = chunk.content_block;
      blocks.set(chunk.index, block);
      if (block?.type === "text" && block.text && !jsonMode) {
        text += block.text;
        send(controller, { choices: [{ index: 0, delta: { content: block.text }, finish_reason: null }] });
      }
      if (block?.type === "tool_use" && !jsonMode) {
        send(controller, { choices: [{ index: 0, delta: { tool_calls: [{ index: chunk.index, id: block.id, type: "function", function: { name: block.name, arguments: "" } }] }, finish_reason: null }] });
      }
    }
    if (chunk.type === "content_block_delta") {
      const delta = chunk.delta;
      if ((delta?.type === "text_delta" && !jsonMode) || (delta?.type === "input_json_delta" && jsonMode && blocks.get(chunk.index)?.name === JSON_TOOL)) {
        const content = delta.text ?? delta.partial_json ?? "";
        text += content;
        send(controller, { choices: [{ index: 0, delta: { content }, finish_reason: null }] });
      } else if (delta?.type === "input_json_delta") {
        send(controller, { choices: [{ index: 0, delta: { tool_calls: [{ index: chunk.index, function: { arguments: delta.partial_json } }] }, finish_reason: null }] });
      }
    }
    if (chunk.type === "message_delta") {
      usage = { ...usage, ...chunk.usage };
      reason = chunk.delta?.stop_reason;
    }
    if (chunk.type === "message_stop") {
      if (reason !== "max_tokens") {
        validateOutput(schema, text);
        if (jsonMode && !text.trim()) throw anthropicError(500, "empty json response");
      }
      stopped = true;
      send(controller, { choices: [{ index: 0, delta: {}, finish_reason: jsonMode && reason === "tool_use" ? "stop" : finishReason(reason) }], usage: usageEnvelope(usage) });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    }
  };
  const consume = (controller: TransformStreamDefaultController<Uint8Array>) => {
    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      event(buffer.slice(0, index), controller);
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf("\n\n");
    }
  };
  const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(value, controller) {
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      consume(controller);
    },
    flush(controller) {
      buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g, "\n");
      consume(controller);
      if (buffer.trim()) event(buffer, controller);
      if (!stopped) throw anthropicError(500, "incomplete stream");
    },
  }));
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

/** Provider boundary: accepts the existing chat request contract, but NEVER
 * forwards its credentials, URL, model or OpenAI-only parameters upstream. */
export async function anthropicChat(init: RequestInit): Promise<Response> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw anthropicError(500, "missing key");
  const chat = JSON.parse(String(init.body)) as ChatBody;
  const { body, jsonMode, schema } = buildRequest(chat);
  let response: Response;
  try {
    response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: init.signal,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    console.error("Anthropic error", "network failure");
    throw anthropicError(500, "network failure");
  }
  if (!response.ok) {
    const text = await response.text();
    console.error("Anthropic error", response.status, text);
    const mapped = anthropicError(response.status, text);
    // Keep the upstream status available to each agent's retry policy.
    return new Response(JSON.stringify({ error: mapped.message, status: mapped.status }), { status: response.status });
  }
  if (chat.stream) return adaptStream(response, jsonMode, schema);
  const data = await response.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  const jsonBlock = blocks.find((block: any) => block.type === "tool_use" && block.name === JSON_TOOL);
  const content = jsonMode ? (jsonBlock ? JSON.stringify(jsonBlock.input) : "") : blocks.filter((block: any) => block.type === "text").map((block: any) => block.text).join("");
  if (data.stop_reason === "max_tokens") throw anthropicError(500, "truncated output");
  validateOutput(schema, content);
  if (jsonMode && !content.trim()) throw anthropicError(500, "empty json response");
  const toolCalls = blocks.filter((block: any) => block.type === "tool_use" && !jsonMode).map((block: any) => ({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input) } }));
  return new Response(JSON.stringify({
    choices: [{ message: { role: "assistant", content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: jsonMode ? "stop" : finishReason(data.stop_reason) }],
    usage: usageEnvelope(data.usage),
  }), { headers: { "Content-Type": "application/json" } });
}

export async function anthropicFailure(response: Response, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<Response> {
  const data = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({ error: data.error ?? anthropicError(response.status, "").message, ...extra }), {
    status: data.status ?? anthropicError(response.status, "").status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}