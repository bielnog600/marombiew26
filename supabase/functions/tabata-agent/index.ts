import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um personal trainer especialista em treinos de alta intensidade (HIIT/TABATA) com mais de 15 anos de experiência, incluindo reabilitação esportiva.

Sua tarefa: gerar um treino TABATA totalmente personalizado para o aluno, considerando OBRIGATORIAMENTE todos os dados clínicos, lesões, restrições, dores, patologias, observações do coach e nível do aluno.

═══════════════════════════════════════════════
PRINCÍPIO DE SEGURANÇA — PRIORIDADE MÁXIMA
═══════════════════════════════════════════════
SE houver QUALQUER lesão, dor, patologia, restrição articular, observação importante ou risco identificado no perfil do aluno:
- Gerar TABATA ADAPTADO E SEGURO
- Priorizar exercícios de baixo impacto (sem saltos, sem corrida, sem burpees)
- Evitar movimentos que estressem joelhos, lombar, ombros ou área lesionada
- Reduzir intensidade e densidade
- Substituir exercícios pliométricos por versões controladas

SE NÃO houver restrições e o nível permitir:
- Gerar TABATA INTENSO conforme o nível (intermediário/avançado)
- Pode incluir burpees, jumps, mountain climbers, sprints, polichinelo
- Maior densidade e exercícios complexos

═══════════════════════════════════════════════
ESTRUTURA TABATA PADRÃO
═══════════════════════════════════════════════
- Bloco clássico: 8 rounds × (20s trabalho + 10s descanso) = 4 minutos por bloco
- Pode adaptar para: 30s/15s, 40s/20s ou 45s/15s conforme nível
- Múltiplos blocos com 1 a 2 minutos de descanso entre eles
- Aquecimento de 3-5 min ANTES e desaquecimento de 3-5 min DEPOIS

═══════════════════════════════════════════════
FORMATO OBRIGATÓRIO DA RESPOSTA (MARKDOWN)
═══════════════════════════════════════════════

# 🔥 TABATA — [Nome curto e motivacional do treino]

**Tipo:** Adaptado | Moderado | Intenso (escolha conforme perfil)
**Duração total:** XX minutos
**Objetivo:** [emagrecimento / condicionamento / gasto calórico / etc]
**Nível:** [iniciante / intermediário / avançado]

## ⚠️ Considerações de Segurança
[Liste em bullets as adaptações feitas para o perfil do aluno. Se sem restrições, escreva "Sem restrições identificadas - treino em intensidade plena."]

## 🔥 Aquecimento (X min)
- Exercício 1 — duração
- Exercício 2 — duração

## 💪 Bloco Principal

### Bloco 1 — [Nome do bloco]
**Formato:** 8 rounds × 20s trabalho / 10s descanso (4 min)

| Round | Exercício | Trabalho | Descanso | Observação |
|-------|-----------|----------|----------|------------|
| 1 | Agachamento | 20s | 10s | Pés afastados largura do quadril |
| 2 | Mountain Climbers | 20s | 10s | Core firme |
| ... | ... | ... | ... | ... |

**Descanso após bloco:** 1 a 2 min

### Bloco 2 — [Nome do bloco]
[mesmo formato]

## 🧘 Desaquecimento (X min)
- Alongamento 1
- Alongamento 2

## 📋 Instruções de Execução
[Texto curto, direto, com dicas de respiração, postura, hidratação e como modular intensidade.]

## ⚡ Dicas Importantes
- [3-5 dicas práticas para o aluno]

═══════════════════════════════════════════════
REGRAS FINAIS
═══════════════════════════════════════════════
1) NUNCA prescreva exercícios contraindicados às lesões/patologias do aluno
2) Sempre cruze CADA exercício escolhido com as restrições reportadas
3) Em caso de dúvida sobre segurança, opte sempre pela alternativa mais conservadora
4) Inclua sempre aquecimento e desaquecimento
5) Mantenha o markdown limpo e bem estruturado para boa visualização
6) Gere TUDO de uma vez (sem perguntas) — você já tem o contexto completo do aluno`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { studentContext, intensity = 'auto', notes = '' } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let contextMessage = "\n\n=== DADOS COMPLETOS DO ALUNO ===\n";
    if (studentContext) {
      if (studentContext.nome) contextMessage += `Nome: ${studentContext.nome}\n`;
      if (studentContext.sexo) contextMessage += `Sexo: ${studentContext.sexo}\n`;
      if (studentContext.data_nascimento) {
        const age = Math.floor((Date.now() - new Date(studentContext.data_nascimento).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        contextMessage += `Idade: ${age} anos\n`;
      }
      if (studentContext.altura) contextMessage += `Altura: ${studentContext.altura} cm\n`;
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.percentual_gordura) contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.objetivo) contextMessage += `Objetivo: ${studentContext.objetivo}\n`;

      const safety: string[] = [];
      if (studentContext.restricoes) safety.push(`⚠️ RESTRIÇÕES: ${studentContext.restricoes}`);
      if (studentContext.lesoes) safety.push(`🚨 LESÕES: ${studentContext.lesoes}`);
      if (studentContext.observacoes) safety.push(`📋 OBSERVAÇÕES DO COACH: ${studentContext.observacoes}`);
      if (studentContext.anamnese?.dores) safety.push(`💢 DORES: ${studentContext.anamnese.dores}`);
      if (studentContext.anamnese?.cirurgias) safety.push(`🏥 CIRURGIAS: ${studentContext.anamnese.cirurgias}`);
      if (studentContext.anamnese?.historico_saude) safety.push(`📜 HISTÓRICO: ${studentContext.anamnese.historico_saude}`);
      if (studentContext.anamnese?.medicacao) safety.push(`💊 MEDICAÇÃO: ${studentContext.anamnese.medicacao}`);

      if (safety.length > 0) {
        contextMessage += `\n══ ⚠️ DADOS CRÍTICOS DE SEGURANÇA ══\n${safety.join('\n')}\n══════════════════════════════════════\n`;
      }

      if (studentContext.anamnese) {
        const an = studentContext.anamnese;
        if (an.sono) contextMessage += `Sono: ${an.sono}\n`;
        if (an.stress) contextMessage += `Stress: ${an.stress}\n`;
        if (an.tabagismo) contextMessage += `Tabagismo: Sim\n`;
        if (an.treino_atual) contextMessage += `Treino atual: ${an.treino_atual}\n`;
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
        if (v.pressao) contextMessage += `Pressão: ${v.pressao}\n`;
      }
    }

    const intensityInstruction = {
      adaptado: 'GERE TABATA ADAPTADO: baixo impacto, exercícios controlados, sem saltos, intensidade reduzida.',
      moderado: 'GERE TABATA MODERADO: intensidade média, exercícios funcionais, alguns movimentos dinâmicos.',
      intenso: 'GERE TABATA INTENSO: alta intensidade, pliometria, burpees, jumps, máximo desafio.',
      auto: 'AUTO: analise o perfil completo e decida a intensidade ideal (adaptado/moderado/intenso). Priorize segurança.',
    }[intensity] || 'AUTO';

    const userPrompt = `Gere o TABATA agora baseado no perfil completo do aluno.

INTENSIDADE SOLICITADA: ${intensity.toUpperCase()} — ${intensityInstruction}

${notes ? `OBSERVAÇÕES ADICIONAIS DO COACH: ${notes}\n` : ''}

Lembre-se:
- Cruze CADA exercício com as lesões/restrições reportadas
- Se houver patologias, prefira sempre a versão adaptada
- Inclua aquecimento, blocos principais com tabela detalhada e desaquecimento
- Gere tudo de uma vez no formato markdown especificado`;

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
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione créditos em Settings > Workspace > Usage." }), {
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
    console.error("tabata-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
