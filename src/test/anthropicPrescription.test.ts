import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { TextEncoder, TextDecoder } from "node:util";
import { ReadableStream, TransformStream } from "node:stream/web";

const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const source = readFileSync("supabase/functions/_shared/anthropic.ts", "utf8").replace(/^import .*;\n/gm, "");
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });
const plainResponse = { content: [{ type: "text", text: "Resposta" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };

function setup(response: unknown = plainResponse, status = 200) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => response instanceof Response ? response : new Response(JSON.stringify(response), { status }));
  const error = vi.fn();
  const log = vi.fn();
  const exports: any = {};
  const env = vi.fn((name: string) => name === "ANTHROPIC_API_KEY" ? "test-secret" : undefined);
  runInNewContext(code, {
    exports, Ajv, Deno: { env: { get: env } }, fetch, Response, TextEncoder, TextDecoder, TransformStream,
    console: { error, log }, originalRoutingMetadata: () => ({ routing: { primaryModel: "old" }, usage: {} }),
  });
  const call = (body: unknown, signal?: AbortSignal) => exports.anthropicChat({ body: JSON.stringify(body), signal });
  return { exports, fetch, error, log, env, call };
}

const messages = [{ role: "system", content: "Prompt exato" }, { role: "user", content: "Entrada exata" }];
function sse(events: unknown[], split = 11) {
  const bytes = new TextEncoder().encode(events.map((event) => `event: event\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(""));
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
    controller.close();
  } }) as unknown as BodyInit);
}
const start = { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } };
const stop = [{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }, { type: "message_stop" }];

describe("official Anthropic prescription boundary", () => {
  it("uses official Sonnet 5, the existing secret and exact system/messages", async () => {
    const ctx = setup();
    const data = await (await ctx.call({ model: "old-model", messages, max_tokens: 4000, temperature: 0.4 })).json();
    const [url, init] = ctx.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toEqual({ "x-api-key": "test-secret", "anthropic-version": "2023-06-01", "content-type": "application/json" });
    const sent = JSON.parse(String(init.body));
    expect(sent).toEqual({ model: "claude-sonnet-5", max_tokens: 4000, thinking: { type: "disabled" }, stream: false, system: [{ type: "text", text: "Prompt exato" }], messages: [messages[1]], temperature: 0.4 });
    expect(ctx.env).toHaveBeenCalledWith("ANTHROPIC_API_KEY");
    expect(data.choices[0].message.content).toBe("Resposta");
    expect(data.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  });

  it.each([400, 1200, 2000, 4000, 8000, 16000, 24000])("preserves the %s output budget", async (budget) => {
    const ctx = setup();
    await ctx.call({ messages, max_completion_tokens: budget });
    expect(JSON.parse(String(ctx.fetch.mock.calls[0]?.[1]?.body)).max_tokens).toBe(budget);
  });

  it("requires an explicit budget rather than inventing a limit", async () => {
    const ctx = setup();
    await expect(ctx.call({ messages })).rejects.toThrow("Limite de saída da IA não definido.");
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it("maps function tools and keeps their schema and arguments", async () => {
    const schema = { type: "object", properties: { action: { type: "string", enum: ["manter", "ajustar"] } }, required: ["action"], additionalProperties: false };
    const ctx = setup({ content: [{ type: "tool_use", id: "tool1", name: "recommend_action", input: { action: "manter" } }], stop_reason: "tool_use" });
    const data = await (await ctx.call({ messages, max_tokens: 4000, tools: [{ type: "function", function: { name: "recommend_action", description: "Descrição", parameters: schema } }], tool_choice: { type: "function", function: { name: "recommend_action" } } })).json();
    const sent = JSON.parse(String(ctx.fetch.mock.calls[0]?.[1]?.body));
    expect(sent.tools).toEqual([{ name: "recommend_action", description: "Descrição", input_schema: schema }]);
    expect(sent.tool_choice).toEqual({ type: "tool", name: "recommend_action" });
    expect(JSON.parse(data.choices[0].message.tool_calls[0].function.arguments)).toEqual({ action: "manter" });
  });

  it("returns JSON-object tool output in the existing content field", async () => {
    const ctx = setup({ content: [{ type: "tool_use", name: "return_json", input: { actions: [], summary: "Teste" } }], stop_reason: "tool_use" });
    const data = await (await ctx.call({ messages, max_tokens: 2000, response_format: { type: "json_object" } })).json();
    expect(JSON.parse(data.choices[0].message.content)).toEqual({ actions: [], summary: "Teste" });
    expect(data.choices[0].message.tool_calls).toBeUndefined();
  });

  it('rejects thinking-only responses and logs block types and stop reason', async () => {
    const ctx = setup({ content: [{ type: 'thinking', thinking: 'private reasoning' }], stop_reason: 'max_tokens', usage: { output_tokens: 400 } });
    await expect(ctx.call({ messages, max_tokens: 400 })).rejects.toThrow('Não foi possível consultar a IA agora.');
    expect(ctx.error).toHaveBeenCalledWith('Anthropic error', 200, 'empty response', { stop_reason: 'max_tokens', content_types: ['thinking'], usage: { output_tokens: 400 } });
    expect(JSON.stringify(ctx.error.mock.calls)).not.toContain('private reasoning');
  });

  it('rejects thinking-only streams rather than returning a successful empty answer', async () => {
    const ctx = setup(sse([start, { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }, ...stop]));
    await expect((await ctx.call({ messages, max_tokens: 400, stream: true })).text()).rejects.toThrow('Não foi possível consultar a IA agora.');
    expect(ctx.error).toHaveBeenCalledWith('Anthropic error', 200, 'empty response', expect.objectContaining({ stop_reason: 'end_turn', content_types: ['thinking'] }));
  });

  it("keeps strict original schema validation after Anthropic bound transformation", async () => {
    const schema = { type: "object", properties: { count: { type: "integer", minimum: 1 } }, required: ["count"], additionalProperties: false };
    const body = { messages, max_tokens: 16000, response_format: { type: "json_schema", json_schema: { strict: true, schema } } };
    const ctx = setup({ ...plainResponse, content: [{ type: "text", text: '{"count":2}' }] });
    await ctx.call(body);
    const sent = JSON.parse(String(ctx.fetch.mock.calls[0]?.[1]?.body));
    expect(sent.output_config.format.schema.properties.count).toEqual({ type: "integer", description: "minimum: 1" });
    const invalid = setup({ ...plainResponse, content: [{ type: "text", text: '{"count":0}' }] });
    await expect(invalid.call(body)).rejects.toThrow("Resposta estruturada da IA inválida.");
  });

  it("translates fragmented text SSE, UTF-8, usage, finish and DONE", async () => {
    const ctx = setup(sse([start, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Olá, refeição" } }, ...stop], 1));
    const stream = await (await ctx.call({ messages, max_tokens: 16000, stream: true })).text();
    const events = stream.split("\n\n").filter(Boolean).map((x) => x.slice(6));
    expect(JSON.parse(events[0]).choices[0].delta.content).toBe("Olá, refeição");
    expect(JSON.parse(events[1]).usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
    expect(JSON.parse(events[1]).choices[0].finish_reason).toBe("stop");
    expect(events.at(-1)).toBe("[DONE]");
  });

  it("streams JSON tool fragments as content, not tool_calls", async () => {
    const ctx = setup(sse([start, { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "return_json", id: "t", input: {} } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"days":[' } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ']}' } }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 8 } }, { type: "message_stop" }]));
    const text = await (await ctx.call({ messages, max_completion_tokens: 24000, stream: true, response_format: { type: "json_object" } })).text();
    const events = text.split("\n\n").filter((x) => x.startsWith("data: {")).map((x) => JSON.parse(x.slice(6)));
    expect(events.map((x) => x.choices[0].delta.content ?? "").join("")).toBe('{"days":[]}');
    expect(events.at(-1)?.choices[0].finish_reason).toBe("stop");
    expect(text).not.toContain('"tool_calls"');
  });

  it("maps output truncation to length and rejects unexpectedly ended streams", async () => {
    const ctx = setup(sse([start, { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 24000 } }, { type: "message_stop" }]));
    expect(await (await ctx.call({ messages, max_tokens: 24000, stream: true })).text()).toContain('"finish_reason":"length"');
    const incomplete = setup(sse([start]));
    await expect((await incomplete.call({ messages, max_tokens: 4000, stream: true })).text()).rejects.toThrow("Não foi possível consultar a IA agora.");
  });

  it("forwards cancellation and does not replace AbortError", async () => {
    const ctx = setup();
    const controller = new AbortController();
    controller.abort();
    ctx.fetch.mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
    await expect(ctx.call({ messages, max_tokens: 24000 }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(ctx.fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("maps Anthropic rate-limit SSE events without losing the failure", async () => {
    const ctx = setup(sse([start, { type: "error", error: { type: "rate_limit_error", message: "limit" } }]));
    await expect((await ctx.call({ messages, max_tokens: 4000, stream: true })).text()).rejects.toMatchObject({ status: 429, message: "Muitas solicitações agora. Tente de novo em instantes." });
    expect(ctx.error).toHaveBeenCalledWith("Anthropic error", 200, expect.stringContaining("rate_limit_error"));
  });

  it.each([
    [429, "rate_limit_error", 429, "Muitas solicitações agora. Tente de novo em instantes."],
    [401, "authentication_error", 402, "Créditos de IA esgotados."],
    [402, "api_error", 402, "Créditos de IA esgotados."],
    [403, "permission_error", 402, "Créditos de IA esgotados."],
    [400, "credit balance too low", 402, "Créditos de IA esgotados."],
    [529, "overloaded_error", 500, "Não foi possível consultar a IA agora."],
    [500, "api_error", 500, "Não foi possível consultar a IA agora."],
  ])("maps HTTP %s and logs the full upstream body", async (status, message, mapped, text) => {
    const body = { error: { message } };
    const ctx = setup(body, status);
    const upstream = await ctx.call({ messages, max_tokens: 4000 });
    const response = await ctx.exports.anthropicFailure(upstream, { "Access-Control-Allow-Origin": "*" });
    expect(response.status).toBe(mapped);
    expect(await response.json()).toEqual({ error: text });
    expect(ctx.error).toHaveBeenCalledWith("Anthropic error", status, JSON.stringify(body));
  });

  it("keeps the prescription routing metadata on Sonnet without changing the old router", () => {
    const ctx = setup();
    expect(ctx.exports.AI_MODELS).toEqual({ primary: "claude-sonnet-5", fallback: "claude-sonnet-5" });
    expect(ctx.exports.createRoutingMetadata().routing.primaryModel).toBe("claude-sonnet-5");
  });

  it("keeps the cached stable prefix first and logs cache tokens separately", async () => {
    const usage = { input_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 20000, output_tokens: 50 };
    const ctx = setup({ ...plainResponse, usage });
    const system = { role: "system", content: [
      { type: "text", text: "Instruções + catálogo", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Dados do aluno" },
    ] };
    const data = await (await ctx.call({ messages: [system, messages[1]], max_tokens: 100 })).json();
    const sent = JSON.parse(String(ctx.fetch.mock.calls[0]?.[1]?.body));
    expect(sent.system).toEqual(system.content);
    expect(data.usage.cache_read_input_tokens).toBe(20000);
    expect(data.usage.prompt_tokens).toBe(20300);
    expect(ctx.log).toHaveBeenCalledWith("Anthropic usage", JSON.stringify(usage));
  });
});
