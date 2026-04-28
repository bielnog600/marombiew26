import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PhotoInput {
  front?: string | null;
  side?: string | null;
  back?: string | null;
}

interface RequestBody {
  photos: PhotoInput;
  heightCm?: number | null;
  sex?: string | null;
  angles?: Record<string, number | null> | null;
  regionScores?: Array<{ label: string; status: string; note?: string; angle?: number | null }> | null;
  notes?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as RequestBody;
    const { photos, heightCm, sex, angles, regionScores, notes } = body || ({} as RequestBody);

    if (!photos || (!photos.front && !photos.side && !photos.back)) {
      return new Response(
        JSON.stringify({ error: "É necessário ao menos uma foto (frente, lado ou costas)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `Você é um fisioterapeuta e profissional de educação física especialista em avaliação postural estática.
Analise as fotos do aluno (frente, lado e costas) e os dados quantitativos calculados pelo MediaPipe.
Produza um laudo postural CLÍNICO, OBJETIVO e em PORTUGUÊS DO BRASIL.

Regras:
- Use linguagem técnica acessível ao avaliador.
- Não diagnostique patologias graves; sugira encaminhamento se necessário.
- Seja específico nos achados (esquerda/direita, grau de severidade: leve/moderado/grave).
- Foque em desvios visíveis: ombros, escápulas, pelve, joelhos, pés, cabeça, coluna.

Formato OBRIGATÓRIO em Markdown:

## 🔍 Achados Principais
(Lista bullet com 4 a 8 desvios observados, com lateralidade e severidade)

## ⚠️ Compensações e Riscos
(Cadeias compensatórias e possíveis sobrecargas musculares/articulares)

## 💪 Recomendações de Exercícios
**Fortalecimento:** (3-5 exercícios específicos)
**Alongamento/Mobilidade:** (3-5 exercícios específicos)
**Estabilização/Core:** (2-3 exercícios)

## 🎯 Plano de Reavaliação
(Sugestão de prazo para reavaliar e o que monitorar)

## 📝 Observações ao Aluno
(2-3 frases motivacionais e orientações de hábitos posturais no dia a dia)`;

    const userContent: any[] = [
      {
        type: "text",
        text: `Dados do aluno:\n- Altura: ${heightCm ?? "não informada"} cm\n- Sexo: ${sex ?? "não informado"}\n\nMétricas calculadas (MediaPipe):\n${JSON.stringify(angles ?? {}, null, 2)}\n\nScores por região:\n${JSON.stringify(regionScores ?? [], null, 2)}\n\nObservações do avaliador: ${notes || "nenhuma"}\n\nAnalise as imagens abaixo e gere o laudo postural completo.`,
      },
    ];

    const labels: Record<keyof PhotoInput, string> = {
      front: "Vista FRONTAL",
      side: "Vista LATERAL (perfil)",
      back: "Vista POSTERIOR (costas)",
    };

    for (const key of ["front", "side", "back"] as const) {
      const url = photos[key];
      if (url) {
        userContent.push({ type: "text", text: labels[key] });
        userContent.push({ type: "image_url", image_url: { url, detail: "high" } });
      }
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 4000,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Chave OpenAI inválida ou sem créditos." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Falha ao gerar análise postural via OpenAI." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content ?? "";

    return new Response(
      JSON.stringify({ analysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("posture-ai-analysis error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});