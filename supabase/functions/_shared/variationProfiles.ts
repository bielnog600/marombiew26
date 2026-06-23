/**
 * Controlled variability profiles for plan generation.
 * Shared between trainer-agent and diet-agent (Deno edge functions).
 * Mirrors src/lib/variationProfiles.ts for UI labels.
 */

export type VariationIntensity = "baixa" | "media" | "alta";

export const DEFAULT_INTENSITY: VariationIntensity = "media";

/**
 * Similarity threshold ABOVE which the plan is considered too similar to
 * recent history and we trigger a 1x regeneration with stronger instructions.
 * Score is 0..1, weighted-by-age across last 3 plans.
 */
export const SIMILARITY_THRESHOLDS: Record<VariationIntensity, number> = {
  baixa: 0.75,
  media: 0.55,
  alta: 0.35,
};

/** Age decay applied to historic plans (most recent first). */
export const HISTORY_DECAY = [1.0, 0.6, 0.3];
export const HISTORY_LIMIT = HISTORY_DECAY.length;

const WORKOUT_RULES: Record<VariationIntensity, string> = {
  baixa:
    "Mantenha a estrutura geral. Pode preservar a maioria dos exercícios principais e acessórios; varie apenas rep range ou 1-2 acessórios por dia. Foque em pequena progressão.",
  media:
    "Mantenha os compostos principais quando fizerem sentido para o objetivo/fase. Rotacione PELO MENOS 40% dos exercícios acessórios em relação ao plano anterior. Varie rep ranges, técnicas avançadas, ordem ou variações de pegada/ângulo. Mobilidade deve ser DIFERENTE do plano anterior.",
  alta:
    "Reestruture o treino: troque a maioria dos acessórios e pelo menos 1 composto por bloco. Pode alterar divisão/ordem dos dias. Use técnicas avançadas DIFERENTES das anteriores. Mobilidade e variações totalmente novas.",
};

const DIET_RULES: Record<VariationIntensity, string> = {
  baixa:
    "Preserve a estrutura de refeições e a maioria dos alimentos. Faça apenas 1-2 trocas pontuais e ajuste porções para bater a meta.",
  media:
    "Mantenha as âncoras de horário e número de refeições, mas varie ALIMENTOS e COMBINAÇÕES: troque pelo menos uma fonte de proteína, uma de carboidrato e uma de gordura por refeição em relação ao cardápio anterior. Use opções equivalentes dentro dos mesmos macros. APENAS reduzir ou aumentar a gramagem dos MESMOS alimentos NÃO conta como variação.",
  alta:
    "Reescreva o cardápio com alimentos majoritariamente NOVOS em relação ao anterior, mantendo apenas itens essenciais por restrição/preferência. Preserve metas calóricas, macros, restrições e preferências. Repetir os mesmos alimentos com porções diferentes NÃO é aceitável.",
};

export function workoutVariationPrompt(
  intensity: VariationIntensity,
  historySummary: string,
  retryNotes?: string,
): string {
  const rules = WORKOUT_RULES[intensity] ?? WORKOUT_RULES.media;
  const block = [
    "========================================",
    "VARIABILIDADE CONTROLADA — REGRAS OBRIGATÓRIAS",
    "========================================",
    `Intensidade de variação: ${intensity.toUpperCase()}.`,
    rules,
    "NUNCA gere um plano quase idêntico ao anterior sem justificativa técnica clara.",
    "Coerência técnica (objetivo, fase, segurança, periodização) tem PRIORIDADE MÁXIMA sobre variação. Não varie só para parecer novo.",
  ];
  if (historySummary) {
    block.push("", "PLANOS RECENTES DO ALUNO (mais novo primeiro):", historySummary);
  }
  if (retryNotes) {
    block.push(
      "",
      "⚠️ NOVA TENTATIVA — O plano anterior gerado ficou muito parecido com o histórico.",
      "Aplique estas correções obrigatórias:",
      retryNotes,
    );
  }
  return block.join("\n");
}

export function dietVariationPrompt(
  intensity: VariationIntensity,
  historySummary: string,
  retryNotes?: string,
  requireMenuVariation = false,
): string {
  const rules = DIET_RULES[intensity] ?? DIET_RULES.media;
  const block = [
    "========================================",
    "VARIABILIDADE CONTROLADA — REGRAS OBRIGATÓRIAS",
    "========================================",
    "HIERARQUIA DE PRIORIDADES (NÃO INVERTA):",
    "1) Segurança e restrições do aluno",
    "2) Meta calórica e de macros do dia",
    "3) Proteína mínima por refeição (≥30g em almoço e jantar)",
    "4) Estrutura obrigatória das refeições principais (almoço e jantar SEMPRE com uma fonte de proteína principal)",
    "5) Aderência/praticidade",
    "6) Variação do cardápio",
    "Variação NUNCA pode remover a proteína principal de almoço/jantar nem deixar essas refeições com proteína abaixo do piso.",
    "Trocas de variedade devem ser por EQUIVALÊNCIA FUNCIONAL: proteína principal só sai se entrar OUTRA proteína principal — nunca substitua proteína por carbo + gordura.",
    "",
    `Intensidade de variação: ${intensity.toUpperCase()}.`,
    rules,
    "NÃO quebre: metas calóricas, macros, restrições, preferências e aderência relatada.",
    "",
    "DIFERENÇA OBRIGATÓRIA — AJUSTE NUTRICIONAL vs VARIAÇÃO DE CARDÁPIO:",
    "• Ajuste nutricional = mudar calorias/macros/déficit.",
    "• Variação de cardápio = trocar alimentos, combinações e preparações.",
    "Quando o contexto for NOVA dieta, RENOVAÇÃO ou REGENERAÇÃO, é OBRIGATÓRIO variação real de cardápio.",
    "NÃO considere suficiente apenas escalar a quantidade (em gramas) dos mesmos alimentos.",
  ];
  if (requireMenuVariation) {
    block.push(
      "",
      "🔒 EXIGÊNCIA DE VARIAÇÃO DE CARDÁPIO (não negociável nesta geração):",
      "- Em pelo menos 60% das refeições, troque a FONTE PRINCIPAL (proteína OU carboidrato) por outra de GRUPO FUNCIONAL DIFERENTE.",
      "  Grupos de proteína: vermelha (bovina/suína), branca (frango/peru), peixe/frutos do mar, ovos, vísceras (fígado/moela/coração), laticínios (whey/iogurte/queijo), vegetal (tofu/soja/PTS).",
      "  Grupos de carbo: cereais (arroz/aveia/pão/tapioca/macarrão), tubérculos (batata/batata doce/mandioca/inhame), frutas, leguminosas (feijão/lentilha/grão-de-bico).",
      "  Manter o MESMO grupo (ex.: carne vermelha → carne vermelha em outra refeição equivalente) NÃO conta como variação, mesmo que o nome mude.",
      "- Inclua pelo menos 3 alimentos NOVOS (que não aparecem na dieta anterior do aluno).",
      "- Mantenha exatamente as metas de kcal, P, C, G — ajuste porções dos NOVOS alimentos para fechar a conta.",
      "- Se você devolver praticamente os mesmos alimentos OU manter a mesma família de proteína/carbo na mesma refeição, a geração será considerada inválida.",
    );
  }
  if (historySummary) {
    block.push("", "DIETAS RECENTES DO ALUNO (mais nova primeiro):", historySummary);
  }
  if (retryNotes) {
    block.push(
      "",
      "⚠️ NOVA TENTATIVA — O cardápio anterior ficou muito parecido com o histórico.",
      "Aplique estas correções obrigatórias:",
      retryNotes,
    );
  }
  return block.join("\n");
}