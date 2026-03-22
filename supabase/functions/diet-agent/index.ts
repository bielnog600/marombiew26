import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FOOD_DATABASE = `
========================================
BANCO DE ALIMENTOS (valores por 100g salvo indicado)
========================================

CARBOIDRATOS / CEREAIS:
Arroz branco: 129kcal | P:2.5 C:28.18 G:0.23
Arroz integral: 111kcal | P:2.58 C:22.96 G:0.90
Arroz basmati: 361kcal | P:7.70 C:79.00 G:1.00
Batata-doce: 86kcal | P:1.57 C:20.12 G:0.05
Batata inglesa cozida: 77kcal | P:1.90 C:17.13 G:0.12
Mandioca cozida: 173kcal | P:1.34 C:37.46 G:2.04
Macarrão integral: 124kcal | P:5.33 C:26.54 G:0.54
Quinoa cozida: 143kcal | P:5.01 C:26.35 G:2.22
Feijão preto cozido: 132kcal | P:8.86 C:23.71 G:0.54
Feijão carioca cozido: 76kcal | P:4.80 C:13.60 G:0.50
Grão de bico: 117kcal | P:6.50 C:14.00 G:2.50
Lentilhas: 165kcal | P:8.39 C:18.73 G:6.76
Aveia em flocos: 352kcal | P:14.53 C:57.01 G:7.87
Tapioca: 347kcal | P:0.20 C:85.94 G:0.10
Cuscuz: 112kcal | P:3.79 C:23.22 G:0.16
Pão integral: 260kcal | P:9.10 C:47.20 G:4.10
Pão: 266kcal | P:7.64 C:50.61 G:3.29
Pão de forma: 262kcal | P:9.20 C:48.00 G:3.00
Granola sem açúcar: 399kcal | P:9.90 C:47.00 G:15.00
Couve-flor: 25kcal | P:1.98 C:5.30 G:0.10
Cogumelos: 22kcal | P:3.09 C:3.28 G:0.34
Alface: 14kcal | P:0.90 C:2.97 G:0.14
Tomate: 18kcal | P:0.88 C:3.92 G:0.20
Pepino: 15kcal | P:0.65 C:3.63 G:0.11
Cenoura: 41kcal | P:0.93 C:9.58 G:0.24
Beterraba cozida: 44kcal | P:1.67 C:9.90 G:0.18
Espinafre: 23kcal | P:2.86 C:3.63 G:0.39
Couve Refogada: 92kcal | P:1.91 C:7.64 G:6.71
Arroz de pato: 181kcal | P:8.50 C:18.90 G:7.90

PROTEÍNAS:
Filé de frango grelhado: 165kcal | P:31.00 C:0 G:3.60
Frango desfiado: 148kcal | P:29.00 C:0 G:3.70
Peito de peru assado: 93kcal | P:18.00 C:2.30 G:1.20
Carne bovina magra: 269kcal | P:25.54 C:0 G:17.67
Carne bovina grelhada: 250kcal | P:26.00 C:0 G:17.00
Salmão grelhado: 165kcal | P:21.00 C:0.50 G:8.70
Atum em água: 104kcal | P:25.00 C:0 G:0.50
Filé de peixe grelhado: 96kcal | P:20.00 C:0 G:1.70
Bacalhau grelhado: 122kcal | P:20.91 C:0.41 G:3.59
Camarão grelhado: 154kcal | P:24.47 C:1.17 G:5.03
Moela de frango: 94kcal | P:17.66 C:0 G:2.06
Tofu: 151kcal | P:16.60 C:0.40 G:8.40
Soja texturizada cozida: 172kcal | P:17.00 C:10.00 G:9.00
Hambúrguer de soja: 179kcal | P:17.91 C:13.40 G:5.97
Ovo cozido: 154kcal | P:12.53 C:1.12 G:10.57
Clara de ovo: 52kcal | P:10.90 C:0.73 G:0.17
Ovos mexidos: 212kcal | P:13.84 C:2.08 G:16.18

LATICÍNIOS:
Iogurte natural desnatado: 56kcal | P:5.73 C:7.68 G:0.18
Iogurte grego natural: 106kcal | P:3.80 C:4.20 G:8.20
Iogurte natural integral: 105kcal | P:6.00 C:8.00 G:5.00
Iogurte skyr morango: 47kcal | P:7.40 C:3.80 G:0
Yopro: 175kcal | P:25.00 C:16.20 G:1.20
Queijo cottage: 103kcal | P:12.49 C:2.68 G:4.51
Queijo Ricota: 156kcal | P:11.32 C:4.09 G:10.44
Queijo branco: 230kcal | P:14.58 C:4.25 G:17.27
Leite integral: 60kcal | P:3.22 C:4.52 G:3.25

GORDURAS / OLEAGINOSAS:
Abacate: 160kcal | P:2.00 C:8.50 G:14.70
Azeite de oliva: 884kcal | P:0 C:0 G:100.00
Pasta de amendoim: 588kcal | P:24.47 C:19.97 G:49.84
Castanha de caju: 574kcal | P:15.31 C:32.69 G:46.35
Amêndoas: 578kcal | P:21.26 C:19.74 G:50.64
Nozes: 680kcal | P:16.70 C:10.50 G:62.30
Chia: 464kcal | P:22.00 C:2.60 G:34.00
Coco: 354kcal | P:3.33 C:15.23 G:33.49

VERDURAS / LEGUMES:
Brócolis cozido: 22kcal | P:2.31 C:4.40 G:0.12
Espinafre refogado: 23kcal | P:2.90 C:3.60 G:0.40
Vagem cozida: 61kcal | P:3.18 C:6.90 G:2.49
Cenoura cozida: 54kcal | P:0.74 C:7.99 G:2.48
Couve refogada: 48kcal | P:1.77 C:4.00 G:0.70
Abobrinha refogada: 17kcal | P:1.20 C:3.10 G:0.30
Berinjela: 24kcal | P:1.01 C:5.70 G:0.19
Espargos: 21kcal | P:2.20 C:1.70 G:0.30
Couve de Bruxelas cozidas: 55kcal | P:2.47 C:6.91 G:2.77
Legumes cozidos variados: 60kcal | P:2.00 C:8.00 G:2.50

FRUTAS:
Banana: 89kcal | P:1.10 C:23.00 G:0.30
Maçã: 52kcal | P:0.26 C:13.81 G:0.17
Morango: 32kcal | P:0.67 C:7.68 G:0.30
Laranja: 47kcal | P:0.94 C:11.75 G:0.12
Manga: 65kcal | P:0.51 C:17.00 G:0.27
Abacaxi: 48kcal | P:0.54 C:12.63 G:0.12
Mamão: 46kcal | P:0.44 C:11.58 G:0.14
Kiwi: 61kcal | P:1.10 C:15.00 G:0.50
Melancia: 30kcal | P:0.61 C:7.55 G:0.15
Melão: 34kcal | P:0.84 C:8.16 G:0.19
Uvas: 69kcal | P:0.72 C:18.10 G:0.16
Pêra: 58kcal | P:0.38 C:15.46 G:0.12

SUPLEMENTOS (por dose):
Whey Protein Isolado (100g): 374kcal | P:82.31 C:4.42 G:3.06
Whey Protein Concentrado (30g): 120kcal | P:24.00 C:3.00 G:2.00
Caseína (30g): 120kcal | P:24.00 C:3.00 G:1.00
Albumina (100g): 380kcal | P:80.00 C:4.00 G:0
Proteína da Ervilha (30g): 100kcal | P:21.00 C:2.00 G:0.50
Creatina (5g): 0kcal
BCAA (10g): 0kcal
Beta Alanina (2g): 0kcal
Glutamina (5g): 24kcal
Maltodextrina (100g): 380kcal | P:0 C:95.00 G:0
Dextrose (100g): 400kcal | P:0 C:100.00 G:0
Waxy Maize (100g): 370kcal | P:0 C:92.00 G:0

OUTROS:
Tortilha integral: 263kcal | P:9.61 C:55.82 G:1.30
Torrada integral: 350kcal | P:13.67 C:56.67 G:8.00
Biscoito de arroz integral: 392kcal | P:7.00 C:81.00 G:3.50
Bolacha de arroz: 377kcal | P:9.14 C:82.29 G:0
Chocolate 74%: 560kcal | P:8.40 C:32.00 G:41.00
Gelatina Zero: 7kcal | P:1.80 C:0.50 G:0
Mel: 304kcal | P:0.30 C:82.40 G:0
Geleia de frutas: 266kcal | P:0.15 C:69.95 G:0.02
Hummus Classic: 286kcal | P:7.80 C:13.90 G:21.10
`;

const SYSTEM_PROMPT = `Você é um nutricionista esportivo com mais de 15 anos de experiência, especializado em composição corporal, emagrecimento e hipertrofia. Você cria dietas personalizadas baseadas em evidências científicas.

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

${FOOD_DATABASE}

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
| Refeição | Horário | Alimento | Quantidade (g) | Kcal | Proteína (g) | Carboidrato (g) | Gordura (g) |
|----------|---------|----------|----------------|------|-------------|-----------------|-------------|
| ... | ... | ... | ... | ... | ... | ... | ... |

TOTAL do dia no final de cada tabela.

========================================
REGRAS
========================================

1) Use APENAS alimentos do banco fornecido
2) As quantidades devem ser PRECISAS para atingir os macros calculados
3) Apresente o TOTAL de cada refeição e do dia
4) Gere pelo menos 3 estratégias diferentes (ex: déficit moderado, déficit agressivo, manutenção)
5) Para cada estratégia escolhida, gere 2-3 opções de cardápio variadas
6) Considere as preferências e restrições alimentares do aluno
7) Inclua dicas de timing nutricional (pré/pós treino)
8) Pergunte APENAS o que falta, UMA PERGUNTA POR VEZ
9) NÃO pergunte dados que já foram fornecidos no contexto

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
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
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
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
