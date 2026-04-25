import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um personal trainer especialista em condicionamento aeróbico e prescrição de cardio em academia, com experiência em reabilitação cardiopulmonar, articular e periodização.

Sua tarefa: gerar UM PLANO SEMANAL com VÁRIOS protocolos de cardio totalmente personalizados — UM PROTOCOLO POR SESSÃO da semana, cada um em UMA modalidade de máquina (passadeira, bike, elíptica ou escada).

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
VARIAÇÃO SEMANAL (REGRA CENTRAL)
═══════════════════════════════════════════════
Para uma frequência N por semana, gere EXATAMENTE N protocolos DIFERENTES, variando:
- MODALIDADE: alterne entre as modalidades permitidas (informadas no prompt do usuário). Não repita a mesma modalidade duas vezes seguidas, exceto se houver apenas uma permitida.
- ESTRUTURA: combine contínuo, intervalado, HIIT (se apto) e zona2.
- DURAÇÃO: alterne sessões mais curtas/intensas com mais longas/leves.
- INTENSIDADE: nunca 2 sessões de altíssima intensidade seguidas. Para frequência ≥ 3, inclua ao menos uma sessão LEVE/recuperativa.

Cada protocolo deve ter um título único e claro (ex: "Sessão 1 — Bike Z2 longa", "Sessão 2 — HIIT na Escada").

═══════════════════════════════════════════════
MODALIDADES DISPONÍVEIS
═══════════════════════════════════════════════
- "passadeira" — velocidade (km/h) e inclinação (%)
- "bike" — cadência (rpm), carga/nível, posição (sentado/em pé)
- "eliptica" — nível/resistência, cadência (spm)
- "escada" — nível/velocidade (degraus/min)

═══════════════════════════════════════════════
ESTRUTURA DE CADA PROTOCOLO
═══════════════════════════════════════════════
Sempre inclua: aquecimento (3-8 min, Z1), bloco principal (contínuo ou intervalado), desaceleração (3-5 min, Z1).
Cada bloco: nome, duração em segundos, parâmetros específicos, zona alvo (Z1-Z5), intensidade descritiva.

═══════════════════════════════════════════════
ZONAS DE FREQUÊNCIA CARDÍACA (Karvonen)
═══════════════════════════════════════════════
Use as zonas reais do aluno quando disponíveis. Caso contrário, use percepção de esforço (RPE).
Z1 50-60% HRR | Z2 60-70% | Z3 70-80% | Z4 80-90% | Z5 90-100%.

═══════════════════════════════════════════════
SAÍDA OBRIGATÓRIA
═══════════════════════════════════════════════
Chame a função "generate_cardio_week" com EXATAMENTE N protocolos no array "protocols", onde N é a frequência semanal pedida.
Use português do Brasil em todos os textos.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      studentContext,
      modality = "auto", // legacy: single modality
      modalities = null, // new: array of allowed modalities; if empty/null = all
      frequencyPerWeek = 3,
      intensity = "auto",
      style = "auto",
      durationMinutes = "auto",
      notes = "",
      hrZones = null,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Normalize allowed modalities
    const ALL_MODS = ["passadeira", "bike", "eliptica", "escada"] as const;
    let allowedMods: string[];
    if (Array.isArray(modalities) && modalities.length > 0) {
      allowedMods = modalities.filter((m: string) => (ALL_MODS as readonly string[]).includes(m));
      if (allowedMods.length === 0) allowedMods = [...ALL_MODS];
    } else if (modality && modality !== "auto" && (ALL_MODS as readonly string[]).includes(modality)) {
      allowedMods = [modality];
    } else {
      allowedMods = [...ALL_MODS];
    }

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
      auto: "Estilo livre — varie entre os estilos ao longo da semana.",
      continuo: "ESTILO BASE: contínuo (Z2-Z3). Pode variar para intervalado em 1-2 sessões.",
      intervalado: "ESTILO BASE: intervalado (Z3-Z4 com recuperação Z2). Pode incluir 1 sessão contínua leve.",
      hiit: "ESTILO BASE: HIIT (picos Z4-Z5 / recuperação Z2). Inclua sessões recuperativas em Z2 contínuo entre HIITs.",
      zona2: "ESTILO BASE: Zona 2 pura. Toda sessão em Z2, foco em oxidação lipídica.",
    };
    const styleInstr = STYLE_INSTR[style] || STYLE_INSTR.auto;

    const INTENSITY_INSTR: Record<string, string> = {
        auto: "AUTO: analise o perfil completo e decida a intensidade ideal por sessão.",
        leve: "LEVE: predominância Z1-Z2, sem picos.",
        moderada: "MODERADA: predominância Z2-Z3, opcional pequenos picos em Z4.",
        intensa:
          "INTENSA: predominância Z3-Z4 com picos Z5 quando seguro. SOMENTE se sem restrições e bom condicionamento.",
    };
    const intensityInstr = INTENSITY_INSTR[intensity] || "AUTO";

    const modalityInstr = `MODALIDADES PERMITIDAS: ${allowedMods.join(", ")}. ${
      allowedMods.length > 1
        ? "Distribua e ALTERNE essas modalidades ao longo das sessões da semana, sem repetir a mesma duas vezes seguidas."
        : "Use APENAS esta modalidade em todas as sessões — varie estilo/duração para criar diversidade."
    }`;

    const durationInstr =
      durationMinutes === "auto" || !durationMinutes
        ? "Duração total entre 20 e 45 min por sessão, conforme objetivo e nível. Varie entre as sessões."
        : `Duração total alvo por sessão: aproximadamente ${durationMinutes} minutos.`;

    const userPrompt = `Gere o PLANO SEMANAL DE CARDIO agora.

${modalityInstr}
FREQUÊNCIA SEMANAL: ${frequencyPerWeek} sessões — gere EXATAMENTE ${frequencyPerWeek} protocolos diferentes no array "protocols".
INTENSIDADE: ${intensity.toUpperCase()} — ${intensityInstr}
ESTILO: ${style.toUpperCase()} — ${styleInstr}
DURAÇÃO: ${durationInstr}
${notes ? `\nOBSERVAÇÕES ADICIONAIS DO COACH: ${notes}\n` : ""}

Lembre-se:
- VARIE modalidade entre sessões (quando houver mais de uma permitida)
- Cruze CADA bloco com lesões/restrições reportadas
- Use as zonas Karvonen reais quando disponíveis (campo targetZone)
- Sempre inclua aquecimento e desaceleração em cada protocolo
- Cada protocolo precisa de título descritivo e único
- Chame OBRIGATORIAMENTE a função "generate_cardio_week" com a saída completa.`;

    const protocolItem = {
      type: "object",
      properties: {
        title: { type: "string", description: "Título curto e único da sessão (ex: 'Sessão 1 — Bike Z2 longa')." },
        modality: {
          type: "string",
          enum: ["passadeira", "bike", "eliptica", "escada"],
        },
        objective: { type: "string" },
        level: { type: "string", enum: ["iniciante", "intermediario", "avancado"] },
        intensity: { type: "string", enum: ["leve", "moderada", "intensa"] },
        structure: { type: "string", enum: ["continuo", "intervalado", "hiit", "zona2"] },
        totalDurationMin: { type: "number" },
        frequencyPerWeek: { type: "number" },
        targetZoneSummary: { type: "string" },
        safetyNotes: { type: "array", items: { type: "string" } },
        executionTips: { type: "array", items: { type: "string" } },
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: {
                type: "string",
                enum: ["aquecimento", "principal", "pico", "recuperacao", "desaceleracao"],
              },
              durationSec: { type: "number" },
              intensityLabel: { type: "string", enum: ["leve", "moderada", "forte", "maxima"] },
              targetZone: { type: "string" },
              targetHrRange: { type: "string" },
              speedKmh: { type: "number" },
              inclinePct: { type: "number" },
              cadenceRpm: { type: "number" },
              resistanceLevel: { type: "number" },
              bikePosition: { type: "string", enum: ["sentado", "em_pe", "alternado"] },
              stepsPerMin: { type: "number" },
              notes: { type: "string" },
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
    };

    const tool = {
      type: "function",
      function: {
        name: "generate_cardio_week",
        description: "Retorna o plano semanal de cardio (N protocolos diferentes, um por sessão).",
        parameters: {
          type: "object",
          properties: {
            frequencyPerWeek: { type: "number", description: "Número de sessões na semana." },
            protocols: {
              type: "array",
              description: "Lista de protocolos, um por sessão da semana. Tamanho = frequencyPerWeek.",
              items: protocolItem,
            },
          },
          required: ["frequencyPerWeek", "protocols"],
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
        tool_choice: { type: "function", function: { name: "generate_cardio_week" } },
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
      return new Response(JSON.stringify({ error: "IA não retornou plano estruturado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Invalid JSON from AI:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Resposta da IA inválida" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build weekly plan envelope
    const protocols = Array.isArray(parsed?.protocols) ? parsed.protocols : [];
    if (!protocols.length) {
      return new Response(JSON.stringify({ error: "IA não retornou protocolos" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Ensure each protocol carries the weekly frequency
    for (const p of protocols) p.frequencyPerWeek = frequencyPerWeek;

    const weekly = {
      weekly: true,
      frequencyPerWeek,
      protocols,
    };

    return new Response(JSON.stringify({ weekly }), {
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
