// Exercise the deployed entrypoint with mocked transport, without loading Deno's npm imports.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import ts from 'typescript';

const source = readFileSync('supabase/functions/food-scanner/index.ts', 'utf8')
  .replace(/^import .*;\n/gm, '');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });

function setup(status = 200, response: unknown = { choices: [{ message: { content: 'Avaliação de teste' } }] }) {
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

describe('food scanner direct OpenAI', () => {
  it('uses the existing mini model, data URL and 1200 output tokens for extraction', async () => {
    const ctx = setup(200, { choices: [{ message: { content: '{"product_name":"Teste"}' } }] });
    const image = 'data:image/png;base64,dGVzdA==';
    const result = await ctx.request({ action: 'extract', image });
    expect(await result.json()).toEqual({ product: { product_name: 'Teste' } });
    const [url, options] = ctx.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.max_tokens).toBe(1200);
    expect(body.messages[0].content[0]).toEqual({ type: 'image_url', image_url: { url: image } });
  });

  it('keeps evaluation response and 400 output tokens', async () => {
    const ctx = setup();
    expect(await (await ctx.request({ action: 'evaluate', product: {} })).json()).toEqual({ evaluation: 'Avaliação de teste' });
    const [, options] = ctx.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options.body)).max_tokens).toBe(400);
    expect(JSON.parse(String(options.body)).model).toBe('gpt-4o-mini');
  });

  it.each([
    [429, 'rate_limit_exceeded', 'Muitas solicitações agora. Tente de novo em instantes.', 429],
    [401, 'invalid_api_key', 'Créditos de IA esgotados.', 401],
    [402, 'payment_required', 'Créditos de IA esgotados.', 402],
    [429, 'insufficient_quota', 'Créditos de IA esgotados.', 402],
    [500, 'server_error', 'Não foi possível consultar a IA agora.', 500],
  ])('maps upstream %s / %s without retries', async (status, code, message, outputStatus) => {
    const ctx = setup(status, { error: { code } });
    const result = await ctx.request({ action: 'evaluate' });
    expect(result.status).toBe(outputStatus);
    expect(await result.json()).toEqual({ error: message });
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
    expect(ctx.error).toHaveBeenCalledWith('OpenAI error', status, JSON.stringify({ error: { code } }));
  });
});