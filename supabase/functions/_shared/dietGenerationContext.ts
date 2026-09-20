/**
 * dietGenerationContext — montagem do contexto de geração de dieta no servidor.
 *
 * ATENÇÃO (duplicação consciente e mínima):
 * A página `src/pages/DietaIA.tsx` monta esse contexto dentro de hooks React
 * (useState/useMemo/useEffect), com dezenas de campos de wizard. Extrair aquele
 * código para cá exigiria reescrever a página inteira — risco alto e fora do
 * escopo pedido. Por isso este módulo REIMPLEMENTA apenas o núcleo determinístico:
 *   - seleção de fórmula energética (espelha src/lib/energyFormula.ts);
 *   - fator de atividade / estratégia (espelha as constantes da DietaIA);
 *   - preset canônico de macros (espelha buildInitialMacroPreset + resolveMacroConfig
 *     com proteína e gordura travadas e carboidrato como macro de fechamento);
 *   - prompt structured (usa o mesmo contrato de STRUCTURED_CONTRACT_BLOCK).
 * Nenhum arquivo do app foi alterado.
 */

export type Rec = Record<string, unknown>;

export const ACTIVITY_FACTORS = [1.2, 1.3, 1.375, 1.55, 1.725, 1.9];

export const STRATEGY_PCT: Record<string, number> = {
  deficit_leve: -10,
  deficit_moderado: -20,
  deficit_agressivo: -30,
  manutencao: 0,
  superavit_leve: 10,
  superavit_moderado: 20,
};

/** Objetivo do Jarvis → fase + estratégia do app. */
export const OBJECTIVE_MAP: Record<string, { phase: string; strategy: string; label: string }> = {
  cutting: { phase: "cutting", strategy: "deficit_moderado", label: "Cutting — fase de definição" },
  bulking: { phase: "bulking", strategy: "superavit_leve", label: "Bulking — fase de ganho de massa" },
  manutencao: { phase: "manutencao", strategy: "manutencao", label: "Manutenção — manter composição corporal" },
  recomposicao: { phase: "recomposicao", strategy: "manutencao", label: "Recomposição — perder gordura e ganhar massa" },
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const calcAge = (birth: unknown): number | null => {
  if (!birth) return null;
  const d = new Date(String(birth));
  if (Number.isNaN(d.getTime())) return null;
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return years > 0 && years < 120 ? Math.floor(years) : null;
};

/* ---------------------------------------------------------------- */
/* Fórmulas energéticas (espelham src/lib/energyFormula.ts)          */
/* ---------------------------------------------------------------- */

export const mifflinStJeor = (sex: "male" | "female" | null, w: number, h: number, a: number) =>
  sex === "female" ? 10 * w + 6.25 * h - 5 * a - 161 : 10 * w + 6.25 * h - 5 * a + 5;

export const cunningham = (leanKg: number) => 500 + 22 * leanKg;

const isLeanMassUsable = (lean: number | null, weight: number | null) =>
  lean != null && weight != null && lean > 0 && weight > 0 && lean < weight && lean / weight >= 0.3;

export interface EnergySelection {
  formula: string;
  bmr: number;
  insufficientData: boolean;
}

export function selectEnergy(input: {
  sex: "male" | "female" | null;
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  leanMassKg: number | null;
  leanMassAt: string | null;
}): EnergySelection {
  const { sex, weightKg, heightCm, ageYears, leanMassKg } = input;
  const leanUsable = isLeanMassUsable(leanMassKg, weightKg);
  let stale = false;
  if (leanUsable && input.leanMassAt) {
    const d = new Date(input.leanMassAt);
    if (!Number.isNaN(d.getTime())) {
      stale = Math.abs(Date.now() - d.getTime()) / (1000 * 3600 * 24) > 120;
    }
  }
  const canMifflin = sex !== null && weightKg != null && heightCm != null && ageYears != null;
  const mifflin = canMifflin ? Math.round(mifflinStJeor(sex, weightKg!, heightCm!, ageYears!)) : null;

  if (leanUsable && stale && mifflin != null) {
    return { formula: "Mifflin-St Jeor", bmr: mifflin, insufficientData: false };
  }
  if (leanUsable) {
    return { formula: "Cunningham (massa magra)", bmr: Math.round(cunningham(leanMassKg!)), insufficientData: false };
  }
  if (mifflin == null) return { formula: "Mifflin-St Jeor", bmr: 0, insufficientData: true };
  return { formula: "Mifflin-St Jeor", bmr: mifflin, insufficientData: false };
}

/* ---------------------------------------------------------------- */
/* Macros canônicos (proteína e gordura travadas, carbo fecha)       */
/* ---------------------------------------------------------------- */

export function buildCanonicalMacros(opts: {
  calories: number;
  weightKg: number;
  phase: string;
  strategy: string;
  proteinG?: number | null;
  carbG?: number | null;
  fatG?: number | null;
}) {
  const isDeficit =
    opts.strategy.includes("deficit") || opts.phase === "cutting" || opts.phase === "pre_contest";
  const isMaintenance = (opts.phase === "manutencao" || opts.strategy === "manutencao") && !isDeficit;
  const proteinPerKg = isDeficit ? 2.2 : isMaintenance ? 1.8 : 2.0;
  const fatPerKg = isDeficit ? 0.8 : 0.9;

  const p = num(opts.proteinG) ?? Math.round(proteinPerKg * opts.weightKg);
  const g = num(opts.fatG) ?? Math.round(fatPerKg * opts.weightKg);
  const c = num(opts.carbG) ?? Math.max(Math.round((opts.calories - p * 4 - g * 9) / 4), 0);
  return { p, c, g, proteinPerKg, fatPerKg };
}

/* ---------------------------------------------------------------- */
/* Carga de dados do aluno                                           */
/* ---------------------------------------------------------------- */

export interface DietStudentContext {
  studentId: string;
  nome: string | null;
  sexo: string | null;
  data_nascimento: string | null;
  objetivo: string | null;
  restricoes: string | null;
  lesoes: string | null;
  observacoes: string | null;
  peso: number | null;
  altura: number | null;
  imc: number | null;
  percentual_gordura: number | null;
  massa_magra: number | null;
  massa_gorda: number | null;
  peso_fonte: string | null;
  peso_em: string | null;
  data_avaliacao: string | null;
  avaliacao_fonte: string | null;
  avaliacao_id: string | null;
  dias_desde_avaliacao: number | null;
  avaliacao_recente: boolean;
  desvios_posturais: string[];
  dores: string | null;
  questionario: Rec | null;
  questionario_em: string | null;
  anamnese: Rec | null;
  trainingMarkdown: string | null;
  activePlan: { id: string; version: number } | null;

}

export async function loadDietStudentContext(
  supabase: any,
  studentId: string,
): Promise<DietStudentContext> {
  const [profileRes, spRes, avaliacao, questRes, trainRes, dietRes] = await Promise.all([
    supabase.from("profiles").select("nome").eq("user_id", studentId).maybeSingle(),
    supabase.from("students_profile").select("*").eq("user_id", studentId).maybeSingle(),
    resolveLatestAssessment(supabase, studentId),
    supabase.from("diet_questionnaires").select("*").eq("student_id", studentId)
      .eq("status", "completed").order("created_at", { ascending: false }).limit(1),
    supabase.from("ai_plans").select("conteudo").eq("student_id", studentId).eq("tipo", "treino")
      .eq("is_draft", false).order("created_at", { ascending: false }).limit(1),
    supabase.from("ai_plans").select("id, version").eq("student_id", studentId).eq("tipo", "dieta")
      .eq("is_draft", false).order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).limit(1),
  ]);

  const sp = (spRes.data ?? {}) as Rec;
  const assessmentId = avaliacao.assessment_id;
  const quest = (questRes.data?.[0] ?? null) as Rec | null;

  let anthro: Rec | null = null;
  let comp: Rec | null = null;
  let anamnese: Rec | null = null;
  if (assessmentId) {
    const [a, c, an] = await Promise.all([
      supabase.from("anthropometrics").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("composition").select("*").eq("assessment_id", assessmentId).maybeSingle(),
      supabase.from("anamnese").select("*").eq("assessment_id", assessmentId).maybeSingle(),
    ]);
    anthro = a.data ?? null;
    comp = c.data ?? null;
    anamnese = an.data ?? null;
  }

  // Peso: mais recente entre weight_logs, avaliação, check-in e reajuste.
  const pesoRes = await resolveLatestWeight(supabase, studentId, {
    assessmentId,
    assessmentDate: avaliacao.data_avaliacao,
  });

  const activePlanRow = dietRes.data?.[0] ?? null;

  return {
    studentId,
    nome: (profileRes.data?.nome as string) ?? null,
    sexo: (sp.sexo as string) ?? null,
    data_nascimento: (sp.data_nascimento as string) ?? null,
    objetivo: (sp.objetivo as string) ?? null,
    restricoes: (sp.restricoes as string) ?? null,
    lesoes: (sp.lesoes as string) ?? null,
    observacoes: (sp.observacoes as string) ?? null,
    peso: pesoRes.peso,
    peso_fonte: pesoRes.peso_fonte,
    peso_em: pesoRes.peso_em,
    altura: num(sp.altura) ?? num(anthro?.altura),
    imc: num(anthro?.imc),
    percentual_gordura: num(comp?.percentual_gordura),
    massa_magra: num(comp?.massa_magra),
    massa_gorda: num(comp?.massa_gorda),
    data_avaliacao: avaliacao.data_avaliacao,
    avaliacao_fonte: avaliacao.avaliacao_fonte,
    avaliacao_id: avaliacao.avaliacao_id,
    dias_desde_avaliacao: avaliacao.dias_desde_avaliacao,
    avaliacao_recente: avaliacao.recente,
    desvios_posturais: derivePosturalDeviations(avaliacao.postureScan),
    dores: (anamnese?.dores as string) ?? null,
    questionario: quest,
    questionario_em: (quest?.responded_at as string) ?? (quest?.created_at as string) ?? null,
    anamnese,
    trainingMarkdown: (trainRes.data?.[0]?.conteudo as string) ?? null,
    activePlan: activePlanRow
      ? { id: String(activePlanRow.id), version: Number(activePlanRow.version ?? 1) }
      : null,
  };
}

/**
 * Pré-checagem. Bloqueia só por falta de peso (todas as fontes), falta de
 * avaliação (manual, postural IA ou composição IA) ou questionário/altura.
 * Avaliação com mais de 90 dias vira aviso.
 */
export function checkDietDataReadiness(ctx: DietStudentContext, _now = new Date()) {
  const faltando: string[] = [];
  const avisos: string[] = [];
  if (!ctx.data_avaliacao) faltando.push("avaliacao_fisica");
  else if (!ctx.avaliacao_recente) {
    avisos.push(`avaliação de ${ctx.data_avaliacao}, mais de 90 dias`);
  }
  if (!ctx.questionario) faltando.push("questionario");
  if (!ctx.peso) faltando.push("peso");
  if (!ctx.altura) faltando.push("altura");
  return { ok: faltando.length === 0, faltando, avisos };
}


/* ---------------------------------------------------------------- */
/* trainingContext mínimo (dias de treino a partir do markdown)      */
/* ---------------------------------------------------------------- */

const WEEKDAY_PATTERNS: Array<[string, RegExp]> = [
  ["seg", /\bseg(?:unda)?\b/i],
  ["ter", /\bter(?:ça|ca)?\b/i],
  ["qua", /\bqua(?:rta)?\b/i],
  ["qui", /\bqui(?:nta)?\b/i],
  ["sex", /\bsex(?:ta)?\b/i],
  ["sab", /\bs[áa]b(?:ado)?\b/i],
  ["dom", /\bdom(?:ingo)?\b/i],
];

export function buildTrainingContext(markdown: string | null, trainingTime: string | null) {
  if (!markdown) return undefined;
  const daysOfWeek: Record<string, Rec> = {};
  for (const line of markdown.split("\n")) {
    const header = line.match(/^#{1,4}\s*(.+)$/);
    const label = header ? header[1] : /^\s*\|\s*([^|]+)\|/.test(line) ? "" : "";
    if (!label) continue;
    for (const [wd, re] of WEEKDAY_PATTERNS) {
      if (re.test(label) && !daysOfWeek[wd]) {
        daysOfWeek[wd] = { type: /(off|descanso|folga|rest)/i.test(label) ? "rest" : "mixed", label: label.trim() };
      }
    }
  }
  const sessions = Object.values(daysOfWeek).filter((d) => d.type !== "rest").length;
  if (sessions === 0) return undefined;
  return {
    summary: `Treino ativo com ${sessions} sessão(ões) por semana.`,
    weeklySessions: sessions,
    defaultTime: trainingTime,
    daysOfWeek,
  };
}

/* ---------------------------------------------------------------- */
/* Prompt structured                                                 */
/* ---------------------------------------------------------------- */

const STRUCTURED_CONTRACT_BLOCK = `
=== CONTRATO DE SAÍDA (OBRIGATÓRIO) ===
- Escolha os alimentos SOMENTE entre os IDs do FOOD CATALOG desta requisição.
- Cada item deve conter apenas "foodId" (UUID do catálogo) e "qtyGrams" (> 0).
- NUNCA informe calorias, proteína, carboidrato ou gordura de nenhum item.
- NUNCA informe totais de refeição nem totais do dia: o sistema calcula tudo pela base.
- Respeite a estrutura de refeições, horários, restrições e preferências informadas.
- Não crie substituições textuais fora da base nesta etapa.
`.trim();

const block = (title: string, body?: string | null): string => {
  const content = String(body ?? "").trim();
  return content ? `=== ${title} ===\n${content}\n` : "";
};

export const MEAL_NAMES = (count: number): string[] => {
  const base = ["Café da Manhã", "Almoço", "Lanche da Tarde", "Jantar"];
  if (count <= 4) return base.slice(0, count);
  const extra = ["Pós-Treino", "Ceia", "Lanche da Manhã"];
  return [...base, ...extra.slice(0, count - 4)];
};

export interface DietGenerationOverrides {
  objetivo?: string;
  calorias_alvo?: number | null;
  proteina_g?: number | null;
  carbo_g?: number | null;
  gordura_g?: number | null;
  refeicoes?: number | null;
  estrategia?: "linear" | "carb_cycle" | null;
  estilo?: string | null;
  observacoes?: string | null;
}

export interface DietGenerationRequest {
  prompt: string;
  dietConfig: Rec;
  canonicalTargets: { kcal: number; p: number; c: number; g: number };
  trainingContext: unknown;
  meta: {
    phase: string;
    strategy: string;
    activityFactor: number;
    bmr: number;
    tdee: number;
    mealCount: number;
    formula: string;
  };
}

/** Monta a requisição do diet-agent com os overrides do Jarvis por cima do cálculo do app. */
export function buildDietGenerationRequest(
  ctx: DietStudentContext,
  overrides: DietGenerationOverrides,
): { ok: true; request: DietGenerationRequest } | { ok: false; erro: string; detalhes?: unknown } {
  const objetivo = String(overrides.objetivo ?? "").trim().toLowerCase();
  const mapped = OBJECTIVE_MAP[objetivo];
  if (!mapped) return { ok: false, erro: "objetivo_invalido", detalhes: Object.keys(OBJECTIVE_MAP) };

  const weight = ctx.peso;
  const height = ctx.altura;
  const age = calcAge(ctx.data_nascimento);
  const sexRaw = String(ctx.sexo ?? "").toLowerCase();
  const sex = sexRaw.startsWith("m") ? "male" : sexRaw.startsWith("f") ? "female" : null;
  if (!weight || !height || !age) return { ok: false, erro: "dados_corporais_incompletos" };

  // Fator de atividade: o app pede escolha manual; sem treinador na frente,
  // derivamos da frequência de treino do questionário (padrão Moderado 1.55).
  const diasTreino = String(ctx.questionario?.dias_treino ?? "").replace(/\D/g, "");
  const freq = Number(diasTreino);
  const activityFactor = freq >= 6 ? 1.725 : freq >= 4 ? 1.55 : freq >= 3 ? 1.375 : 1.55;

  const energy = selectEnergy({
    sex,
    weightKg: weight,
    heightCm: height,
    ageYears: age,
    leanMassKg: ctx.massa_magra,
    leanMassAt: ctx.data_avaliacao,
  });
  if (energy.insufficientData) return { ok: false, erro: "dados_insuficientes_para_formula" };

  const bmr = Math.round(energy.bmr);
  const tdee = Math.round(bmr * activityFactor);
  const pct = STRATEGY_PCT[mapped.strategy] ?? 0;
  const calculated = Math.round(tdee * (1 + pct / 100));
  const kcal = num(overrides.calorias_alvo) ?? calculated;

  const macros = buildCanonicalMacros({
    calories: kcal,
    weightKg: weight,
    phase: mapped.phase,
    strategy: mapped.strategy,
    proteinG: overrides.proteina_g ?? null,
    carbG: overrides.carbo_g ?? null,
    fatG: overrides.gordura_g ?? null,
  });

  const mealCount = Math.min(Math.max(Number(overrides.refeicoes ?? ctx.questionario?.num_refeicoes ?? 4) || 4, 3), 7);
  const mealNames = MEAL_NAMES(mealCount);
  const estilo = String(overrides.estilo ?? ctx.questionario?.estilo_dieta ?? "").trim();

  const restricoes = [ctx.questionario?.restricoes_alimentares, ctx.restricoes]
    .map((v) => String(v ?? "").trim()).filter(Boolean).join("; ");
  const preferencias = String(ctx.questionario?.preferencias_alimentares ?? "").trim();

  const targetsBlock = [
    "- Origem da meta base: cálculo automático do app",
    `- TMB: ${bmr} kcal (${energy.formula})`,
    `- Fator de Atividade: ${activityFactor}`,
    `- GET: ${tdee} kcal`,
    `- Estratégia: ${mapped.label} (${pct > 0 ? "+" : ""}${pct}%)`,
    `- Calorias alvo EXATAS: ${kcal} kcal`,
    `- Proteína EXATA: ${macros.p}g`,
    `- Carboidrato EXATO: ${macros.c}g`,
    `- Gordura EXATA: ${macros.g}g`,
    `⚠️ Tolerâncias: kcal ±50, proteína ±10, carboidrato ±15, gordura ±8.`,
    overrides.calorias_alvo ? "⚠️ Meta calórica definida manualmente pelo treinador." : "",
  ].filter(Boolean).join("\n");

  const studentContextBlock = [
    `Nome: ${ctx.nome ?? "N/D"}`,
    ctx.sexo ? `Sexo: ${ctx.sexo}` : "",
    age ? `Idade: ${age} anos` : "",
    `Peso: ${weight} kg`,
    `Altura: ${height} cm`,
    ctx.percentual_gordura ? `% Gordura: ${ctx.percentual_gordura}%` : "",
    ctx.massa_magra ? `Massa magra: ${ctx.massa_magra} kg` : "",
    ctx.objetivo ? `Objetivo do perfil: ${ctx.objetivo}` : "",
    ctx.lesoes ? `Lesões: ${ctx.lesoes}` : "",
    ctx.observacoes ? `Observações do perfil: ${ctx.observacoes}` : "",
    overrides.observacoes ? `Observações do treinador: ${overrides.observacoes}` : "",
  ].filter(Boolean).join("\n");

  const prompt = [
    "Monte o plano alimentar escolhendo alimentos do FOOD CATALOG desta requisição.",
    block("CONTEXTO DO ALUNO", studentContextBlock),
    block("ROTINA DO ALUNO", String(ctx.anamnese?.rotina ?? "").trim()),
    block("TREINO", ctx.questionario?.dias_treino ? `${ctx.questionario.dias_treino} por semana` : ""),
    block("FASE ATUAL", mapped.label),
    block("ESTRATÉGIA", `${mapped.strategy} (${pct > 0 ? "+" : ""}${pct}%)`),
    block("ESTILO DE DIETA", estilo),
    block("REFEIÇÕES (NOME E HORÁRIO)", [
      `Número de refeições: ${mealCount} por dia`,
      `Nomes das refeições (use exatamente): ${mealNames.join(", ")}`,
    ].join("\n")),
    block("RESTRIÇÕES OBRIGATÓRIAS", restricoes),
    block("PREFERÊNCIAS", preferencias),
    block("METAS DETERMINÍSTICAS (DEFINITIVAS — NÃO RECALCULE)", targetsBlock),
    block("EXTRAS", overrides.observacoes ?? ""),
    STRUCTURED_CONTRACT_BLOCK,
  ].filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const carbCycle = overrides.estrategia === "carb_cycle";

  return {
    ok: true,
    request: {
      prompt,
      canonicalTargets: { kcal, p: macros.p, c: macros.c, g: macros.g },
      trainingContext: buildTrainingContext(
        ctx.trainingMarkdown,
        (ctx.questionario?.horario_treino as string) ?? null,
      ),
      dietConfig: {
        objective: mapped.phase,
        strategy: mapped.strategy,
        style: estilo || undefined,
        // Ciclagem só é materializada pelo editor do app; o Jarvis gera linear
        // e a ciclagem fica como pedido explícito registrado no rascunho.
        carbCyclingEnabled: false,
        requestedStrategy: carbCycle ? "carb_cycle" : "linear",
      },
      meta: {
        phase: mapped.phase,
        strategy: mapped.strategy,
        activityFactor,
        bmr,
        tdee,
        mealCount,
        formula: energy.formula,
      },
    },
  };
}
