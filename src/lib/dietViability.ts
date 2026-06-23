/**
 * Viability score — estimates how realistically the student will follow the
 * generated diet, based on questionnaire + adherence history + plan complexity.
 *
 * Each dimension is 0..100. Final score is a weighted average.
 * Pure function — safe to run client-side after generation.
 */

export type ViabilityBreakdown = {
  adherence: number;     // histórico de aderência
  practicality: number;  // nº de refeições e preparações realistas
  cost: number;          // proxy: variedade × itens caros
  complexity: number;    // diversidade de preparos
  familiarity: number;   // % de alimentos dentro da lista de preferidos
};

export type ViabilityInput = {
  plan: any;
  questionnaire?: any | null;
  adherencePct?: number | null;   // 0..100 (últimos 14 dias)
  mealCount?: number | null;
};

const WEIGHTS: Record<keyof ViabilityBreakdown, number> = {
  adherence: 0.30,
  practicality: 0.20,
  familiarity: 0.25,
  complexity: 0.15,
  cost: 0.10,
};

function normalize(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .trim();
}

function collectPlanFoods(plan: any): string[] {
  const out: string[] = [];
  const days = Array.isArray(plan?.days) ? plan.days : [];
  for (const d of days) {
    const meals = Array.isArray(d?.meals) ? d.meals : [];
    for (const m of meals) {
      const items = Array.isArray(m?.items) ? m.items : [];
      for (const it of items) if (it?.name) out.push(normalize(String(it.name)));
    }
  }
  return out;
}

function collectPreferredFoods(questionnaire: any | null | undefined): string[] {
  if (!questionnaire) return [];
  const out: string[] = [];
  const apr = questionnaire.alimentos_por_refeicao;
  if (apr && typeof apr === "object") {
    for (const arr of Object.values(apr)) {
      if (Array.isArray(arr)) for (const f of arr) if (f) out.push(normalize(String(f)));
    }
  }
  const pref = questionnaire.preferencias_alimentares;
  if (typeof pref === "string") {
    for (const tok of pref.split(/[,;\n]/)) {
      const t = normalize(tok);
      if (t.length > 2) out.push(t);
    }
  }
  return out;
}

/** Crude proxy: foods commonly considered expensive in BR context. */
const EXPENSIVE_TOKENS = [
  "salmao", "salmão", "filé mignon", "file mignon", "picanha", "atum", "amendoas", "amêndoas",
  "castanha", "nozes", "macadamia", "macadâmia", "abacate", "queijo branco", "iogurte grego",
  "whey", "creatina",
];

export function computeViabilityScore(input: ViabilityInput): {
  score: number;
  breakdown: ViabilityBreakdown;
  notes: string[];
} {
  const notes: string[] = [];
  const planFoods = collectPlanFoods(input.plan);
  const preferred = collectPreferredFoods(input.questionnaire);

  // 1) Adherence — direct from history.
  const adherence = Math.max(0, Math.min(100,
    typeof input.adherencePct === "number" ? input.adherencePct : 60,
  ));

  // 2) Practicality — penalize 7+ meals or 1-2 meals; sweet spot 4-5.
  const mc = input.mealCount ?? (Array.isArray(input.plan?.days?.[0]?.meals) ? input.plan.days[0].meals.length : 5);
  let practicality = 100;
  if (mc <= 2) practicality = 50;
  else if (mc === 3) practicality = 75;
  else if (mc === 4 || mc === 5) practicality = 95;
  else if (mc === 6) practicality = 80;
  else if (mc >= 7) practicality = 60;
  if (mc >= 7) notes.push(`${mc} refeições/dia é difícil de manter — considere reduzir.`);

  // 3) Familiarity — % of plan foods that match preferred list.
  let familiarity = 70; // neutral default when no questionnaire
  if (preferred.length > 0 && planFoods.length > 0) {
    const matched = planFoods.filter((f) =>
      preferred.some((p) => f.includes(p) || p.includes(f)),
    ).length;
    familiarity = Math.round((matched / planFoods.length) * 100);
    if (familiarity < 50) {
      notes.push(`Só ${familiarity}% dos alimentos batem com a lista de preferidos do aluno.`);
    }
  } else if (preferred.length === 0) {
    notes.push("Sem lista de alimentos preferidos no questionário — viabilidade estimada.");
  }

  // 4) Complexity — diversity of items per meal; >6 distinct items per meal = complex.
  const meals = Array.isArray(input.plan?.days?.[0]?.meals) ? input.plan.days[0].meals : [];
  const avgItems = meals.length > 0
    ? meals.reduce((a: number, m: any) => a + (Array.isArray(m?.items) ? m.items.length : 0), 0) / meals.length
    : 4;
  let complexity = 100;
  if (avgItems > 7) complexity = 55;
  else if (avgItems > 5) complexity = 75;
  else if (avgItems > 3) complexity = 95;
  else complexity = 85;

  // 5) Cost — % of expensive tokens.
  const expensiveHits = planFoods.filter((f) => EXPENSIVE_TOKENS.some((e) => f.includes(e))).length;
  const expensiveRatio = planFoods.length ? expensiveHits / planFoods.length : 0;
  const cost = Math.round(100 - Math.min(60, expensiveRatio * 200)); // 30% expensive → 40
  if (expensiveRatio > 0.3) notes.push("Plano com proporção alta de itens caros — pode pesar no orçamento.");

  const breakdown: ViabilityBreakdown = {
    adherence: Math.round(adherence),
    practicality: Math.round(practicality),
    familiarity: Math.round(familiarity),
    complexity: Math.round(complexity),
    cost: Math.round(cost),
  };

  const score = Math.round(
    breakdown.adherence * WEIGHTS.adherence +
    breakdown.practicality * WEIGHTS.practicality +
    breakdown.familiarity * WEIGHTS.familiarity +
    breakdown.complexity * WEIGHTS.complexity +
    breakdown.cost * WEIGHTS.cost,
  );

  return { score, breakdown, notes };
}

export function describeViability(score: number): { level: "ok" | "warn" | "bad"; label: string } {
  if (score >= 75) return { level: "ok", label: `Viabilidade alta (${score}/100)` };
  if (score >= 55) return { level: "warn", label: `Viabilidade moderada (${score}/100) — revisar` };
  return { level: "bad", label: `Viabilidade baixa (${score}/100) — revise antes de enviar` };
}