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
1) A coluna "TREINO DO DIA" deve usar SEMPRE EM MAIÚSCULAS: SEGUNDA-FEIRA, TERÇA-FEIRA, QUARTA-FEIRA, QUINTA-FEIRA, SEXTA-FEIRA, SÁBADO ou DOMINGO.
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

No começo de cada treino, colocar 2 a 3 exercícios de mobilidade/estabilidade/ativação do grupo muscular do dia usando exercícios do banco.
Os exercícios de mobilidade/estabilidade NÃO precisam de descrição na coluna DESCRIÇÃO 2 (deixar vazio ou "—").

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
COLETA DE DADOS — REGRA CRÍTICA
========================================

IMPORTANTE: Você receberá TODOS os dados do aluno já disponíveis no sistema (perfil, avaliação física, anamnese, composição corporal, sinais vitais, testes de performance, dobras cutâneas, etc).

USE ESSES DADOS DIRETAMENTE. NÃO pergunte informações que já foram fornecidas no contexto do aluno.

Pergunte APENAS o que ainda falta para completar o protocolo, UMA PERGUNTA POR VEZ.

Dados que você pode precisar perguntar (SE não estiverem no contexto):
1) Nível (iniciante/intermediário/avançado)
2) Dias/semana de treino
3) Fotos do aluno (frente, lado, costas)
4) Gráfico de volume mensal
5) Treino anterior (últimas 1-2 semanas)
6) Semana do ciclo (1, 2, 3 ou 4)
7) Divisão desejada (ou "decida por mim")
8) Equipamentos (academia completa ou limitado)
9) Rotina fora da academia (ativo/sentado, passos/dia)
10) Quantas refeições/dia consegue manter
11) Preferências alimentares
12) Praticidade (cozinha, marmita, comer fora)
13) Dieta atual (se faz ou não)

NÃO pergunte: nome, idade, sexo, altura, peso, objetivo, restrições, lesões, observações, IMC, % gordura, massa magra/gorda, FC repouso, pressão, SpO2, glicemia, dobras cutâneas, histórico de saúde, medicação, suplementos, sono, stress, rotina, tabagismo, álcool, cirurgias, dores, treino atual — SE esses dados já estiverem no contexto.

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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    let contextMessage = "";
    if (studentContext) {
      contextMessage = "\n\n=== DADOS COMPLETOS DO ALUNO (JÁ DISPONÍVEIS NO SISTEMA — NÃO PERGUNTE NOVAMENTE) ===\n";
      
      // Profile
      if (studentContext.nome) contextMessage += `Nome: ${studentContext.nome}\n`;
      if (studentContext.email) contextMessage += `Email: ${studentContext.email}\n`;
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
      if (studentContext.observacoes) contextMessage += `Observações gerais: ${studentContext.observacoes}\n`;
      if (studentContext.raca) contextMessage += `Raça/etnia: ${studentContext.raca}\n`;

      // Anthropometrics
      contextMessage += "\n--- Dados Antropométricos ---\n";
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.cintura) contextMessage += `Cintura: ${studentContext.cintura} cm\n`;
      if (studentContext.quadril) contextMessage += `Quadril: ${studentContext.quadril} cm\n`;
      if (studentContext.rcq) contextMessage += `RCQ: ${studentContext.rcq}\n`;
      if (studentContext.torax) contextMessage += `Tórax: ${studentContext.torax} cm\n`;
      if (studentContext.abdomen) contextMessage += `Abdômen: ${studentContext.abdomen} cm\n`;
      if (studentContext.ombro) contextMessage += `Ombro: ${studentContext.ombro} cm\n`;
      if (studentContext.pescoco) contextMessage += `Pescoço: ${studentContext.pescoco} cm\n`;
      if (studentContext.braco_direito) contextMessage += `Braço D: ${studentContext.braco_direito} cm\n`;
      if (studentContext.braco_esquerdo) contextMessage += `Braço E: ${studentContext.braco_esquerdo} cm\n`;
      if (studentContext.coxa_direita) contextMessage += `Coxa D: ${studentContext.coxa_direita} cm\n`;
      if (studentContext.coxa_esquerda) contextMessage += `Coxa E: ${studentContext.coxa_esquerda} cm\n`;
      if (studentContext.panturrilha_direita) contextMessage += `Panturrilha D: ${studentContext.panturrilha_direita} cm\n`;
      if (studentContext.panturrilha_esquerda) contextMessage += `Panturrilha E: ${studentContext.panturrilha_esquerda} cm\n`;

      // Composition
      contextMessage += "\n--- Composição Corporal ---\n";
      if (studentContext.percentual_gordura) contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.massa_magra) contextMessage += `Massa Magra: ${studentContext.massa_magra} kg\n`;
      if (studentContext.massa_gorda) contextMessage += `Massa Gorda: ${studentContext.massa_gorda} kg\n`;

      // Vitals
      contextMessage += "\n--- Sinais Vitais ---\n";
      if (studentContext.fc_repouso) contextMessage += `FC Repouso: ${studentContext.fc_repouso} bpm\n`;
      if (studentContext.pressao) contextMessage += `Pressão Arterial: ${studentContext.pressao}\n`;
      if (studentContext.spo2) contextMessage += `SpO2: ${studentContext.spo2}%\n`;
      if (studentContext.glicemia) contextMessage += `Glicemia: ${studentContext.glicemia} mg/dL\n`;

      // Skinfolds
      if (studentContext.skinfolds) {
        const sf = studentContext.skinfolds;
        contextMessage += "\n--- Dobras Cutâneas ---\n";
        if (sf.metodo) contextMessage += `Método: ${sf.metodo}\n`;
        if (sf.triceps) contextMessage += `Tríceps: ${sf.triceps} mm\n`;
        if (sf.peitoral) contextMessage += `Peitoral: ${sf.peitoral} mm\n`;
        if (sf.subescapular) contextMessage += `Subescapular: ${sf.subescapular} mm\n`;
        if (sf.axilar_media) contextMessage += `Axilar Média: ${sf.axilar_media} mm\n`;
        if (sf.suprailiaca) contextMessage += `Suprailíaca: ${sf.suprailiaca} mm\n`;
        if (sf.abdominal) contextMessage += `Abdominal: ${sf.abdominal} mm\n`;
        if (sf.coxa) contextMessage += `Coxa: ${sf.coxa} mm\n`;
      }

      // Anamnese
      if (studentContext.anamnese) {
        const an = studentContext.anamnese;
        contextMessage += "\n--- Anamnese ---\n";
        if (an.historico_saude) contextMessage += `Histórico de saúde: ${an.historico_saude}\n`;
        if (an.medicacao) contextMessage += `Medicação: ${an.medicacao}\n`;
        if (an.suplementos) contextMessage += `Suplementos: ${an.suplementos}\n`;
        if (an.cirurgias) contextMessage += `Cirurgias: ${an.cirurgias}\n`;
        if (an.dores) contextMessage += `Dores: ${an.dores}\n`;
        if (an.sono) contextMessage += `Sono: ${an.sono}\n`;
        if (an.stress) contextMessage += `Stress: ${an.stress}\n`;
        if (an.rotina) contextMessage += `Rotina: ${an.rotina}\n`;
        if (an.treino_atual) contextMessage += `Treino atual: ${an.treino_atual}\n`;
        if (an.tabagismo) contextMessage += `Tabagismo: Sim\n`;
        if (an.alcool) contextMessage += `Álcool: ${an.alcool}\n`;
      }

      // Performance
      if (studentContext.performance) {
        const pf = studentContext.performance;
        contextMessage += "\n--- Testes de Performance ---\n";
        if (pf.cooper_12min) contextMessage += `Cooper 12min: ${pf.cooper_12min} m\n`;
        if (pf.pushup) contextMessage += `Flexões: ${pf.pushup}\n`;
        if (pf.plank) contextMessage += `Prancha: ${pf.plank} seg\n`;
        if (pf.salto_vertical) contextMessage += `Salto vertical: ${pf.salto_vertical} cm\n`;
        if (pf.agachamento_score) contextMessage += `Score agachamento: ${pf.agachamento_score}\n`;
        if (pf.mobilidade_ombro) contextMessage += `Mobilidade ombro: ${pf.mobilidade_ombro}\n`;
        if (pf.mobilidade_quadril) contextMessage += `Mobilidade quadril: ${pf.mobilidade_quadril}\n`;
        if (pf.mobilidade_tornozelo) contextMessage += `Mobilidade tornozelo: ${pf.mobilidade_tornozelo}\n`;
      }

      // Posture analysis
      if (studentContext.posture) {
        const pos = studentContext.posture;
        contextMessage += "\n--- Avaliação Postural (Manual) ---\n";
        if (pos.vista_anterior) contextMessage += `Vista Anterior: ${JSON.stringify(pos.vista_anterior)}\n`;
        if (pos.vista_lateral) contextMessage += `Vista Lateral: ${JSON.stringify(pos.vista_lateral)}\n`;
        if (pos.vista_posterior) contextMessage += `Vista Posterior: ${JSON.stringify(pos.vista_posterior)}\n`;
        if (pos.observacoes) contextMessage += `Observações posturais: ${pos.observacoes}\n`;
      }

      // Posture scan (2D analysis)
      if (studentContext.posture_scan) {
        const ps = studentContext.posture_scan;
        contextMessage += "\n--- Análise Postural 2D (Automatizada) ---\n";
        if (ps.angles) contextMessage += `Ângulos medidos: ${JSON.stringify(ps.angles)}\n`;
        if (ps.attention_points) contextMessage += `Pontos de atenção: ${JSON.stringify(ps.attention_points)}\n`;
        if (ps.region_scores) contextMessage += `Scores por região: ${JSON.stringify(ps.region_scores)}\n`;
        if (ps.notes) contextMessage += `Notas da análise: ${ps.notes}\n`;
      }

      // Photos
      if (studentContext.fotos_avaliacao && studentContext.fotos_avaliacao.length > 0) {
        contextMessage += "\n--- Fotos da Avaliação ---\n";
        contextMessage += `O aluno possui ${studentContext.fotos_avaliacao.length} foto(s) registradas: ${studentContext.fotos_avaliacao.map((f: any) => f.tipo || 'sem tipo').join(', ')}.\n`;
      }
      if (studentContext.fotos_perfil && studentContext.fotos_perfil.length > 0) {
        contextMessage += `Fotos de perfil registradas: ${studentContext.fotos_perfil.length} foto(s).\n`;
      }

      contextMessage += "\n=== FIM DOS DADOS ===\n\nIMPORTANTE: Todos os dados acima já são conhecidos. Comece perguntando APENAS o que falta (nível, dias/semana, semana do ciclo, divisão, equipamentos, preferências alimentares, etc). UMA PERGUNTA POR VEZ.\n\nSe houver dados de análise postural, CONSIDERE-OS ao montar o treino: priorize exercícios corretivos para desvios identificados, inclua mobilidade específica e evite exercícios que possam agravar problemas posturais detectados.";
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
    console.error("trainer-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
