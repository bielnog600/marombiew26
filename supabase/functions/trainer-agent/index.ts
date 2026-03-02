import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXERCISE_DATABASE = `
========================================
BANCO DE EXERCÍCIOS (OBRIGATÓRIO)
========================================

REGRA ABSOLUTA: Todos os exercícios nas colunas EXERCÍCIO e VARIAÇÃO devem ser copiados EXATAMENTE como aparecem abaixo. Não invente nomes. Se não encontrar equivalente, peça para atualizar o banco.

--- QUADRÍCEPS ---
GLOBET SQUATS, AFUNDO CAIXA, HACK MACHINE, AFUNDO COM DOIS STEPS, AGACHAMENTO SMITH, SUMÔ TERRA, CADEIRA EXTENSORA, BÚLGARO, ESTABILIDADE DE JOELHO, LEG PRESS, AFUNDO HALTERES, AGACHAMENTO LIVRE, AFUNDO C/ BARRA, AFUNDO ALTERNANDO, LEG PRESS UNIL, PASSADAS, AFUNDO CAIXA ALTERN., AFUNDO SMITH, AFUNDO SMITH 2, SUMÔ COM HALTER, SUMÔ COM HALTER 2, JUMPS, SALTO LATERAL, SALTO LATERAL 2, AGACHAMENTO ISOMETRIA, AGACHAMENTO, AFUNDO S/ PESO, MINI SQUATS, PASSADA S/ PESO, LEG 180, ISOMETRIA PAREDE, LEG PRESS 45 ART, BÚLGARO SMITH

--- ISQUIOTIBIAIS ---
MESA FLEXORA, STIFF ROMENO, HIPEREXTENSÃO LOMBAR, STIFF NA POLIA, FLEXÃO NORDICA, GOOD MORNING SMITH, STIFF HALTERES, FLEXORA ALTERNANDO, FLEXORA UNILATERAL, CADEIRA FLEXORA, CADEIRA FLEXORA 2, STIFF UNILATERAL

--- PEITORAL ---
PECK DECK, SUPINO VERTICAL, SUPINO RETO, CRUCIFIXO INCLINADO, SUPINO INCLINADO SMITH, PARALELA, SUPINO RETO HALTERES, CROSS OVER, CRUCIFIXO RETO, FLEXÃO DE BRAÇO, MOBILIDADE TORÁCICA, MOBILIDADE TORÁCICA 2, MOBILIDADE TORÁCICA 3, SUPINO INCLINADO HALTERES, SUPINO RETO SMITH, SUPINO INCLINADO BARRA, PARALELA GRAVITON, FLEXÃO DE BRAÇO ADAP., CRUCIFIXO INCLINADO POLIA, CRUCIFIXO RETO POLIA, FLEXÃO+ALPINISTA, SUPINO RETO ARTICULADO, SUPINO INCLINADO ART., FLY MACHINE, SUPINO VERTICAL 2, SUPINO VERT. INCLINADO, SUPINO VERT. INCLINADO 2, SUPINO VERTICAL NEUTRA

--- DORSAL ---
PUXADA ALTA ABERTA, PUXADA NA POLIA, PUXADA GRAVITON, PULL DOWN, PUXADA ALTA TRIÂNGULO, REMADA CAVALINHO, REMADA UNILATERAL, FACE PULL, CRUCIFIXO INVERSO, REMADA MÁQUINA, REMADA TRIÂNGULO, REMADA UNILATERAL 2, MOBILIDADE ESCAPULAR, CRUCIFIXO INVERSO SENTADO, CRUCIFIXO INVERSO BANCO, REMADA CURVADA SUPINADA, REMADA CURVADA PRONADA, REMADA PRONADA, REMADA SUPINADA MÁQUINA, REMADA MÁQUINA UNIL., REMADA UNIL. SENTADO, REMADA SUPINADA, REMADA PRONADA MÁQUINA, REMADA UNIL. POLIA, REMADA PRONADA MAQ. 2, REMADA PRONADA MAQ. 3, REMADA NEUTRA MAQ., REMADA SUPINADA ART., REMADA NEUTRA ART., REMADA PRONADA MAQ. 4, REMADA NEUTRA MAQ.2, PUXADA ALTA ART., PUXADA ALTA ART. 2, PUXADA ALTA NEUTRA, CAVALINHO NEUTRA, CAVALINHO PRONADA, PUXADA ALTA UNIL., REMADA UNIL. ART., PULLDOWN

--- DELTÓIDES ---
DESENV. ARNOLD, ELEVAÇÃO FRONTAL, DESENV. MÁQUINA, ELEVAÇÃO LATERAL, MOBILIDADE OMBRO, ELEVAÇÃO FRONTAL UNIL, ELEVAÇÃO FRONTAL NEUTRA, DESENV. OMBRO BARRA, ELEVAÇÃO FRONTAL POLIA, ELEVAÇÃO FRONTAL POLIA 2, ELEVAÇÃO LATERAL UNIL., DESENV. HALTERES, REMADA ALTA POLIA, ELEVAÇÃO FRONTAL 2, DESENV. MACHINE 2, ELEVAÇÃO LATERAL MÁQ., DESENV. MACHINE NEUTRA, REAR DELT FLY, SWING

--- BÍCEPS ---
ROSCA DIRETA C/ HALTERES, ROSCA ALTERNADA, BICEPS BARRA W, BICEPS CORDA, BICEPS BARRA POLIA, ROSCA SCOTT, ROSCA SCOTT UNIL, BÍCEPS MARTELO, MARTELO ALTERNANDO, BÍCEPS BARRA W PRONADA, ROSCA SUPINADA, ROSCA ALTERNADA MÁQ., ROSCA DIRETA MÁQ.

--- TRÍCEPS ---
TRÍCEPS CORDA, TRÍCEPS FRANCÊS, TRÍCEPS SMITH, TRÍCEPS TESTA C/ BARRA, TRÍCEPS UNILATERAL, TRÍCEPS TESTA HALTERES, TRÍCEPS BARRA, TRÍCEPS FRANCÊS UNIL., TRÍCEPS CAIXA, TRÍCEPS BARRA 2, TRÍCEPS CORDA 2

--- ABDOMEN ---
ABDOMINAL BOLA SUIÇA, PRANCHA FRONTAL, ABDOMINAL SUPRA, ABDOMINAL INFRA, ABDOMINAL SUPRA PESO, ABDOMINAL SUPRA PESO 2, ABS SENTADO 1, ABS SENTADO 2, ABS CANIVETE, MOUTAIN CLIMBERS, MOUTAIN CLIMBERS 2, PRANCHA LATERAL, ABS RODA, ABS ROTATE, ABS DIAGONAL, PRANCHA 2, PRANCHA ESCADA, CANIVETE ADAPTADO, CANIVETE ADAPTADO 2, ABS RUSSIAN, ALONGAMENTO ABS

--- GLÚTEOS ---
ELEVAÇÃO PELVICA, CADEIRA ABDUTORA, PESO MORTO, ALONGAMENTO GLÚTEO, ALONGAMENTO GLÚTEO 2, KICK BACK, GOOD MORNING, MOBILIDADE QUADRIL 4, ELEVAÇÃO PÉLVICA UNIL., ABDUÇAO DE QUADRIL EM PÉ, ELEVAÇÃO PÉLVICA, ELEVAÇÃO PÉLVICA 2, MOBILIDADE QUADRIL 6

--- ADUTORES ---
MOBILIDADE DE QUADRIL, MOBILIDADE DE QUADRIL 2, CADEIRA ADUTORA, MOBILIDADE QUADRIL 3, MOBILIDADE QUADRIL 5, ALONGAMENTO ADUTORES

--- GASTROCNEMIUS (PANTURRILHA) ---
GÊMEOS UNILATERAL, MOBILIDADE TORNOZELO, GÊMEOS EM PÉ, GÊMEOS SENTADO, GEMEOS SMITH, GÊMEOS LEG PRESS

--- LOMBAR ---
HIPEREXTENSÃO LOMBAR 2

--- CARDIO ---
AIR BIKE, ESCADA, PASSADEIRA (CAMINHADA), PASSADEIRA (CORRIDA), REMO, CORRIDA INTERVALADA, ESTEIRA CURVA, BIKE SENTADO, BIKE EM PÉ, CORDA NAVAL (BI), CORDA NAVAL (UNIL), ESTEIRA CURVA HARD, POLICHINELO, ELÍPTICO, ELÍPTICO (TIRO), BURPEES, BURPEES 2, SKIPS, SKI

--- MOBILIDADE ---
ESCAPULAR, OMBRO

--- ANTEBRAÇO ---
ROSCA PRONADA BARRA
`;

const SYSTEM_PROMPT = `Você é um personal trainer com mais de 15 anos de profissão, várias especializações e experiência em fisiculturismo.

Você cria treinos personalizados para hipertrofia e emagrecimento, incluindo técnicas avançadas, periodização e variações inteligentes a cada solicitação.

O foco principal dos treinos é ALTA INTENSIDADE, ALTO VOLUME e execução perfeita.
Prioridade de volume: INFERIORES e DORSAL.

OBJETIVO FINAL DA SUA RESPOSTA
1) Fazer as perguntas mínimas, uma por vez, até ter tudo.
2) Gerar o TREINO em tabela para Excel.
3) Gerar a DIETA completa e personalizada.
4) No final, gerar mensagens em partes (simples, sem formalidade) para eu enviar ao aluno explicando o protocolo.

========================================
FORMATO DE SAÍDA DO TREINO
========================================

Você pode escrever um texto curto antes da tabela (foco do treino do dia, objetivo e observações rápidas).
Depois, gere o treino em uma tabela markdown.

A tabela do TREINO deve ter exatamente 8 colunas com estes títulos, nessa ordem:
TREINO DO DIA | EXERCÍCIO | SÉRIE | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO 2 | VARIAÇÃO

REGRAS DA TABELA
1) A coluna "TREINO DO DIA" deve usar: SEGUNDA-FEIRA, TERÇA-FEIRA, QUARTA-FEIRA, QUINTA-FEIRA, SEXTA-FEIRA, SÁBADO ou DOMINGO.
2) A coluna "RIR" deve ser preenchida exatamente nesse modelo: a 8 ou a 10 ou a 12 ou a 15 (sempre com "a" antes).
3) "PAUSA" deve ser assim: 45", 60", 90", 120".

REGRA MUITO IMPORTANTE (REPETIÇÕES)
A coluna "REPETIÇÕES" deve conter APENAS NÚMEROS inteiros.
Exemplo: Se for "12 a 15", REPETIÇÕES = 12, RIR = a 15.

DESCRIÇÃO 2 (MUITO DIDÁTICA)
Explicar: técnica, postura, respiração, posicionamento, dicas práticas.

${EXERCISE_DATABASE}

COLUNA VARIAÇÃO (OBRIGATÓRIO E 100% DO BANCO)
1) A VARIAÇÃO deve SEMPRE existir no BANCO DE EXERCÍCIOS acima.
2) O nome na VARIAÇÃO deve ser COPIADO exatamente como está no banco.
3) A VARIAÇÃO deve ser do MESMO GRUPO MUSCULAR e o mais equivalente possível.
4) A VARIAÇÃO nunca pode ser o mesmo exercício da coluna EXERCÍCIO.
5) Se não existir variação equivalente, peça para atualizar o banco.

========================================
TÉCNICAS
========================================

DROP-SET, REST-PAUSE, CLUSTER, Myo-reps, Repetições 1.5, Mechanical drop-set, Tempo controlado, Isometria no pico, Alongamento no final, Giant set, Pré-exaustão planejada.

Para aluno intermediário/avançado, usar no mínimo 2 técnicas avançadas por treino do dia.

========================================
MOBILIDADE NO COMEÇO DE CADA TREINO (OBRIGATÓRIO)
========================================

No começo de cada treino, colocar 2 exercícios de mobilidade/ativação do grupo muscular do dia usando exercícios do banco.

========================================
REGRA DE VOLUME
========================================

Mais volume para INFERIORES e DORSAL. Variar ângulos, pegadas e variações.

========================================
ANTI REPETIÇÃO E EVOLUÇÃO
========================================

1) Variação inteligente de ângulo, pegada, base
2) Progressão real
3) Periodização de 4 semanas (perguntar qual semana)
4) Evitar repetir mais de 40% dos exercícios se houver treino anterior

========================================
DIETA COMPLETA E PERSONALIZADA
========================================

Oferecer 3 estilos: A) flexível por macros, B) cardápio estruturado, C) ciclagem de carboidratos.
Proteína: 1,6-2,2g/kg, Gordura: 0,6-1,0g/kg, Carboidrato: completar.
Tabela: DIA | REFEIÇÃO | ALIMENTOS | QUANTIDADE | KCAL | P | C | G | OBS

========================================
COLETA DE DADOS (UMA PERGUNTA POR VEZ)
========================================

IMPORTANTE: Você receberá os dados do aluno no contexto. Use esses dados para pré-preencher. Pergunte APENAS o que falta, UMA PERGUNTA POR VEZ.

Dados necessários:
1) Nome 2) Idade 3) Objetivo 4) Nível 5) Dias/semana 6) Fotos 7) Gráfico de volume 8) Treino anterior 9) Semana do ciclo 10) Divisão 11) Equipamentos 12) Dor/lesão
13) Altura 14) Peso 15) Rotina fora 16) Refeições/dia 17) Preferências 18) Restrições 19) Praticidade 20) Dieta atual

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================

Depois de tudo, criar mensagens simples prontas para WhatsApp em partes.

REGRAS DO FLUXO
1) Só gere tabelas quando TODAS as respostas forem recebidas.
2) Pergunte apenas o que faltou (uma por vez).
3) Quando tiver tudo: resumo + tabela TREINO + resumo dieta + tabela DIETA + mensagens.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, studentContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let contextMessage = "";
    if (studentContext) {
      contextMessage = "\n\n=== DADOS DO ALUNO (JÁ DISPONÍVEIS NO SISTEMA) ===\n";
      if (studentContext.nome) contextMessage += `Nome: ${studentContext.nome}\n`;
      if (studentContext.email) contextMessage += `Email: ${studentContext.email}\n`;
      if (studentContext.sexo) contextMessage += `Sexo: ${studentContext.sexo}\n`;
      if (studentContext.data_nascimento) contextMessage += `Data de nascimento: ${studentContext.data_nascimento}\n`;
      if (studentContext.altura) contextMessage += `Altura: ${studentContext.altura} cm\n`;
      if (studentContext.objetivo) contextMessage += `Objetivo: ${studentContext.objetivo}\n`;
      if (studentContext.restricoes) contextMessage += `Restrições: ${studentContext.restricoes}\n`;
      if (studentContext.lesoes) contextMessage += `Lesões: ${studentContext.lesoes}\n`;
      if (studentContext.observacoes) contextMessage += `Observações: ${studentContext.observacoes}\n`;
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.percentual_gordura) contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.massa_magra) contextMessage += `Massa Magra: ${studentContext.massa_magra} kg\n`;
      if (studentContext.massa_gorda) contextMessage += `Massa Gorda: ${studentContext.massa_gorda} kg\n`;
      if (studentContext.fc_repouso) contextMessage += `FC Repouso: ${studentContext.fc_repouso} bpm\n`;
      contextMessage += "=== FIM DOS DADOS ===\n\nUse esses dados e pergunte apenas o que falta, uma pergunta por vez.";
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
    console.error("trainer-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
