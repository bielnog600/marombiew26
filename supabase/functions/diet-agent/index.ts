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
