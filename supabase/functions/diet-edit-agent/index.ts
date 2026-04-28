import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um nutricionista esportivo especialista que EDITA uma dieta existente conforme a instrução do usuário.

REGRAS DE SAÍDA (OBRIGATÓRIAS — RETORNE APENAS JSON VÁLIDO, SEM TEXTO EXTRA, SEM MARKDOWN):

{
  "actions": [
    {
      "op": "add" | "modify" | "remove" | "replace" | "scale_meal" | "scale_day" | "set_meal_time" | "rename_meal" | "remove_meal" | "add_meal" | "carb_cycle",
      "mealMatch": "<nome aproximado da refeição alvo, opcional>",
      "mealIndex": <número 0-based, opcional>,
      "foodMatch": "<nome aproximado do alimento, opcional>",
      "foodIndex": <número 0-based, opcional>,
      "food": {
        "food": "Nome do alimento",
        "qty": "100 g",
        "kcal": "150",
        "p": "20",
        "c": "10",
        "g": "3"
      },
      "targetKcal": <número, opcional, para scale_meal/scale_day>,
      "factor": <número, opcional, ex 0.9 para reduzir 10%>,
      "newName": "<novo nome, opcional, para rename_meal>",
      "newTime": "<HH:MM, opcional, para set_meal_time>",
      "carbCycle": {
        "lowCarbDays": ["segunda", "quarta"],
        "highCarbDays": ["terça", "quinta"],
        "lowCarbReduction": 0.5,
        "highCarbIncrease": 1.2,
        "strategy": "Descrição em texto livre da estratégia"
      }
    }
  ],
  "summary": "frase curta explicando as mudanças"
}

OPERAÇÕES:
- "add": adiciona alimento à refeição (use mealMatch ou mealIndex + objeto food).
- "modify": altera campos do alimento alvo (use mealMatch/foodMatch).
- "remove": remove alimento (use mealMatch + foodMatch).
- "replace": substitui alimento completamente.
- "scale_meal": escala a refeição inteira (use targetKcal OU factor).
- "scale_day": escala o dia inteiro proporcionalmente (use targetKcal OU factor). Use isso para "reduzir calorias da dieta toda".
- "add_meal": adiciona nova refeição (use food + newName + newTime).
- "remove_meal": remove refeição inteira (use mealMatch).
- "rename_meal": renomeia refeição (mealMatch + newName).
- "set_meal_time": altera horário (mealMatch + newTime).
- "carb_cycle": cria notas de ciclo de carboidratos. NÃO mexe em refeições; apenas registra a estratégia em uma seção de observações.

REGRAS DOS ALIMENTOS:
- Use APENAS alimentos do BANCO fornecido quando possível. Se o banco tiver o alimento, use os macros do banco escalados pela porção.
- Macros sempre por porção real informada (não por 100g). Ex: 200g de arroz cozido ≈ 260kcal.
- "qty" sempre em gramas: "150 g".
- Arredonde kcal para inteiro; macros para 1 casa.

CASOS COMUNS:
- "reduzir calorias para 1800" → use scale_day com targetKcal=1800.
- "diminuir 10% das calorias" → scale_day com factor=0.9.
- "ciclo de carboidratos com low carb na segunda e quarta" → use carb_cycle.
- "trocar X por Y" → replace.
- "adicionar whey no pós-treino" → add com mealMatch.
- "tirar arroz do almoço" → remove.
- "ajustar dieta para todos os dias da semana" → carb_cycle ou observação geral, dependendo do contexto. Se for igualar dieta para todos dias, retorne summary explicando que a dieta atual já vale para todos os dias.

IMPORTANTE: Respeite restrições alimentares e preferências do aluno se fornecidas. NUNCA inclua alimentos com alergia/intolerância informada.

RETORNE APENAS O JSON. NADA MAIS.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { currentMeals, instruction, foodCatalog, studentContext, dayTotals } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    if (!instruction || typeof instruction !== "string") {
      return new Response(JSON.stringify({ error: "instruction é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Catalog (limit to keep tokens reasonable)
    let catalogBlock = "";
    if (Array.isArray(foodCatalog) && foodCatalog.length > 0) {
      const top = foodCatalog.slice(0, 250);
      catalogBlock =
        "\n\n=== BANCO DE ALIMENTOS DISPONÍVEIS (use estes preferencialmente — macros por porção_padrão g) ===\n" +
        top
          .map(
            (f: any) =>
              `${f.name} | ${f.portion_size}g => ${f.calories}kcal P${f.protein} C${f.carbs} G${f.fats}`,
          )
          .join("\n");
    }

    const currentBlock =
      "\n\n=== DIETA ATUAL ===\n" +
      (Array.isArray(currentMeals) && currentMeals.length > 0
        ? currentMeals
            .map(
              (m: any, mi: number) =>
                `[Refeição ${mi}] ${m.name}${m.time ? " (" + m.time + ")" : ""}\n` +
                (m.foods || [])
                  .map(
                    (f: any, fi: number) =>
                      `  [${fi}] ${f.food} | ${f.qty || "-"} | ${f.kcal || "-"}kcal P${f.p || "-"} C${f.c || "-"} G${f.g || "-"}`,
                  )
                  .join("\n"),
            )
            .join("\n\n")
        : "(nenhuma refeição)");

    const totalsBlock = dayTotals
      ? `\n\n=== TOTAIS DO DIA ===\n${Math.round(dayTotals.kcal)} kcal | P${Math.round(dayTotals.p)} C${Math.round(dayTotals.c)} G${Math.round(dayTotals.g)}`
      : "";

    let safetyBlock = "";
    if (studentContext) {
      const parts: string[] = [];
      if (studentContext.objetivo) parts.push(`OBJETIVO: ${studentContext.objetivo}`);
      if (studentContext.restricoes) parts.push(`RESTRIÇÕES: ${studentContext.restricoes}`);
      if (studentContext.observacoes) parts.push(`OBS: ${studentContext.observacoes}`);
      if (parts.length) safetyBlock = `\n\n=== DADOS DO ALUNO (RESPEITAR) ===\n${parts.join("\n")}`;
    }

    const userMessage = `${currentBlock}${totalsBlock}${safetyBlock}${catalogBlock}\n\n=== INSTRUÇÃO DO USUÁRIO ===\n${instruction}\n\nRetorne o JSON com as ações.`;

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
      console.error("diet-edit-agent OpenAI error:", response.status, t);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes na conta OpenAI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("Failed to parse AI JSON:", raw);
      return new Response(JSON.stringify({ error: "Resposta inválida da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("diet-edit-agent error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});