import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { aiFetch, setAiUsageActor, withAiUsage } from '../_shared/aiUsage.ts';
import { autoAddDecision, autoAddFoodRow, cleanReferenceMacros, findReferenceDuplicate, productKey, referenceFoodName, referenceTableFor } from '../_shared/foodCatalogRules.ts';

const FIELDS =
  'product_name,brands,image_front_url,nutriments,nutriscore_grade,nutriscore_score,nova_group,additives_tags,additives_n,ingredients_text,labels_tags,quantity,serving_size,serving_quantity,categories_tags';
const CACHE_DAYS = 30;
const MODEL = 'claude-haiku-5-5';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** `feature`: which scanner use this call is billed to in Custos de IA. */
async function anthropic(content: unknown, maxTokens: number, feature: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Não foi possível consultar a IA agora.');
  let res: Response;
  try {
    res = await aiFetch(`${ANTHROPIC_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' }, messages: [{ role: 'user', content }] }),
    }, { feature });
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

const IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_CHARS = 6_000_000;
const parseImage = (value: unknown) => {
  const s = typeof value === 'string' ? value : '';
  if (!s || s.length > MAX_IMAGE_CHARS) return null;
  const m = s.match(IMAGE_RE);
  return m ? { media_type: m[1], data: m[2] } : null;
};
const cleanNames = (value: unknown, max: number) =>
  (Array.isArray(value) ? value : [])
    .map((v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, max);
const cleanAdded = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((v: any) => ({ alimento: String(v?.alimento ?? '').replace(/\s+/g, ' ').trim().slice(0, 120), gramas: Number(v?.gramas) }))
    .filter((v) => v.alimento)
    .slice(0, 30);
/** Correções recentes do aluno no "Prato pronto" (estimado pela IA → real), no máximo 5. */
const cleanCorrections = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((v: any) => ({
      alimento: String(v?.alimento ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      estimado: Math.round(Number(v?.estimado)),
      real: Math.round(Number(v?.real)),
    }))
    .filter((v) => v.alimento && v.estimado > 0 && v.estimado <= 5000 && v.real > 0 && v.real <= 5000)
    .slice(0, 5);

/**
 * Macros por 100 g de tabela de referência (TACO/INSA) que a IA manda para um
 * alimento que não está na base. Conferência leve aqui; o `reference_food`
 * valida de novo antes de criar o alimento.
 */
function parseRefMacros(raw: any, cited: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const n = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const x = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : null;
  };
  const kcal = n(raw.kcal), p = n(raw.proteina), c = n(raw.carbo), g = n(raw.gordura);
  if (kcal == null || p == null || c == null || g == null || kcal > 900 || p + c + g > 105) return null;
  return { kcal, proteina: p, carbo: c, gordura: g, fibra: n(raw.fibra), tabela: String(cited ?? '').trim().slice(0, 40) || null };
}

const refInstruction = (country: 'br' | 'pt') =>
  `- Se o alimento NÃO for um dos nomes do plano/base informados (ex.: fruta, carne, peixe, ovo, cereal, leguminosa, tofu, tempeh, seitan, PTS), preencha por_100g_referencia com kcal, proteina, carbo, gordura e fibra por 100 g do alimento como está (cozido/cru) segundo a tabela ${country === 'br' ? 'TACO (Brasil)' : 'INSA/PortFIR (Portugal)'} e tabela_referencia com o nome da tabela. Se for um nome da base, use null. Nunca invente para produto industrializado.`;

const countryOf = (v: unknown): 'br' | 'pt' => (v === 'br' ? 'br' : 'pt');

/** Normaliza o JSON da pesagem; null quando a IA não devolveu um objeto. */
function parseWeighJson(text: string) {
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const conf = (v: unknown) => {
    let n = num(v) ?? 0;
    if (n > 1) n = n / 100;
    return Math.max(0, Math.min(1, n));
  };
  const grams = num(o.gramas_lidas);
  const readable = grams !== null && grams > 0;
  return {
    alimento: String(o.alimento ?? '').trim().slice(0, 120),
    alimento_alternativas: (Array.isArray(o.alimento_alternativas) ? o.alimento_alternativas : [])
      .map((s: unknown) => String(s ?? '').trim().slice(0, 120)).filter(Boolean).slice(0, 3),
    gramas_lidas: readable ? Math.round(grams! * 10) / 10 : null,
    confianca_alimento: conf(o.confianca_alimento),
    confianca_leitura: readable ? conf(o.confianca_leitura) : 0,
    visor_legivel: o.visor_legivel === true && readable,
    observacao: String(o.observacao ?? '').trim().slice(0, 240),
    ref_100g: parseRefMacros(o.por_100g_referencia, o.tabela_referencia),
  };
}

function weighPrompt(
  hasPrevious: boolean,
  mealName: string,
  planFoods: string[],
  added: { alimento: string; gramas: number }[],
  pendingFoods: string[] = [],
  country: 'br' | 'pt' = 'pt',
) {
  const task = hasPrevious
    ? 'Você recebeu duas fotos da mesma balança de cozinha: a ANTERIOR e a ATUAL. Entre elas o aluno zerou a balança (tara) e colocou UM alimento novo. Compare as duas fotos. Identifique SOMENTE o que foi adicionado entre a foto anterior e a atual. Um alimento já pesado não deve ser retornado de novo, a menos que a quantidade dele claramente aumentou. Leia o número do visor na foto ATUAL (depois da tara o visor mostra só o peso do alimento novo).'
    : 'Você recebeu uma foto de uma balança de cozinha com comida. Identifique o alimento que está na balança e leia o número do visor.';
  const candidates = pendingFoods.length ? pendingFoods : planFoods;
  return `${task}
Refeição: ${mealName || 'não informada'}.
Alimentos previstos no plano desta refeição: ${planFoods.length ? planFoods.join('; ') : 'nenhum informado'}.
Candidatos prioritários (previstos e AINDA NÃO pesados): ${candidates.length ? candidates.join('; ') : 'nenhum'}. Se o alimento novo for compatível com um deles (ex.: sementes escuras pequenas → chia), escolha esse, com exatamente esse nome.
Já pesados nesta refeição: ${added.length ? added.map((a) => `${a.alimento}${Number.isFinite(a.gramas) && a.gramas > 0 ? ` (${Math.round(a.gramas)} g)` : ''}`).join('; ') : 'nenhum'}.
Regras:
- gramas_lidas é o número do visor em gramas (converta kg, oz ou lb para gramas). Nunca estime pelo tamanho da comida. Se não der para ler o visor, use null e visor_legivel false.
- confianca_alimento e confianca_leitura vão de 0 a 1.
- alimento_alternativas: 3 outros nomes prováveis para o alimento, do mais ao menos provável.
- Nomes simples em português do Brasil, como numa tabela de alimentos (ex.: "Arroz branco cozido", "Peito de frango grelhado").
- observacao: curta (ex.: reflexo no visor) ou "". Só fale de tara ou balança não zerada se houver suspeita real (ex.: peso muito acima do esperado para o alimento). Não comente a tigela, o prato ou o recipiente.
${refInstruction(country)}
Responda SOMENTE JSON:
{"alimento":string,"alimento_alternativas":[string,string,string],"gramas_lidas":number|null,"confianca_alimento":number,"confianca_leitura":number,"visor_legivel":boolean,"por_100g_referencia":{"kcal":number,"proteina":number,"carbo":number,"gordura":number,"fibra":number}|null,"tabela_referencia":string|null,"observacao":string}`;
}

/** Normaliza o JSON do "Prato pronto"; null quando a IA não devolveu itens num objeto. */
function parsePlateJson(text: string) {
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object' || !Array.isArray(o.itens)) return null;
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const conf = (v: unknown) => {
    let n = num(v) ?? 0;
    if (n > 1) n = n / 100;
    return Math.max(0, Math.min(1, n));
  };
  const itens = o.itens
    .map((it: any) => {
      const grams = Math.max(0, Math.round(num(it?.gramas_estimadas) ?? 0));
      const f = Array.isArray(it?.faixa_gramas) ? it.faixa_gramas.map((x: unknown) => num(x)) : [];
      const lo = f[0] != null && f[0] > 0 ? Math.round(f[0]) : null;
      const hi = f[1] != null && f[1] > 0 ? Math.round(f[1]) : null;
      return {
        alimento: String(it?.alimento ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        alternativas: (Array.isArray(it?.alternativas) ? it.alternativas : [])
          .map((x: unknown) => String(x ?? '').trim().slice(0, 120)).filter(Boolean).slice(0, 3),
        gramas_estimadas: grams,
        faixa_gramas: lo != null && hi != null ? [Math.min(lo, hi), Math.max(lo, hi)] : null,
        confianca: conf(it?.confianca),
        ref_100g: parseRefMacros(it?.por_100g_referencia, it?.tabela_referencia),
      };
    })
    .filter((it: any) => it.alimento)
    .slice(0, 12);
  const total = num(o.peso_total_lido ?? o.gramas_lidas);
  return {
    itens,
    peso_total_lido: total != null && total > 0 ? Math.round(total * 10) / 10 : null,
    prato_tarado: total != null && total > 0 && typeof o.prato_tarado === 'boolean' ? o.prato_tarado : null,
    observacao: String(o.observacao ?? '').trim().slice(0, 240),
    balanca_sem_visor: !(total != null && total > 0) && o.balanca_sem_visor === true,
  };
}

function platePrompt(
  mealName: string,
  planFoods: string[],
  pendingFoods: string[],
  added: { alimento: string; gramas: number }[],
  baseFoods: string[],
  corrections: { alimento: string; estimado: number; real: number }[] = [],
  country: 'br' | 'pt' = 'pt',
) {
  const calib = corrections.length
    ? `\nCorreções recentes deste aluno (a estimativa da foto × o que era de verdade; use para calibrar as gramas, sem copiar números): ${corrections.map((c) => `${c.alimento}: você estimou ${c.estimado} g, era ${c.real} g`).join('; ')}.`
    : '';
  return `Você recebeu UMA foto de um prato pronto (a refeição já montada), de cima ou levemente inclinada. Identifique CADA alimento do prato e estime as gramas de cada um.
Refeição: ${mealName || 'não informada'}.
Alimentos previstos no plano desta refeição (quando o alimento do prato for compatível, use EXATAMENTE um destes nomes): ${planFoods.length ? planFoods.join('; ') : 'nenhum informado'}.
Previstos ainda não registrados: ${pendingFoods.length ? pendingFoods.join('; ') : 'nenhum'}.
Já registrados nesta refeição (não repita, a menos que estejam claramente neste prato): ${added.length ? added.map((a) => a.alimento).join('; ') : 'nenhum'}.
Base de alimentos do app (fora do plano, prefira um destes nomes): ${baseFoods.length ? baseFoods.join('; ') : 'não informada'}.${calib}
Regras:
- Um item por alimento visível. Um preparo misturado conta como um item (ex.: "Strogonoff de frango"). Molho ou tempero só se for uma porção relevante.
- Se aparecer uma balança com o visor legível, leia o número em peso_total_lido (gramas; converta kg, oz ou lb). Em prato_tarado diga se o visor mostra só a comida (true, balança zerada com o prato), comida + prato (false) ou se não dá para saber (null). Sem balança ou visor ilegível: peso_total_lido null e prato_tarado null. balanca_sem_visor: true só se aparece uma balança mas o visor não está na foto ou não dá para ler; senão false.
- gramas_estimadas: gramas do alimento pronto, pelo tamanho visual (tipo e diâmetro do prato — raso ~26 cm, sobremesa ~20 cm —, talheres, mão por perto e porções típicas). Com peso_total_lido, faça a soma das gramas combinar com ele (descontando o prato quando prato_tarado for false).
- faixa_gramas: [mínimo, máximo] plausível para cada alimento.
- confianca de 0 a 1.
- alternativas: 3 outros nomes prováveis, do mais ao menos provável.
- Nomes simples em português do Brasil, como numa tabela de alimentos (ex.: "Arroz branco cozido", "Peito de frango grelhado").
- observacao: curta ou "".
${refInstruction(country)}
Responda SOMENTE JSON:
{"itens":[{"alimento":string,"alternativas":[string,string,string],"gramas_estimadas":number,"faixa_gramas":[number,number],"confianca":number,"por_100g_referencia":{"kcal":number,"proteina":number,"carbo":number,"gordura":number,"fibra":number}|null,"tabela_referencia":string|null}],"peso_total_lido":number|null,"prato_tarado":boolean|null,"balanca_sem_visor":boolean,"observacao":string}`;
}

/* ---------- Scanner por foto ---------- */

const normText = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Normaliza a identificação da foto; null quando a IA não devolveu um objeto. */
function parseIdentifyJson(text: string) {
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const conf = (v: unknown) => {
    let n = num(v) ?? 0;
    if (n > 1) n = n / 100;
    return Math.max(0, Math.min(1, n));
  };
  const str = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const macros = (m: any) => {
    if (!m || typeof m !== 'object') return null;
    const out = {
      kcal: num(m.kcal), proteina: num(m.proteina), carbo: num(m.carbo), gordura: num(m.gordura),
      acucar: num(m.acucar), fibra: num(m.fibra), sodio_mg: num(m.sodio_mg ?? m.sodio),
    };
    return out.kcal == null && out.proteina == null && out.carbo == null && out.gordura == null ? null : out;
  };
  const tipo = ['embalado', 'in_natura', 'prato'].includes(o.tipo) ? o.tipo : 'embalado';
  const code = String(o.codigo_barras_visivel ?? '').replace(/\D/g, '');
  const t = o.tabela && typeof o.tabela === 'object' ? o.tabela : null;
  const tabela = t ? { porcao_g: num(t.porcao_g), por_100g: macros(t.por_100g), por_porcao: macros(t.por_porcao) } : null;
  const tamanho = ['pequeno', 'medio', 'grande'].includes(normText(o.tamanho)) ? normText(o.tamanho) : 'medio';
  const unidades = Math.max(1, Math.min(30, Math.round(num(o.unidades) ?? 1)));
  const peso = num(o.peso_balanca_g);
  return {
    tipo,
    marca: str(o.marca) || null,
    produto: str(o.produto),
    variante: str(o.variante) || null,
    codigo_barras_visivel: code.length >= 8 && code.length <= 14 ? code : null,
    tabela_nutricional_visivel: o.tabela_nutricional_visivel === true && !!tabela && (!!tabela.por_100g || !!tabela.por_porcao),
    tabela: tabela && (tabela.por_100g || tabela.por_porcao) ? tabela : null,
    alimento: str(o.alimento) || str(o.produto),
    tamanho,
    unidades,
    peso_balanca_g: peso != null && peso > 0 ? Math.round(peso * 10) / 10 : null,
    confianca: conf(o.confianca),
  };
}

function identifyPrompt(baseFoods: string[]) {
  return `Você recebeu UMA foto tirada por um aluno (no mercado ou em casa). Diga o que é.
tipo: "embalado" (produto industrializado com embalagem/marca), "in_natura" (fruta, ovo, pão, batata, etc. sem embalagem de marca) ou "prato" (refeição pronta).
Embalado: marca, produto (nome comercial), variante (sabor/versão) ou null. Se o código de barras estiver nítido, escreva só os números em codigo_barras_visivel; senão null. Se a tabela nutricional estiver legível, preencha tabela (por_100g e/ou por_porcao, porcao_g em gramas, sódio em mg) e tabela_nutricional_visivel true; senão tabela null e false. Nunca invente números da tabela.
In natura / prato: alimento (nome simples em português do Brasil; quando possível use um destes nomes da base: ${baseFoods.length ? baseFoods.join('; ') : 'não informada'}), tamanho ("pequeno", "medio" ou "grande") e unidades (quantas há na foto). Se aparecer uma balança com o visor legível, peso_balanca_g é o número do visor em gramas; senão null.
confianca de 0 a 1.
Responda SOMENTE JSON:
{"tipo":"embalado"|"in_natura"|"prato","marca":string|null,"produto":string,"variante":string|null,"codigo_barras_visivel":string|null,"tabela_nutricional_visivel":boolean,"tabela":{"porcao_g":number|null,"por_100g":{"kcal":number,"proteina":number,"carbo":number,"gordura":number,"acucar":number,"fibra":number,"sodio_mg":number}|null,"por_porcao":{"kcal":number,"proteina":number,"carbo":number,"gordura":number,"acucar":number,"fibra":number,"sodio_mg":number}|null}|null,"alimento":string,"tamanho":"pequeno"|"medio"|"grande","unidades":number,"peso_balanca_g":number|null,"confianca":number}`;
}

/** Mesmo produto: nomes normalizados iguais ou um contém o outro (ex.: produto + variante). */
const sameProduct = (a: string, b: string) => {
  const x = normText(a), y = normText(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** Produto aprovado na base (foods) → formato do Open Food Facts usado pelo scanner. */
const foodRowToProduct = (f: any) => {
  const size = Number(f.portion_size) || 100;
  const k = 100 / size;
  const r1 = (v: unknown) => Math.round((Number(v) || 0) * k * 10) / 10;
  return {
    product_name: f.name, brands: f.brand ?? undefined,
    nutriments: { 'energy-kcal_100g': r1(f.calories), proteins_100g: r1(f.protein), carbohydrates_100g: r1(f.carbs), fat_100g: r1(f.fats) },
    serving_quantity: size !== 100 ? size : null,
  };
};


/* ---------- Scanner único: modo Automático ---------- */

const AUTO_KINDS = ['embalado', 'in_natura', 'prato', 'balanca'];
const NUTRI_CATS = ['geral', 'bebida', 'agua', 'gordura', 'queijo'];

/** Normaliza a resposta do Automático: tipo, itens, visor, código, tabela e categoria do Nutri-Score. */
function parseAutoJson(text: string) {
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const id = parseIdentifyJson(raw);
  if (!id) return null;
  const plate = Array.isArray(o.itens) ? parsePlateJson(raw) : null;
  const itens = plate?.itens ?? [];
  const tipo = AUTO_KINDS.includes(o.tipo) ? o.tipo
    : id.codigo_barras_visivel || id.tabela ? 'embalado' : itens.length > 0 ? 'prato' : 'embalado';
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const grams = num(o.gramas_lidas);
  const readable = grams !== null && grams > 0;
  let lc = num(o.confianca_leitura) ?? 0;
  if (lc > 1) lc /= 100;
  const fv = num(o.frutas_legumes_pct);
  return {
    tipo,
    itens,
    gramas_lidas: readable ? Math.round(grams! * 10) / 10 : null,
    visor_legivel: o.visor_legivel === true && readable,
    confianca_leitura: readable ? Math.max(0, Math.min(1, lc)) : 0,
    prato_tarado: plate?.prato_tarado ?? (readable && typeof o.prato_tarado === 'boolean' ? o.prato_tarado : null),
    balanca_sem_visor: !readable && o.balanca_sem_visor === true,
    observacao: String(o.observacao ?? '').trim().slice(0, 240),
    marca: id.marca,
    produto: id.produto,
    variante: id.variante,
    codigo_barras_visivel: id.codigo_barras_visivel,
    tabela_nutricional_visivel: id.tabela_nutricional_visivel,
    tabela: id.tabela,
    categoria_nutriscore: NUTRI_CATS.includes(String(o.categoria_nutriscore)) ? String(o.categoria_nutriscore) : 'geral',
    frutas_legumes_pct: fv != null && fv >= 0 && fv <= 100 ? Math.round(fv) : null,
    confianca: id.confianca,
  };
}

function autoPrompt(input: {
  mealName: string; planFoods: string[]; pendingFoods: string[]; added: { alimento: string; gramas: number }[];
  baseFoods: string[]; corrections: { alimento: string; estimado: number; real: number }[];
  country: 'br' | 'pt'; hint: 'auto' | 'label'; liveBarcode: string | null;
}) {
  const calib = input.corrections.length
    ? `\nCorreções recentes deste aluno (estimativa da foto × real; calibre sem copiar números): ${input.corrections.map((c) => `${c.alimento}: você estimou ${c.estimado} g, era ${c.real} g`).join('; ')}.`
    : '';
  return `Você recebeu UMA foto tirada por um aluno para registrar o que vai comer. Descubra sozinho o que é e devolva tudo numa resposta.
${input.hint === 'label' ? 'O aluno escolheu "Código / rótulo": trate como produto embalado e leia código de barras e tabela nutricional.\n' : ''}${input.liveBarcode ? `O app já leu o código de barras ${input.liveBarcode} ao vivo; não precisa lê-lo de novo.\n` : ''}Refeição: ${input.mealName || 'não informada'}.
Alimentos previstos no plano (quando compatível, use EXATAMENTE um destes nomes): ${input.planFoods.length ? input.planFoods.join('; ') : 'nenhum'}.
Previstos ainda não registrados: ${input.pendingFoods.length ? input.pendingFoods.join('; ') : 'nenhum'}.
Já registrados nesta refeição (não repita): ${input.added.length ? input.added.map((a) => a.alimento).join('; ') : 'nenhum'}.
Base de alimentos do app (prefira um destes nomes): ${input.baseFoods.length ? input.baseFoods.join('; ') : 'não informada'}.${calib}
tipo:
- "embalado": produto industrializado (embalagem, marca, rótulo). Preencha marca, produto, variante; codigo_barras_visivel só com os números se nítido; tabela (por_100g e/ou por_porcao, porcao_g, sódio em mg) e tabela_nutricional_visivel true só se a tabela estiver legível — nunca invente números da tabela. categoria_nutriscore: "bebida" (refrigerante, suco, chá, bebida vegetal), "agua", "gordura" (óleo, azeite, manteiga, margarina, oleaginosas, pasta de amendoim), "queijo" ou "geral"; frutas_legumes_pct = % de frutas/legumes/leguminosas/oleaginosas nos ingredientes (azeite = 100) ou null. itens pode ter o produto como único item.
- "balanca": UM alimento sem embalagem em cima de uma balança de cozinha.
- "in_natura": alimento sem embalagem fora da balança (fruta, ovo, pão...).
- "prato": refeição montada com um ou mais alimentos.
Para balanca/in_natura/prato: itens = um por alimento visível, com gramas_estimadas pelo tamanho visual (prato raso ~26 cm, talheres, mão), faixa_gramas [mín, máx], confianca 0–1 e 3 alternativas.
Balança: se o visor estiver legível, gramas_lidas = número do visor em gramas (converta kg/oz/lb), visor_legivel true e confianca_leitura 0–1; em "prato" com balança, gramas_lidas é o peso total e prato_tarado diz se o visor mostra só a comida (true), comida + prato (false) ou não dá para saber (null); com visor legível, faça a soma das gramas_estimadas combinar com ele. Sem balança: gramas_lidas null. balanca_sem_visor true só se aparece uma balança sem visor legível.
${refInstruction(input.country)}
Nomes simples em português do Brasil, como numa tabela de alimentos. observacao curta ou "". confianca (0–1) = certeza sobre o que é a foto.
Responda SOMENTE JSON:
{"tipo":"embalado"|"balanca"|"in_natura"|"prato","itens":[{"alimento":string,"alternativas":[string,string,string],"gramas_estimadas":number,"faixa_gramas":[number,number],"confianca":number,"por_100g_referencia":{"kcal":number,"proteina":number,"carbo":number,"gordura":number,"fibra":number}|null,"tabela_referencia":string|null}],"gramas_lidas":number|null,"visor_legivel":boolean,"confianca_leitura":number,"prato_tarado":boolean|null,"balanca_sem_visor":boolean,"marca":string|null,"produto":string,"variante":string|null,"codigo_barras_visivel":string|null,"tabela_nutricional_visivel":boolean,"tabela":{"porcao_g":number|null,"por_100g":{"kcal":number,"proteina":number,"carbo":number,"gordura":number,"acucar":number,"fibra":number,"sodio_mg":number}|null,"por_porcao":{"kcal":number,"proteina":number,"carbo":number,"gordura":number,"acucar":number,"fibra":number,"sodio_mg":number}|null}|null,"categoria_nutriscore":string,"frutas_legumes_pct":number|null,"alimento":string,"confianca":number,"observacao":string}`;
}

const OFF_SEARCH_FIELDS = `code,${FIELDS}`;

Deno.serve(withAiUsage('scanner', 'food-scanner', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!u?.user) return json({ error: 'Não autenticado' }, 401);
    setAiUsageActor(u.user.id);
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
Em additives_tags liste os aditivos dos ingredientes como E-numbers (en:eXXX). Use 0 para valores ausentes.
Inclua também "nutriscore_category": "bebida" (refrigerante, suco, chá, bebida vegetal), "agua", "gordura" (óleo, azeite, manteiga, margarina, oleaginosas, pasta de amendoim), "queijo" ou "geral", e "fruits-vegetables-nuts_100g" (% de frutas, legumes, leguminosas e oleaginosas nos ingredientes; azeite = 100) dentro de nutriments.`,
          },
        ],
        1200,
        'scanner_rotulo',
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
      const evaluation = await anthropic(prompt, 300, 'scanner_barcode_ia');
      return json({ evaluation });
    }

    if (action === 'read_weight') {
      // Pesar alimento da dieta (Premium): o alimento já é o do plano; só lê o visor.
      const { data: allowed, error: permErr } = await admin.rpc('has_premium_scale', { _user_id: u.user.id });
      if (permErr || allowed !== true) return json({ error: 'Pesar refeição é um recurso Premium.' }, 403);
      const current = parseImage(body.image);
      if (!current) return json({ error: 'Imagem inválida' }, 400);
      const foodName = String(body.foodName ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const text = await anthropic(
        [
          { type: 'image', source: { type: 'base64', ...current } },
          {
            type: 'text',
            text: `Esta foto mostra uma balança de cozinha com ${foodName || 'um alimento'}. NÃO identifique o alimento: só leia o número do visor.
Regras:
- gramas_lidas é o número do visor em gramas (converta kg, oz ou lb para gramas). Nunca estime pelo tamanho da comida. Se não der para ler o visor, use null e visor_legivel false.
- confianca_leitura vai de 0 a 1.
Responda SOMENTE JSON:
{"gramas_lidas":number|null,"visor_legivel":boolean,"confianca_leitura":number}`,
          },
        ],
        150,
        'pesar_visor',
      );
      const parsed = parseWeighJson(text);
      if (!parsed) return json({ error: 'Não consegui analisar a foto. Tira outra.' }, 422);
      return json({ result: { gramas_lidas: parsed.gramas_lidas, visor_legivel: parsed.visor_legivel, confianca_leitura: parsed.confianca_leitura } });
    }

    if (action === 'weigh') {
      // Pesar refeição (Premium): só quem tem premium_scale (ou admin).
      const { data: allowed, error: permErr } = await admin.rpc('has_premium_scale', { _user_id: u.user.id });
      if (permErr || allowed !== true) return json({ error: 'Pesar refeição é um recurso Premium.' }, 403);
      const current = parseImage(body.image);
      if (!current) return json({ error: 'Imagem inválida' }, 400);
      const previous = body.previousImage == null ? null : parseImage(body.previousImage);
      if (body.previousImage != null && !previous) return json({ error: 'Imagem anterior inválida' }, 400);
      const planFoods = cleanNames(body.planFoods, 40);
      const added = cleanAdded(body.addedFoods);
      const pendingFoods = cleanNames(body.pendingPlanFoods, 40);
      const mealName = String(body.mealName ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const content: unknown[] = previous
        ? [
            { type: 'text', text: 'Foto ANTERIOR:' },
            { type: 'image', source: { type: 'base64', ...previous } },
            { type: 'text', text: 'Foto ATUAL:' },
            { type: 'image', source: { type: 'base64', ...current } },
          ]
        : [{ type: 'image', source: { type: 'base64', ...current } }];
      content.push({ type: 'text', text: weighPrompt(!!previous, mealName, planFoods, added, pendingFoods, countryOf(body.country)) });
      const text = await anthropic(content, 400, 'escanear_prato');
      const result = parseWeighJson(text);
      if (!result) return json({ error: 'Não consegui analisar a foto. Tira outra.' }, 422);
      return json({ result });
    }

    if (action === 'plate_estimate') {
      // Prato pronto (Premium): uma foto do prato montado; a IA identifica cada alimento e estima as gramas.
      const { data: allowed, error: permErr } = await admin.rpc('has_premium_scale', { _user_id: u.user.id });
      if (permErr || allowed !== true) return json({ error: 'Pesar refeição é um recurso Premium.' }, 403);
      const current = parseImage(body.image);
      if (!current) return json({ error: 'Imagem inválida' }, 400);
      const planFoods = cleanNames(body.planFoods, 40);
      const pendingFoods = cleanNames(body.pendingPlanFoods, 40);
      const added = cleanAdded(body.addedFoods);
      const corrections = cleanCorrections(body.corrections);
      const mealName = String(body.mealName ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      let baseFoods: string[] = [];
      try {
        const { data } = await admin.from('foods').select('name').order('name').limit(600);
        baseFoods = cleanNames((data ?? []).map((f: any) => f?.name), 600);
      } catch {
        baseFoods = [];
      }
      const text = await anthropic(
        [
          { type: 'image', source: { type: 'base64', ...current } },
          { type: 'text', text: platePrompt(mealName, planFoods, pendingFoods, added, baseFoods, corrections, countryOf(body.country)) },
        ],
        900,
        'prato_pronto',
      );
      const result = parsePlateJson(text);
      if (!result || result.itens.length === 0) return json({ error: 'Não consegui ver os alimentos do prato. Tira outra foto de cima, com o prato inteiro.' }, 422);
      return json({ result });
    }

    if (action === 'identify_photo') {
      // Scanner por foto: identifica produto embalado, alimento in natura ou prato.
      const current = parseImage(body.image);
      if (!current) return json({ error: 'Imagem inválida' }, 400);
      let baseFoods: string[] = [];
      try {
        const { data } = await admin.from('foods').select('name').is('brand', null).order('name').limit(500);
        baseFoods = cleanNames((data ?? []).map((f: any) => f?.name), 500);
      } catch {
        baseFoods = [];
      }
      const text = await anthropic(
        [{ type: 'image', source: { type: 'base64', ...current } }, { type: 'text', text: identifyPrompt(baseFoods) }],
        700,
        'scanner_foto',
      );
      const result = parseIdentifyJson(text);
      if (!result || (!result.produto && !result.alimento)) return json({ error: 'Não consegui identificar. Tira outra foto, mais de perto.' }, 422);
      return json({ result });
    }

    if (action === 'find_product') {
      // Mesmo produto (marca + nome) já aprovado na base ou escaneado antes por qualquer aluno: responde na hora, sem IA.
      const brand = String(body.brand ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const name = [body.product, body.variant].map((v: unknown) => String(v ?? '').trim()).filter(Boolean).join(' ').slice(0, 200);
      if (!name || !brand) return json({ found: false });
      const like = `%${brand.replace(/[%_]/g, '')}%`;
      const { data: foods } = await admin.from('foods')
        .select('id, name, brand, barcode, portion_size, calories, protein, carbs, fats').ilike('brand', like).limit(80);
      const food = (foods ?? []).find((f: any) => sameProduct(f.name, name) || sameProduct(f.name, String(body.product ?? '')));
      if (food) return json({ found: true, source: 'base', product: foodRowToProduct(food), barcode: food.barcode ?? null, food_id: food.id });
      const { data: scans } = await admin.from('food_scans')
        .select('barcode, product_name, brand, image_url, nutriments, source').ilike('brand', like)
        .order('created_at', { ascending: false }).limit(80);
      const scan = (scans ?? []).find((sc: any) =>
        (sameProduct(sc.product_name, name) || sameProduct(sc.product_name, String(body.product ?? '')))
        && Number(sc.nutriments?.['energy-kcal_100g']) >= 0 && sc.nutriments?.['energy-kcal_100g'] != null);
      if (scan) {
        const { serving_quantity, quantity, ...nutriments } = scan.nutriments ?? {};
        return json({
          found: true, source: 'cache', barcode: scan.barcode ?? null,
          product: { product_name: scan.product_name, brands: scan.brand ?? undefined, image_front_url: scan.image_url ?? undefined, nutriments, serving_quantity: serving_quantity ?? null, quantity: quantity ?? null },
        });
      }
      return json({ found: false });
    }

    if (action === 'search_off') {
      // Open Food Facts por nome + marca, primeiro no país do aluno; até 3 com tabela.
      const terms = [body.brand, body.product, body.variant].map((v: unknown) => String(v ?? '').trim()).filter(Boolean).join(' ').slice(0, 160);
      if (!terms) return json({ candidates: [] });
      const cc = body.country === 'br' ? 'br' : 'pt';
      const search = async (host: string) => {
        const url = `https://${host}.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(terms)}&search_simple=1&action=process&json=1&page_size=8&fields=${OFF_SEARCH_FIELDS}`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Marombiew/1.0 (contato do app)' } });
        if (!r.ok) return [];
        const d = await r.json().catch(() => null);
        return (Array.isArray(d?.products) ? d.products : [])
          .filter((p: any) => p?.product_name && p?.nutriments && p.nutriments['energy-kcal_100g'] != null)
          .slice(0, 3);
      };
      let products: any[] = [];
      try {
        products = await search(cc);
        if (products.length === 0) products = await search('world');
      } catch {
        return json({ error: 'Base de produtos indisponível. Tente de novo.' }, 502);
      }
      const candidates = products.map((p: any) => {
        const { code, ...product } = p;
        return { barcode: String(code ?? '').replace(/\D/g, '') || null, product };
      });
      for (const c of candidates) {
        if (c.barcode) await admin.from('products_cache').upsert({ barcode: c.barcode, data: c.product, fetched_at: new Date().toISOString() });
      }
      return json({ candidates });
    }

    if (action === 'scan_auto') {
      // Scanner único (Premium): uma foto, a IA diz o tipo e o app segue o caminho certo. 1 chamada por scan.
      const { data: allowed, error: permErr } = await admin.rpc('has_premium_scale', { _user_id: u.user.id });
      if (permErr || allowed !== true) return json({ error: 'O scanner com balança é um recurso Premium.' }, 403);
      const current = parseImage(body.image);
      if (!current) return json({ error: 'Imagem inválida' }, 400);
      let baseFoods: string[] = [];
      try {
        const { data } = await admin.from('foods').select('name').is('brand', null).order('name').limit(600);
        baseFoods = cleanNames((data ?? []).map((f: any) => f?.name), 600);
      } catch {
        baseFoods = [];
      }
      const live = String(body.liveBarcode ?? '').replace(/\D/g, '');
      const text = await anthropic(
        [
          { type: 'image', source: { type: 'base64', ...current } },
          {
            type: 'text',
            text: autoPrompt({
              mealName: String(body.mealName ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
              planFoods: cleanNames(body.planFoods, 40),
              pendingFoods: cleanNames(body.pendingPlanFoods, 40),
              added: cleanAdded(body.addedFoods),
              baseFoods,
              corrections: cleanCorrections(body.corrections),
              country: countryOf(body.country),
              hint: body.hint === 'label' ? 'label' : 'auto',
              liveBarcode: live.length >= 8 && live.length <= 14 ? live : null,
            }),
          },
        ],
        1100,
        'scanner_automatico',
      );
      const result = parseAutoJson(text);
      if (!result || (!result.produto && result.itens.length === 0)) return json({ error: 'Não consegui identificar. Tira outra foto, mais de perto.' }, 422);
      return json({ result });
    }

    if (action === 'reference_food') {
      // Alimento que não existe no banco: cria com os macros de referência (TACO/INSA) e deixa pendente para o admin.
      const { data: allowed, error: permErr } = await admin.rpc('has_premium_scale', { _user_id: u.user.id });
      if (permErr || allowed !== true) return json({ error: 'O scanner com balança é um recurso Premium.' }, 403);
      const name = referenceFoodName(String(body.name ?? ''));
      const ref = cleanReferenceMacros(body.ref);
      if (!name || !ref) return json({ error: 'Valores do alimento inválidos' }, 400);
      const tabela = referenceTableFor(countryOf(body.country), body.tabela);
      const FOOD_COLS = 'id, name, calories, protein, carbs, fats, portion, portion_size, brand, source, barcode';
      const first = name.split(' ')[0].replace(/[%_]/g, '');
      const { data: similar } = await admin.from('foods').select(FOOD_COLS).ilike('name', `%${first}%`).limit(400);
      const dup = findReferenceDuplicate(name, (similar ?? []) as any[]);
      if (dup) return json({ food: dup, created: false });
      const { data: food, error: insErr } = await admin.from('foods').insert({
        name, calories: ref.kcal, protein: ref.p, carbs: ref.c, fats: ref.g, fiber: ref.fibras,
        portion: 'gramas', portion_size: 100, source: 'ia_referencia', reference_table: tabela,
      }).select(FOOD_COLS).single();
      if (insErr || !food) return json({ error: 'Não foi possível criar o alimento.' }, 500);
      await admin.from('food_scans').insert({
        aluno_id: u.user.id, product_name: name, brand: null, barcode: null, source: 'ia_referencia', score: null, score_label: null,
        nutriments: { 'energy-kcal_100g': ref.kcal, proteins_100g: ref.p, carbohydrates_100g: ref.c, fat_100g: ref.g, fiber_100g: ref.fibras, reference_table: tabela },
      });
      await admin.from('food_scan_reviews').upsert({
        product_key: productKey({ barcode: null, product_name: name, brand: null }), barcode: null, status: 'pendente', food_id: food.id, auto: false,
      });
      return json({ food, created: true });
    }

    if (action === 'register_product') {
      // Produto escaneado completo e sem duplicado entra sozinho no banco (revisão 'adicionado' pelo sistema).
      const p = body.product ?? {};
      const name = String(p.product_name ?? '').trim() || 'Produto sem nome';
      const brand = p.brands ? String(p.brands).trim() : null;
      const barcode = String(body.barcode ?? '').replace(/\D/g, '') || null;
      const key = productKey({ barcode, product_name: name, brand });
      const { data: rev } = await admin.from('food_scan_reviews').select('status').eq('product_key', key).maybeSingle();
      const FOOD_COLS = 'id, name, brand, barcode';
      const candidates: any[] = [];
      if (barcode) {
        const { data } = await admin.from('foods').select(FOOD_COLS).eq('barcode', barcode).limit(5);
        candidates.push(...(data ?? []));
      }
      const firstBrand = String(brand ?? '').split(',')[0].trim().replace(/[%_]/g, '');
      if (firstBrand) {
        const { data } = await admin.from('foods').select(FOOD_COLS).ilike('brand', `%${firstBrand}%`).limit(200);
        candidates.push(...(data ?? []));
      }
      const input = {
        name, brand, barcode, nutriments: p.nutriments, servingQuantity: Number(p.serving_quantity) || null,
        source: String(body.source ?? ''), confidence: body.confidence == null ? null : Number(body.confidence),
      };
      const decision = autoAddDecision(input, candidates, !!rev);
      if (!decision.add) return json({ added: false, reason: decision.reason });
      const { data: food, error: insErr } = await admin.from('foods').insert(autoAddFoodRow(input)).select('id, name').single();
      if (insErr || !food) return json({ added: false, reason: 'erro' });
      await admin.from('food_scan_reviews').upsert({
        product_key: key, barcode, status: 'adicionado', auto: true, reviewed_by: null, reviewed_at: new Date().toISOString(), food_id: food.id,
      });
      return json({ added: true, food });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (e) {
    const status = (e as any)?.status && [401, 402, 429].includes((e as any).status) ? (e as any).status : 500;
    return json({ error: (e as Error).message || 'Erro inesperado' }, status);
  }
}));
