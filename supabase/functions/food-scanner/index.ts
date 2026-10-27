import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const FIELDS =
  'product_name,brands,image_front_url,nutriments,nutriscore_grade,nutriscore_score,nova_group,additives_tags,additives_n,ingredients_text,labels_tags,quantity,serving_size,serving_quantity';
const CACHE_DAYS = 30;
const MODEL = 'claude-haiku-5-5';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function anthropic(content: unknown, maxTokens: number) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Não foi possível consultar a IA agora.');
  let res: Response;
  try {
    res = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' }, messages: [{ role: 'user', content }] }),
    });
  } catch {
    console.error('Anthropic error', 'network failure');
    throw new Error('Não foi possível consultar a IA agora.');
  }
  if (!res.ok) {
    const t = await res.text();
    console.error('Anthropic error', res.status, t);
    const billing = /credit|billing/i.test(t);
    const credits = billing || [401, 402, 403].includes(res.status);
    const msg =
      res.status === 429 ? 'Muitas solicitações agora. Tente de novo em instantes.'
      : credits ? 'Créditos de IA esgotados.'
      : 'Não foi possível consultar a IA agora.';
    throw Object.assign(new Error(msg), { status: res.status === 429 ? 429 : credits ? 402 : res.status });
  }
  const data = await res.json();
  const text = Array.isArray(data.content)
    ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
    : '';
  if (!text.trim()) {
    console.error('Anthropic error', res.status, 'empty text response', {
      stop_reason: data.stop_reason,
      content_types: Array.isArray(data.content) ? data.content.map((b: any) => b?.type) : [],
      usage: data.usage,
    });
    throw new Error('Não foi possível consultar a IA agora.');
  }
  return text.trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!u?.user) return json({ error: 'Não autenticado' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'lookup') {
      const barcode = String(body.barcode ?? '').replace(/\D/g, '');
      if (barcode.length < 8 || barcode.length > 14) return json({ error: 'Código de barras inválido' }, 400);
      const { data: cached } = await admin.from('products_cache').select('data, fetched_at').eq('barcode', barcode).maybeSingle();
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_DAYS * 864e5) {
        return json({ found: !!cached.data?.product_name || !!cached.data?.nutriments, product: cached.data, cached: true });
      }
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
        headers: { 'User-Agent': 'Marombiew/1.0 (contato do app)' },
      });
      if (r.status === 404) return json({ found: false });
      if (!r.ok) return json({ error: 'Base de produtos indisponível. Tente de novo.' }, 502);
      const d = await r.json();
      if (d.status !== 1 || !d.product) return json({ found: false });
      await admin.from('products_cache').upsert({ barcode, data: d.product, fetched_at: new Date().toISOString() });
      return json({ found: true, product: d.product });
    }

    if (action === 'extract') {
      const image = String(body.image ?? '');
      const m = image.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!m) return json({ error: 'Imagem inválida' }, 400);
      const text = await anthropic(
        [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          {
            type: 'text',
            text: `Leia a tabela nutricional e a lista de ingredientes deste rótulo. Converta tudo para 100 g/ml. Responda SOMENTE JSON:
{"product_name":string|null,"brands":string|null,"serving_quantity":number|null,"nutriments":{"energy-kcal_100g":number,"proteins_100g":number,"carbohydrates_100g":number,"sugars_100g":number,"fat_100g":number,"saturated-fat_100g":number,"fiber_100g":number,"salt_100g":number},"additives_tags":["en:e330"],"ingredients_text":string,"labels_tags":[]}
Em additives_tags liste os aditivos dos ingredientes como E-numbers (en:eXXX). Use 0 para valores ausentes.`,
          },
        ],
        1200,
      );
      const raw = text.match(/\{[\s\S]*\}/)?.[0];
      if (!raw) return json({ error: 'Não consegui ler o rótulo. Tente outra foto, mais nítida.' }, 422);
      return json({ product: JSON.parse(raw) });
    }

    if (action === 'evaluate') {
      const p = body.product ?? {};
      const { data: prof } = await admin.from('students_profile').select('objetivo, restricoes, sexo').eq('user_id', u.user.id).maybeSingle();
      const { data: diet } = await admin
        .from('ai_plans').select('conteudo').eq('student_id', u.user.id).eq('tipo', 'dieta').eq('is_draft', false)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const n = p.nutriments ?? {};
      const prompt = `Você é personal trainer e nutricionista esportivo do app Marombiew. Avalie este produto para o aluno.
Produto: ${p.product_name ?? 'sem nome'} (${p.brands ?? ''}). Por 100 g: ${n['energy-kcal_100g'] ?? '?'} kcal, P ${n.proteins_100g ?? '?'} g, C ${n.carbohydrates_100g ?? '?'} g (açúcar ${n.sugars_100g ?? '?'}), G ${n.fat_100g ?? '?'} g (sat. ${n['saturated-fat_100g'] ?? '?'}), fibras ${n.fiber_100g ?? '?'}, sal ${n.salt_100g ?? '?'}. Porção: ${p.serving_quantity ?? '?'} g.
Nota de qualidade: ${body.score ?? '?'}/100 (${body.label ?? ''}). Aditivos: ${(body.additives ?? []).map((a: any) => `${a.code} (${a.level})`).join(', ') || 'nenhum'}.
Objetivo do aluno: ${prof?.objetivo ?? 'não informado'}. Restrições: ${prof?.restricoes ?? 'nenhuma'}. Meta de hoje: ${body.dailyKcal ?? '?'} kcal.
Dieta atual (resumo): ${String(diet?.conteudo ?? 'sem dieta publicada').slice(0, 2500)}

Responda em português do Brasil, linguagem neutra em gênero, tom de personal real, direto, sem motivação genérica e sem markdown.
Regras:
- No máximo 3 frases, sem repetir ideia.
- Se o produto for infantil (papinha, cereal para bebê, fórmula), suplemento ou bebida alcoólica, diga isso logo na primeira frase.
- Separe a nota de qualidade da utilidade para o objetivo.
- Dê UMA recomendação só e clara: se cabe ou não na dieta, em qual refeição, em qual quantidade e qual alimento da dieta ajustar. Nunca dê duas opções nem alternativas contraditórias.
- Nunca recomende uma troca que reduza de forma relevante a proteína da refeição (ex.: trocar whey, ovos, frango ou carne por um produto com bem menos proteína). Se o produto tem pouca proteína, ele pode entrar só como complemento ou no lugar de um carboidrato ou gordura equivalente, nunca no lugar da fonte de proteína. Só chame de 'boa proteína' acima de ~8 g por 100 g.`;
      const evaluation = await anthropic(prompt, 300);
      return json({ evaluation });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (e) {
    const status = (e as any)?.status && [401, 402, 429].includes((e as any).status) ? (e as any).status : 500;
    return json({ error: (e as Error).message || 'Erro inesperado' }, status);
  }
});
