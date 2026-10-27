// Exercise the deployed entrypoint with mocked transport, without loading Deno's npm imports.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import ts from 'typescript';

const source = readFileSync('supabase/functions/food-scanner/index.ts', 'utf8')
  .replace(/^import .*;\n/gm, '');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });

function setup(status = 200, response: unknown = { content: [{ type: 'text', text: 'Avaliação ' }, { type: 'text', text: 'de teste' }] }) {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const query = {
    select: () => query, eq: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ data: null }),
  };
  const fetch = vi.fn(async () => new Response(JSON.stringify(response), { status }));
  const error = vi.fn();
  runInNewContext(code, {
    Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) }, from: () => query }),
    corsHeaders: {}, fetch, Response, console: { error },
  });
  const request = (body: unknown) => handler(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: JSON.stringify(body),
  }));
  return { request, fetch, error };
}

describe('food scanner direct Anthropic', () => {
  it('sends base64 image block, official Claude Haiku 5.5 and 1200 output tokens for extraction', async () => {
    const ctx = setup(200, { content: [{ type: 'text', text: '{"product_name":"Teste"}' }] });
    const result = await ctx.request({ action: 'extract', image: 'data:image/png;base64,dGVzdA==' });
    expect(await result.json()).toEqual({ product: { product_name: 'Teste' } });
    const [url, options] = ctx.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = options.headers as Record<string, string>;
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['x-api-key']).toBe('test-only');
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.max_tokens).toBe(1200);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'dGVzdA==' } });
    expect(body.messages[0].content[1].type).toBe('text');
  });

  it('joins text blocks and keeps 400 output tokens for evaluation', async () => {
    const ctx = setup();
    expect(await (await ctx.request({ action: 'evaluate', product: {} })).json()).toEqual({ evaluation: 'Avaliação de teste' });
    const [, options] = ctx.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options.body)).max_tokens).toBe(400);
    expect(JSON.parse(String(options.body)).thinking).toEqual({ type: 'disabled' });
  });

  it('logs empty text diagnostics without exposing thinking content', async () => {
    const usage = { output_tokens: 400 };
    const ctx = setup(200, { content: [{ type: 'thinking', thinking: 'private reasoning' }], stop_reason: 'max_tokens', usage });
    const result = await ctx.request({ action: 'evaluate', product: {} });
    expect(result.status).toBe(500);
    expect(ctx.error).toHaveBeenCalledWith('Anthropic error', 200, 'empty text response', { stop_reason: 'max_tokens', content_types: ['thinking'], usage });
    expect(JSON.stringify(ctx.error.mock.calls)).not.toContain('private reasoning');
  });

  it.each([
    [429, 'rate_limit_error', 'Muitas solicitações agora. Tente de novo em instantes.', 429],
    [401, 'authentication_error', 'Créditos de IA esgotados.', 402],
    [403, 'permission_error', 'Créditos de IA esgotados.', 402],
    [400, 'Your credit balance is too low', 'Créditos de IA esgotados.', 402],
    [529, 'overloaded_error', 'Não foi possível consultar a IA agora.', 500],
    [500, 'api_error', 'Não foi possível consultar a IA agora.', 500],
  ])('maps upstream %s / %s', async (status, msg, message, outputStatus) => {
    const ctx = setup(status, { type: 'error', error: { type: 'x', message: msg } });
    const result = await ctx.request({ action: 'evaluate' });
    expect(result.status).toBe(outputStatus);
    expect(await result.json()).toEqual({ error: message });
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
    expect(ctx.error).toHaveBeenCalledWith('Anthropic error', status, expect.any(String));
  });
});
