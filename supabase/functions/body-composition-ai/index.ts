import { AI_MODELS } from "../_shared/aiModelRouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  photos?: { front?: string | null; side?: string | null; back?: string | null };
  sex?: string | null;
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  notes?: string | null;
}

const SYSTEM = `Você é um avaliador físico especialista em composição corporal por análise visual (foto-antropometria).
Analise as fotos do aluno (frente, lado, costas) junto com os dados informados e ESTIME a composição corporal com o MÁXIMO de precisão possível.

Método obrigatório (raciocine antes de responder):
1. Identifique pontos anatômicos visíveis (acrômios, crista ilíaca, umbigo, joelhos, tornozelos) e use a ALTURA informada como escala de referência para converter pixels em centímetros.
2. Estime perímetros por proporção corporal calibrada pela altura, e não por "chute" visual.
3. Cruze o percentual de gordura estimado visualmente com a checagem de consistência: massa gorda + massa magra = peso informado; IMC = peso / altura².
4. Se o peso e a altura forem informados, os valores devem ser matematicamente coerentes entre si (arredonde para 1 casa decimal).
5. Ajuste a estimativa pelo sexo e idade (distribuição de gordura androide vs. ginoide, perda de massa magra por idade).

Regras:
- Trabalhe SEMPRE em português do Brasil e no sistema métrico (kg, cm, %).
- Estimativas visuais têm margem de erro. Informe confiança (baixa/média/alta) e a margem em pontos percentuais, coerente com a qualidade/quantidade de fotos (1 foto = baixa; 3 fotos nítidas com corpo inteiro = média/alta).
- Estime também dobras cutâneas aparentes quando possível (mm), coerentes com o %G estimado.
- NUNCA diagnostique doenças. Se as fotos forem insuficientes, diga isso em "limitacoes".
- Não invente valores impossíveis; use null quando realmente não for possível estimar.

Responda SOMENTE com um JSON válido no formato:
{
  "percentual_gordura": number,
  "margem_erro_pp": number,
  "confianca": "baixa" | "media" | "alta",
  "massa_gorda_kg": number | null,
  "massa_magra_kg": number | null,
  "imc": number | null,
  "classificacao": string,
  "somatotipo": string,
  "medidas_cm": {
    "pescoco": number | null, "ombro": number | null, "torax": number | null,
    "cintura": number | null, "abdomen": number | null, "quadril": number | null,
    "braco_direito": number | null, "braco_esquerdo": number | null,
    "antebraco": number | null, "coxa_direita": number | null, "coxa_esquerda": number | null,
    "panturrilha_direita": number | null, "panturrilha_esquerda": number | null
  },
  "dobras_mm": {
    "triceps": number | null, "subescapular": number | null, "suprailiaca": number | null,
    "abdominal": number | null, "peitoral": number | null, "axilar_media": number | null,
    "coxa": number | null, "biceps": number | null, "panturrilha_medial": number | null
  },
  "pontos_fortes": string[],
  "pontos_atencao": string[],
  "recomendacoes": string[],
  "limitacoes": string[],
  "relatorio_markdown": string
}`;

async function callOpenAIVision(model: string, content: unknown[], apiKey: string) {
  const isNextGen = /^gpt-5/.test(model);
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
  };
  if (isNextGen) {
    body.max_completion_tokens = 6000;
  } else {
    body.max_tokens = 4000;
    body.temperature = 0.3;
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return j(500, { error: "OPENAI_API_KEY não configurada." });

    const body = (await req.json()) as Body;
    const photos = body.photos ?? {};
    const urls = [
      ["Vista FRONTAL", photos.front],
      ["Vista LATERAL", photos.side],
      ["Vista POSTERIOR (costas)", photos.back],
    ].filter(([, u]) => !!u) as [string, string][];

    if (urls.length === 0) return j(400, { error: "Envie ao menos uma foto." });

    const content: any[] = [
      {
        type: "text",
        text: `Dados do aluno:
- Sexo: ${body.sex ?? "não informado"}
- Idade: ${body.ageYears ?? "não informada"} anos
- Altura: ${body.heightCm ?? "não informada"} cm
- Peso: ${body.weightKg ?? "não informado"} kg
- Observações: ${body.notes || "nenhuma"}
- Fotos disponíveis: ${urls.length} (${urls.map(([l]) => l).join(", ")})

Analise as imagens e devolva o JSON pedido, com valores coerentes entre si.`,
      },
    ];
    for (const [label, url] of urls) {
      content.push({ type: "text", text: label });
      content.push({ type: "image_url", image_url: { url, detail: "high" } });
    }

    // Mesma família de modelos usada na geração de treino e dieta.
    const models = Array.from(new Set([AI_MODELS.fallback, AI_MODELS.primary].filter(Boolean)));
    let last: { status: number; data: any } | null = null;
    let raw: string | null = null;
    let usedModel: string | null = null;

    for (const model of models) {
      const r = await callOpenAIVision(model, content, apiKey);
      if (r.ok) {
        const text = r.data?.choices?.[0]?.message?.content;
        if (text) {
          raw = text;
          usedModel = model;
          break;
        }
      }
      last = { status: r.status, data: r.data };
      console.error(`body-composition-ai: falha no modelo ${model}`, r.status, JSON.stringify(r.data)?.slice(0, 400));
      if (r.status === 401) break;
    }

    if (!raw) {
      if (last?.status === 429) return j(429, { error: "Limite de requisições atingido. Tente novamente em instantes." });
      if (last?.status === 401) return j(401, { error: "Chave OpenAI inválida ou sem créditos." });
      return j(502, { error: "Falha na análise de IA.", detail: JSON.stringify(last?.data ?? {}).slice(0, 500) });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!parsed) return j(502, { error: "Resposta da IA em formato inválido." });

    return j(200, { result: parsed, model: usedModel });
  } catch (err) {
    console.error("body-composition-ai error", err);
    return j(500, { error: err instanceof Error ? err.message : "Erro desconhecido." });
  }
});
