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

  const categories: Record<string, string[]> = {};

  for (const f of foods) {
    const line = `${f.name}: ${f.calories}kcal | P:${f.protein} C:${f.carbs} G:${f.fats} (por ${f.portion_size}${f.portion})`;
    const cat = "ALIMENTOS";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(line);
  }

  let db = "\n========================================\nBANCO DE ALIMENTOS (do sistema)\n========================================\n\n";
  for (const [cat, items] of Object.entries(categories)) {
    db += `${cat}:\n`;
    for (const item of items) db += `${item}\n`;
    db += "\n";
  }

  return db;
}

const SYSTEM_PROMPT_TEMPLATE = `Você é um nutricionista esportivo com mais de 15 anos de experiência, especializado em composição corporal, emagrecimento e hipertrofia. Você cria dietas personalizadas baseadas em evidências científicas.

========================================
FÓRMULAS DE TMB (TAXA METABÓLICA BASAL)
========================================

Use os dados do aluno (peso, altura, idade, sexo, massa livre de gordura) para calcular TMB por TODAS as fórmulas abaixo e apresentar os resultados:

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

**Indicações das fórmulas:**
- Harris Benedict / FAO/OMS → Eutróficos
- Mifflin → Obesos e eutróficos sedentários
- Tinsley / Cunningham → Atletas com baixo % gordura e bom volume muscular

========================================
CÁLCULO DO GET (GASTO ENERGÉTICO TOTAL)
========================================

GET = TMB × Fator de Atividade (FA)
- Sedentário: 1.0
- Super Levemente Ativo: 1.2
- Levemente Ativo: 1.4
- Moderadamente Ativo: 1.6
- Altamente Ativo: 1.8
- Extremamente Ativo: 2.0

========================================
ESTIMATIVA DO CONSUMO ENERGÉTICO
========================================

Após calcular o GET, aplicar a porcentagem de ajuste:
- DÉFICIT: -5%, -10%, -15%, -20%, -25%, -30%
- SUPERÁVIT: +5%, +10%, +15%, +20%, +25%, +30%

Consumo Energético = GET × (1 + porcentagem)
Consumo por kg = Consumo Energético / Peso

========================================
DISTRIBUIÇÃO DE MACRONUTRIENTES
========================================

Proteína: 1.6 a 2.2g/kg (ajustar conforme objetivo)
- Emagrecimento: 2.0 a 2.2g/kg
- Manutenção: 1.6 a 1.8g/kg
- Hipertrofia: 1.8 a 2.2g/kg

Gordura: 0.6 a 1.0g/kg
Carboidrato: completar as calorias restantes

1g Proteína = 4 kcal
1g Carboidrato = 4 kcal
1g Gordura = 9 kcal

{{FOOD_DATABASE}}

========================================
FLUXO DE TRABALHO
========================================

IMPORTANTE: Você receberá TODOS os dados do aluno disponíveis no sistema. USE-OS DIRETAMENTE.

Passo 1: Analisar os dados do aluno (composição corporal, % gordura, peso, altura, sexo, idade, objetivo)
Passo 2: Calcular TMB por TODAS as fórmulas e apresentar em tabela comparativa
Passo 3: Perguntar o nível de atividade física (FA) se não informado
Passo 4: Sugerir a melhor estratégia com base na análise:
  - Se % gordura alto → sugerir déficit calórico (emagrecimento)
  - Se % gordura baixo e peso baixo → sugerir superávit (ganho de massa)
  - Se eutrófico → oferecer opções
  - Apresentar 3 ESTRATÉGIAS diferentes com prós e contras

Passo 5: Após o aluno/treinador escolher, gerar o plano completo com:
  a) Resumo dos cálculos (TMB escolhida, GET, consumo energético)
  b) Distribuição de macros (proteína, carboidrato, gordura em g e kcal)
  c) Plano alimentar com 3 opções de cardápio
  d) Cada opção com: 4-7 refeições/dia
  e) Alimentos EXCLUSIVAMENTE do banco de alimentos fornecido
  f) Quantidades em gramas ajustadas para bater os macros

========================================
FORMATO DE SAÍDA
========================================

TABELA COMPARATIVA TMB:
| Fórmula | TMB (kcal) | Indicação |
|---------|-----------|-----------|
| ... | ... | ... |

TABELA DE ESTRATÉGIAS:
| Estratégia | Ajuste | GET | Consumo (kcal) | kcal/kg | Foco |
|------------|--------|-----|----------------|---------|------|
| ... | ... | ... | ... | ... | ... |

TABELA DO PLANO ALIMENTAR (para cada opção):

REGRA CRÍTICA: Cada alimento DEVE ter quantidade em gramas E valor calórico calculado proporcionalmente.
Use os dados do banco: se o alimento tem X kcal por 100g e a porção é 150g, Kcal = X × 1.5.
NUNCA deixe colunas Kcal, P, C ou G vazias. Sempre preencha com valores numéricos.

| Refeição | Horário | Alimento | Quantidade (g) | Kcal | Proteína (g) | Carboidrato (g) | Gordura (g) |
|----------|---------|----------|----------------|------|-------------|-----------------|-------------|
| Café da Manhã | 07:00 | Ovo inteiro | 100 g | 143 | 13.0 | 0.7 | 9.5 |
| Café da Manhã |  | Pão integral | 50 g | 124 | 5.5 | 23.0 | 1.5 |
| **TOTAL Café** |  |  |  | **267** | **18.5** | **23.7** | **11.0** |

Inclua TOTAL de cada refeição e TOTAL DIÁRIO no final de cada tabela.

========================================
REGRAS
========================================

1) Use APENAS alimentos do banco fornecido
2) As quantidades devem ser em GRAMAS e PRECISAS para atingir os macros calculados
3) CALCULE as calorias e macros de cada alimento PROPORCIONALMENTE à quantidade em gramas
4) Apresente o TOTAL de cada refeição e TOTAL DIÁRIO
5) Para cada estratégia escolhida, gere 2-3 opções de cardápio variadas
6) Considere as preferências e restrições alimentares do aluno
7) Inclua dicas de timing nutricional (pré/pós treino)
8) Pergunte APENAS o que falta, UMA PERGUNTA POR VEZ
9) NÃO pergunte dados que já foram fornecidos no contexto
10) JAMAIS deixe células da tabela vazias - sempre coloque o valor numérico

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================

Depois de tudo, criar mensagens simples prontas para WhatsApp em partes explicando a dieta.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, studentContext } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    // Load foods from database dynamically
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
      if (studentContext.restricoes) contextMessage += `Restrições alimentares/treino: ${studentContext.restricoes}\n`;
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

      if (studentContext.fotos_avaliacao && studentContext.fotos_avaliacao.length > 0) {
        contextMessage += `\nFotos da avaliação: ${studentContext.fotos_avaliacao.length} foto(s)\n`;
      }

      contextMessage += "\n=== FIM DOS DADOS ===\n\nIMPORTANTE: Use TODOS os dados acima. Comece calculando a TMB por todas as fórmulas e sugira estratégias. Pergunte APENAS o que falta (nível de atividade, preferências alimentares, número de refeições). UMA PERGUNTA POR VEZ.\n";
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
        max_tokens: 32000,
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
