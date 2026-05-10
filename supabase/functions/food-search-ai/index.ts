import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, mode, existingFoods } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: mode === 'suggest' ? [
          {
            role: "system",
            content: `Você é um especialista em nutrição. Sua tarefa é sugerir alimentos saudáveis, ideais para dietas equilibradas, que NÃO estejam na lista fornecida pelo usuário.
            Retorne APENAS um array de objetos JSON no seguinte formato:
            [
              {
                "name": "Nome do Alimento",
                "portion": "gramas",
                "portion_size": 100,
                "calories": 0,
                "protein": 0,
                "carbs": 0,
                "fats": 0
              }
            ]
            Importante:
            1. Sugira 10 a 15 alimentos extremamente variados.
            2. VARIEDADE RADICAL: Cada resposta deve ser totalmente imprevisível. Alterne entre frutas exóticas, tipos de peixes, cortes de carne magra, sementes, raízes e grãos integrais.
            3. EVITE O ÓBVIO: Não sugira alimentos comuns que já costumam estar em qualquer banco de dados (como frango, ovo, maçã, banana).
            4. BLOQUEIO SEMÂNTICO: Verifique rigorosamente os alimentos já cadastrados: ${existingFoods?.join(', ') || 'nenhum'}. Se o usuário já tem qualquer variação de um alimento (ex: se tem "Nabo cozido"), NÃO sugira nada que contenha a palavra "Nabo".
            5. CATEGORIAS: Tente incluir pelo menos um item de cada: Fruta, Vegetal, Proteína Animal, Proteína Vegetal, Gordura Boa, Grão/Cereal.
            6. Porção: 100g.
            7. Responda APENAS o JSON.`
          },
          { role: "user", content: "Sugira alimentos saudáveis ausentes na lista." }
        ] : [
          {
            role: "system",
            content: `Você é um especialista em nutrição. O usuário fornecerá o nome de um alimento e você deve retornar os dados nutricionais baseados em fontes confiáveis como FatSecret ou MyFitnessPal.
            Retorne APENAS um objeto JSON no seguinte formato:
            {
              "name": "Nome do Alimento",
              "portion": "gramas",
              "portion_size": 100,
              "calories": 0,
              "protein": 0,
              "carbs": 0,
              "fats": 0
            }
            Importante:
            1. Tente ser o mais preciso possível.
            2. Se o alimento for genérico, use uma porção de 100g.
            3. Responda apenas o JSON, sem texto adicional.
            4. Use g (gramas) para porção se não especificado.`
          },
          { role: "user", content: query }
        ],
        temperature: 1.0,
      }),
    });

    const data = await response.json();
    console.log("OpenAI Response:", data);

    if (!data.choices || !data.choices[0]) {
      throw new Error("Resposta inválida da OpenAI");
    }

    const content = data.choices[0].message.content.trim();
    
    // Remove potential markdown code blocks
    const jsonStr = content.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const foodData = JSON.parse(jsonStr);

    return new Response(JSON.stringify(foodData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in food-search-ai:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});