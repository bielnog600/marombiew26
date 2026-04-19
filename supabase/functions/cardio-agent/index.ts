import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um personal trainer especialista em condicionamento aeróbico e prescrição de cardio em academia, com experiência em reabilitação cardiopulmonar, articular e periodização.

Sua tarefa: gerar UM protocolo de cardio totalmente personalizado para o aluno em UMA modalidade de máquina (passadeira, bike, elíptica ou escada).

═══════════════════════════════════════════════
PRINCÍPIO DE SEGURANÇA — PRIORIDADE MÁXIMA
═══════════════════════════════════════════════
Sempre cruze CADA decisão (modalidade, intensidade, blocos, picos) com:
- lesões reportadas (joelho, tornozelo, lombar, ombro, quadril)
- patologias (hipertensão, asma, diabetes, cardiopatias)
- restrições articulares
- nível de condicionamento (cooper 12min, FC repouso, idade, IMC)
- composição corporal (sobrepeso → preferir baixo impacto)
- observações do coach

REGRAS DE ADAPTAÇÃO:
- Joelho/tornozelo/lombar com problema → priorizar BIKE ou ELÍPTICA, evitar passadeira intensa e ESCADA
- Sobrepeso (IMC > 28) ou iniciante → começar com baixo impacto, intensidade leve a moderada
- Hipertensão / cardiopatia → manter Z1-Z2, sem picos, sem HIIT
- Sem restrições + bom condicionamento → pode prescrever HIIT, picos em Z4-Z5, intervalado
- Cooper baixo (< 1500m) → começar contínuo leve, progredir devagar

═══════════════════════════════════════════════
MODALIDADES DISPONÍVEIS (escolha UMA)
═══════════════════════════════════════════════
- "passadeira" — esteira, parâmetros: velocidade (km/h) e inclinação (%)
- "bike" — bicicleta ergométrica (vertical/horizontal), parâmetros: cadência (rpm), carga/nível, posição (sentado/em pé)
- "eliptica" — elíptico/transport, parâmetros: nível/resistência, cadência (spm)
- "escada" — escada rolante/stairmaster, parâmetros: nível/velocidade (degraus/min)

═══════════════════════════════════════════════
ESTRUTURA DO PROTOCOLO
═══════════════════════════════════════════════
Sempre inclua:
1. Aquecimento (3-8 min, leve, Z1)
2. Bloco(s) principal(is) — contínuo OU intervalado (HIIT, Fartlek, escadas crescentes)
3. Desaceleração / Cool down (3-5 min, leve, Z1)

Cada bloco/etapa contém:
- nome (ex: "Aquecimento", "Bloco principal", "Pico 1", "Recuperação")
- duração em segundos
- parâmetros específicos da modalidade
- zona alvo (Z1 a Z5) quando aplicável
- intensidade descritiva (leve / moderada / forte / máxima)

═══════════════════════════════════════════════
ZONAS DE FREQUÊNCIA CARDÍACA (Karvonen)
═══════════════════════════════════════════════
Se o aluno tiver zonas calculadas, use-as como referência principal de intensidade. Caso contrário, use percepção de esforço (RPE 1-10).

Z1 (Recuperação) — 50-60% HRR — RPE 2-3
Z2 (Base / queima de gordura) — 60-70% HRR — RPE 4-5
Z3 (Moderada / aeróbico) — 70-80% HRR — RPE 6-7
Z4 (Forte / VO2max) — 80-90% HRR — RPE 8-9
Z5 (Máxima) — 90-100% HRR — RPE 10

Exemplos:
- Objetivo "queima de gordura" → predominância Z2, opcional intervalo Z3
- Objetivo "condicionamento" → Z3 com picos Z4
- HIIT avançado → Z2 (recuperação) alternando com Z4-Z5 (picos)

═══════════════════════════════════════════════
SAÍDA OBRIGATÓRIA
═══════════════════════════════════════════════
Você DEVE chamar a função "generate_cardio_protocol" com TODOS os campos preenchidos.
NÃO escreva texto fora da function call.
Use português do Brasil em todos os textos.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      studentContext,
      modality = "auto", // auto | passadeira | bike | eliptica | escada
      frequencyPerWeek = 3,
      intensity = "auto", // auto | leve | moderada | intensa
      style = "auto", // auto | continuo | intervalado | hiit | zona2
      durationMinutes = "auto", // auto | number
      notes = "",
      hrZones = null, // { fcMax, fcRepouso, hrr, zones: [{zona, label, min, max}] }
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build student context message
    let contextMessage = "\n\n=== DADOS COMPLETOS DO ALUNO ===\n";
    if (studentContext) {
      if (studentContext.nome) contextMessage += `Nome: ${studentContext.nome}\n`;
      if (studentContext.sexo) contextMessage += `Sexo: ${studentContext.sexo}\n`;
      if (studentContext.data_nascimento) {
        const age = Math.floor(
          (Date.now() - new Date(studentContext.data_nascimento).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        );
        contextMessage += `Idade: ${age} anos\n`;
      }
      if (studentContext.altura) contextMessage += `Altura: ${studentContext.altura} cm\n`;
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.percentual_gordura)
        contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.objetivo) contextMessage += `Objetivo: ${studentContext.objetivo}\n`;

      const safety: string[] = [];
      if (studentContext.restricoes) safety.push(`⚠️ RESTRIÇÕES: ${studentContext.restricoes}`);
      if (studentContext.lesoes) safety.push(`🚨 LESÕES: ${studentContext.lesoes}`);
      if (studentContext.observacoes)
        safety.push(`📋 OBSERVAÇÕES DO COACH: ${studentContext.observacoes}`);
      if (studentContext.anamnese?.dores) safety.push(`💢 DORES: ${studentContext.anamnese.dores}`);
      if (studentContext.anamnese?.cirurgias)
        safety.push(`🏥 CIRURGIAS: ${studentContext.anamnese.cirurgias}`);
      if (studentContext.anamnese?.historico_saude)
        safety.push(`📜 HISTÓRICO: ${studentContext.anamnese.historico_saude}`);
      if (studentContext.anamnese?.medicacao)
        safety.push(`💊 MEDICAÇÃO: ${studentContext.anamnese.medicacao}`);
      if (safety.length > 0) {
        contextMessage += `\n══ ⚠️ DADOS CRÍTICOS DE SEGURANÇA ══\n${safety.join("\n")}\n══════════════════════════════════════\n`;
      }

      if (studentContext.performance) {
        const p = studentContext.performance;
        if (p.cooper_12min) contextMessage += `Cooper 12min: ${p.cooper_12min}m\n`;
        if (p.pushup) contextMessage += `Flexões: ${p.pushup}\n`;
        if (p.plank) contextMessage += `Prancha: ${p.plank}s\n`;
      }

      if (studentContext.vitals) {
        const v = studentContext.vitals;
        if (v.fc_repouso) contextMessage += `FC repouso: ${v.fc_repouso}bpm\n`;
        if (v.pressao) contextMessage += `Pressão arterial: ${v.pressao}\n`;
      }
    }

    if (hrZones) {
      contextMessage += `\n══ ❤️ ZONAS DE FREQUÊNCIA CARDÍACA (Karvonen) ══\n`;
      contextMessage += `FC Máx estimada: ${hrZones.fcMax} bpm | FC Repouso: ${hrZones.fcRepouso} bpm | HRR: ${hrZones.hrr} bpm\n`;
      if (Array.isArray(hrZones.zones)) {
        for (const z of hrZones.zones) {
          contextMessage += `${z.zona} (${z.label}): ${z.min}-${z.max} bpm\n`;
        }
      }
      contextMessage += `IMPORTANTE: Use estas zonas REAIS no campo targetZone de cada bloco quando relevante.\n`;
    }

    const STYLE_INSTR: Record<string, string> = {
      auto: "Estilo livre — escolha o melhor para o objetivo do aluno.",
      continuo:
        "ESTILO: CONTÍNUO. Bloco principal único, intensidade constante (Z2 ou Z3). Ideal para queima de gordura ou base aeróbica.",
      intervalado:
        "ESTILO: INTERVALADO MODERADO. Alterne 2-4 blocos de esforço (Z3-Z4) com recuperações ativas (Z2).",
      hiit:
        "ESTILO: HIIT. Picos curtos e intensos em Z4-Z5 (20-60s) alternados com recuperação ativa em Z2 (40-90s). 6-12 ciclos. SOMENTE se aluno apto.",
      zona2:
        "ESTILO: ZONA 2 PURA. Toda a sessão em Z2 (60-70% HRR). Ritmo conversacional, foco em oxidação lipídica e base aeróbica.",
    };
    const styleInstr = STYLE_INSTR[style] || STYLE_INSTR.auto;

    const intensityInstr =
      {
        auto: "AUTO: analise o perfil completo e decida a intensidade ideal. Priorize segurança.",
        leve: "LEVE: predominância Z1-Z2, sem picos, sessão tranquila.",
        moderada: "MODERADA: predominância Z2-Z3, opcional pequenos picos em Z4.",
        intensa:
          "INTENSA: predominância Z3-Z4 com picos Z5 quando seguro. SOMENTE se sem restrições e bom condicionamento.",
      }[intensity] || "AUTO";

    const modalityInstr =
      modality === "auto"
        ? "Você decide a melhor modalidade considerando lesões e objetivo. Em caso de dúvida, prefira BIKE (mais segura)."
        : `MODALIDADE FIXA: ${modality.toUpperCase()}. Use SOMENTE esta modalidade.`;

    const durationInstr =
      durationMinutes === "auto" || !durationMinutes
        ? "Duração total entre 20 e 45 min, conforme objetivo e nível."
        : `Duração total alvo: aproximadamente ${durationMinutes} minutos.`;

    const userPrompt = `Gere o protocolo de CARDIO agora.

MODALIDADE: ${modalityInstr}
FREQUÊNCIA SEMANAL: ${frequencyPerWeek}x por semana
INTENSIDADE: ${intensity.toUpperCase()} — ${intensityInstr}
ESTILO: ${style.toUpperCase()} — ${styleInstr}
DURAÇÃO: ${durationInstr}
${notes ? `\nOBSERVAÇÕES ADICIONAIS DO COACH: ${notes}\n` : ""}

Lembre-se:
- Cruze CADA bloco com lesões/restrições reportadas
- Use as zonas Karvonen reais quando disponíveis (campo targetZone)
- Sempre inclua aquecimento e desaceleração
- Chame OBRIGATORIAMENTE a função "generate_cardio_protocol" com a saída completa.`;

    const tool = {
      type: "function",
      function: {
        name: "generate_cardio_protocol",
        description: "Retorna o protocolo de cardio personalizado em formato estruturado.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Título curto e motivacional do cardio." },
            modality: {
              type: "string",
              enum: ["passadeira", "bike", "eliptica", "escada"],
              description: "Modalidade da máquina escolhida.",
            },
            objective: { type: "string", description: "Objetivo principal do cardio." },
            level: {
              type: "string",
              enum: ["iniciante", "intermediario", "avancado"],
            },
            intensity: {
              type: "string",
              enum: ["leve", "moderada", "intensa"],
            },
            structure: {
              type: "string",
              enum: ["continuo", "intervalado", "hiit", "zona2"],
            },
            totalDurationMin: { type: "number", description: "Duração total em minutos." },
            frequencyPerWeek: { type: "number" },
            targetZoneSummary: {
              type: "string",
              description: "Resumo da zona alvo principal (ex: 'Z2 — 120-135 bpm').",
            },
            safetyNotes: {
              type: "array",
              items: { type: "string" },
              description: "Adaptações de segurança aplicadas conforme perfil do aluno.",
            },
            executionTips: {
              type: "array",
              items: { type: "string" },
              description: "Dicas práticas de execução, respiração e hidratação.",
            },
            blocks: {
              type: "array",
              description: "Etapas/blocos do protocolo em ordem cronológica.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Nome do bloco (ex: Aquecimento, Pico 1)." },
                  type: {
                    type: "string",
                    enum: ["aquecimento", "principal", "pico", "recuperacao", "desaceleracao"],
                  },
                  durationSec: { type: "number" },
                  intensityLabel: {
                    type: "string",
                    enum: ["leve", "moderada", "forte", "maxima"],
                  },
                  targetZone: {
                    type: "string",
                    description: "Zona alvo (ex: Z1, Z2, Z3, Z4, Z5) ou vazio.",
                  },
                  targetHrRange: {
                    type: "string",
                    description: "Faixa de FC alvo em bpm (ex: '120-135 bpm') ou vazio.",
                  },
                  // Modality-specific (only fill when relevant)
                  speedKmh: { type: "number", description: "Velocidade km/h (passadeira)." },
                  inclinePct: { type: "number", description: "Inclinação % (passadeira)." },
                  cadenceRpm: { type: "number", description: "Cadência rpm (bike) ou spm (elíptica)." },
                  resistanceLevel: {
                    type: "number",
                    description: "Nível de resistência (bike, elíptica, escada).",
                  },
                  bikePosition: {
                    type: "string",
                    enum: ["sentado", "em_pe", "alternado"],
                    description: "Posição na bike.",
                  },
                  stepsPerMin: { type: "number", description: "Degraus por minuto (escada)." },
                  notes: { type: "string", description: "Observação curta para o aluno." },
                },
                required: ["name", "type", "durationSec", "intensityLabel"],
                additionalProperties: false,
              },
            },
          },
          required: [
            "title",
            "modality",
            "objective",
            "level",
            "intensity",
            "structure",
            "totalDurationMin",
            "frequencyPerWeek",
            "blocks",
          ],
          additionalProperties: false,
        },
      },
    };

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
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "generate_cardio_protocol" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos esgotados. Adicione créditos em Lovable Cloud." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call returned:", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "IA não retornou protocolo estruturado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let protocol;
    try {
      protocol = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Invalid JSON from AI:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Resposta da IA inválida" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ protocol }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cardio-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
