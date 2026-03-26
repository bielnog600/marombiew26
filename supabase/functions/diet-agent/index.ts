import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function loadFoodDatabase(): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: foods, error } = await supabase
    .from("foods")
    .select("name, calories, protein, carbs, fats, portion, portion_size")
    .order("name");

  if (error || !foods || foods.length === 0) {
    console.error("Error loading foods:", error);
    return "BANCO DE ALIMENTOS: Nenhum alimento cadastrado.";
  }

  const lines: string[] = [];
  for (const f of foods) {
    lines.push(`${f.name}: ${f.calories}kcal | P:${f.protein} C:${f.carbs} G:${f.fats} (por ${f.portion_size}${f.portion})`);
  }

  return `\n========================================\nBANCO DE ALIMENTOS (do sistema)\n========================================\n\nALIMENTOS:\n${lines.join("\n")}\n`;
}

const SYSTEM_PROMPT_TEMPLATE = `Você é um nutricionista esportivo com mais de 15 anos de experiência, especializado em fisiculturismo, composição corporal, emagrecimento e hipertrofia. Você cria dietas personalizadas baseadas em evidências científicas para atletas e praticantes de musculação.

========================================
FÓRMULAS DE TMB (TAXA METABÓLICA BASAL)
========================================

Use os dados do aluno (peso, altura, idade, sexo, massa livre de gordura) para calcular TMB por TODAS as fórmulas abaixo:

**MASCULINO:**
- FAO/OMS: TMB = 15.3 × Peso + 679
- Harris Benedict: TMB = 66.47 + (13.75 × Peso) + (5.003 × Altura_cm) - (6.755 × Idade)
- Mifflin: TMB = (10 × Peso) + (6.25 × Altura_cm) - (5 × Idade) + 5
- Cunningham: TMB = 500 + (22 × MLG)
- Tinsley MLG: TMB = 25.9 × MLG + 284
- Tinsley Peso: TMB = 24.8 × Peso + 10

**FEMININO:**
- FAO/OMS: TMB = 14.7 × Peso + 496
- Harris Benedict: TMB = 655.1 + (9.563 × Peso) + (1.850 × Altura_cm) - (4.676 × Idade)
- Mifflin: TMB = (10 × Peso) + (6.25 × Altura_cm) - (5 × Idade) - 161
- Cunningham: TMB = 500 + (22 × MLG)
- Tinsley MLG: TMB = 25.9 × MLG + 284
- Tinsley Peso: TMB = 24.8 × Peso + 10

**Indicações:**
- Harris Benedict / FAO/OMS → Eutróficos
- Mifflin → Obesos e eutróficos sedentários
- Tinsley / Cunningham → Atletas com baixo % gordura e bom volume muscular

========================================
CÁLCULO DO GET
========================================

GET = TMB × FA
- Sedentário: 1.0 | Super Leve: 1.2 | Leve: 1.4 | Moderado: 1.6 | Alto: 1.8 | Extremo: 2.0

Consumo Energético = GET × (1 + porcentagem de ajuste)

========================================
MACRONUTRIENTES POR FASE
========================================

**BULKING:** P: 1.8-2.2g/kg | G: 0.8-1.2g/kg | C: restante (alto)
**CUTTING:** P: 2.2-2.8g/kg | G: 0.6-0.8g/kg | C: restante (progressivamente reduzido)
**MANUTENÇÃO:** P: 1.6-2.0g/kg | G: 0.8-1.0g/kg | C: restante
**RECOMPOSIÇÃO:** P: 2.2-2.5g/kg | G: 0.7-0.9g/kg | C: moderado, priorizar peri-treino
**PRÉ-CONTEST:** P: 2.5-3.0g/kg | G: 0.5-0.7g/kg | C: variável (manipulação nas últimas semanas)

1g P = 4 kcal | 1g C = 4 kcal | 1g G = 9 kcal

========================================
PROTOCOLOS DE AJUSTE AVANÇADOS
========================================

Quando solicitado, incluir:

**REFEED:** Dias de recarga calórica (principalmente carb) para leptina/glicogênio. Frequência, calorias extras, distribuição.
**DIET BREAK:** 1-2 semanas em manutenção para reversão metabólica.
**CARB CYCLING:** Tabela HIGH (treino intenso), MEDIUM (treino moderado), LOW (off/cardio) com gramas de carb.
**MANIPULAÇÃO DE SÓDIO:** Para pré-contest: sódio alto nas semanas anteriores, reduzir/cortar nos últimos dias.
**MANIPULAÇÃO DE ÁGUA:** Water loading e depleção para pré-contest.
**ESTRATÉGIA PARA PLATÔ:** Reverse diet, refeed, NEAT, ajuste de cardio, diet break.
**AJUSTE CALÓRICO PROGRESSIVO:** Redução ou aumento de 100-200kcal/semana conforme resposta.

========================================
HORMÔNIOS
========================================

Se usa hormônios/TRT: proteína faixa superior, carbs mais elevados (melhor particionamento), suporta déficit mais agressivo.
Se natural: faixas conservadoras para preservar massa magra.

{{FOOD_DATABASE}}

========================================
FORMATO DE SAÍDA
========================================

REGRA CRÍTICA: Cada alimento DEVE ter quantidade em gramas E valor calórico calculado proporcionalmente.
Use os dados do banco: se o alimento tem X kcal por 100g e a porção é 150g, Kcal = X × 1.5.
NUNCA deixe colunas Kcal, P, C ou G vazias. Sempre preencha com valores numéricos.

| Refeição | Horário | Alimento | Quantidade (g) | Kcal | Proteína (g) | Carboidrato (g) | Gordura (g) |
Inclua TOTAL de cada refeição e TOTAL DIÁRIO.

========================================
REGRAS
========================================

1) Use APENAS alimentos do banco fornecido
2) Quantidades em GRAMAS e PRECISAS para atingir os macros
3) CALCULE calorias e macros PROPORCIONALMENTE à quantidade em gramas
4) TOTAL de cada refeição e TOTAL DIÁRIO
5) Gere 2-3 opções de cardápio variadas
6) Considere preferências e restrições alimentares
7) Timing nutricional baseado no horário de treino (pré, intra, pós)
8) Diferencie dias de treino e dias off quando aplicável
9) NÃO pergunte dados já fornecidos
10) JAMAIS deixe células da tabela vazias

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================

Criar mensagens simples prontas para WhatsApp explicando a dieta.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, studentContext } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const foodDatabase = await loadFoodDatabase();
    const SYSTEM_PROMPT = SYSTEM_PROMPT_TEMPLATE.replace("{{FOOD_DATABASE}}", foodDatabase);

    let contextMessage = "";
    if (studentContext) {
      contextMessage = "\n\n=== DADOS COMPLETOS DO ALUNO (JÁ DISPONÍVEIS — NÃO PERGUNTE NOVAMENTE) ===\n";
      
      if (studentContext.nome) contextMessage += `Nome: ${studentContext.nome}\n`;
      if (studentContext.sexo) contextMessage += `Sexo: ${studentContext.sexo}\n`;
      if (studentContext.data_nascimento) {
        const birth = new Date(studentContext.data_nascimento);
        const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        contextMessage += `Data de nascimento: ${studentContext.data_nascimento} (${age} anos)\n`;
      }
      if (studentContext.altura) contextMessage += `Altura: ${studentContext.altura} cm\n`;
      if (studentContext.objetivo) contextMessage += `Objetivo: ${studentContext.objetivo}\n`;
      if (studentContext.restricoes) contextMessage += `Restrições: ${studentContext.restricoes}\n`;
      if (studentContext.lesoes) contextMessage += `Lesões: ${studentContext.lesoes}\n`;
      if (studentContext.observacoes) contextMessage += `Observações: ${studentContext.observacoes}\n`;

      contextMessage += "\n--- Dados Antropométricos ---\n";
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.cintura) contextMessage += `Cintura: ${studentContext.cintura} cm\n`;
      if (studentContext.quadril) contextMessage += `Quadril: ${studentContext.quadril} cm\n`;
      if (studentContext.rcq) contextMessage += `RCQ: ${studentContext.rcq}\n`;

      contextMessage += "\n--- Composição Corporal ---\n";
      if (studentContext.percentual_gordura) contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.massa_magra) contextMessage += `Massa Magra: ${studentContext.massa_magra} kg\n`;
      if (studentContext.massa_gorda) contextMessage += `Massa Gorda: ${studentContext.massa_gorda} kg\n`;

      if (studentContext.anamnese) {
        const an = studentContext.anamnese;
        contextMessage += "\n--- Anamnese ---\n";
        if (an.historico_saude) contextMessage += `Histórico: ${an.historico_saude}\n`;
        if (an.medicacao) contextMessage += `Medicação: ${an.medicacao}\n`;
        if (an.suplementos) contextMessage += `Suplementos: ${an.suplementos}\n`;
        if (an.rotina) contextMessage += `Rotina: ${an.rotina}\n`;
        if (an.sono) contextMessage += `Sono: ${an.sono}\n`;
        if (an.stress) contextMessage += `Stress: ${an.stress}\n`;
      }

      contextMessage += "\n=== FIM DOS DADOS ===\n\nIMPORTANTE: Use TODOS os dados acima. Gere o plano completo conforme solicitado. NÃO pergunte dados já fornecidos.\n";
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
          { role: "system", content: SYSTEM_PROMPT + contextMessage },
          ...messages,
        ],
        stream: true,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes na sua conta OpenAI." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("diet-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
