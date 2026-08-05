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
Analise as fotos do aluno (frente, lado, costas) junto com os dados informados e ESTIME a composição corporal.

Regras:
- Trabalhe SEMPRE em português do Brasil e no sistema métrico (kg, cm, %).
- Estimativas visuais têm margem de erro. Informe confiança (baixa/média/alta) e a margem em pontos percentuais.
- Se altura/peso forem informados, use-os como âncora para calcular massa gorda e massa magra.
- Estime perímetros (medidas antropométricas) em cm, comparando proporções corporais nas fotos.
- Estime também dobras cutâneas aparentes quando possível (mm).
- NUNCA diagnostique doenças. Se as fotos forem insuficientes, diga isso em "limitacoes".

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return j(500, { error: "LOVABLE_API_KEY não configurada." });

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

Analise as imagens e devolva o JSON pedido.`,
      },
    ];
    for (const [label, url] of urls) {
      content.push({ type: "text", text: label });
      content.push({ type: "image_url", image_url: { url } });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("ai gateway failed", resp.status, detail.slice(0, 500));
      if (resp.status === 429) return j(429, { error: "Limite de requisições atingido. Tente novamente em instantes." });
      if (resp.status === 402) return j(402, { error: "Créditos de IA esgotados. Adicione créditos no workspace." });
      return j(502, { error: "Falha na análise de IA.", detail: detail.slice(0, 500) });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!parsed) return j(502, { error: "Resposta da IA em formato inválido." });

    return j(200, { result: parsed });
  } catch (err) {
    console.error("body-composition-ai error", err);
    return j(500, { error: err instanceof Error ? err.message : "Erro desconhecido." });
  }
});
