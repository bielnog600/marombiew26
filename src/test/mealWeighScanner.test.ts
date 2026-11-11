// Ação "weigh" do food-scanner com transporte simulado — nenhuma chamada real à IA.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import ts from 'typescript';

const source = readFileSync('supabase/functions/food-scanner/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });

const IMG = 'data:image/jpeg;base64,QUJD';
const PREV = 'data:image/jpeg;base64,REVG';

function setup(premium: boolean, aiText = '{"alimento":"Arroz branco cozido","alimento_alternativas":["Arroz integral","Risoto","Arroz de pato","Extra"],"gramas_lidas":"182,5","confianca_alimento":90,"confianca_leitura":0.8,"visor_legivel":true,"observacao":""}') {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const rpc = vi.fn(async () => ({ data: premium, error: null }));
  const fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: aiText }] }), { status: 200 }));
  runInNewContext(code, {
    Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'aluno-1' } } }) }, rpc, from: () => ({}) }),
    corsHeaders: {}, fetch, Response, console: { error: vi.fn() },
  });
  const request = (body: unknown) => handler(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: JSON.stringify(body),
  }));
  return { request, fetch, rpc };
}

describe('food-scanner weigh (Pesar refeição)', () => {
  it('sem premium_scale responde 403 e não chama a IA', async () => {
    const ctx = setup(false);
    const res = await ctx.request({ action: 'weigh', image: IMG });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Pesar refeição é um recurso Premium.' });
    expect(ctx.rpc).toHaveBeenCalledWith('has_premium_scale', { _user_id: 'aluno-1' });
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('imagem inválida responde 400 sem chamar a IA', async () => {
    const ctx = setup(true);
    expect((await ctx.request({ action: 'weigh', image: 'nada' })).status).toBe(400);
    expect((await ctx.request({ action: 'weigh', image: IMG, previousImage: 'x' })).status).toBe(400);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('envia foto anterior + atual, plano e itens ao mesmo Claude do scanner e normaliza o JSON', async () => {
    const ctx = setup(true);
    const res = await ctx.request({
      action: 'weigh', image: IMG, previousImage: PREV, mealName: 'Almoço',
      planFoods: ['Arroz branco cozido', 'Peito de frango grelhado'],
      addedFoods: [{ alimento: 'Peito de frango grelhado', gramas: 120 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: {
      alimento: 'Arroz branco cozido',
      alimento_alternativas: ['Arroz integral', 'Risoto', 'Arroz de pato'],
      gramas_lidas: 182.5, confianca_alimento: 0.9, confianca_leitura: 0.8, visor_legivel: true, observacao: '',
    } });
    const [url, options] = ctx.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.thinking).toEqual({ type: 'disabled' });
    const content = body.messages[0].content;
    expect(content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'REVG' } });
    expect(content[3]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
    const prompt = content[4].text as string;
    expect(prompt).toContain('ADICIONADO');
    expect(prompt).toContain('Arroz branco cozido; Peito de frango grelhado');
    expect(prompt).toContain('Peito de frango grelhado (120 g)');
  });

  it('visor sem número vira visor_legivel false', async () => {
    const ctx = setup(true, '{"alimento":"Frango","alimento_alternativas":[],"gramas_lidas":null,"confianca_alimento":0.7,"confianca_leitura":0.9,"visor_legivel":true,"observacao":"reflexo"}');
    const { result } = await (await ctx.request({ action: 'weigh', image: IMG })).json();
    expect(result).toMatchObject({ gramas_lidas: null, visor_legivel: false, confianca_leitura: 0 });
    const content = JSON.parse(String((ctx.fetch.mock.calls[0] as any)[1].body)).messages[0].content;
    expect(content).toHaveLength(2);
  });

  it('read_weight (alimento da dieta): sem premium 403 sem chamar a IA', async () => {
    const ctx = setup(false);
    expect((await ctx.request({ action: 'read_weight', image: IMG, foodName: 'Arroz branco' })).status).toBe(403);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('read_weight só lê o visor e devolve gramas_lidas, visor_legivel, confianca_leitura', async () => {
    const ctx = setup(true, '{"gramas_lidas":182,"visor_legivel":true,"confianca_leitura":0.95}');
    const res = await ctx.request({ action: 'read_weight', image: IMG, foodName: 'Arroz branco' });
    expect(await res.json()).toEqual({ result: { gramas_lidas: 182, visor_legivel: true, confianca_leitura: 0.95 } });
    const body = JSON.parse(String((ctx.fetch.mock.calls[0] as any)[1].body));
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.max_tokens).toBe(150);
    const content = body.messages[0].content;
    expect(content).toHaveLength(2);
    expect(content[1].text).toContain('Arroz branco');
    expect(content[1].text).toContain('NÃO identifique o alimento');
  });

  it('itens 2+: compara as fotos, só o adicionado, e prioriza os previstos ainda não pesados', async () => {
    const ctx = setup(true);
    await ctx.request({
      action: 'weigh', image: IMG, previousImage: PREV, mealName: 'Lanche',
      planFoods: ['Iogurte natural', 'Whey protein', 'Chia'],
      pendingPlanFoods: ['Chia'],
      addedFoods: [{ alimento: 'Iogurte natural', gramas: 154 }, { alimento: 'Whey protein', gramas: 26 }],
    });
    const prompt = JSON.parse(String((ctx.fetch.mock.calls[0] as any)[1].body)).messages[0].content[4].text as string;
    expect(prompt).toContain('Compare as duas fotos. Identifique SOMENTE o que foi adicionado entre a foto anterior e a atual.');
    expect(prompt).toContain('Um alimento já pesado não deve ser retornado de novo, a menos que a quantidade dele claramente aumentou.');
    expect(prompt).toContain('Candidatos prioritários (previstos e AINDA NÃO pesados): Chia.');
    expect(prompt).toContain('sementes escuras pequenas → chia');
    expect(prompt).toContain('Não comente a tigela');
  });
});
