import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_INTENSITY,
  SIMILARITY_THRESHOLDS,
  dietVariationPrompt,
  dietIntentPrompt,
  supplementationPolicyPrompt,
  type VariationIntensity,
  type DietIntent,
} from "../_shared/variationProfiles.ts";
import {
  computeDietSimilarity,
  validateDietNutrition,
  type DietNutritionValidation,
} from "../_shared/planSimilarity.ts";
import {
  loadPlanHistory,
  summarizeDietForPrompt,
  type HistoryPlan,
} from "../_shared/planHistory.ts";
import {
  detectHungerContext,
  satietyPromptBlock,
  carbCyclePromptBlock,
  type CarbCyclePlan,
} from "../_shared/satietyEngine.ts";
import {
  ENERGY_WEEKDAYS,
  buildRequestedFromSchedule,
  normalizeDailyAdjustments,
  validateDailyAdjustments,
} from "../_shared/dailyAdjustments.ts";

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

function buildLayeredInstructions(dietConfig: any, trainingContext: any): string {
  if (!dietConfig && !trainingContext) return "";
  const lines: string[] = ["\n\n=== CAMADAS DE DECISÃO (USE COMO ÂNCORA) ===\n"];
  if (dietConfig?.objective) lines.push(`1) OBJETIVO METABÓLICO: ${dietConfig.objective} — define direção calórica.`);
  if (dietConfig?.strategy) lines.push(`2) ESTRATÉGIA NUTRICIONAL: ${dietConfig.strategy} — define distribuição entre dias (linear, ciclo de carbo, refeed, low carb, IF...).`);
  if (dietConfig?.style) lines.push(`3) ESTILO ALIMENTAR: ${dietConfig.style} — define escolha de alimentos.`);
  if (trainingContext) {
    lines.push("\n=== CONTEXTO DE TREINO ESTRUTURADO ===");
    if (trainingContext.summary) lines.push(`Resumo: ${trainingContext.summary}`);
    if (trainingContext.splitType) lines.push(`Split: ${trainingContext.splitType}`);
    if (trainingContext.weeklySessions != null) lines.push(`Sessões/semana: ${trainingContext.weeklySessions}`);
    if (trainingContext.defaultTime) lines.push(`Horário de treino: ${trainingContext.defaultTime}`);
    if (trainingContext.daysOfWeek) {
      lines.push("Dias da semana:");
      for (const [wd, load] of Object.entries(trainingContext.daysOfWeek)) {
        const l: any = load;
        lines.push(`  - ${wd.toUpperCase()}: ${l.type}${l.intensity ? ` (${l.intensity})` : ""}`);
      }
    }
    lines.push("Use essa estrutura para concentrar carbos nos dias de maior demanda (treinos pesados/lower/full) e reduzir em dias OFF/cardio leve. Posicione pré e pós-treino conforme o horário declarado.");
  }
  // === Weekly Energy Schedule (MVP) — imutável para o modelo ===
  const schedule = dietConfig?.weeklyEnergySchedule;
  if (schedule && typeof schedule === "object" && schedule.days) {
    lines.push("\n=== CALORIAS POR DIA (BLOCO IMUTÁVEL — NÃO ALTERE) ===");
    lines.push(`Meta base do plano: ${schedule.base_daily_kcal} kcal/dia.`);
    lines.push("Cada dia da semana possui uma meta calórica final obrigatória:");
    const WD_ORDER = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
    const WD_LABEL: Record<string, string> = {
      seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta",
      sex: "Sexta", sab: "Sábado", dom: "Domingo",
    };
    for (const wd of WD_ORDER) {
      const d: any = schedule.days?.[wd];
      if (!d) continue;
      const t = d.target_kcal ?? d.base_kcal;
      const workoutBits: string[] = [];
      if (d.workout?.label) workoutBits.push(String(d.workout.label));
      if (Array.isArray(d.workout?.muscles) && d.workout.muscles.length > 0) {
        workoutBits.push(`grupos: ${d.workout.muscles.join(", ")}`);
      }
      const workoutTxt = workoutBits.length > 0 ? ` — treino: ${workoutBits.join(" / ")}` : " — sem treino associado";
      lines.push(`  - ${WD_LABEL[wd]}: ${t} kcal${workoutTxt}`);
    }
    lines.push("REGRAS OBRIGATÓRIAS para a seção 'Ajustes por dia':");
    lines.push("  1. Respeite EXATAMENTE a meta calórica final de cada dia acima.");
    lines.push("  2. A variação entre dias deve ocorrer preferencialmente via CARBOIDRATOS.");
    lines.push("  3. A PROTEÍNA deve permanecer estável em todos os dias (mesma g total).");
    lines.push("  4. A GORDURA pode variar levemente, mas nunca abaixo de 0,6 g/kg de peso corporal.");
    lines.push("  5. Produza um plano base único + uma seção 'Ajustes por dia' listando, para cada dia com meta diferente da base, as trocas ou porções ajustadas para bater a meta.");
    lines.push("");
    lines.push("FORMATO OBRIGATÓRIO — CAMPO RAIZ \"dailyAdjustments\" NO JSON DE SAÍDA:");
    lines.push("Inclua um campo raiz OBRIGATÓRIO \"dailyAdjustments\" com EXATAMENTE 7 chaves (seg, ter, qua, qui, sex, sab, dom).");
    lines.push("Cada dia DEVE ter o seguinte shape estrito:");
    lines.push('  {');
    lines.push('    "target_kcal": <int>,                       // igual à meta final declarada acima');
    lines.push('    "requested_adjustment_kcal": <int, com sinal>, // = target_kcal − base_daily_kcal');
    lines.push('    "estimated_adjustment_kcal": <int, com sinal>, // estimativa real das trocas propostas');
    lines.push('    "status": "base" | "adjusted",              // "base" quando requested_adjustment_kcal = 0');
    lines.push('    "instructions": [                            // vazio para dias base');
    lines.push('      { "action": "add" | "remove", "food_name": "<nome do banco>", "quantity": <int>, "unit": "g", "estimated_kcal": <int> }');
    lines.push('    ],');
    lines.push('    "summary": "<frase curta descrevendo a mudança em relação ao plano base>"');
    lines.push('  }');
    lines.push("Regras estritas:");
    lines.push('  - Dias com ajuste zero: status = "base", instructions = [], summary = "Manter plano base".');
    lines.push('  - Ajuste positivo (dia com mais kcal): usar SOMENTE action = "add" nas instruções.');
    lines.push('  - Ajuste negativo (dia com menos kcal): usar SOMENTE action = "remove" nas instruções.');
    lines.push('  - unit deve ser "g" (gramas) sempre que possível.');
    lines.push('  - Não invente propriedades adicionais. O servidor normaliza e valida antes de aceitar a resposta.');
    lines.push('  - Este campo NÃO substitui days[]. É complementar.');
  }
  return lines.join("\n") + "\n";
}

const STRUCTURED_OUTPUT_INSTRUCTIONS = `

========================================
MODO ESTRUTURADO — SAÍDA OBRIGATORIAMENTE JSON
========================================

Responda APENAS com um objeto JSON válido (sem markdown, sem texto antes ou depois) que siga EXATAMENTE este shape:

{
  "meta": {
    "version": "1.0",
    "objective": "cutting|bulking|recomp|manutencao|performance|precontest",
    "strategy": "linear|carb_cycle|refeed|diet_break|low_carb|if|custom",
    "style": "tradicional|mediterranea|low_carb|vegana|vegetariana|flexivel|cetogenica|paleo|outra",
    "phase": "string opcional",
    "mealCount": number,
    "trainingAware": boolean,
    "decision": "manter|ajustar|nova|pedir_dados",
    "confidence": number 0-100,
    "rationale": "string curta"
  },
  "targets": { "tmb": number, "get": number, "kcal": number, "p": number, "c": number, "g": number },
  "trainingContext": { "splitType": "string", "summary": "string" },
  "days": [
    {
      "label": "Padrão" | "Segunda" | "Treino" | "Off",
      "weekday": "seg|ter|qua|qui|sex|sab|dom" (opcional),
      "carbBias": "low|normal|high" (opcional),
      "trainingDay": boolean,
      "meals": [
        {
          "id": "m1",
          "name": "Café da Manhã",
          "time": "07:00",
          "order": 0,
          "items": [
            {
              "name": "Aveia em flocos",
              "qtyGrams": 60,
              "portionLabel": "60 g",
              "substitution": "Tapioca 50g",
              "macros": { "kcal": 220, "p": 8, "c": 38, "g": 4 }
            }
          ],
          "totals": { "kcal": 220, "p": 8, "c": 38, "g": 4 }
        }
      ],
      "totals": { "kcal": 0, "p": 0, "c": 0, "g": 0 }
    }
  ],
  "tips": ["string"],
  "whatsappMessages": ["string"]
}

REGRAS:
- Calcule totals.kcal de cada item via kcal_base * qty / porção_base; macros idem.
- meal.totals = soma dos items; day.totals = soma dos meals.
- O somatório de day.totals deve bater com targets.kcal/p/c/g (tolerância: ±50 kcal e ±10g por macro).
- Se estratégia = "carb_cycle", gere múltiplos days com carbBias variando (low/normal/high).
- Caso contrário, gere 1 day único com label "Padrão" (vale para todos os dias da semana).
- NÃO inclua nada além do JSON.
`;

const SYSTEM_PROMPT_TEMPLATE = `Você é um nutricionista esportivo com mais de 15 anos de experiência, especializado em fisiculturismo, composição corporal, emagrecimento e hipertrofia. Você cria dietas personalizadas baseadas em evidências científicas para atletas e praticantes de musculação.

========================================
REGRA NÚMERO 1 — PRECISÃO CALÓRICA
========================================

SE os dados do aluno incluírem uma seção "RECOMENDAÇÃO CALCULADA", você DEVE:
1) Usar os valores de TMB, GET e Calorias Alvo EXATAMENTE como informados
2) Usar os gramas de Proteína, Carboidrato e Gordura EXATAMENTE como informados
3) NÃO recalcular TMB por conta própria — os valores já foram calculados com a fórmula mais adequada
4) Ao somar os alimentos da tabela, o TOTAL DIÁRIO deve bater com as calorias alvo (tolerância máxima de ±50 kcal)
5) Cada refeição deve ser calculada proporcionalmente para que a soma feche no total
6) JAMAIS gere valores diferentes entre regenerações — use sempre os valores fornecidos como âncora fixa

SE NÃO houver recomendação calculada, use as fórmulas abaixo:

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

**BULKING / HIPERTROFIA / CORPO SLIM:** P: 1.8-2.2g/kg (máx automático 2.4g/kg) | G: 0.7-1.0g/kg (mín 0.7g/kg) | C: restante (alto)
**CUTTING / EMAGRECIMENTO:** P: 2.0-2.4g/kg (máx automático 2.6g/kg) | G: 0.6-0.9g/kg (mín 0.6g/kg) | C: restante
**MANUTENÇÃO:** P: 1.6-2.0g/kg (máx automático 2.2g/kg) | G: 0.7-1.0g/kg (mín 0.7g/kg) | C: restante
**RECOMPOSIÇÃO:** P: 1.8-2.2g/kg (máx automático 2.4g/kg) | G: 0.7-1.0g/kg (mín 0.7g/kg) | C: restante, priorizar peri-treino
**PRÉ-CONTEST / CUTTING AVANÇADO:** P: 2.0-2.4g/kg (máx automático 2.6g/kg) | G: 0.6-0.9g/kg | C: restante

REGRA CRÍTICA DE DISTRIBUIÇÃO DE MACROS:
1) Use a meta calórica final já calculada pelo sistema. NÃO recalcule calorias.
2) Proteína deve ser proporcional ao peso corporal e objetivo. Para hipertrofia, corpo slim ou recomposição, manter proteína preferencialmente entre 1.8 e 2.2 g/kg, NUNCA acima de 2.4 g/kg automaticamente.
3) Gordura deve respeitar o mínimo fisiológico do objetivo.
4) Carboidratos = (meta_calorica - proteina_g*4 - gordura_g*9) / 4. NÃO use proteína para preencher calorias restantes — calorias restantes vão para CARBOIDRATOS.
5) Prioridade: 1º proteína na faixa correta → 2º gordura no mínimo/padrão → 3º carboidratos com o restante.

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
VARIEDADE E CRIATIVIDADE NO CARDÁPIO
========================================

REGRA CRÍTICA — DIETA ÚNICA PARA A SEMANA INTEIRA:

OBRIGATÓRIO: Gere EXATAMENTE 1 (UM) cardápio completo, que será seguido em TODOS os dias da semana (segunda a domingo).
NÃO gere "Opção 1", "Opção 2", "Opção 3" nem "Cardápio 1/2/3". Apenas UMA tabela única de refeições.
No início, escreva claramente: "## CARDÁPIO ÚNICO (segue de segunda a domingo)".

Diretrizes para o cardápio:
1) NUNCA repita a mesma proteína em mais de 2 refeições do mesmo dia
2) Use fontes variadas de carboidrato ao longo do dia (ex: aveia no café, arroz no almoço, batata-doce no pós-treino)
3) Use fontes variadas de proteína (frango, ovos, whey, peixe, carne, iogurte grego)
4) Inclua preparações apetitosas: saladas, legumes refogados, omeletes, bowls, wraps, tapioca
5) Inclua pelo menos 2 porções de frutas e 3 porções de vegetais/legumes
6) Distribua as proteínas de forma equilibrada entre as refeições
7) Para variar substituições, use a coluna "Substituição" da tabela quando fizer sentido (1 alternativa por alimento principal)

========================================
FORMATO DE SAÍDA
========================================

REGRA CRÍTICA: Cada alimento DEVE ter quantidade em gramas E valor calórico calculado proporcionalmente.
Use os dados do banco: se o alimento tem X kcal por 100g e a porção é 150g, Kcal = X × 1.5.
NUNCA deixe colunas Kcal, P, C ou G vazias. Sempre preencha com valores numéricos.

| Refeição | Horário | Alimento | Quantidade (g) | Kcal | Proteína (g) | Carboidrato (g) | Gordura (g) |
Inclua TOTAL de cada refeição e TOTAL DIÁRIO.

========================================
VERIFICAÇÃO FINAL OBRIGATÓRIA (MAIS IMPORTANTE)
========================================

ANTES de escrever a resposta final, execute MENTALMENTE estes passos:

1) Para CADA alimento, calcule: Kcal = (kcal_por_porção / porção_base) × quantidade_usada. Faça o mesmo para P, C e G.
2) Some TODOS os alimentos de TODAS as refeições de cada cardápio.
3) Compare os totais com as METAS definidas pelo app (calorias alvo, P, C, G). Essas metas são obrigatórias e substituem qualquer faixa genérica deste prompt.
4) Se a diferença em QUALQUER macro for > 3g ou em calorias > 30 kcal:
   → AJUSTE as quantidades em gramas dos alimentos até que os totais batam.
   → Para corrigir calorias faltantes, aumente carboidratos; NÃO aumente proteína acima da meta definida pelo app.
5) Confirme que P×4 + C×4 + G×9 ≈ Kcal total (tolerância ±30 kcal).
6) A linha "Total" da tabela DEVE refletir EXATAMENTE a soma dos alimentos acima dela.
7) Os valores do "Resumo Nutricional" DEVEM ser IDÊNTICOS aos totais da tabela.
8) Se encontrar QUALQUER inconsistência, CORRIJA as porções ANTES de apresentar.

ERRO COMUM A EVITAR: Definir meta de 2200kcal/165P/250C/65G no resumo mas gerar alimentos que somam 2158kcal/186P/223C/59G. Isso é INACEITÁVEL. Os alimentos DEVEM somar os valores da meta.

========================================
REGRAS
========================================

1) Use APENAS alimentos do banco fornecido
2) Quantidades em GRAMAS e PRECISAS para atingir os macros
3) CALCULE calorias e macros PROPORCIONALMENTE à quantidade em gramas
4) TOTAL de cada refeição e TOTAL DIÁRIO
5) Gere EXATAMENTE 1 (UM) cardápio único, que vale para TODOS os dias da semana (segunda a domingo). NÃO gere múltiplas opções/cardápios.
6) Considere preferências e restrições alimentares
7) Timing nutricional baseado no horário de treino (pré, intra, pós)
8) Diferencie dias de treino e dias off quando aplicável
9) NÃO pergunte dados já fornecidos
10) JAMAIS deixe células da tabela vazias
11) Analise TODA a ficha do aluno: avaliação física, composição corporal, anamnese, sinais vitais, performance, postura e questionário de dieta

========================================
MENSAGENS WHATSAPP (NO FINAL)
========================================

Criar mensagens simples prontas para WhatsApp explicando a dieta.

========================================
CONTINUIDADE E MEMÓRIA DO PROCESSO (CRÍTICO)
========================================

Se o aluno tem uma "ÚLTIMA DIETA" no contexto, você NÃO está gerando do zero. Você é o nutricionista que acompanha esse aluno e está fazendo a próxima iteração do plano.

Antes de gerar o cardápio, decida internamente entre uma destas 4 ações e declare a decisão na seção "JUSTIFICATIVA TÉCNICA":

1) MANTER ESTRUTURA — dados não mudaram de forma relevante. Preservar refeições, horários e maioria dos alimentos da dieta anterior; só ajustar porções para bater a meta.
2) AJUSTAR DIETA ATUAL — variação pequena/moderada (peso +/- 1-2 kg, macros mudaram <10%, sintomas leves). Mesma estrutura, troca pontual de alimentos, recalibra porções.
3) NOVA DIETA COMPLETA — mudança significativa de fase (cutting↔bulking), >10% de variação calórica, sintomas relevantes ou pedido explícito.
4) PEDIR MAIS DADOS — só se faltar dado essencial e bloqueante. Caso contrário, prossiga.

REGRAS DE PRESERVAÇÃO:
- Se a estrutura da última dieta cabe nas novas metas (±10% kcal/macros), reaproveite refeições e alimentos principais. Não troque tudo só para parecer "novo".
- Quando a decisão for AJUSTAR: PRESERVE pelo menos 70% dos alimentos principais da dieta anterior. Mude apenas o necessário (porções, 1-2 trocas pontuais, refeição mais falhada). NÃO refaça o cardápio inteiro.
- Quando a decisão for MANTER: mantenha o mesmo cardápio, apenas recalibre porções para bater a meta exata.
- Pondere os fatores: aderência baixa, sintomas negativos e tendência contrária aumentam o peso da mudança; última dieta com aderência alta + sem sintomas reduz a urgência de mudar.
- Se a aderência registrada está baixa (<60%), simplifique antes de aumentar complexidade — e sinalize isso na justificativa.
- Se o aluno relatou fome excessiva no último reajuste, evite reduzir mais kcal sem comentar.
- Se relatou insônia, não concentre carbs/cafeína à noite.
- Se a tendência de peso contradiz a meta (ex: meta cutting mas peso já caindo rápido), recomende moderar — não acelere o déficit.
- Se a "DECISÃO RECOMENDADA" do sistema vier no contexto, considere-a como input forte. Você pode discordar, mas justifique no bloco final.

========================================
SAÍDA OBRIGATÓRIA — SEÇÕES FINAIS
========================================

Ao final da resposta, SEMPRE inclua DUAS seções extras (após a tabela e mensagens WhatsApp):

## Justificativa Técnica
Use EXATAMENTE este formato em blocos curtos (não escreva texto solto):

- **Decisão:** Manter | Ajustar | Nova | Pedir dados
- **Motivos principais:**
  - (3 a 5 bullets curtos: aderência, tendência de peso com velocidade, sintomas, mudança de fase, etc.)
- **Mudança principal:** (1 frase descrevendo a alteração de maior impacto: ex. "redução de 150 kcal nos carbos do jantar" ou "estrutura preservada, apenas recalibração de porções")
- **Estrutura preservada:** (% aproximado de alimentos mantidos da dieta anterior — ex: "~80% preservados" ou "n/a — primeira dieta")
- **Nível de confiança:** X/100

## Confiança da Geração
Mostre o score de confiança (0-100) recebido no contexto e liste os FATORES recebidos (positivos com ✓, negativos com ✗, neutros com ·). Se score < 60, alerte que o nutricionista deve revisar antes de enviar.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      messages,
      studentContext,
      mode,
      trainingContext,
      dietConfig,
      studentId,
      variationIntensity,
      regenerateIntent,
      intent: rawIntent,
    } = await req.json();
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

      if (studentContext.raca) contextMessage += `Raça/Etnia: ${studentContext.raca}\n`;

      contextMessage += "\n--- Dados Antropométricos ---\n";
      if (studentContext.peso) contextMessage += `Peso: ${studentContext.peso} kg\n`;
      if (studentContext.imc) contextMessage += `IMC: ${studentContext.imc}\n`;
      if (studentContext.cintura) contextMessage += `Cintura: ${studentContext.cintura} cm\n`;
      if (studentContext.quadril) contextMessage += `Quadril: ${studentContext.quadril} cm\n`;
      if (studentContext.rcq) contextMessage += `RCQ: ${studentContext.rcq}\n`;

      if (studentContext.antropometria_completa) {
        const ac = studentContext.antropometria_completa;
        const measures: [string, any][] = [
          ['Pescoço', ac.pescoco], ['Tórax', ac.torax], ['Ombro', ac.ombro],
          ['Abdômen', ac.abdomen], ['Braço D', ac.braco_direito], ['Braço E', ac.braco_esquerdo],
          ['Antebraço D', ac.antebraco], ['Antebraço E', ac.antebraco_esquerdo],
          ['Bíceps Contr. D', ac.biceps_contraido_direito], ['Bíceps Contr. E', ac.biceps_contraido_esquerdo],
          ['Coxa D', ac.coxa_direita], ['Coxa E', ac.coxa_esquerda],
          ['Panturrilha D', ac.panturrilha_direita], ['Panturrilha E', ac.panturrilha_esquerda],
        ];
        const filled = measures.filter(([, v]) => v != null);
        if (filled.length > 0) {
          contextMessage += `Circunferências: ${filled.map(([k, v]) => `${k}: ${v}cm`).join(' | ')}\n`;
        }
      }

      contextMessage += "\n--- Composição Corporal ---\n";
      if (studentContext.percentual_gordura) contextMessage += `% Gordura: ${studentContext.percentual_gordura}%\n`;
      if (studentContext.massa_magra) contextMessage += `Massa Magra: ${studentContext.massa_magra} kg\n`;
      if (studentContext.massa_gorda) contextMessage += `Massa Gorda: ${studentContext.massa_gorda} kg\n`;
      if (studentContext.composicao_obs) contextMessage += `Observações composição: ${studentContext.composicao_obs}\n`;

      if (studentContext.dobras_cutaneas) {
        const dc = studentContext.dobras_cutaneas;
        contextMessage += "\n--- Dobras Cutâneas ---\n";
        if (dc.metodo) contextMessage += `Método: ${dc.metodo}\n`;
        const folds: [string, any][] = [
          ['Tríceps', dc.triceps], ['Subescapular', dc.subescapular], ['Suprailíaca', dc.suprailiaca],
          ['Abdominal', dc.abdominal], ['Peitoral', dc.peitoral], ['Axilar Média', dc.axilar_media], ['Coxa', dc.coxa],
        ];
        const filledFolds = folds.filter(([, v]) => v != null);
        if (filledFolds.length > 0) {
          contextMessage += `Dobras: ${filledFolds.map(([k, v]) => `${k}: ${v}mm`).join(' | ')}\n`;
        }
      }

      if (studentContext.sinais_vitais) {
        const sv = studentContext.sinais_vitais;
        contextMessage += "\n--- Sinais Vitais ---\n";
        if (sv.fc_repouso) contextMessage += `FC Repouso: ${sv.fc_repouso} bpm\n`;
        if (sv.pressao) contextMessage += `Pressão: ${sv.pressao}\n`;
        if (sv.spo2) contextMessage += `SpO2: ${sv.spo2}%\n`;
        if (sv.glicemia) contextMessage += `Glicemia: ${sv.glicemia} mg/dL\n`;
        if (sv.observacoes) contextMessage += `Obs vitais: ${sv.observacoes}\n`;
      }

      if (studentContext.testes_performance) {
        const tp = studentContext.testes_performance;
        contextMessage += "\n--- Testes de Performance ---\n";
        if (tp.pushup) contextMessage += `Flexões: ${tp.pushup}\n`;
        if (tp.plank) contextMessage += `Prancha: ${tp.plank}s\n`;
        if (tp.cooper_12min) contextMessage += `Cooper 12min: ${tp.cooper_12min}m\n`;
        if (tp.salto_vertical) contextMessage += `Salto vertical: ${tp.salto_vertical}cm\n`;
        if (tp.agachamento_score) contextMessage += `Score agachamento: ${tp.agachamento_score}\n`;
        if (tp.mobilidade_ombro) contextMessage += `Mobilidade ombro: ${tp.mobilidade_ombro}\n`;
        if (tp.mobilidade_quadril) contextMessage += `Mobilidade quadril: ${tp.mobilidade_quadril}\n`;
        if (tp.mobilidade_tornozelo) contextMessage += `Mobilidade tornozelo: ${tp.mobilidade_tornozelo}\n`;
        if (tp.observacoes) contextMessage += `Obs performance: ${tp.observacoes}\n`;
      }

      if (studentContext.analise_postural) {
        const ap = studentContext.analise_postural;
        contextMessage += "\n--- Análise Postural ---\n";
        if (ap.attention_points && Array.isArray(ap.attention_points) && ap.attention_points.length > 0) {
          contextMessage += `Pontos de atenção: ${ap.attention_points.map((p: any) => typeof p === 'string' ? p : `${p.label || p.name}: ${p.severity || p.value}`).join('; ')}\n`;
        }
        if (ap.notes) contextMessage += `Notas posturais: ${ap.notes}\n`;
      }

      if (studentContext.zonas_fc) {
        const zf = studentContext.zonas_fc;
        contextMessage += "\n--- Zonas de FC (Karvonen) ---\n";
        contextMessage += `FC Repouso: ${zf.fc_repouso} | FCmax: ${zf.fcmax} (${zf.formula})\n`;
      }

      if (studentContext.anamnese) {
        const an = studentContext.anamnese;
        contextMessage += "\n--- Anamnese ---\n";
        if (an.historico_saude) contextMessage += `Histórico: ${an.historico_saude}\n`;
        if (an.medicacao) contextMessage += `Medicação: ${an.medicacao}\n`;
        if (an.suplementos) contextMessage += `Suplementos: ${an.suplementos}\n`;
        if (an.rotina) contextMessage += `Rotina: ${an.rotina}\n`;
        if (an.sono) contextMessage += `Sono: ${an.sono}\n`;
        if (an.stress) contextMessage += `Stress: ${an.stress}\n`;
        if (an.dores) contextMessage += `Dores: ${an.dores}\n`;
        if (an.cirurgias) contextMessage += `Cirurgias: ${an.cirurgias}\n`;
        if (an.tabagismo) contextMessage += `Tabagismo: Sim\n`;
        if (an.alcool) contextMessage += `Álcool: ${an.alcool}\n`;
      }

      if (studentContext.fotos_avaliacao && studentContext.fotos_avaliacao.length > 0) {
        contextMessage += `\n--- Fotos da Avaliação ---\nO aluno possui ${studentContext.fotos_avaliacao.length} foto(s) registrada(s) na avaliação (${studentContext.fotos_avaliacao.map((f: any) => f.tipo || 'foto').join(', ')}).\n`;
      }

      // ── HISTÓRICO LONGITUDINAL DO PROCESSO ──
      if (studentContext.historico_processo) {
        const hp = studentContext.historico_processo;
        contextMessage += "\n========================================\n";
        contextMessage += "HISTÓRICO DO PROCESSO (MEMÓRIA — USE PARA CONTINUIDADE)\n";
        contextMessage += "========================================\n";

        if (hp.ultima_dieta) {
          const u = hp.ultima_dieta;
          contextMessage += `\n--- ÚLTIMA DIETA ATIVA ---\n`;
          contextMessage += `Título: ${u.titulo} | Fase: ${u.fase} | Há ${u.dias_desde} dias (${new Date(u.criada_em).toLocaleDateString('pt-BR')})\n`;
          if (u.kcal_total) contextMessage += `Kcal totais: ${u.kcal_total} | P: ${u.proteina_g ?? '?'}g | C: ${u.carbs_g ?? '?'}g | G: ${u.gordura_g ?? '?'}g\n`;
          if (u.num_refeicoes) contextMessage += `Nº refeições: ${u.num_refeicoes}\n`;
          if (u.excerto) contextMessage += `\nExcerto da dieta anterior (use como base para continuidade):\n${u.excerto}\n`;
        } else {
          contextMessage += `\n--- ÚLTIMA DIETA ---\nNenhuma dieta anterior registrada — esta é a PRIMEIRA dieta deste aluno.\n`;
        }

        if (hp.tendencia_peso) {
          const t = hp.tendencia_peso;
          contextMessage += `\n--- TENDÊNCIA DE PESO/COMPOSIÇÃO ---\n`;
          contextMessage += `Peso atual: ${t.peso_atual ?? '?'}kg | Variação: ${t.variacao_kg > 0 ? '+' : ''}${t.variacao_kg}kg em ${t.intervalo_dias ?? '?'} dias | Direção: ${t.direcao} | Velocidade: ${t.velocidade_kg_semana ?? 0}kg/sem | Relevância: ${t.relevancia ?? '?'}\n`;
          if (Array.isArray(t.historico) && t.historico.length > 0) {
            contextMessage += `Histórico (mais recente primeiro):\n`;
            t.historico.forEach((h: any) => {
              const d = h.data ? new Date(h.data).toLocaleDateString('pt-BR') : '?';
              contextMessage += `  - ${d}: peso ${h.peso ?? '?'}kg`;
              if (h.percentual_gordura != null) contextMessage += ` | %G: ${h.percentual_gordura}`;
              if (h.massa_magra != null) contextMessage += ` | MLG: ${h.massa_magra}kg`;
              if (h.cintura != null) contextMessage += ` | cintura: ${h.cintura}cm`;
              contextMessage += `\n`;
            });
          }
        }

        if (hp.aderencia_recente) {
          const a = hp.aderencia_recente;
          contextMessage += `\n--- ADERÊNCIA (últimos 14 dias) ---\n`;
          contextMessage += `Dias com registro: ${a.dias_com_registro}/${a.dias_total} (${a.dias_com_registro_pct ?? '?'}%)\n`;
          contextMessage += `Refeições marcadas: ${a.refeicoes_marcadas}/${a.refeicoes_esperadas} (${a.percentual_aderencia}%)\n`;
          contextMessage += `Água média: ${a.agua_media_copos_dia} copos/dia\n`;
          if (Array.isArray(a.refeicoes_mais_falhadas) && a.refeicoes_mais_falhadas.length > 0) {
            contextMessage += `Refeições mais falhadas (índice → falhadas): ${a.refeicoes_mais_falhadas.map((r: any) => `#${r.indice}: ${r.falhadas}/${a.dias_com_registro}`).join(' | ')}\n`;
          }
          if (a.percentual_aderencia < 60) {
            contextMessage += `⚠️ ADERÊNCIA BAIXA — simplifique a dieta e sinalize na justificativa.\n`;
          }
        } else {
          contextMessage += `\n--- ADERÊNCIA ---\nSem registros nos últimos 14 dias.\n`;
        }

        if (hp.ultimo_reajuste) {
          const r = hp.ultimo_reajuste;
          contextMessage += `\n--- ÚLTIMO REAJUSTE/FEEDBACK ---\n`;
          contextMessage += `Data: ${new Date(r.data).toLocaleDateString('pt-BR')}\n`;
          if (r.peso_atual) contextMessage += `Peso reportado: ${r.peso_atual}kg\n`;
          if (r.sintomas?.length) contextMessage += `Sintomas: ${r.sintomas.join(', ')}\n`;
          if (r.rendimento_treino) contextMessage += `Rendimento treino: ${r.rendimento_treino}\n`;
          if (r.satisfacao) contextMessage += `Satisfação: ${r.satisfacao}\n`;
          if (r.observacoes) contextMessage += `Observações: ${r.observacoes}\n`;
          contextMessage += `⚠️ NÃO repita erros já relatados.\n`;
        }

        if (hp.confianca_geracao) {
          const c = hp.confianca_geracao;
          contextMessage += `\n--- SCORE DE CONFIANÇA DA GERAÇÃO ---\n`;
          contextMessage += `Score: ${c.score}/100\n`;
          if (Array.isArray(c.factors) && c.factors.length > 0) {
            contextMessage += `Fatores:\n`;
            for (const f of c.factors) {
              const sym = f.status === 'positive' ? '✓' : f.status === 'negative' ? '✗' : '·';
              contextMessage += `  ${sym} ${f.label} (peso ${f.weight})\n`;
            }
          } else {
            contextMessage += `Motivos: ${(c.motivos || []).join(', ') || 'dados limitados'}\n`;
          }
          contextMessage += `Use este score na seção final "Confiança da Geração".\n`;
        }

        if (hp.decisao_recomendada) {
          contextMessage += `\n--- DECISÃO RECOMENDADA PELO SISTEMA (heurística) ---\n`;
          contextMessage += `Sugestão: ${String(hp.decisao_recomendada).toUpperCase()}\n`;
          if (Array.isArray(hp.motivos_decisao) && hp.motivos_decisao.length > 0) {
            contextMessage += `Motivos:\n${hp.motivos_decisao.map((m: string) => `  - ${m}`).join('\n')}\n`;
          }
          contextMessage += `Você pode discordar, mas precisa justificar explicitamente na "Justificativa Técnica".\n`;
        }
      }

      contextMessage += "\n=== FIM DOS DADOS ===\n\nIMPORTANTE: Use TODOS os dados acima para personalizar a dieta. Considere a composição corporal, postura, performance, sinais vitais e anamnese completa. NÃO pergunte dados já fornecidos.\n";
    }

    // ─── Structured (JSON) generation mode ───
    if (mode === "structured") {
      const layeredInstructions = buildLayeredInstructions(dietConfig, trainingContext);
      // Resolve intent: explicit `intent` wins; legacy `regenerateIntent` maps to "regenerate".
      const intent: DietIntent =
        rawIntent === "update" || rawIntent === "regenerate" || rawIntent === "new"
          ? rawIntent
          : regenerateIntent ? "regenerate" : "new";

      // For "update" intent, force LOW variation regardless of what was passed.
      const intensity: VariationIntensity =
        intent === "update"
          ? "baixa"
          : intent === "regenerate"
            ? "alta"
            : variationIntensity === "baixa" || variationIntensity === "alta"
              ? variationIntensity
              : DEFAULT_INTENSITY;

      // Hard demand for menu variation when explicitly regenerating.
      const requireMenuVariation = intent === "regenerate";
      let history: HistoryPlan[] = [];
      let historySummary = "";
      if (typeof studentId === "string" && studentId.length > 0) {
        history = await loadPlanHistory(studentId, "dieta");
        historySummary = history.map((p, i) => summarizeDietForPrompt(p, i)).join("\n");
      }

      const callModel = async (
        extraSystem: string,
      ): Promise<{ ok: true; plan: any } | { ok: false; resp: Response }> => {
        const hungerCtx = detectHungerContext(studentContext);
        const cyclePlan: CarbCyclePlan | undefined =
          dietConfig && typeof dietConfig === "object" && dietConfig.carbCyclePlan
            ? (dietConfig.carbCyclePlan as CarbCyclePlan)
            : undefined;
        const jsonSystem =
          SYSTEM_PROMPT +
          contextMessage +
          layeredInstructions +
          "\n\n" +
          dietIntentPrompt(intent) +
          "\n\n" +
          supplementationPolicyPrompt() +
          "\n\n" +
          satietyPromptBlock(hungerCtx) +
          "\n\n" +
          (cyclePlan ? carbCyclePromptBlock(cyclePlan) + "\n\n" : "") +
          extraSystem +
          "\n\n" +
          STRUCTURED_OUTPUT_INSTRUCTIONS;
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: jsonSystem },
              ...messages,
            ],
            temperature: 0.3,
            max_tokens: 16000,
            response_format: { type: "json_object" },
          }),
        });
        if (!r.ok) {
          const status = r.status;
          const t = await r.text();
          console.error("structured diet-agent error:", status, t);
          return {
            ok: false,
            resp: new Response(
              JSON.stringify({
                error:
                  status === 429
                    ? "Limite de requisições excedido. Tente novamente em alguns minutos."
                    : status === 402
                      ? "Créditos insuficientes na conta OpenAI."
                      : "Erro ao gerar dieta estruturada.",
              }),
              { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            ),
          };
        }
        const completion = await r.json();
        const raw = completion?.choices?.[0]?.message?.content;
        if (!raw) {
          return {
            ok: false,
            resp: new Response(
              JSON.stringify({ error: "Resposta vazia do modelo." }),
              { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            ),
          };
        }
        try {
          return { ok: true, plan: JSON.parse(raw) };
        } catch (e) {
          console.error("structured diet-agent: invalid JSON", e, raw.slice(0, 500));
          return {
            ok: false,
            resp: new Response(
              JSON.stringify({ error: "Modelo retornou JSON inválido.", raw }),
              { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            ),
          };
        }
      };

      const first = await callModel(
        dietVariationPrompt(intensity, historySummary, undefined, requireMenuVariation),
      );
      if (!first.ok) return first.resp;

      const historyJsons = history
        .map((h) => h.conteudo_json)
        .filter((j) => j && typeof j === "object") as any[];

      let similarity = computeDietSimilarity(first.plan, historyJsons);
      const threshold = SIMILARITY_THRESHOLDS[intensity];
      let finalPlan = first.plan;
      let regenerated = false;
      let warning: string | null = null;
      let nutrition: DietNutritionValidation = validateDietNutrition(finalPlan);

      const qOnly = similarity.quantityOnlyRatio ?? 0;
      const isPortionOnly = similarity.changeKind === "portion_only";
      const protRepeat = similarity.primaryProteinRepeatRatio ?? 0;
      const carbRepeat = similarity.primaryCarbRepeatRatio ?? 0;
      const primarySourceTooRepetitive = Math.max(protRepeat, carbRepeat) >= 0.6;
      // Trigger regen if:
      //  - nutrition guardrail failed (main meals must have primary protein), OR
      //  - similarity above threshold, OR
      //  - the change is essentially "same foods, different portions", OR
      //  - admin asked for regeneration / menu renewal and we got portion_only
      //  - primary protein/carb groups repeat in ≥60% of meals vs previous plan
      const needsRetry =
        !nutrition.ok ||
        historyJsons.length > 0 &&
        (similarity.score > threshold ||
          isPortionOnly ||
          (requireMenuVariation && qOnly > 0.3) ||
          primarySourceTooRepetitive);

      if (needsRetry) {
        const overlapList = similarity.worstOverlap.length
          ? `Alimentos repetidos do cardápio anterior (TROQUE A MAIORIA): ${similarity.worstOverlap.join(", ")}.`
          : "Muitos alimentos coincidem com o cardápio anterior.";
        const retryParts = [
          overlapList,
          "Substitua por equivalentes em macros usando o BANCO DE ALIMENTOS.",
          "Preserve metas calóricas, macros, restrições e preferências.",
        ];
        if (!nutrition.ok) {
          const missing = nutrition.issues
            .filter((i) => i.reason === "missing_primary_protein")
            .map((i) => i.meal);
          const lowProt = nutrition.issues
            .filter((i) => i.reason === "protein_below_floor")
            .map((i) => `${i.meal} (${Math.round(i.proteinG)}g)`);
          const lowShare = nutrition.issues
            .filter((i) => i.reason === "low_protein_share")
            .map((i) => `${i.meal} (${Math.round(i.proteinG)}g)`);
          const bfMissing = nutrition.issues
            .filter((i) => i.reason === "breakfast_missing_protein")
            .map((i) => i.meal);
          const bfLow = nutrition.issues
            .filter((i) => i.reason === "breakfast_protein_below_floor")
            .map((i) => `${i.meal} (${Math.round(i.proteinG)}g)`);
          retryParts.unshift(
            "🚨 PRIORIDADE MÁXIMA — ESTRUTURA NUTRICIONAL INCOMPLETA. Antes de pensar em variação, CORRIJA:",
            ...(missing.length
              ? [`• Refeições principais SEM proteína principal: ${missing.join(", ")}. Inclua OBRIGATORIAMENTE uma fonte de proteína principal (frango, peixe, carne, ovos, vísceras, laticínios ou vegetal proteica) em cada uma.`]
              : []),
            ...(lowProt.length
              ? [`• Almoço/Jantar com proteína abaixo do piso (mín 30g): ${lowProt.join(", ")}. Aumente a porção da proteína principal até atingir o piso, ajustando carbo/gordura para manter as metas.`]
              : []),
            ...(bfMissing.length
              ? [`• Café da manhã SEM fonte proteica: ${bfMissing.join(", ")}. Inclua OBRIGATORIAMENTE uma fonte proteica (ovos, whey, iogurte, queijo, leite ou similar da lista do aluno).`]
              : []),
            ...(bfLow.length
              ? [`• Café da manhã com proteína abaixo do piso (mín 15g): ${bfLow.join(", ")}. Aumente a porção da fonte proteica.`]
              : []),
            ...(lowShare.length
              ? [`• Refeições com participação de proteína muito baixa: ${lowShare.join(", ")}. Acrescente uma fonte proteica adequada.`]
              : []),
            "Variação de cardápio é prioridade MENOR que esta correção — não remova proteínas para variar. Lanche da tarde é a ÚNICA refeição que pode ser carbo / carbo+gordura.",
            "Todas as correções devem usar alimentos da lista de preferidos/acessíveis/práticos do questionário do aluno.",
          );
        }
        if (isPortionOnly || qOnly > 0.3) {
          retryParts.push(
            "❗ A geração anterior apenas mudou GRAMAGEM dos mesmos alimentos. Isto NÃO é variação. Substitua de fato os alimentos por outros equivalentes (proteínas, carbs e gorduras diferentes).",
          );
        }
        if (protRepeat >= 0.6 && similarity.proteinRepeatMeals?.length) {
          retryParts.push(
            `❗ Em ${Math.round(protRepeat * 100)}% das refeições a PROTEÍNA PRINCIPAL repete a MESMA FAMÍLIA do cardápio anterior (refeições: ${similarity.proteinRepeatMeals.join(", ")}). Troque por outra família: se antes era carne vermelha, use frango, peixe, ovos, vísceras (fígado/moela) ou laticínios — não outra carne vermelha.`,
          );
        }
        if (carbRepeat >= 0.6 && similarity.carbRepeatMeals?.length) {
          retryParts.push(
            `❗ Em ${Math.round(carbRepeat * 100)}% das refeições o CARBOIDRATO PRINCIPAL repete a MESMA FAMÍLIA (refeições: ${similarity.carbRepeatMeals.join(", ")}). Alterne entre cereais, tubérculos, frutas e leguminosas.`,
          );
        }
        const second = await callModel(
          dietVariationPrompt(intensity, historySummary, retryParts.join(" "), true),
        );
        if (second.ok) {
          const sim2 = computeDietSimilarity(second.plan, historyJsons);
          const nut2 = validateDietNutrition(second.plan);
          // Prefer the second plan when it (a) lowers similarity OR
          // (b) escapes portion_only mode OR
          // (c) reduces primary-source repetition OR
          // (d) fixes a nutrition guardrail failure.
          const escapedPortion =
            isPortionOnly && sim2.changeKind !== "portion_only";
          const sim2Primary = Math.max(
            sim2.primaryProteinRepeatRatio ?? 0,
            sim2.primaryCarbRepeatRatio ?? 0,
          );
          const reducedPrimary =
            primarySourceTooRepetitive && sim2Primary < Math.max(protRepeat, carbRepeat);
          const fixedNutrition = !nutrition.ok && nut2.issues.length < nutrition.issues.length;
          // Nutrition guardrail trumps similarity preference: if the first plan
          // was nutritionally invalid and the second is valid (or better),
          // always take the second.
          if (
            fixedNutrition ||
            (nutrition.ok &&
              (sim2.score <= similarity.score || escapedPortion || reducedPrimary))
          ) {
            finalPlan = second.plan;
            similarity = sim2;
            nutrition = nut2;
          }
          regenerated = true;
          if (!nutrition.ok) warning = "incomplete_nutrition";
          else if (similarity.changeKind === "portion_only") warning = "quantity_only";
          else if (similarity.score > threshold) warning = "high_similarity";
          else if (
            Math.max(
              similarity.primaryProteinRepeatRatio ?? 0,
              similarity.primaryCarbRepeatRatio ?? 0,
            ) >= 0.6
          ) {
            warning = "primary_source_repeated";
          }
        } else {
          warning = !nutrition.ok
            ? "incomplete_nutrition"
            : isPortionOnly
              ? "quantity_only"
              : "high_similarity";
        }
      }

      // === dailyAdjustments contract ===
      // Quando o cliente enviou um weeklyEnergySchedule, os targets são
      // determinísticos e vêm do schedule (fonte de verdade). A IA fornece
      // apenas instructions / summary / estimated_adjustment_kcal.
      const schedule = (dietConfig && typeof dietConfig === "object")
        ? (dietConfig as any).weeklyEnergySchedule
        : null;
      let normalizedDailyAdjustments: any = null;
      let dailyAdjustmentsError: string | null = null;
      if (schedule && typeof schedule === "object" && schedule.days) {
        console.log("[diet-agent] weekly_schedule_received=true", {
          requested_day_count: ENERGY_WEEKDAYS.filter((wd) => schedule.days?.[wd]).length,
          model_daily_adjustments_present:
            !!(finalPlan && typeof finalPlan === "object" && (finalPlan as any).dailyAdjustments),
        });
        const modelAdj = (finalPlan && typeof finalPlan === "object")
          ? (finalPlan as any).dailyAdjustments
          : null;
        const { adjustments, missing } = normalizeDailyAdjustments(modelAdj, schedule);
        const requested = buildRequestedFromSchedule(schedule);
        // Log divergências de target (nunca aceitas silenciosamente).
        for (const wd of ENERGY_WEEKDAYS) {
          const modelDay = modelAdj?.[wd];
          if (modelDay && Number(modelDay.target_kcal) !== requested[wd].target_kcal) {
            console.warn(`[diet-agent] target divergence on ${wd}: model=${modelDay.target_kcal} authoritative=${requested[wd].target_kcal}`);
          }
        }
        const validation = validateDailyAdjustments(adjustments, missing);
        console.log("[diet-agent] normalized_day_count", {
          count: Object.keys(adjustments).length,
          missing_count: missing.length,
          validation_ok: validation.ok,
        });
        if (!validation.ok) {
          dailyAdjustmentsError = validation.errors.join(" | ");
        } else {
          normalizedDailyAdjustments = adjustments;
        }
      }

      if (schedule && !normalizedDailyAdjustments) {
        return new Response(
          JSON.stringify({
            error:
              "A dieta foi gerada, mas os ajustes calóricos por dia não foram devolvidos corretamente. Regere o plano.",
            error_code: "daily_adjustments_invalid",
            details: dailyAdjustmentsError,
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          plan: finalPlan,
          intent,
          dailyAdjustments: normalizedDailyAdjustments,
          similarity: {
            score: Number(similarity.score.toFixed(3)),
            threshold,
            intensity,
            regenerated,
            warning,
            worstOverlap: similarity.worstOverlap,
            historyCount: historyJsons.length,
            quantityOnlyRatio: Number((similarity.quantityOnlyRatio ?? 0).toFixed(3)),
            changeKind: similarity.changeKind ?? "new_menu",
            primaryProteinRepeatRatio: Number(
              (similarity.primaryProteinRepeatRatio ?? 0).toFixed(3),
            ),
            primaryCarbRepeatRatio: Number(
              (similarity.primaryCarbRepeatRatio ?? 0).toFixed(3),
            ),
            proteinRepeatMeals: similarity.proteinRepeatMeals ?? [],
            carbRepeatMeals: similarity.carbRepeatMeals ?? [],
          },
          nutrition: {
            ok: nutrition.ok,
            issues: nutrition.issues,
            totalProteinG: Math.round(nutrition.totalProteinG),
            totalKcal: Math.round(nutrition.totalKcal),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
        temperature: 0.4,
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
