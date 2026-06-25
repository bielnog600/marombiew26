import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista em prescrição de treino de musculação.
Sua tarefa: agrupar uma lista de exercícios em GRUPOS DE VARIAÇÃO — exercícios que treinam o mesmo padrão de movimento e podem ser substituídos uns pelos outros em um treino.

REGRAS:
- Cada grupo deve representar UM padrão de movimento (ex: "Afundo", "Supino horizontal", "Remada baixa", "Agachamento livre").
- Inclua TODAS as variações relevantes do mesmo padrão no mesmo grupo, independente do equipamento (halteres, smith, barra, máquina, peso corporal, búlgaro, dois steps, etc).
- Exercícios que treinam padrões diferentes vão em grupos diferentes (ex: Agachamento ≠ Afundo ≠ Leg press).
- Nome do grupo: curto, descritivo, em português (ex: "Afundo", "Supino reto", "Remada curvada").
- Descrição: 1 linha explicando o padrão de movimento e principais músculos.
- Cada exercício deve aparecer em NO MÁXIMO UM grupo.
- Exercícios sem variação clara (únicos) podem ficar de fora.
- Use APENAS os IDs fornecidos. Não invente IDs.

Retorne via a função "organize_variations".`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const { exercises, existingGroups } = await req.json();
    if (!Array.isArray(exercises) || exercises.length === 0) {
      return new Response(JSON.stringify({ error: "exercises array é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exerciseList = exercises
      .map((e: any) => `- ${e.id} | ${e.nome} | grupo: ${e.grupo_muscular ?? "-"}`)
      .join("\n");

    const existingBlock =
      Array.isArray(existingGroups) && existingGroups.length > 0
        ? `\n\nGRUPOS JÁ EXISTENTES (preserve quando fizer sentido, complete com exercícios faltantes):\n${existingGroups
            .map(
              (g: any) =>
                `• ${g.nome}: ${(g.exercise_ids ?? []).length} exercícios`
            )
            .join("\n")}`
        : "";

    const userPrompt = `Organize os exercícios abaixo em grupos de variação.${existingBlock}

EXERCÍCIOS DISPONÍVEIS (id | nome | grupo muscular):
${exerciseList}

Retorne os grupos via a função organize_variations.`;

    const tool = {
      type: "function",
      function: {
        name: "organize_variations",
        description: "Retorna grupos de variação de exercícios.",
        parameters: {
          type: "object",
          properties: {
            groups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string" },
                  descricao: { type: "string" },
                  exercise_ids: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["nome", "exercise_ids"],
                additionalProperties: false,
              },
            },
          },
          required: ["groups"],
          additionalProperties: false,
        },
      },
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "organize_variations" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      const status = response.status === 429 || response.status === 402 ? response.status : 500;
      return new Response(
        JSON.stringify({ error: status === 429 ? "Limite excedido. Tente novamente." : status === 402 ? "Créditos OpenAI esgotados." : "Erro no gateway de IA" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "IA não retornou grupos." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Resposta da IA inválida" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter IDs to only valid ones
    const validIds = new Set(exercises.map((e: any) => String(e.id)));
    const groups = (parsed.groups ?? [])
      .map((g: any) => ({
        nome: String(g.nome ?? "").trim(),
        descricao: g.descricao ? String(g.descricao).trim() : "",
        exercise_ids: Array.from(
          new Set((g.exercise_ids ?? []).map(String).filter((id: string) => validIds.has(id)))
        ),
      }))
      .filter((g: any) => g.nome && g.exercise_ids.length >= 2);

    return new Response(JSON.stringify({ groups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("organize-exercise-variations error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});