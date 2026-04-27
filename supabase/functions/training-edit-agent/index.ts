import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um personal trainer especialista que EDITA um treino existente conforme a instrução do usuário.

REGRAS DE SAÍDA (OBRIGATÓRIAS — RETORNE APENAS JSON VÁLIDO, SEM TEXTO EXTRA, SEM MARKDOWN):

{
  "actions": [
    {
      "op": "add" | "modify" | "remove" | "replace",
      "index": <número, 0-based, opcional para add no final> ,
      "match": "<nome aproximado do exercício a modificar/remover/substituir, opcional>",
      "exercise": {
        "exercise": "NOME DO EXERCÍCIO EM MAIÚSCULAS",
        "series": "3",
        "series2": "",
        "reps": "8-10",
        "rir": "1-2",
        "pause": "60s",
        "description": "técnica/dica/adaptação",
        "variation": "NOME DA VARIAÇÃO"
      }
    }
  ],
  "summary": "frase curta explicando as mudanças"
}

OPERAÇÕES:
- "add": adiciona um novo exercício. Se "index" for fornecido, insere naquela posição; senão, adiciona ao final.
- "modify": altera os campos fornecidos do exercício identificado por "match" (nome) ou "index". Campos não fornecidos no objeto "exercise" são mantidos.
- "remove": remove o exercício identificado por "match" ou "index". Não precisa enviar "exercise".
- "replace": substitui completamente o exercício identificado por "match" ou "index" pelo novo "exercise".

REGRAS DOS CAMPOS:
- "series" = SEMPRE preenchido com número (string). Nunca vazio.
- "series2" = vazio ("") salvo se for prescrição com reconhecimento + trabalho.
- "reps" = só reps ou faixa ("8", "8-10", "12+8-10" para reconhecimento + trabalho).
- "rir" = "1", "2", "1-2", etc. ou vazio se acessório/mobilidade.
- "pause" = SEMPRE no formato "<n>s" (ex: "60s", "90s"). Nunca aspas, nunca "seg".
- Nomes de exercícios e variações devem ser do BANCO DE EXERCÍCIOS fornecido pelo sistema (em maiúsculas).
- "variation" deve ser do mesmo grupo muscular e DIFERENTE do "exercise".

CASOS COMUNS:
- "adicionar exercício de core/abdômen" → adicione 1-2 exercícios de ABDOMEN/core do banco (ex: PRANCHA FRONTAL, ABDOMINAL SUPRA, ABS SENTADO 1).
- "trocar X por algo mais leve" → use "replace" com alternativa segura.
- "mais intensidade" → modifique reps menores, RIR menor, ou adicione técnica avançada na descrição (drop-set, rest-pause).
- "menos volume" → use "remove" em exercícios menos prioritários.
- "diminuir descanso" → modify pause.
- Se o usuário pedir uma técnica (drop-set, rest-pause, cluster), aplique modify na "description" do(s) exercício(s) alvo.

IMPORTANTE: Considere o contexto do dia (grupo muscular já presente). Não duplique exercícios. Respeite restrições/lesões do aluno se fornecidas.

RETORNE APENAS O JSON. NADA MAIS.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { dayName, currentExercises, instruction, exerciseCatalog, studentContext } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    if (!instruction || typeof instruction !== "string") {
      return new Response(JSON.stringify({ error: "instruction é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build catalog string grouped
    const catalogText = Array.isArray(exerciseCatalog) && exerciseCatalog.length > 0
      ? exerciseCatalog
          .reduce((acc: Record<string, string[]>, ex: any) => {
            const g = (ex.grupo_muscular || "OUTROS").toUpperCase();
            if (!acc[g]) acc[g] = [];
            acc[g].push(String(ex.nome || "").toUpperCase());
            return acc;
          }, {})
      : null;

    let catalogBlock = "";
    if (catalogText) {
      catalogBlock = "\n\n=== BANCO DE EXERCÍCIOS DISPONÍVEIS (use APENAS esses nomes) ===\n";
      for (const [g, list] of Object.entries(catalogText)) {
        catalogBlock += `\n--- ${g} ---\n${(list as string[]).join(", ")}\n`;
      }
    }

    const currentBlock = `\n\n=== TREINO ATUAL (${dayName}) ===\n` +
      (Array.isArray(currentExercises) && currentExercises.length > 0
        ? currentExercises.map((ex: any, i: number) =>
            `[${i}] ${ex.exercise} | séries: ${ex.series || "-"}${ex.series2 ? "+" + ex.series2 : ""} | reps: ${ex.reps || "-"} | RIR: ${ex.rir || "-"} | pausa: ${ex.pause || "-"} | variação: ${ex.variation || "-"}${ex.description ? " | desc: " + ex.description : ""}`
          ).join("\n")
        : "(nenhum exercício ainda)");

    let safetyBlock = "";
    if (studentContext) {
      const parts: string[] = [];
      if (studentContext.lesoes) parts.push(`LESÕES: ${studentContext.lesoes}`);
      if (studentContext.restricoes) parts.push(`RESTRIÇÕES: ${studentContext.restricoes}`);
      if (studentContext.observacoes) parts.push(`OBS PROFESSOR: ${studentContext.observacoes}`);
      if (studentContext.objetivo) parts.push(`OBJETIVO: ${studentContext.objetivo}`);
      if (parts.length) {
        safetyBlock = `\n\n=== DADOS DO ALUNO (RESPEITAR) ===\n${parts.join("\n")}`;
      }
    }

    const userMessage = `${currentBlock}${safetyBlock}${catalogBlock}\n\n=== INSTRUÇÃO DO USUÁRIO ===\n${instruction}\n\nRetorne o JSON com as ações.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4000,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("training-edit-agent OpenAI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes na conta OpenAI." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse AI JSON:", raw);
      return new Response(JSON.stringify({ error: "Resposta inválida da IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("training-edit-agent error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});