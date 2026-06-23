/**
 * Satiety / caloric density helpers.
 *
 * Heuristic seed (no DB column yet) used to bias the model toward
 * high-satiety, lower-density foods when the student reports hunger.
 * Shared between diet-agent and (later) the substitution flow.
 */

/** High-satiety foods: high protein, high fiber and/or low energy density. */
export const HIGH_SATIETY_FOODS = [
  "ovos", "claras", "frango grelhado", "frango desfiado", "peito de peru",
  "peixe branco", "tilápia", "atum em água", "patinho moído", "moela",
  "iogurte natural desnatado", "iogurte grego natural", "queijo cottage",
  "ricota fresca", "feijão", "lentilha", "grão-de-bico", "ervilha",
  "aveia em flocos", "batata cozida", "batata doce cozida", "mandioca",
  "abóbora", "cenoura cozida", "brócolis", "couve-flor", "espinafre",
  "couve", "rúcula", "alface", "tomate", "pepino", "abobrinha",
  "berinjela", "chuchu", "maçã", "pera", "laranja", "kiwi", "morango",
  "melão", "melancia", "abacaxi",
];

/** Low-satiety / high-density: avoid as anchors when hunger is high. */
export const LOW_SATIETY_FOODS = [
  "pão branco", "biscoito", "bolacha doce", "torrada", "açúcar",
  "mel", "geleia", "suco", "refrigerante", "manteiga", "azeite",
  "amendoim", "pasta de amendoim", "castanhas", "nozes", "macadâmia",
  "queijo cheddar", "queijo prato", "linguiça", "bacon", "salgadinho",
];

export type HungerContext = {
  hungerHigh: boolean;
  reasons: string[];
};

/** Detect hunger context from questionnaire + last readjustment + tracking. */
export function detectHungerContext(studentContext: any): HungerContext {
  const reasons: string[] = [];
  let hungerHigh = false;
  const q = studentContext?.questionario_dieta;
  if (q?.fome_excessiva) {
    hungerHigh = true;
    reasons.push("questionário: fome excessiva");
  }
  const symptoms: string[] = studentContext?.historico_processo?.ultimo_reajuste?.sintomas ?? [];
  if (symptoms.some((s) => /fome|fraqueza|baixa energia/i.test(String(s)))) {
    hungerHigh = true;
    reasons.push(`último reajuste: ${symptoms.filter((s) => /fome|fraqueza|baixa energia/i.test(String(s))).join(", ")}`);
  }
  return { hungerHigh, reasons };
}

/** Prompt block instructing the model on satiety/density priorities. */
export function satietyPromptBlock(ctx: HungerContext): string {
  if (!ctx.hungerHigh) {
    // Always-on hint, but soft.
    return [
      "========================================",
      "MOTOR DE SACIEDADE (BACKGROUND)",
      "========================================",
      "Mesmo sem queixa de fome, prefira fontes com boa saciedade quando equivalentes nutricionalmente",
      "(proteínas magras, vegetais volumosos, frutas inteiras vs sucos, grãos integrais vs refinados).",
    ].join("\n");
  }
  return [
    "========================================",
    "MOTOR DE SACIEDADE — FOME ALTA RELATADA",
    "========================================",
    `Sinais: ${ctx.reasons.join("; ")}.`,
    "Regras OBRIGATÓRIAS para esta geração:",
    "1) Priorize alimentos de ALTA saciedade e BAIXA densidade calórica (g/kcal alto).",
    `   Exemplos: ${HIGH_SATIETY_FOODS.slice(0, 18).join(", ")}.`,
    "2) Limite alimentos de baixa saciedade / alta densidade a porções pequenas (≤10% das kcal do dia).",
    `   Exemplos a moderar: ${LOW_SATIETY_FOODS.slice(0, 12).join(", ")}.`,
    "3) Em cada refeição principal, inclua ao menos UMA fonte volumosa (vegetal cozido/cru, fruta inteira ou leguminosa).",
    "4) Em déficit, prefira proteína magra + carbo de baixa densidade + vegetais — evite empilhar gorduras calóricas (oleaginosas, óleos) só para fechar kcal.",
    "5) Distribua a proteína em TODAS as refeições para sustentar saciedade.",
    "6) Mantenha as metas exatas de kcal/macros — esta regra reorganiza ESCOLHAS, não muda os totais.",
  ].join("\n");
}

/** Type for a structured carb-cycle day plan injected by the client. */
export type CarbCycleDay = {
  weekday: "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";
  label: string;
  carbBias: "low" | "normal" | "high";
  trainingDay: boolean;
  kcal: number;
  p: number;
  c: number;
  g: number;
};

export type CarbCyclePlan = {
  baseKcal: number;
  baseP: number;
  baseC: number;
  baseG: number;
  days: CarbCycleDay[];
  refeed?: { weekday: CarbCycleDay["weekday"]; extraCarbsG: number } | null;
};

export function carbCyclePromptBlock(plan: CarbCyclePlan): string {
  const rows = plan.days
    .map(
      (d) =>
        `  • ${d.weekday.toUpperCase()} (${d.label}) — bias ${d.carbBias.toUpperCase()}${d.trainingDay ? " [TREINO]" : " [OFF]"}: ${d.kcal} kcal | P ${d.p}g | C ${d.c}g | G ${d.g}g`,
    )
    .join("\n");
  const refeed = plan.refeed
    ? `\nREFEED EXTRA: ${plan.refeed.weekday.toUpperCase()} acresce +${plan.refeed.extraCarbsG}g de carbo (use carbo de fácil digestão e baixa gordura).`
    : "";
  return [
    "========================================",
    "CARB CYCLING ESTRUTURADO (OBRIGATÓRIO NESTA GERAÇÃO)",
    "========================================",
    `Base diária de referência: ${plan.baseKcal} kcal | P ${plan.baseP}g | C ${plan.baseC}g | G ${plan.baseG}g.`,
    "Você DEVE emitir MÚLTIPLOS dias no campo `days[]` (um por weekday abaixo).",
    "Cada day.totals e respectivas refeições devem bater EXATAMENTE com as metas do dia:",
    rows,
    refeed,
    "Regras:",
    "- Proteína praticamente constante entre os dias.",
    "- Em dias HIGH: concentre carbo no pré/intra/pós-treino.",
    "- Em dias LOW: distribua carbo no café e pós-treino (se houver) e aumente vegetais + proteína.",
    "- Preserve restrições, preferências, estrutura mínima de refeições e proteína obrigatória.",
    "- carbBias na saída deve ser exatamente low|normal|high conforme tabela acima.",
  ].join("\n");
}