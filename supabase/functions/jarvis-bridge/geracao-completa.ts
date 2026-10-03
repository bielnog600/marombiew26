/**
 * Geração de dieta do Jarvis com TODOS os campos da entrevista (módulo ADITIVO da ponte).
 *
 * Substitui a chamada de buildDietGenerationRequest dentro de gerar_dieta, usando as
 * mesmas peças do app (_shared/dietGenerationContext.ts) e honrando o que a entrevista
 * do Jarvis já manda e antes era ignorado:
 *   fase (inclui pre_contest) · estrategia_calorica (STRATEGY_PCT) · nivel_atividade
 *   (fator do app) · horario/frequência de treino · hormônios · ajustes (refeed, diet
 *   break, platô, sódio, água...) · restrições/preferências da entrevista ·
 *   alimentos_por_refeicao do questionário · dieta modelo (dieta atual) ·
 *   CICLO DE CARBOIDRATO (LOW/MEDIUM/HIGH por dia, g/kg por tipo, modo variável/fixo),
 *   materializado igual à página DietaIA: weeklyEnergySchedule + carbCyclingEnabled no
 *   diet-agent, e protocols.carb_cycling + weekly_day_targets no rascunho.
 */
import {
  buildCanonicalMacros,
  buildTrainingContext,
  calcAge,
  MEAL_NAMES,
  OBJECTIVE_MAP,
  selectEnergy,
  STRATEGY_PCT,
  type DietStudentContext,
} from "../_shared/dietGenerationContext.ts";
import {
  blocoPrompt,
  calcularCiclo,
  configDoPedido,
  resumoCiclo,
  scheduleDoCiclo,
  sugerirDias,
  treinosDaSemana,
  weeklyDayTargets,
  type Weekday,
} from "./ciclo-carbo-calc.ts";

type Rec = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type Db = any;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const txt = (v: unknown) => String(v ?? "").trim();
const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => txt(x)).filter(Boolean) : txt(v) ? [txt(v)] : [];

/** Rótulos do app (DietaIA). */
export const FASES: Record<string, { label: string; desc: string; strategy: string }> = {
  bulking: { label: "Bulking", desc: "Fase de ganho de massa", strategy: "superavit_leve" },
  cutting: { label: "Cutting", desc: "Fase de definição", strategy: "deficit_moderado" },
  manutencao: { label: "Manutenção", desc: "Manter composição corporal", strategy: "manutencao" },
  recomposicao: {
    label: "Recomposição",
    desc: "Perder gordura e ganhar massa simultaneamente",
    strategy: "manutencao",
  },
  pre_contest: { label: "Pré-Contest", desc: "Preparação para competição", strategy: "deficit_moderado" },
};

const ESTRATEGIAS: Record<string, string> = {
  deficit_leve: "Déficit Leve (-10%)",
  deficit_moderado: "Déficit Moderado (-20%)",
  deficit_agressivo: "Déficit Agressivo (-30%)",
  manutencao: "Manutenção (0%)",
  superavit_leve: "Superávit Leve (+10%)",
  superavit_moderado: "Superávit Moderado (+20%)",
};

/** Nível de atividade do Jarvis → fator do app (ACTIVITY_LEVELS). */
export const FATOR_ATIVIDADE: Record<string, { fator: number; label: string }> = {
  sedentario: { fator: 1.2, label: "Sedentário" },
  super_leve: { fator: 1.3, label: "Super Leve" },
  leve: { fator: 1.375, label: "Leve" },
  moderado: { fator: 1.55, label: "Moderado" },
  ativo: { fator: 1.725, label: "Alto" },
  alto: { fator: 1.725, label: "Alto" },
  muito_ativo: { fator: 1.9, label: "Extremo" },
  extremo: { fator: 1.9, label: "Extremo" },
};

const HORARIOS: Record<string, string> = {
  manha_jejum: "Manhã (jejum)",
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  madrugada: "Madrugada",
};

const ESTILOS: Record<string, string> = {
  flexivel: "Flexível (IIFYM) — Foco nos macros, liberdade de escolha dos alimentos",
  low_carb: "Low Carb — Redução significativa de carboidratos",
  cetogenica: "Cetogênica — Ultra low carb, alto em gorduras",
  mediterranea: "Mediterrânea — Baseada em azeite, peixes, grãos integrais",
  paleolitica: "Paleolítica — Alimentos naturais, sem processados",
  vegetariana: "Vegetariana — Sem carnes, permite ovos/laticínios",
  vegana: "Vegana — Sem alimentos de origem animal",
  convencional: "Convencional — Dieta tradicional balanceada",
};

const AJUSTES: Record<string, string> = {
  calorie_adjust: "Ajuste de Calorias — Aumento ou redução calórica semanal",
  carb_adjust: "Ajuste de Carboidrato — Manipulação de carbs por dia da semana",
  sodium_adjust: "Ajuste de Sódio — Protocolo de manipulação de sódio",
  water_adjust: "Ajuste de Água — Protocolo de ingestão hídrica",
  meal_change: "Mudança de Refeições — Alterar número/distribuição de refeições",
  plato: "Estratégia para Platô — Quebrar estagnação metabólica",
  refeed: "Refeed — Dias de recarga de carboidrato",
  diet_break: "Diet Break — Pausa programada na dieta",
  carb_cycling: "Carb Cycling — Ciclagem de carboidrato (high/medium/low)",
};

const STRUCTURED_CONTRACT_BLOCK = `
=== CONTRATO DE SAÍDA (OBRIGATÓRIO) ===
- Escolha os alimentos SOMENTE entre os IDs do FOOD CATALOG desta requisição.
- Cada item deve conter apenas "foodId" (UUID do catálogo) e "qtyGrams" (> 0).
- NUNCA informe calorias, proteína, carboidrato ou gordura de nenhum item.
- NUNCA informe totais de refeição nem totais do dia: o sistema calcula tudo pela base.
- Respeite a estrutura de refeições, horários, restrições e preferências informadas.
- Não crie substituições textuais fora da base nesta etapa.
`.trim();

const bloco = (titulo: string, corpo?: string | null): string => {
  const c = txt(corpo);
  return c ? `=== ${titulo} ===\n${c}\n` : "";
};

export type BaseDieta = {
  phase: string;
  faseLabel: string;
  faseDesc: string;
  strategy: string;
  strategyLabel: string;
  pct: number;
  fator: number;
  fatorLabel: string;
  fatorOrigem: "entrevista" | "questionario";
  bmr: number;
  tdee: number;
  formula: string;
  kcal: number;
  kcalManual: boolean;
  p: number;
  c: number;
  g: number;
  proteinPerKg: number;
  fatPerKg: number;
  peso: number;
  age: number;
};

/** Meta base (TMB → GET → estratégia → macros canônicos), com os campos da entrevista. */
export function calcularBaseDieta(
  ctx: DietStudentContext,
  body: Rec,
): { ok: true; base: BaseDieta } | { ok: false; erro: string; detalhes?: unknown } {
  const objetivo = txt(body.objetivo).toLowerCase();
  const faseId = txt(body.fase).toLowerCase() || objetivo;
  const fase = FASES[faseId] ?? (OBJECTIVE_MAP[objetivo] ? FASES[OBJECTIVE_MAP[objetivo].phase] : undefined);
  if (!fase) return { ok: false, erro: "objetivo_invalido", detalhes: Object.keys(FASES) };
  const phase = FASES[faseId] ? faseId : OBJECTIVE_MAP[objetivo]!.phase;

  const estrategiaPedida = txt(body.estrategia_calorica).toLowerCase();
  const strategy = STRATEGY_PCT[estrategiaPedida] !== undefined ? estrategiaPedida : fase.strategy;
  const pct = STRATEGY_PCT[strategy] ?? 0;

  const weight = ctx.peso;
  const height = ctx.altura;
  const age = calcAge(ctx.data_nascimento);
  const sexRaw = String(ctx.sexo ?? "").toLowerCase();
  const sex = sexRaw.startsWith("m") ? "male" : sexRaw.startsWith("f") ? "female" : null;
  if (!weight || !height || !age) return { ok: false, erro: "dados_corporais_incompletos" };

  // Fator de atividade: o da entrevista (igual ao seletor do app); sem ele, o
  // mesmo derivado da frequência de treino que a ponte já usava.
  const nivel = FATOR_ATIVIDADE[txt(body.nivel_atividade).toLowerCase()];
  let fator: number;
  let fatorLabel: string;
  let fatorOrigem: "entrevista" | "questionario";
  if (nivel) {
    fator = nivel.fator;
    fatorLabel = nivel.label;
    fatorOrigem = "entrevista";
  } else {
    const freq =
      num(body.frequencia_treino) ?? Number(String(ctx.questionario?.dias_treino ?? "").replace(/\D/g, ""));
    fator = freq >= 6 ? 1.725 : freq >= 4 ? 1.55 : freq >= 3 ? 1.375 : 1.55;
    fatorLabel = String(fator);
    fatorOrigem = "questionario";
  }

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
  const tdee = Math.round(bmr * fator);
  const calculado = Math.round(tdee * (1 + pct / 100));
  const manual = num(body.calorias_alvo);
  const kcal = manual ?? calculado;

  const macros = buildCanonicalMacros({
    calories: kcal,
    weightKg: weight,
    phase,
    strategy,
    proteinG: num(body.proteina_g),
    carbG: num(body.carbo_g),
    fatG: num(body.gordura_g),
  });

  return {
    ok: true,
    base: {
      phase,
      faseLabel: fase.label,
      faseDesc: fase.desc,
      strategy,
      strategyLabel: ESTRATEGIAS[strategy] ?? strategy,
      pct,
      fator,
      fatorLabel,
      fatorOrigem,
      bmr,
      tdee,
      formula: energy.formula,
      kcal,
      kcalManual: manual !== null,
      p: macros.p,
      c: macros.c,
      g: macros.g,
      proteinPerKg: macros.proteinPerKg,
      fatPerKg: macros.fatPerKg,
      peso: weight,
      age,
    },
  };
}

/** Treino ativo em JSON (para sugerir LOW/MEDIUM/HIGH por dia). */
export async function carregarTreinoAtivo(supabase: Db, studentId: string): Promise<unknown> {
  const { data } = await supabase
    .from("ai_plans")
    .select("conteudo_json")
    .eq("student_id", studentId)
    .eq("tipo", "treino")
    .eq("is_draft", false)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.conteudo_json ?? null;
}

/** Dieta modelo: lista de alimentos por refeição de um plano (ativo ou plan_id). */
async function textoDietaModelo(supabase: Db, studentId: string, planId: string | null): Promise<string> {
  let q = supabase.from("ai_plans").select("conteudo_json").eq("tipo", "dieta").eq("student_id", studentId);
  q = planId
    ? q.eq("id", planId)
    : q.eq("is_draft", false).order("published_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const { data } = await q.limit(1);
  const plano = (data?.[0]?.conteudo_json ?? null) as Rec | null;
  const days = Array.isArray(plano?.days) ? (plano!.days as Rec[]) : [];
  if (days.length === 0) return "";
  const porRefeicao = new Map<string, Set<string>>();
  for (const d of days) {
    for (const m of Array.isArray(d.meals) ? (d.meals as Rec[]) : []) {
      const nome = txt(m.name) || "Refeição";
      const set = porRefeicao.get(nome) ?? new Set<string>();
      for (const it of Array.isArray(m.items) ? (m.items as Rec[]) : []) {
        const a = txt(it.name);
        if (a) set.add(a);
      }
      porRefeicao.set(nome, set);
    }
  }
  return [...porRefeicao.entries()].map(([r, s]) => `- ${r}: ${[...s].join(", ")}`).join("\n");
}

export type PedidoMontado = {
  ok: true;
  request: {
    prompt: string;
    dietConfig: Rec;
    canonicalTargets: { kcal: number; p: number; c: number; g: number };
    trainingContext: unknown;
    meta: { phase: string; strategy: string; activityFactor: number; bmr: number; tdee: number; mealCount: number; formula: string };
  };
  base: BaseDieta;
  /** Vai em ai_plans.protocols (junto com extras). */
  protocolos: Rec;
  /** Resumo do ciclo para o Jarvis (null = linear). */
  ciclo: Rec | null;
  /** Meta por weekday para o resumo do rascunho (null = linear). */
  metasPorDia: Partial<Record<Weekday, { kcal: number; p: number; c: number; g: number; type: string }>> | null;
  timeoutMs: number;
  usouModelo: boolean;
};

export async function montarPedidoGeracao(
  supabase: Db,
  ctx: DietStudentContext,
  body: Rec,
  observacoes: string | null,
): Promise<PedidoMontado | { ok: false; erro: string; detalhes?: unknown }> {
  const calc = calcularBaseDieta(ctx, body);
  if (!calc.ok) return calc;
  const b = calc.base;

  const ajustes = lista(body.ajustes);
  const cicloPedido = body.ciclo_carbo && typeof body.ciclo_carbo === "object" ? (body.ciclo_carbo as Rec) : null;
  const cicloAtivo =
    cicloPedido?.ativo !== false &&
    (ajustes.includes("carb_cycling") || cicloPedido !== null || txt(body.estrategia) === "carb_cycle");

  const treinoJson = await carregarTreinoAtivo(supabase, ctx.studentId).catch(() => null);
  const treinos = treinosDaSemana(treinoJson);

  // ---- Ciclo de carboidrato (mesma conta do app) ----
  let ciclo: ReturnType<typeof calcularCiclo> | null = null;
  if (cicloAtivo) {
    const pedido = { ...(cicloPedido ?? {}), dias_altos: body.dias_altos ?? cicloPedido?.dias_altos };
    const cfg = configDoPedido(pedido, sugerirDias(treinos));
    ciclo = calcularCiclo(cfg, b.peso, { kcal: b.kcal, p: b.p, c: b.c, g: b.g });
    if (!ciclo.valido) return { ok: false, erro: "ciclo_carbo_invalido", detalhes: ciclo.erros };
  }

  const mealCount = Math.min(
    Math.max(Number(body.refeicoes ?? ctx.questionario?.num_refeicoes ?? 4) || 4, 3),
    7,
  );
  const mealNames = MEAL_NAMES(mealCount);
  const estiloId = txt(body.estilo ?? ctx.questionario?.estilo_dieta);
  const estilo = ESTILOS[estiloId.toLowerCase()] ?? estiloId;

  const restricoes = [
    ...lista(body.restricoes),
    txt(ctx.questionario?.restricoes_alimentares),
    txt(ctx.restricoes),
  ].filter(Boolean);
  const preferencias = [
    ...lista(body.preferencias),
    lista(body.preferencias).length === 0 ? txt(ctx.questionario?.preferencias_alimentares) : "",
  ].filter(Boolean);

  const horario = HORARIOS[txt(body.horario_treino)] ?? txt(body.horario_treino ?? ctx.questionario?.horario_treino);
  const freq = num(body.frequencia_treino) ?? (txt(ctx.questionario?.dias_treino) || null);
  const hormonios =
    body.usa_hormonios === true ? "Sim" : body.usa_hormonios === false ? "Não (natural)" : "Não informado";

  // Alimentos por refeição do questionário (mesmo texto da DietaIA).
  const apr = body.alimentos_por_refeicao ?? ctx.questionario?.alimentos_por_refeicao ?? null;
  let alimentosPorRefeicao = "";
  if (apr && typeof apr === "object") {
    const entries = Object.entries(apr as Rec).filter(([, v]) => v && txt(v));
    if (entries.length > 0) {
      alimentosPorRefeicao = `${entries.map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")}\nIMPORTANTE: Respeite esses alimentos nas refeições correspondentes.`;
    }
  }

  // Dieta modelo (ex.: ativar ciclo numa dieta que já existe).
  const usarModelo = body.usar_dieta_atual_como_modelo === true || Boolean(txt(body.modelo_plan_id));
  const modelo = usarModelo
    ? await textoDietaModelo(supabase, ctx.studentId, txt(body.modelo_plan_id) || null).catch(() => "")
    : "";

  const metasLinear = [
    `- Origem da meta base: ${b.kcalManual ? "definida pelo treinador" : "cálculo automático do app"}`,
    `- TMB: ${b.bmr} kcal (calculado por ${b.formula})`,
    `- Fator de Atividade: ${b.fator}${b.fatorOrigem === "entrevista" ? ` (${b.fatorLabel})` : ""}`,
    `- GET: ${b.tdee} kcal`,
    `- Estratégia: ${b.strategyLabel} (${b.pct > 0 ? "+" : ""}${b.pct}%)`,
    `- Calorias alvo EXATAS: ${b.kcal} kcal`,
    `- Proteína EXATA: ${b.p}g${num(body.proteina_g) ? "" : ` (${b.proteinPerKg} g/kg de peso corporal)`}`,
    `- Carboidrato EXATO: ${b.c}g`,
    `- Gordura EXATA: ${b.g}g${num(body.gordura_g) ? "" : ` (${b.fatPerKg} g/kg de peso corporal)`}`,
    `⚠️ OBRIGATÓRIO: o total diário DEVE ser ${b.kcal} kcal (±50). Proteína ${b.p}g, Carboidrato ${b.c}g, Gordura ${b.g}g. NÃO recalcule a TMB.`,
    `⚠️ REGRA DE CORREÇÃO: Se faltar caloria para bater a meta, ajuste CARBOIDRATO. NÃO aumente proteína acima de ${b.p}g para completar calorias.`,
    `⚠️ Tolerâncias: kcal ±50, proteína ±10, carboidrato ±15, gordura ±8.`,
  ].join("\n");

  const contextoAluno = [
    `Nome: ${ctx.nome ?? "N/D"}`,
    ctx.sexo ? `Sexo: ${ctx.sexo}` : "",
    `Idade: ${b.age} anos`,
    `Peso: ${b.peso} kg`,
    `Altura: ${ctx.altura} cm`,
    ctx.percentual_gordura ? `% Gordura: ${ctx.percentual_gordura}%` : "",
    ctx.massa_magra ? `Massa magra: ${ctx.massa_magra} kg` : "",
    ctx.objetivo ? `Objetivo do perfil: ${ctx.objetivo}` : "",
    ctx.lesoes ? `Lesões: ${ctx.lesoes}` : "",
    ctx.observacoes ? `Observações do perfil: ${ctx.observacoes}` : "",
    observacoes ? `Observações do treinador: ${observacoes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ajustesTexto = ajustes.map((a) => `- ${AJUSTES[a] ?? a}`).join("\n");

  const prompt = [
    "Monte o plano alimentar escolhendo alimentos do FOOD CATALOG desta requisição.",
    bloco("CONTEXTO DO ALUNO", contextoAluno),
    ciclo
      ? blocoPrompt(ciclo.semana, { tmb: b.bmr, get: b.tdee, base: b.kcal, formula: b.formula }) + "\n"
      : bloco("METAS DETERMINÍSTICAS (DEFINITIVAS — NÃO RECALCULE)", metasLinear),
    bloco(
      "ROTINA DO ALUNO",
      [
        txt(ctx.anamnese?.rotina) ? `- Rotina diária: ${txt(ctx.anamnese?.rotina)}` : "",
        `- Horário de treino: ${horario || "Não informado"}`,
        `- Dias de treino: ${freq ? `${freq}x/semana` : "Não informado"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    bloco(
      "ESTILO DE DIETA",
      estilo
        ? `- Estilo: ${estilo}\nIMPORTANTE: Siga o estilo selecionado sem quebrar os macros obrigatórios. Se Low Carb/Cetogênica conflitar com a meta de carboidrato calculada, a meta calculada vence. Se Vegetariana/Vegana, respeite as restrições proteicas sem aumentar a proteína total.`
        : "",
    ),
    bloco(
      "FASE ATUAL",
      `- Fase: ${b.faseLabel} — ${b.faseDesc}\n- Uso de hormônios: ${hormonios}`,
    ),
    bloco("ESTRATÉGIA", `${b.strategyLabel}${ciclo ? " + Carb Cycling (LOW/MEDIUM/HIGH por dia)" : ""}`),
    bloco(
      "REFEIÇÕES (NOME E HORÁRIO)",
      [`Número de refeições: ${mealCount} por dia`, `Nomes das refeições (use exatamente): ${mealNames.join(", ")}`].join("\n"),
    ),
    bloco("ALIMENTOS POR REFEIÇÃO (informados pelo aluno na ficha)", alimentosPorRefeicao),
    bloco("RESTRIÇÕES OBRIGATÓRIAS", restricoes.join("; ")),
    bloco("PREFERÊNCIAS", preferencias.join("; ")),
    modelo
      ? bloco(
          "DIETA MODELO",
          `${modelo}\nIMPORTANTE: A dieta modelo serve APENAS como fonte da LISTA DE ALIMENTOS por refeição. IGNORE completamente as calorias e macros da dieta modelo. ${
            ciclo
              ? "Use as metas específicas de cada dia definidas no bloco METAS DIÁRIAS OBRIGATÓRIAS — não existe meta única para todos os dias."
              : `A meta do aluno é ${b.kcal} kcal, P=${b.p}g, C=${b.c}g, G=${b.g}g e SEMPRE prevalece.`
          }`,
        )
      : "",
    bloco("AJUSTES DE PROTOCOLO", ajustesTexto),
    bloco("EXTRAS", observacoes ?? ""),
    STRUCTURED_CONTRACT_BLOCK,
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const snapshot = {
    bmr: b.bmr,
    tdee: b.tdee,
    activity_factor: b.fator,
    formula: b.formula,
    strategy: b.strategy,
    strategy_pct: b.pct,
    source: "jarvis",
  };
  const schedule = ciclo ? scheduleDoCiclo(b.kcal, ciclo.semana, treinos, snapshot) : null;

  const dietConfig: Rec = {
    objective: b.phase,
    strategy: b.strategy,
    style: estiloId || undefined,
    carbCyclingEnabled: Boolean(ciclo),
    requestedStrategy: ciclo ? "carb_cycle" : "linear",
    ...(schedule ? { weeklyEnergySchedule: schedule } : {}),
  };

  const trainingContext = buildTrainingContext(ctx.trainingMarkdown, horario || null);

  const protocolos: Rec = ciclo
    ? {
        carb_cycling: JSON.parse(JSON.stringify(ciclo.config)),
        weekly_day_targets: weeklyDayTargets(ciclo.semana),
        weekly_energy_schedule: schedule,
      }
    : {};

  return {
    ok: true,
    request: {
      prompt,
      dietConfig,
      canonicalTargets: { kcal: b.kcal, p: b.p, c: b.c, g: b.g },
      trainingContext,
      meta: {
        phase: b.phase,
        strategy: b.strategy,
        activityFactor: b.fator,
        bmr: b.bmr,
        tdee: b.tdee,
        mealCount,
        formula: b.formula,
      },
    },
    base: b,
    protocolos,
    ciclo: ciclo ? resumoCiclo(ciclo, b.peso) : null,
    metasPorDia: ciclo ? (ciclo.semana as PedidoMontado["metasPorDia"]) : null,
    // 7 cardápios levam mais tempo no diet-agent.
    timeoutMs: ciclo ? 145_000 : 120_000,
    usouModelo: Boolean(modelo),
  };
}
