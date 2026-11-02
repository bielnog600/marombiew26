// @ts-nocheck
// ARQUIVO GERADO — não editar. Fonte: src/lib/officeWizard/serverEntry.ts
// Regerar com: bun scripts/build-office-core.mjs
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/splitSlugs.ts
var LEGACY_MAP = {
  fullbody: "full_body",
  full_body: "full_body",
  abcde: "body_part",
  body_part: "body_part",
  decida: "ai_decides",
  ai_decides: "ai_decides",
  upper_lower: "upper_lower",
  push_pull_legs: "push_pull_legs",
  push_pull: "push_pull",
  upper_lower_ppl: "upper_lower_ppl",
  torso_limbs: "torso_limbs",
  specialization: "specialization",
  custom: "custom"
};
function normalizeSplitSlug(value) {
  if (!value || typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return LEGACY_MAP[key] ?? null;
}

// supabase/functions/_shared/periodization.ts
var SELECTABLE_MODELS = [
  "linear",
  "ondulatoria",
  "blocos",
  "concorrente"
];
var MODEL_LABELS = {
  automatica: "Autom\xE1tica \u2014 o sistema decide",
  linear: "Linear",
  ondulatoria: "Ondulat\xF3ria",
  blocos: "Por blocos",
  concorrente: "Concorrente",
  linear_reversa: "Linear reversa",
  trifasica: "Trif\xE1sica",
  legacy: "Padr\xE3o (plano anterior)"
};
var WEEK_PHASES = ["semana_1", "semana_2", "semana_3", "deload"];
var phaseToWeekNumber = (phase) => Math.max(1, WEEK_PHASES.indexOf(phase) + 1);
var weekNumberToPhase = (week) => WEEK_PHASES[Math.min(Math.max(Math.trunc(week), 1), 4) - 1];
var normalizeLevel = (level) => {
  const v = String(level || "").toLowerCase();
  if (v.startsWith("avanc")) return "avancado";
  if (v.startsWith("interm")) return "intermediario";
  return "iniciante";
};
var assessDataSufficiency = (ctx) => {
  let score = 0;
  if (ctx.level) score++;
  if (ctx.daysPerWeek) score++;
  if (ctx.objective) score++;
  if (typeof ctx.adherencePct === "number") score++;
  if (typeof ctx.completedPlans === "number" && (ctx.completedPlans ?? 0) > 0) score++;
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
};
var selectPeriodizationModel = (ctx, selection = "automatica") => {
  const dataSufficiency = assessDataSufficiency(ctx);
  if (selection !== "automatica") {
    return {
      model: selection,
      reason: `Modelo definido manualmente pelo professor: ${MODEL_LABELS[selection]}.`,
      eligible: [selection],
      manual: true,
      dataSufficiency
    };
  }
  const level = normalizeLevel(ctx.level);
  const days = ctx.daysPerWeek ?? 0;
  const stimuli = ctx.weeklyStimuliPerMuscle ?? (days >= 4 ? 2 : 1);
  const adherence = ctx.adherencePct ?? null;
  const history = ctx.completedPlans ?? 0;
  const eligible = ["linear"];
  const concurrent = !!ctx.cardioIsProgrammatic && !ctx.cardioIsComplementary;
  if (concurrent) eligible.push("concorrente");
  const undulating = level !== "iniciante" && stimuli >= 2 && days >= 4 && (adherence === null ? history >= 1 : adherence >= 70);
  if (undulating) eligible.push("ondulatoria");
  const blocks = level !== "iniciante" && history >= 2 && dataSufficiency !== "low";
  if (blocks) eligible.push("blocos");
  if (dataSufficiency === "low") {
    return {
      model: "linear",
      reason: "Informa\xE7\xE3o insuficiente sobre hist\xF3rico e ades\xE3o \u2014 fallback conservador para Linear.",
      eligible,
      manual: false,
      dataSufficiency
    };
  }
  if (concurrent) {
    return {
      model: "concorrente",
      reason: `Segunda capacidade com relev\xE2ncia program\xE1tica (${ctx.secondaryCapacity || "condicionamento"}) exige coordena\xE7\xE3o de est\xEDmulos.`,
      eligible,
      manual: false,
      dataSufficiency
    };
  }
  if (blocks && ctx.priorityFocus) {
    return {
      model: "blocos",
      reason: `Hist\xF3rico consistente (${history} ciclos) e prioridade clara (${ctx.priorityFocus}) justificam fases distintas.`,
      eligible,
      manual: false,
      dataSufficiency
    };
  }
  if (undulating) {
    return {
      model: "ondulatoria",
      reason: `N\xEDvel ${level} com ${stimuli} est\xEDmulos semanais por grupo e boa ades\xE3o \u2014 sess\xF5es diferenciadas rendem mais.`,
      eligible,
      manual: false,
      dataSufficiency
    };
  }
  if (blocks) {
    return {
      model: "blocos",
      reason: `Hist\xF3rico de ${history} ciclos permite organizar acumula\xE7\xE3o e intensifica\xE7\xE3o em blocos.`,
      eligible,
      manual: false,
      dataSufficiency
    };
  }
  return {
    model: "linear",
    reason: level === "iniciante" ? "Aluno iniciante com objetivo \xFAnico \u2014 progress\xE3o linear \xE9 a mais eficiente e segura." : "Perfil sem necessidade real de modelo complexo \u2014 Linear \xE9 suficiente.",
    eligible,
    manual: false,
    dataSufficiency
  };
};
var blockSequenceFor = (model, hasPriorityFocus) => {
  if (model !== "blocos") return ["acumulacao"];
  return hasPriorityFocus ? ["acumulacao", "intensificacao", "especializacao", "transicao"] : ["acumulacao", "intensificacao", "transicao"];
};
var resolveBlockPlan = (model, blockNumber, hasPriorityFocus) => {
  const seq = blockSequenceFor(model, hasPriorityFocus);
  const total = seq.length;
  const idx = Math.min(Math.max(blockNumber, 1), total) - 1;
  return {
    blockType: seq[idx],
    blockNumber: idx + 1,
    blockTotal: total,
    nextBlockType: seq[(idx + 1) % total],
    macrocycleWeeks: total * 4
  };
};
var DELOAD_STRATEGY = (phase, weekNumber, note) => ({
  weekNumber,
  phase,
  label: "Deload \u2014 recupera\xE7\xE3o",
  volumeTarget: "baixo",
  intensityTarget: "baixa",
  effortTarget: "4-5",
  repStrategy: "8-12 confort\xE1veis, longe da falha",
  progressionPreference: "manter",
  blockAggressiveProgression: true,
  sessionProfiles: [],
  notes: note
});
var undulatingProfiles = (daysPerWeek, intensify) => {
  const cycle = ["tensao", "hipertrofia", "volume"];
  const out = [];
  const days = Math.max(1, daysPerWeek || 3);
  for (let i = 0; i < days; i++) {
    const p = cycle[i % cycle.length];
    out.push({
      sessionIndex: i,
      profile: p,
      repRange: p === "tensao" ? "5-8" : p === "hipertrofia" ? "8-12" : "12-18",
      rir: p === "tensao" ? intensify ? "1-2" : "2-3" : p === "hipertrofia" ? intensify ? "1-2" : "2" : "1-2"
    });
  }
  return out;
};
var resolveWeekStrategy = (input) => {
  const { model, blockType, phase } = input;
  const weekNumber = phaseToWeekNumber(phase);
  const days = input.daysPerWeek ?? 3;
  if (phase === "deload" || blockType === "transicao") {
    return DELOAD_STRATEGY(
      phase,
      weekNumber,
      "Reduzir volume e intensidade. Nenhuma t\xE9cnica avan\xE7ada. Nenhum aumento de carga."
    );
  }
  if (model === "ondulatoria") {
    const intensify = weekNumber >= 2;
    return {
      weekNumber,
      phase,
      label: weekNumber === 1 ? "Calibra\xE7\xE3o ondulat\xF3ria" : weekNumber === 2 ? "Ondula\xE7\xE3o com progress\xE3o" : "Ondula\xE7\xE3o em pico",
      volumeTarget: weekNumber === 3 ? "alto" : "moderado_alto",
      intensityTarget: weekNumber === 1 ? "moderada" : weekNumber === 2 ? "moderada_alta" : "alta",
      effortTarget: weekNumber === 1 ? "2-3" : weekNumber === 2 ? "1-2" : "1",
      repStrategy: "Faixas distintas por sess\xE3o (tens\xE3o 5-8 / hipertrofia 8-12 / volume 12-18)",
      progressionPreference: weekNumber >= 3 ? "carga" : "reps_volume",
      blockAggressiveProgression: false,
      sessionProfiles: undulatingProfiles(days, intensify),
      notes: "Cada sess\xE3o da semana deve ter perfil funcional pr\xF3prio (tens\xE3o, hipertrofia moderada, volume). N\xE3o basta mudar a faixa de reps: sele\xE7\xE3o de exerc\xEDcios, pausas e RIR devem acompanhar o perfil."
    };
  }
  if (model === "blocos" && blockType === "intensificacao") {
    return {
      weekNumber,
      phase,
      label: weekNumber === 1 ? "Entrada na intensifica\xE7\xE3o" : weekNumber === 2 ? "Progress\xE3o de carga" : "Pico de intensidade",
      volumeTarget: weekNumber === 3 ? "moderado" : "moderado_alto",
      intensityTarget: weekNumber === 1 ? "moderada_alta" : "alta",
      effortTarget: weekNumber === 1 ? "2" : weekNumber === 2 ? "1-2" : "0-1",
      repStrategy: "Principais 5-8, acess\xF3rios 8-12",
      progressionPreference: "carga",
      blockAggressiveProgression: false,
      sessionProfiles: [],
      notes: "Bloco de intensifica\xE7\xE3o: prioridade em carga nos exerc\xEDcios \xE2ncora, volume acess\xF3rio contido."
    };
  }
  if (model === "blocos" && blockType === "especializacao") {
    return {
      weekNumber,
      phase,
      label: `Especializa\xE7\xE3o \u2014 semana ${weekNumber}`,
      volumeTarget: weekNumber === 3 ? "alto" : "moderado_alto",
      intensityTarget: "moderada_alta",
      effortTarget: weekNumber === 1 ? "2-3" : "1-2",
      repStrategy: "Grupo priorit\xE1rio 8-15 com frequ\xEAncia extra; demais em manuten\xE7\xE3o",
      progressionPreference: "reps_volume",
      blockAggressiveProgression: false,
      sessionProfiles: [],
      notes: "Concentrar volume no foco priorit\xE1rio e manter os demais grupos em volume de manuten\xE7\xE3o."
    };
  }
  if (model === "concorrente") {
    return {
      weekNumber,
      phase,
      label: `Concorrente \u2014 semana ${weekNumber}`,
      volumeTarget: weekNumber === 3 ? "moderado_alto" : "moderado",
      intensityTarget: weekNumber === 1 ? "moderada" : "moderada_alta",
      effortTarget: weekNumber === 1 ? "3" : "2",
      repStrategy: "Principais 6-10, acess\xF3rios 10-15",
      progressionPreference: weekNumber >= 2 ? "carga" : "reps_volume",
      blockAggressiveProgression: false,
      sessionProfiles: [],
      notes: "Coordenar com a capacidade secund\xE1ria: evitar dias duros de pernas colados a sess\xF5es-chave de cardio, manter progress\xE3o conservadora."
    };
  }
  const accumulation = model === "blocos" && blockType === "acumulacao";
  return {
    weekNumber,
    phase,
    label: weekNumber === 1 ? accumulation ? "Acumula\xE7\xE3o \u2014 calibra\xE7\xE3o" : "Base t\xE9cnica" : weekNumber === 2 ? accumulation ? "Acumula\xE7\xE3o \u2014 progress\xE3o de volume" : "Progress\xE3o" : accumulation ? "Acumula\xE7\xE3o \u2014 maior est\xEDmulo" : "Overload",
    volumeTarget: weekNumber === 1 ? "moderado" : weekNumber === 2 ? "moderado_alto" : "alto",
    intensityTarget: weekNumber === 1 ? "moderada" : weekNumber === 2 ? "moderada_alta" : "alta",
    effortTarget: weekNumber === 1 ? "3" : weekNumber === 2 ? "2" : "1-2",
    repStrategy: accumulation ? "Principais 8-12, acess\xF3rios 12-15" : "Principais 6-10, acess\xF3rios 10-15",
    progressionPreference: accumulation ? "reps_volume" : weekNumber >= 3 ? "carga" : "reps_volume",
    blockAggressiveProgression: false,
    sessionProfiles: [],
    notes: accumulation ? "Bloco de acumula\xE7\xE3o: progredir prioritariamente em repeti\xE7\xF5es e volume antes de subir carga." : "Progress\xE3o linear: mesma estrutura entre semanas, com aumento gradual de exig\xEAncia."
  };
};
var resolvePeriodization = (input) => {
  const decision = selectPeriodizationModel(input.context, input.selection ?? "automatica");
  const block = resolveBlockPlan(
    decision.model,
    input.blockNumber ?? 1,
    !!input.context.priorityFocus
  );
  const week = resolveWeekStrategy({
    model: decision.model,
    blockType: block.blockType,
    phase: input.phase,
    daysPerWeek: input.context.daysPerWeek ?? null
  });
  return {
    version: 1,
    model: decision.model,
    reason: decision.reason,
    manual: decision.manual,
    dataSufficiency: decision.dataSufficiency,
    block,
    week,
    resolvedAt: (input.now ?? /* @__PURE__ */ new Date()).toISOString()
  };
};
var snapshotToPlanColumns = (snap, blockStartDate) => {
  const start = blockStartDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const end = new Date(start);
  end.setDate(end.getDate() + 28);
  return {
    periodization_model: snap.model,
    periodization_reason: snap.reason,
    macrocycle_weeks: snap.block.macrocycleWeeks,
    block_type: snap.block.blockType,
    block_number: snap.block.blockNumber,
    block_total: snap.block.blockTotal,
    next_block_type: snap.block.nextBlockType,
    block_start_date: start,
    block_end_date: end.toISOString().slice(0, 10),
    periodization_snapshot: snap
  };
};

// src/lib/variationProfiles.ts
var DEFAULT_INTENSITY = "media";
var VARIATION_OPTIONS = [
  {
    value: "baixa",
    label: "Baixa",
    desc: "Pequenas trocas, mant\xE9m estrutura e maioria dos itens."
  },
  {
    value: "media",
    label: "M\xE9dia (recomendado)",
    desc: "Mant\xE9m \xE2ncoras t\xE9cnicas, rotaciona acess\xF3rios e varia\xE7\xF5es."
  },
  {
    value: "alta",
    label: "Alta",
    desc: "Reestrutura agressivamente; card\xE1pio/treino quase novo."
  }
];

// src/lib/officeWizard/treinoWizard.ts
var LEVELS = [
  { value: "iniciante", label: "Iniciante", desc: "Menos de 6 meses de treino" },
  { value: "intermediario", label: "Intermedi\xE1rio", desc: "6 meses a 2 anos" },
  { value: "avancado", label: "Avan\xE7ado", desc: "Mais de 2 anos consistentes" }
];
var DAYS_PER_WEEK = [
  { value: "2", label: "2 dias" },
  { value: "3", label: "3 dias" },
  { value: "4", label: "4 dias" },
  { value: "5", label: "5 dias" },
  { value: "6", label: "6 dias" },
  { value: "7", label: "7 dias" }
];
var SPLITS = [
  { value: "full_body", label: "Full Body", desc: "Corpo inteiro por sess\xE3o" },
  { value: "upper_lower", label: "Upper/Lower", desc: "Superior e inferior alternados" },
  { value: "push_pull_legs", label: "Push/Pull/Legs", desc: "Empurrar / Puxar / Pernas" },
  { value: "push_pull", label: "Push/Pull", desc: "Empurrar e Puxar alternados" },
  { value: "upper_lower_ppl", label: "Upper/Lower + PPL", desc: "H\xEDbrido para 5 dias" },
  { value: "torso_limbs", label: "Torso / Membros", desc: "Tronco e membros alternados" },
  { value: "specialization", label: "Especializa\xE7\xE3o", desc: "Foco em grupo(s) priorit\xE1rio(s)" },
  { value: "body_part", label: "Divis\xE3o por grupos musculares", desc: "Maior concentra\xE7\xE3o de volume por sess\xE3o" },
  { value: "custom", label: "Selecionar grupos", desc: "Escolher grupos por dia" },
  { value: "ai_decides", label: "Decida por mim", desc: "IA escolhe a melhor divis\xE3o" }
];
var WEEKS = [
  { value: "1", label: "Semana 1", desc: "Adapta\xE7\xE3o / Volume base" },
  { value: "2", label: "Semana 2", desc: "Progress\xE3o de carga" },
  { value: "3", label: "Semana 3", desc: "Intensifica\xE7\xE3o" },
  { value: "4", label: "Semana 4", desc: "Deload / Recupera\xE7\xE3o" }
];
var EQUIPMENT = [
  { value: "completa", label: "Academia Completa", desc: "Todos os equipamentos" },
  { value: "limitado", label: "Equipamento Limitado", desc: "Halteres, barras e poucos aparelhos" },
  { value: "casa", label: "Home Gym", desc: "Treino em casa com b\xE1sico" }
];
var AVAILABLE_MACHINES = [
  { id: "halteres", label: "Halteres", category: "Pesos Livres" },
  { id: "barras_anilhas", label: "Barras e Anilhas", category: "Pesos Livres" },
  { id: "banco_regulavel", label: "Banco Regul\xE1vel", category: "Pesos Livres" },
  { id: "kettlebells", label: "Kettlebells", category: "Pesos Livres" },
  { id: "polia_crossover", label: "Polia / Cross Over", category: "M\xE1quinas Superiores" },
  { id: "puxador_alto", label: "Puxador (Lat Pulldown)", category: "M\xE1quinas Superiores" },
  { id: "remada_baixa", label: "Remada Baixa", category: "M\xE1quinas Superiores" },
  { id: "supino_maquina", label: "Supino M\xE1quina", category: "M\xE1quinas Superiores" },
  { id: "peck_deck", label: "Peck Deck / Voador", category: "M\xE1quinas Superiores" },
  { id: "gravitron", label: "Gravitron", category: "M\xE1quinas Superiores" },
  { id: "leg_press", label: "Leg Press", category: "M\xE1quinas Inferiores" },
  { id: "extensora", label: "Cadeira Extensora", category: "M\xE1quinas Inferiores" },
  { id: "flexora", label: "Mesa Flexora", category: "M\xE1quinas Inferiores" },
  { id: "abdutora_adutora", label: "Cadeira Abdutora/Adutora", category: "M\xE1quinas Inferiores" },
  { id: "hack_squat", label: "Hack Squat", category: "M\xE1quinas Inferiores" },
  { id: "smith", label: "Smith Machine", category: "M\xE1quinas Inferiores" },
  { id: "barra_fixa", label: "Barra Fixa", category: "Calistenia/Outros" },
  { id: "paralelas", label: "Paralelas", category: "Calistenia/Outros" },
  { id: "elasticos", label: "El\xE1sticos / Mini-bands", category: "Calistenia/Outros" },
  { id: "trx", label: "TRX / Suspens\xE3o", category: "Calistenia/Outros" },
  { id: "esteira", label: "Esteira", category: "Cardio" },
  { id: "bike", label: "Bicicleta Ergom\xE9trica", category: "Cardio" },
  { id: "eliptico", label: "El\xEDptico", category: "Cardio" },
  { id: "escada", label: "Escada", category: "Cardio" }
];
var EXERCISE_PROFILES = [
  { value: "basic", label: "B\xE1sico / Tradicional", desc: "Prioriza equipamentos tradicionais, polias, pesos livres e m\xE1quinas convencionais. N\xE3o utiliza m\xE1quinas articuladas." },
  { value: "articulated_plus_basic", label: "Articulados + B\xE1sicos", desc: "Prioriza m\xE1quinas articuladas quando existir uma op\xE7\xE3o funcional equivalente, mantendo exerc\xEDcios tradicionais como alternativas." },
  { value: "mixed", label: "Misto / Sem prefer\xEAncia", desc: "Permite todos os exerc\xEDcios dispon\xEDveis sem priorizar articulados ou tradicionais." }
];
var MACHINE_CATEGORIES = Array.from(new Set(AVAILABLE_MACHINES.map((m) => m.category)));
var FORBIDDEN_PATTERNS = [
  { id: "sobrecarga_axial", label: "Sobrecarga axial", desc: "Agachamento livre, smith, afundo c/ barra" },
  { id: "hinge_pesado", label: "Hinge pesado", desc: "Stiff, sum\xF4 terra, peso morto, good morning" },
  { id: "overhead", label: "Movimentos acima da cabe\xE7a", desc: "Desenvolvimentos, eleva\xE7\xE3o frontal alta" },
  { id: "compressao_cervical", label: "Compress\xE3o cervical/ombros", desc: "Cargas sobre trap\xE9zio/cervical" },
  { id: "flexao_lombar", label: "Flex\xE3o lombar agressiva", desc: "Abdominais din\xE2micos, canivete, hiperextens\xE3o" },
  { id: "alto_impacto", label: "Alto impacto / explosivos", desc: "Saltos, burpees, skips, polichinelo" },
  { id: "instabilidade", label: "Instabilidade excessiva", desc: "Bola, BOSU, exerc\xEDcios em superf\xEDcie inst\xE1vel" },
  { id: "unilateral", label: "Unilateral pesado", desc: "B\xFAlgaro, afundo c/ carga, passadas" }
];
var EXECUTION_RULES = [
  { id: "baixa_carga", label: "Baixa carga" },
  { id: "pouca_serie", label: "Pouca s\xE9rie" },
  { id: "amplitude_controlada", label: "Amplitude controlada" },
  { id: "amplitude_parcial", label: "Amplitude parcial" },
  { id: "priorizar_isometria", label: "Priorizar isometria" },
  { id: "sem_peso", label: "Sem peso quando poss\xEDvel" },
  { id: "tempo_controlado", label: "Tempo / cad\xEAncia controlada" },
  { id: "sem_falha", label: "Longe da falha (RIR alto)" }
];
var MUSCLE_GROUPS = [
  "Peito",
  "Costas",
  "Ombro",
  "B\xEDceps",
  "Tr\xEDceps",
  "Antebra\xE7o",
  "Quadr\xEDceps",
  "Posterior",
  "Gl\xFAteo",
  "Panturrilha",
  "Abd\xF4men",
  "Core",
  "Lombar",
  "Trap\xE9zio",
  "Cardio"
];
var LESAO_LOCAIS = ["Ombro", "Cotovelo", "Punho", "Coluna Cervical", "Coluna Lombar", "Coluna Tor\xE1cica", "Quadril", "Joelho", "Tornozelo", "Outro"];
var MOBILITY_COUNT_OPTIONS = ["auto", "0", "1", "2", "3", "4"];
var MAIN_EXERCISES_COUNT_OPTIONS = ["auto", "4", "5", "6", "7", "8", "9", "10"];
var defaultTreinoWizardState = () => ({
  level: "",
  daysPerWeek: "",
  split: "",
  week: "",
  equipment: "",
  selectedMachines: [],
  exerciseProfile: "mixed",
  notes: "",
  treinoReferencia: "",
  customSplit: {},
  hasLesao: false,
  lesaoLocal: [],
  hasDor: false,
  dorLocal: "",
  limitacaoArticular: false,
  limitacaoLocal: "",
  hipercifose: false,
  escoliose: false,
  hiperlordose: false,
  protrusaoOmbro: false,
  valgoJoelho: false,
  tabagismo: false,
  stressAlto: false,
  sonoRuim: false,
  casoAdaptado: false,
  objetivosTerapeuticos: "",
  exerciciosProibidos: "",
  padroesProibidos: [],
  exerciciosPermitidos: "",
  regrasExecucao: [],
  mobilityCount: "auto",
  mainExercisesCount: "auto",
  marombiewEnabled: false,
  periodizationSelection: "automatica",
  variationIntensity: DEFAULT_INTENSITY
});
var canGenerateTreino = (s) => Boolean(s.level && s.daysPerWeek && s.split && s.week && s.equipment);
function buildTreinoGenerationRequest({ state, studentCtx, studentId, lastWorkoutPlan }) {
  const {
    level,
    daysPerWeek,
    split,
    week,
    equipment,
    selectedMachines,
    exerciseProfile,
    notes,
    treinoReferencia,
    customSplit,
    hasLesao,
    lesaoLocal,
    hasDor,
    dorLocal,
    limitacaoArticular,
    limitacaoLocal,
    hipercifose,
    escoliose,
    hiperlordose,
    protrusaoOmbro,
    valgoJoelho,
    tabagismo,
    stressAlto,
    sonoRuim,
    casoAdaptado,
    objetivosTerapeuticos,
    exerciciosProibidos,
    padroesProibidos,
    exerciciosPermitidos,
    regrasExecucao,
    mobilityCount,
    mainExercisesCount,
    marombiewEnabled,
    periodizationSelection,
    variationIntensity
  } = state;
  const selectedLevel = LEVELS.find((l) => l.value === level);
  const selectedSplit = SPLITS.find((s) => s.value === split);
  const selectedEquip = EQUIPMENT.find((e) => e.value === equipment);
  const canonicalSplit = normalizeSplitSlug(split);
  const daysAvailableNum = parseInt(daysPerWeek || "0", 10) || null;
  const healthLines = [];
  if (hasLesao) {
    healthLines.push(`- LES\xC3O: ${lesaoLocal.length > 0 ? lesaoLocal.join(", ") : "Sim (local n\xE3o especificado)"}`);
  }
  if (hasDor) {
    healthLines.push(`- DOR: ${dorLocal || "Sim (local n\xE3o especificado)"}`);
  }
  if (limitacaoArticular) {
    healthLines.push(`- LIMITA\xC7\xC3O ARTICULAR: ${limitacaoLocal || "Sim (local n\xE3o especificado)"}`);
  }
  if (hipercifose) healthLines.push("- DESVIO POSTURAL: Hipercifose");
  if (escoliose) healthLines.push("- DESVIO POSTURAL: Escoliose");
  if (hiperlordose) healthLines.push("- DESVIO POSTURAL: Hiperlordose");
  if (protrusaoOmbro) healthLines.push("- DESVIO POSTURAL: Protrus\xE3o de ombros");
  if (valgoJoelho) healthLines.push("- DESVIO POSTURAL: Valgo de joelho");
  if (tabagismo) healthLines.push("- H\xC1BITO: Tabagismo (considerar capacidade cardiorrespirat\xF3ria reduzida)");
  if (stressAlto) healthLines.push("- H\xC1BITO: Stress alto (priorizar exerc\xEDcios com efeito ansiol\xEDtico)");
  if (sonoRuim) healthLines.push("- H\xC1BITO: Sono ruim (evitar treinos muito intensos, priorizar recupera\xE7\xE3o)");
  const healthBlock = healthLines.length > 0 ? `

CONDI\xC7\xD5ES DE SA\xDADE E RESTRI\xC7\xD5ES DO ALUNO (ADAPTAR O TREINO OBRIGATORIAMENTE):
${healthLines.join("\n")}

IMPORTANTE: Adapte exerc\xEDcios, amplitude, carga e volume considerando as condi\xE7\xF5es acima. Inclua exerc\xEDcios corretivos/compensat\xF3rios quando houver desvios posturais. Evite exerc\xEDcios que agravem les\xF5es ou dores reportadas.` : "";
  const safetyLines = [];
  if (casoAdaptado) safetyLines.push("CASO_ADAPTADO: SIM (tratar como caso reabilitativo / adaptado \u2014 seguran\xE7a acima de qualquer outra regra)");
  if (objetivosTerapeuticos.trim()) safetyLines.push(`OBJETIVOS_TERAPEUTICOS_OBRIGATORIOS: ${objetivosTerapeuticos.trim()}`);
  if (exerciciosProibidos.trim()) safetyLines.push(`EXERCICIOS_PROIBIDOS (bloqueio absoluto, inclusive varia\xE7\xF5es/sin\xF4nimos): ${exerciciosProibidos.trim()}`);
  if (padroesProibidos.length > 0) {
    const labels = padroesProibidos.map((id) => FORBIDDEN_PATTERNS.find((p) => p.id === id)?.label).filter(Boolean).join(", ");
    safetyLines.push(`PADROES_DE_MOVIMENTO_PROIBIDOS: ${labels}`);
  }
  if (exerciciosPermitidos.trim()) safetyLines.push(`EXERCICIOS_PERMITIDOS_OU_PRIORITARIOS: ${exerciciosPermitidos.trim()}`);
  if (regrasExecucao.length > 0) {
    const labels = regrasExecucao.map((id) => EXECUTION_RULES.find((r) => r.id === id)?.label).filter(Boolean).join(", ");
    safetyLines.push(`REGRAS_DE_CARGA_E_EXECUCAO: ${labels}`);
  }
  const structuredSafetyBlock = safetyLines.length > 0 ? `

========================================
\u{1F6A8} REGRAS R\xCDGIDAS DE SEGURAN\xC7A ESTRUTURADAS (PRIORIDADE ABSOLUTA \u2014 LEIA PRIMEIRO)
========================================
Estes campos foram preenchidos pelo professor em formato estruturado.
N\xC3O s\xE3o observa\xE7\xF5es soltas \u2014 s\xE3o REGRAS OBRIGAT\xD3RIAS que VENCEM qualquer outra regra do prompt (volume, intensidade, t\xE9cnicas avan\xE7adas, divis\xE3o padr\xE3o, periodiza\xE7\xE3o).

${safetyLines.map((l) => `\u2022 ${l}`).join("\n")}

FLUXO OBRIGAT\xD3RIO:
1) Aplique este filtro ANTES de escolher qualquer exerc\xEDcio.
2) Bloqueie todo exerc\xEDcio que bata com EXERCICIOS_PROIBIDOS (nome ou sin\xF4nimo) ou que use PADROES_DE_MOVIMENTO_PROIBIDOS.
3) N\xC3O substitua um proibido por uma varia\xE7\xE3o que mantenha o mesmo padr\xE3o (ex: smith squat continua sendo sobrecarga axial; stiff halteres continua sendo hinge pesado).
4) Inclua obrigatoriamente exerc\xEDcios alinhados aos OBJETIVOS_TERAPEUTICOS_OBRIGATORIOS.
5) Aplique REGRAS_DE_CARGA_E_EXECUCAO em cada exerc\xEDcio escolhido e mencione a adapta\xE7\xE3o na coluna DESCRI\xC7\xC3O (ex: "carga baixa, amplitude controlada, isometria 20s").
6) Se o quadro for s\xE9rio e n\xE3o couber treino completo respeitando tudo, monte um treino MENOR \u2014 NUNCA preencha com exerc\xEDcio duvidoso.
========================================` : "";
  const numDays = parseInt(daysPerWeek || "0", 10);
  const WEEKDAYS2 = [
    "Segunda-feira",
    "Ter\xE7a-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "S\xE1bado",
    "Domingo"
  ];
  const customLines = [];
  for (let i = 0; i < numDays; i++) {
    const groups = customSplit[i];
    if (groups && groups.length > 0) {
      customLines.push(`- ${WEEKDAYS2[i] ?? `Dia ${i + 1}`}: ${groups.join(" + ")}`);
    }
  }
  const customSplitBlock = customLines.length > 0 ? `

DIVIS\xC3O PERSONALIZADA POR DIA (USE EXATAMENTE ESTA ESTRUTURA, sobrep\xF5e a divis\xE3o padr\xE3o):
${customLines.join("\n")}

Monte cada dia com os grupos musculares listados acima, respeitando volume adequado para o n\xEDvel.` : "";
  const prompt = `Gere o TREINO COMPLETO agora com as seguintes configura\xE7\xF5es:

- N\xEDvel: ${selectedLevel?.label}
- Dias dispon\xEDveis para treinar: ${daysPerWeek}
- Divis\xE3o: ${canonicalSplit === "ai_decides" ? "IA DEVE ESCOLHER a melhor divis\xE3o (Full Body, Upper/Lower, Push/Pull/Legs ou ABCDE) com base no n\xEDvel, dias por semana, objetivo e condi\xE7\xF5es de sa\xFAde do aluno. Justifique brevemente a escolha no Resumo do protocolo." : selectedSplit?.label}
- Semana do ciclo: ${week} de 4
  - Equipamento: ${selectedEquip?.label}${selectedMachines.length > 0 ? ` (BLOQUEIO ABSOLUTO: USE APENAS OS SEGUINTES EQUIPAMENTOS E NADA MAIS: ${selectedMachines.map((id) => AVAILABLE_MACHINES.find((m) => m.id === id)?.label).join(", ")}. \xC9 PROIBIDO incluir exerc\xEDcios que exijam m\xE1quinas fora desta lista, como por exemplo Leg Press se n\xE3o estiver listado.)` : ""}
${notes ? `- Observa\xE7\xF5es adicionais (complementares \u2014 N\xC3O substituem as regras estruturadas acima): ${notes}` : ""}${customSplitBlock}${structuredSafetyBlock}${healthBlock}
${treinoReferencia ? `

REFER\xCANCIA DE TREINO FORNECIDA PELO PROFESSOR (${marombiewEnabled ? "USE APENAS COMO APOIO SECUND\xC1RIO, N\xC3O SOBRESCREVA REGRAS R\xCDGIDAS" : "USE COMO BASE EXATA para estruturar o treino, exerc\xEDcios, divis\xE3o, volume e faixas de repeti\xE7\xE3o"}):
---
${treinoReferencia}
---
${marombiewEnabled ? "Considere este treino apenas como uma refer\xEAncia de estilo ou prefer\xEAncia do professor, mas priorize as regras estruturadas e condi\xE7\xF5es de sa\xFAde." : "Siga essa estrutura o mais fielmente poss\xEDvel, adaptando apenas para as condi\xE7\xF5es de sa\xFAde e equipamento informados."}

REGRA OBRIGAT\xD3RIA DE NOMES (REFER\xCANCIA):
1) Respeite a ESTRUTURA da refer\xEAncia: mesma divis\xE3o por dia, mesma ordem, mesmos grupos musculares, mesmo n\xFAmero de s\xE9ries e as mesmas faixas de repeti\xE7\xE3o.
2) NUNCA copie os nomes dos exerc\xEDcios da refer\xEAncia. Para CADA exerc\xEDcio, escolha o item MAIS EQUIVALENTE do BANCO DE EXERC\xCDCIOS e escreva o nome EXATAMENTE como est\xE1 no banco (mesma grafia, acentos e abrevia\xE7\xF5es).
3) \xC9 PROIBIDO usar qualquer nome que n\xE3o exista no banco. Se n\xE3o houver equivalente exato, use o mais pr\xF3ximo do MESMO grupo muscular e registre a troca na coluna DESCRI\xC7\xC3O.
4) Aquecimentos, feeder sets, DC stretch e alongamentos da refer\xEAncia devem virar exerc\xEDcios de mobilidade/alongamento existentes no banco (ou ser descritos na coluna DESCRI\xC7\xC3O), nunca linhas com nomes inventados.

REGRA DE COBERTURA TOTAL (CR\xCDTICA \u2014 A REFER\xCANCIA MANDA NA QUANTIDADE):
a) Para CADA dia da refer\xEAncia, gere UMA LINHA na tabela para CADA exerc\xEDcio listado, na mesma ordem. \xC9 PROIBIDO omitir, fundir ou resumir exerc\xEDcios da refer\xEAncia.
b) A quantidade de exerc\xEDcios de cada dia \xE9 definida pela REFER\xCANCIA e SOBREP\xD5E qualquer limite de 'Exerc\xEDcios Principais' ou 'Mobilidade' configurado nesta requisi\xE7\xE3o.
c) \xC9 PROIBIDO cortar os exerc\xEDcios COMPOSTOS/PRINCIPAIS (os primeiros de cada grupo muscular) para caber em um limite. Se precisar reduzir algo, reduza mobilidade/alongamento \u2014 nunca os principais.
d) Antes de finalizar, CONFIRA dia a dia: o n\xFAmero de exerc\xEDcios gerados deve ser >= o n\xFAmero de exerc\xEDcios da refer\xEAncia daquele dia, e TODO grupo muscular citado no cabe\xE7alho do dia (ex.: 'Posterior \u2022 Gl\xFAteo \u2022 Panturrilha \u2022 Core') precisa ter pelo menos os mesmos exerc\xEDcios da refer\xEAncia.
e) Itens que costumam ser perdidos e N\xC3O podem faltar: 'Hip Thrust'/'Hip Thrust Smith'/'Hip Thrust m\xE1quina' \u2192 ELEVA\xC7\xC3O P\xC9LVICA; 'Bulgarian Split Squat' \u2192 B\xDALGARO; 'Abdominal cabo' \u2192 exerc\xEDcio do grupo ABDOMEN do banco.` : ""}
${marombiewEnabled ? `

MODO AGENTE MAROMBIEW ATIVADO: Use uma l\xF3gica avan\xE7ada e estruturada de gera\xE7\xE3o. Considere TODO o contexto do aluno (hist\xF3rico, anamnese, testes de performance, posturas, les\xF5es, restri\xE7\xF5es e objetivos) para criar um planejamento de treino inteligente, seguro e periodizado.
PRIORIDADE DE PROCESSAMENTO (ORDEM DE IMPORT\xC2NCIA):
1. Regras r\xEDgidas de seguran\xE7a (bloqueios absolutos)
2. Condi\xE7\xF5es de sa\xFAde, les\xF5es e restri\xE7\xF5es
3. Objetivos e prioridades musculares do aluno
4. Periodiza\xE7\xE3o (semana do ciclo) e Equipamento dispon\xEDvel
5. Hist\xF3rico de treino e logbook (se dispon\xEDveis no contexto)
6. Treino de refer\xEAncia (se fornecido)
7. Observa\xE7\xF5es gerais` : ""}

GERE TUDO DE UMA VEZ:
1) Resumo do protocolo e foco da semana
2) Tabela completa do treino com TODAS as colunas: TREINO DO DIA | EXERC\xCDCIO | S\xC9RIE | S\xC9RIE 2 | REPETI\xC7\xD5ES | RIR | PAUSA | DESCRI\xC7\xC3O | VARIA\xC7\xC3O
3) Estrutura da Sess\xE3o (REGRAS OBRIGAT\xD3RIAS):
   - Exerc\xEDcios de Mobilidade por sess\xE3o: ${treinoReferencia ? "seguir a REFER\xCANCIA (ela define a quantidade)" : mobilityCount === "auto" ? "IA deve decidir (padr\xE3o 2-3)" : `EXATAMENTE ${mobilityCount}`}
   - Exerc\xEDcios Principais por sess\xE3o: ${treinoReferencia ? "seguir a REFER\xCANCIA \u2014 inclua TODOS os exerc\xEDcios principais de cada dia da refer\xEAncia, sem cortes" : mainExercisesCount === "auto" ? "IA deve decidir (padr\xE3o 6)" : `EXATAMENTE ${mainExercisesCount}`}
   - REGRA PARA MOBILIDADE/ESTABILIDADE: Sempre apenas 1 s\xE9rie, dura\xE7\xE3o de 10 a 20 segundos e descanso sempre de 10 segundos.
4) Use t\xE9cnicas avan\xE7adas conforme o n\xEDvel
5) Mensagens prontas para WhatsApp explicando o protocolo`;
  const weekNumber = parseInt(week || "1", 10) || 1;
  const snapshot = resolvePeriodization({
    selection: periodizationSelection,
    phase: weekNumberToPhase(weekNumber),
    blockNumber: (lastWorkoutPlan?.block_number ?? 0) + 1,
    context: {
      objective: studentCtx?.objetivo ?? null,
      level,
      daysPerWeek: daysAvailableNum,
      weeklyStimuliPerMuscle: canonicalSplit === "full_body" ? daysAvailableNum ?? 3 : canonicalSplit === "upper_lower" || canonicalSplit === "push_pull" ? Math.floor((daysAvailableNum ?? 4) / 2) : (daysAvailableNum ?? 0) >= 5 ? 2 : 1,
      completedPlans: lastWorkoutPlan ? lastWorkoutPlan.version ?? 1 : 0,
      priorityFocus: canonicalSplit === "specialization" ? "grupo priorit\xE1rio" : null,
      painFlags: hasDor || hasLesao
    }
  });
  return {
    prompt,
    snapshot,
    body: {
      messages: [{ role: "user", content: prompt }],
      studentContext: studentCtx,
      outputMode: "json",
      studentId,
      variationIntensity,
      // Phase 1 — additive, optional fields
      split_slug: canonicalSplit,
      split_slug_legacy: split && split !== canonicalSplit ? split : null,
      days_available: daysAvailableNum,
      periodization: snapshot,
      phase: weekNumberToPhase(weekNumber),
      exercise_profile: exerciseProfile,
      available_equipment: equipment === "limitado" || equipment === "casa" ? selectedMachines : []
    }
  };
}

// src/lib/officeWizard/treinoStudentData.ts
async function loadTreinoWizardData(client, studentId) {
  const [profileRes, spRes, assessRes] = await Promise.all([
    client.from("profiles").select("*").eq("user_id", studentId).maybeSingle(),
    client.from("students_profile").select("*").eq("user_id", studentId).maybeSingle(),
    client.from("assessments").select("id").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1)
  ]);
  const profile = profileRes.data;
  const sp = spRes.data;
  const latestAssessmentId = assessRes.data?.[0]?.id;
  let anthro = null, comp = null, vitals = null, anamnese = null;
  let skinfolds = null, performance = null, posture = null;
  let photos = [];
  if (latestAssessmentId) {
    const [anthroRes, compRes, vitalsRes, sfRes, anRes, perfRes, postureRes, photosRes] = await Promise.all([
      client.from("anthropometrics").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("composition").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("vitals").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("skinfolds").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("anamnese").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("performance_tests").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("posture").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("assessment_photos").select("*").eq("assessment_id", latestAssessmentId)
    ]);
    anthro = anthroRes.data;
    comp = compRes.data;
    vitals = vitalsRes.data;
    skinfolds = sfRes.data;
    anamnese = anRes.data;
    performance = perfRes.data;
    posture = postureRes.data;
    photos = photosRes.data ?? [];
  }
  const { data: postureScans } = await client.from("posture_scans").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1);
  const ctx = {
    nome: profile?.nome,
    email: profile?.email,
    sexo: sp?.sexo,
    data_nascimento: sp?.data_nascimento,
    altura: sp?.altura || anthro?.altura,
    objetivo: sp?.objetivo,
    restricoes: sp?.restricoes,
    lesoes: sp?.lesoes,
    observacoes: sp?.observacoes,
    raca: sp?.raca,
    peso: anthro?.peso,
    imc: anthro?.imc,
    cintura: anthro?.cintura,
    quadril: anthro?.quadril,
    rcq: anthro?.rcq,
    torax: anthro?.torax,
    abdomen: anthro?.abdomen,
    ombro: anthro?.ombro,
    pescoco: anthro?.pescoco,
    braco_direito: anthro?.braco_direito,
    braco_esquerdo: anthro?.braco_esquerdo,
    coxa_direita: anthro?.coxa_direita,
    coxa_esquerda: anthro?.coxa_esquerda,
    panturrilha_direita: anthro?.panturrilha_direita,
    panturrilha_esquerda: anthro?.panturrilha_esquerda,
    percentual_gordura: comp?.percentual_gordura,
    massa_magra: comp?.massa_magra,
    massa_gorda: comp?.massa_gorda,
    fc_repouso: vitals?.fc_repouso,
    pressao: vitals?.pressao,
    spo2: vitals?.spo2,
    glicemia: vitals?.glicemia,
    skinfolds: skinfolds ? { metodo: skinfolds.metodo, triceps: skinfolds.triceps, peitoral: skinfolds.peitoral, subescapular: skinfolds.subescapular, axilar_media: skinfolds.axilar_media, suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal, coxa: skinfolds.coxa } : null,
    anamnese: anamnese ? { historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao, suplementos: anamnese.suplementos, cirurgias: anamnese.cirurgias, dores: anamnese.dores, sono: anamnese.sono, stress: anamnese.stress, rotina: anamnese.rotina, treino_atual: anamnese.treino_atual, tabagismo: anamnese.tabagismo, alcool: anamnese.alcool } : null,
    performance: performance ? { cooper_12min: performance.cooper_12min, pushup: performance.pushup, plank: performance.plank, salto_vertical: performance.salto_vertical, agachamento_score: performance.agachamento_score, mobilidade_ombro: performance.mobilidade_ombro, mobilidade_quadril: performance.mobilidade_quadril, mobilidade_tornozelo: performance.mobilidade_tornozelo } : null,
    posture: posture ? { vista_anterior: posture.vista_anterior, vista_lateral: posture.vista_lateral, vista_posterior: posture.vista_posterior, observacoes: posture.observacoes } : null,
    posture_scan: postureScans?.[0] ? { angles: postureScans[0].angles_json, attention_points: postureScans[0].attention_points_json, region_scores: postureScans[0].region_scores_json, notes: postureScans[0].notes } : null,
    fotos_avaliacao: photos.length > 0 ? photos.map((p) => ({ tipo: p.tipo, url: p.url })) : null,
    fotos_perfil: sp?.fotos ?? null
  };
  const { data: lastWorkoutRes } = await client.from("ai_plans").select("id, titulo, conteudo, created_at").eq("student_id", studentId).eq("tipo", "treino").eq("is_draft", false).order("created_at", { ascending: false }).limit(1);
  const lastWorkoutPlan = lastWorkoutRes?.[0] || null;
  const studentName = profile?.nome || "Aluno";
  const health = {};
  if (sp?.lesoes) {
    health.hasLesao = true;
  }
  if (anamnese?.dores) {
    health.hasDor = true;
    health.dorLocal = anamnese.dores;
  }
  if (anamnese?.tabagismo) {
    health.tabagismo = true;
  }
  if (anamnese?.stress && ["alto", "muito alto"].some((s) => anamnese.stress?.toLowerCase().includes(s))) {
    health.stressAlto = true;
  }
  if (anamnese?.sono && ["ruim", "p\xE9ssimo", "ins\xF4nia", "pouco"].some((s) => anamnese.sono?.toLowerCase().includes(s))) {
    health.sonoRuim = true;
  }
  const attentionPoints = postureScans?.[0]?.attention_points_json;
  if (attentionPoints?.length) {
    const labels = attentionPoints.map((p) => (p.label || p.name || "").toLowerCase());
    if (labels.some((l) => l.includes("cifose") || l.includes("kyphosis"))) health.hipercifose = true;
    if (labels.some((l) => l.includes("escoliose") || l.includes("scoliosis"))) health.escoliose = true;
    if (labels.some((l) => l.includes("lordose") || l.includes("lordosis"))) health.hiperlordose = true;
    if (labels.some((l) => l.includes("ombro") || l.includes("shoulder"))) health.protrusaoOmbro = true;
    if (labels.some((l) => l.includes("valgo") || l.includes("valgus"))) health.valgoJoelho = true;
  }
  return { ctx, studentName, lastWorkoutPlan, health };
}

// src/lib/cardioParser.ts
function isWeeklyPlan(payload) {
  return !!payload && payload.weekly === true && Array.isArray(payload.protocols);
}
function parseCardioPayload(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isWeeklyPlan(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.blocks)) return parsed;
    return null;
  } catch {
    return null;
  }
}
var MODALITY_LABEL = {
  passadeira: "Passadeira",
  bike: "Bike",
  eliptica: "El\xEDptica",
  escada: "Escada"
};
var STRUCTURE_LABEL = {
  continuo: "Cont\xEDnuo",
  intervalado: "Intervalado",
  hiit: "HIIT",
  zona2: "Zona 2"
};
var INTENSITY_LABEL = {
  leve: "Leve",
  moderada: "Moderada",
  intensa: "Intensa"
};
function totalCardioDurationSec(protocol) {
  return protocol.blocks.reduce((sum, b) => sum + (b.durationSec || 0), 0);
}
function formatDurationFromSec(totalSec) {
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min} min` : `${min} min ${sec}s`;
}

// src/lib/officeWizard/cardioWizard.ts
var CARDIO_MODALITY_VALUES = ["passadeira", "bike", "eliptica", "escada"];
var CARDIO_INTENSITIES = [
  { value: "auto", label: "Auto" },
  { value: "leve", label: "Leve" },
  { value: "moderada", label: "Moderada" },
  { value: "intensa", label: "Intensa" }
];
var CARDIO_STYLES = [
  { value: "auto", label: "Autom\xE1tico (IA decide)" },
  { value: "continuo", label: "Cont\xEDnuo (intensidade constante)" },
  { value: "intervalado", label: "Intervalado (blocos alternados)" },
  { value: "hiit", label: "HIIT (picos curtos e intensos)" },
  { value: "zona2", label: "Zona 2 pura (queima de gordura)" }
];
var CARDIO_FREQUENCIES = ["1", "2", "3", "4", "5", "6"];
var CARDIO_DURATIONS = ["auto", "15", "20", "25", "30", "40", "45", "60"];
var CARDIO_SPEEDS = ["3", "4", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "10", "11", "12", "13", "14", "15", "16"];
var CARDIO_INCLINES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "15"];
var CARDIO_TIMES = ["10", "15", "20", "30", "40", "45", "60", "90", "120", "180", "240", "300"];
var CARDIO_BIKE_LEVELS = Array.from({ length: 20 }, (_, i) => String(i + 1));
var CARDIO_ROUNDS = ["4", "5", "6", "8", "10", "12", "15", "20"];
var CARDIO_BIKE_POSITIONS = ["auto", "alternado", "sentado", "em_pe"];
var CARDIO_EQUIPMENT_FIELDS = [
  { key: "tSpeedEasy", label: "Esteira: velocidade leve (km/h)", options: CARDIO_SPEEDS, modality: "passadeira" },
  { key: "tSpeedHard", label: "Esteira: velocidade forte (km/h)", options: CARDIO_SPEEDS, modality: "passadeira" },
  { key: "tInclineEasy", label: "Esteira: inclina\xE7\xE3o leve (%)", options: CARDIO_INCLINES, modality: "passadeira" },
  { key: "tInclineHard", label: "Esteira: inclina\xE7\xE3o forte (%)", options: CARDIO_INCLINES, modality: "passadeira" },
  { key: "tWorkSec", label: "Esteira: tempo forte (s)", options: CARDIO_TIMES, modality: "passadeira" },
  { key: "tRestSec", label: "Esteira: tempo recupera\xE7\xE3o (s)", options: CARDIO_TIMES, modality: "passadeira" },
  { key: "bHiit", label: "Bike: HIIT na bike", options: ["auto", "sim"], modality: "bike" },
  { key: "bPosition", label: "Bike: posi\xE7\xE3o", options: CARDIO_BIKE_POSITIONS, modality: "bike" },
  { key: "bStandSec", label: "Bike: tempo em p\xE9 (s)", options: CARDIO_TIMES, modality: "bike" },
  { key: "bSeatSec", label: "Bike: tempo sentado (s)", options: CARDIO_TIMES, modality: "bike" },
  { key: "bHardSec", label: "Bike: tempo mais carga (s)", options: CARDIO_TIMES, modality: "bike" },
  { key: "bEasySec", label: "Bike: tempo menos carga (s)", options: CARDIO_TIMES, modality: "bike" },
  { key: "bHardLevel", label: "Bike: carga alta (n\xEDvel)", options: CARDIO_BIKE_LEVELS, modality: "bike" },
  { key: "bEasyLevel", label: "Bike: carga baixa (n\xEDvel)", options: CARDIO_BIKE_LEVELS, modality: "bike" },
  { key: "rounds", label: "N\xBA de ciclos (intervalado)", options: CARDIO_ROUNDS }
];
var defaultCardioWizardState = () => ({
  modalities: [],
  frequency: "3",
  intensity: "auto",
  style: "auto",
  duration: "auto",
  notes: "",
  eq: {}
});
function buildEquipment(eq) {
  const n = (k) => eq[k] && eq[k] !== "auto" ? Number(eq[k]) : void 0;
  return {
    treadmill: { speedEasy: n("tSpeedEasy"), speedHard: n("tSpeedHard"), inclineEasy: n("tInclineEasy"), inclineHard: n("tInclineHard"), workSec: n("tWorkSec"), restSec: n("tRestSec") },
    bike: { hiit: eq.bHiit === "sim", position: eq.bPosition && eq.bPosition !== "auto" ? eq.bPosition : void 0, standSec: n("bStandSec"), seatSec: n("bSeatSec"), hardSec: n("bHardSec"), easySec: n("bEasySec"), hardLevel: n("bHardLevel"), easyLevel: n("bEasyLevel") },
    rounds: n("rounds")
  };
}
function buildCardioRequestBody(state, studentCtx, hrZones) {
  const { modalities, frequency, intensity, style, duration, notes, eq } = state;
  return {
    studentContext: studentCtx,
    modalities,
    // [] = automático (IA escolhe entre todas)
    frequencyPerWeek: parseInt(frequency, 10),
    intensity,
    style,
    durationMinutes: duration === "auto" ? "auto" : parseInt(duration, 10),
    notes,
    hrZones,
    equipment: buildEquipment(eq)
  };
}
function buildCardioPlanInsert(studentId, payload) {
  const isWeekly = isWeeklyPlan(payload);
  const titulo = isWeekly ? `Plano Semanal de Cardio (${payload.protocols.length} sess\xF5es)` : payload.title || `Cardio ${MODALITY_LABEL[payload.modality]} - ${(/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")}`;
  return {
    student_id: studentId,
    tipo: "cardio",
    titulo,
    conteudo: JSON.stringify(payload, null, 2)
  };
}
async function loadCardioWizardData(client, studentId) {
  const [profileRes, spRes, assessRes, hrRes] = await Promise.all([
    client.from("profiles").select("*").eq("user_id", studentId).maybeSingle(),
    client.from("students_profile").select("*").eq("user_id", studentId).maybeSingle(),
    client.from("assessments").select("id").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1),
    client.from("hr_zones").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  const profile = profileRes.data;
  const sp = spRes.data;
  const latestAssessmentId = assessRes.data?.[0]?.id;
  let anthro = null, comp = null, vitals = null, anamnese = null, performance = null;
  if (latestAssessmentId) {
    const [a, c, v, an, pf] = await Promise.all([
      client.from("anthropometrics").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("composition").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("vitals").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("anamnese").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      client.from("performance_tests").select("*").eq("assessment_id", latestAssessmentId).maybeSingle()
    ]);
    anthro = a.data;
    comp = c.data;
    vitals = v.data;
    anamnese = an.data;
    performance = pf.data;
  }
  const studentCtx = {
    nome: profile?.nome,
    sexo: sp?.sexo,
    data_nascimento: sp?.data_nascimento,
    altura: sp?.altura || anthro?.altura,
    objetivo: sp?.objetivo,
    restricoes: sp?.restricoes,
    lesoes: sp?.lesoes,
    observacoes: sp?.observacoes,
    peso: anthro?.peso,
    imc: anthro?.imc,
    percentual_gordura: comp?.percentual_gordura,
    vitals,
    anamnese,
    performance
  };
  const hrZones = hrRes.data ? {
    fcMax: hrRes.data.fcmax_estimada,
    fcRepouso: hrRes.data.fc_repouso,
    hrr: hrRes.data.hrr,
    zones: hrRes.data.zonas_karvonen
  } : null;
  return { studentCtx, studentName: profile?.nome || "Aluno", hrZones };
}

// src/lib/officeWizard/fields.ts
var opt = (arr) => arr.map((o) => ({ valor: o.value, rotulo: o.label, ...o.desc ? { descricao: o.desc } : {} }));
var optIds = (arr) => arr.map((o) => ({ valor: o.id, rotulo: o.label, ...o.desc || o.category ? { descricao: o.desc ?? o.category } : {} }));
var optStr = (arr, fmt = (v) => v) => arr.map((v) => ({ valor: v, rotulo: fmt(v) }));
function treinoFields() {
  const d = defaultTreinoWizardState();
  const f = (x) => ({ ...x, padrao: d[x.stateKey] });
  return [
    f({ id: "nivel", stateKey: "level", pergunta: "N\xEDvel do aluno", tipo: "escolha", opcoes: opt(LEVELS), obrigatorio: true }),
    f({ id: "dias_semana", stateKey: "daysPerWeek", pergunta: "Dias por semana", tipo: "escolha", opcoes: opt(DAYS_PER_WEEK), obrigatorio: true }),
    f({ id: "divisao", stateKey: "split", pergunta: "Divis\xE3o do treino", tipo: "escolha", opcoes: opt(SPLITS), obrigatorio: true }),
    f({ id: "divisao_por_dia", stateKey: "customSplit", pergunta: "Grupos musculares por dia (\xEDndice 0 = Segunda)", tipo: "divisao_por_dia", opcoes: optStr(MUSCLE_GROUPS), obrigatorio: false, depende_de: { campo: "divisao", valores: ["custom"] } }),
    f({ id: "periodizacao", stateKey: "periodizationSelection", pergunta: "Modelo de periodiza\xE7\xE3o", tipo: "escolha", opcoes: [{ valor: "automatica", rotulo: MODEL_LABELS.automatica }, ...SELECTABLE_MODELS.map((m) => ({ valor: m, rotulo: MODEL_LABELS[m] }))], obrigatorio: false }),
    f({ id: "semana_ciclo", stateKey: "week", pergunta: "Semana do ciclo", tipo: "escolha", opcoes: opt(WEEKS), obrigatorio: true }),
    f({ id: "equipamento", stateKey: "equipment", pergunta: "Equipamento", tipo: "escolha", opcoes: opt(EQUIPMENT), obrigatorio: true }),
    f({ id: "maquinas", stateKey: "selectedMachines", pergunta: "M\xE1quinas dispon\xEDveis", tipo: "multipla", opcoes: optIds(AVAILABLE_MACHINES), obrigatorio: false, depende_de: { campo: "equipamento", valores: ["limitado", "casa"] } }),
    f({ id: "perfil_exercicios", stateKey: "exerciseProfile", pergunta: "Perfil de exerc\xEDcios", tipo: "escolha", opcoes: opt(EXERCISE_PROFILES), obrigatorio: false }),
    f({ id: "intensidade_variacao", stateKey: "variationIntensity", pergunta: "Varia\xE7\xE3o em rela\xE7\xE3o aos treinos anteriores", tipo: "escolha", opcoes: VARIATION_OPTIONS.map((o) => ({ valor: o.value, rotulo: o.label, ...o.desc ? { descricao: o.desc } : {} })), obrigatorio: false }),
    f({ id: "caso_adaptado", stateKey: "casoAdaptado", pergunta: "Caso adaptado / reabilita\xE7\xE3o?", tipo: "booleano", obrigatorio: false }),
    f({ id: "objetivos_terapeuticos", stateKey: "objetivosTerapeuticos", pergunta: "Objetivos terap\xEAuticos", tipo: "texto", obrigatorio: false }),
    f({ id: "exercicios_proibidos", stateKey: "exerciciosProibidos", pergunta: "Exerc\xEDcios proibidos", tipo: "texto", obrigatorio: false }),
    f({ id: "padroes_proibidos", stateKey: "padroesProibidos", pergunta: "Padr\xF5es de movimento proibidos", tipo: "multipla", opcoes: optIds(FORBIDDEN_PATTERNS), obrigatorio: false }),
    f({ id: "exercicios_permitidos", stateKey: "exerciciosPermitidos", pergunta: "Exerc\xEDcios permitidos/priorit\xE1rios", tipo: "texto", obrigatorio: false }),
    f({ id: "regras_execucao", stateKey: "regrasExecucao", pergunta: "Regras de carga e execu\xE7\xE3o", tipo: "multipla", opcoes: optIds(EXECUTION_RULES), obrigatorio: false }),
    f({ id: "possui_lesao", stateKey: "hasLesao", pergunta: "Possui les\xE3o?", tipo: "booleano", obrigatorio: false }),
    f({ id: "local_lesao", stateKey: "lesaoLocal", pergunta: "Local da les\xE3o", tipo: "multipla", opcoes: optStr(LESAO_LOCAIS), obrigatorio: false, depende_de: { campo: "possui_lesao", valores: [true] } }),
    f({ id: "possui_dor", stateKey: "hasDor", pergunta: "Sente dor?", tipo: "booleano", obrigatorio: false }),
    f({ id: "local_dor", stateKey: "dorLocal", pergunta: "Local da dor", tipo: "texto", obrigatorio: false, depende_de: { campo: "possui_dor", valores: [true] } }),
    f({ id: "limitacao_articular", stateKey: "limitacaoArticular", pergunta: "Limita\xE7\xE3o articular?", tipo: "booleano", obrigatorio: false }),
    f({ id: "local_limitacao", stateKey: "limitacaoLocal", pergunta: "Local da limita\xE7\xE3o", tipo: "texto", obrigatorio: false, depende_de: { campo: "limitacao_articular", valores: [true] } }),
    f({ id: "hipercifose", stateKey: "hipercifose", pergunta: "Hipercifose?", tipo: "booleano", obrigatorio: false }),
    f({ id: "escoliose", stateKey: "escoliose", pergunta: "Escoliose?", tipo: "booleano", obrigatorio: false }),
    f({ id: "hiperlordose", stateKey: "hiperlordose", pergunta: "Hiperlordose?", tipo: "booleano", obrigatorio: false }),
    f({ id: "protrusao_ombro", stateKey: "protrusaoOmbro", pergunta: "Protrus\xE3o de ombros?", tipo: "booleano", obrigatorio: false }),
    f({ id: "valgo_joelho", stateKey: "valgoJoelho", pergunta: "Valgo de joelho?", tipo: "booleano", obrigatorio: false }),
    f({ id: "tabagismo", stateKey: "tabagismo", pergunta: "Tabagismo?", tipo: "booleano", obrigatorio: false }),
    f({ id: "stress_alto", stateKey: "stressAlto", pergunta: "Stress alto?", tipo: "booleano", obrigatorio: false }),
    f({ id: "sono_ruim", stateKey: "sonoRuim", pergunta: "Sono ruim?", tipo: "booleano", obrigatorio: false }),
    f({ id: "mobilidade_qtd", stateKey: "mobilityCount", pergunta: "Exerc\xEDcios de mobilidade por sess\xE3o", tipo: "escolha", opcoes: optStr(MOBILITY_COUNT_OPTIONS, (v) => v === "auto" ? "Autom\xE1tico pela IA" : `${v} exerc\xEDcio(s)`), obrigatorio: false }),
    f({ id: "principais_qtd", stateKey: "mainExercisesCount", pergunta: "Exerc\xEDcios principais por sess\xE3o", tipo: "escolha", opcoes: optStr(MAIN_EXERCISES_COUNT_OPTIONS, (v) => v === "auto" ? "Autom\xE1tico pela IA" : `${v} exerc\xEDcios`), obrigatorio: false }),
    f({ id: "treino_referencia", stateKey: "treinoReferencia", pergunta: "Treino de refer\xEAncia (texto colado)", tipo: "texto", obrigatorio: false }),
    f({ id: "agente_marombiew", stateKey: "marombiewEnabled", pergunta: "Ativar Modo Agente Marombiew?", tipo: "booleano", obrigatorio: false }),
    f({ id: "observacoes", stateKey: "notes", pergunta: "Observa\xE7\xF5es adicionais", tipo: "texto", obrigatorio: false })
  ];
}
function cardioFields() {
  const d = defaultCardioWizardState();
  const base = [
    { id: "modalidades", stateKey: "modalities", pergunta: "Modalidades (vazio = IA escolhe)", tipo: "multipla", opcoes: CARDIO_MODALITY_VALUES.map((m) => ({ valor: m, rotulo: MODALITY_LABEL[m] })), obrigatorio: false, padrao: d.modalities },
    { id: "frequencia_semana", stateKey: "frequency", pergunta: "Sess\xF5es por semana", tipo: "escolha", opcoes: optStr(CARDIO_FREQUENCIES), obrigatorio: true, padrao: d.frequency },
    { id: "intensidade", stateKey: "intensity", pergunta: "Intensidade", tipo: "escolha", opcoes: opt(CARDIO_INTENSITIES), obrigatorio: true, padrao: d.intensity },
    { id: "estilo", stateKey: "style", pergunta: "Estilo", tipo: "escolha", opcoes: opt(CARDIO_STYLES), obrigatorio: true, padrao: d.style },
    { id: "duracao", stateKey: "duration", pergunta: "Dura\xE7\xE3o (min)", tipo: "escolha", opcoes: optStr(CARDIO_DURATIONS, (v) => v === "auto" ? "Auto" : `${v} min`), obrigatorio: true, padrao: d.duration }
  ];
  const eq = CARDIO_EQUIPMENT_FIELDS.map((e) => ({
    id: `eq_${e.key}`,
    stateKey: `eq.${e.key}`,
    pergunta: e.label,
    tipo: "escolha",
    opcoes: optStr(e.options.includes("auto") ? e.options : ["auto", ...e.options]),
    obrigatorio: false,
    ...e.modality ? { depende_de: { campo: "modalidades", valores: [e.modality] } } : {},
    padrao: "auto"
  }));
  return [...base, ...eq, { id: "observacoes", stateKey: "notes", pergunta: "Observa\xE7\xF5es", tipo: "texto", obrigatorio: false, padrao: d.notes }];
}
function isActive(field, answers) {
  if (!field.depende_de) return true;
  const v = answers[field.depende_de.campo];
  if (Array.isArray(v)) return v.length === 0 || v.some((x) => field.depende_de.valores.includes(x));
  return field.depende_de.valores.includes(v);
}
function coerce(field, raw) {
  const valid = new Set((field.opcoes ?? []).map((o) => o.valor));
  switch (field.tipo) {
    case "escolha": {
      const v = typeof raw === "number" ? String(raw) : raw;
      if (typeof v !== "string" || !valid.has(v)) return { ok: false, motivo: `valor fora das op\xE7\xF5es: ${JSON.stringify(raw)}` };
      return { ok: true, value: v };
    }
    case "multipla": {
      if (!Array.isArray(raw)) return { ok: false, motivo: "esperado uma lista" };
      const bad = raw.filter((x) => typeof x !== "string" || !valid.has(x));
      if (bad.length) return { ok: false, motivo: `valores fora das op\xE7\xF5es: ${JSON.stringify(bad)}` };
      return { ok: true, value: Array.from(new Set(raw)) };
    }
    case "booleano":
      if (typeof raw !== "boolean") return { ok: false, motivo: "esperado true/false" };
      return { ok: true, value: raw };
    case "texto":
      if (typeof raw !== "string") return { ok: false, motivo: "esperado texto" };
      if (raw.length > 2e4) return { ok: false, motivo: "texto longo demais" };
      return { ok: true, value: raw };
    case "divisao_por_dia": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, motivo: "esperado objeto {indiceDia: [grupos]}" };
      const out = {};
      for (const [k, v] of Object.entries(raw)) {
        const idx = Number(k);
        if (!Number.isInteger(idx) || idx < 0 || idx > 6) return { ok: false, motivo: `dia inv\xE1lido: ${k}` };
        if (!Array.isArray(v) || v.some((g) => typeof g !== "string" || !valid.has(g))) return { ok: false, motivo: `grupos inv\xE1lidos no dia ${k}` };
        out[idx] = v;
      }
      return { ok: true, value: out };
    }
  }
}
var isEmpty = (field, v) => v === void 0 || v === null || field.tipo !== "booleano" && typeof v === "string" && v.trim() === "";
function answersToState(fields, defaults, respostas, instrucoes) {
  const faltando = [];
  const invalidos = [];
  const known = new Set(fields.map((f) => f.id));
  for (const k of Object.keys(respostas ?? {})) if (!known.has(k)) invalidos.push({ id: k, motivo: "campo desconhecido" });
  const state = JSON.parse(JSON.stringify(defaults));
  const answers = {};
  for (const field of fields) {
    const raw = respostas?.[field.id];
    if (isEmpty(field, raw)) {
      if (field.obrigatorio && isActive(field, answers)) faltando.push({ id: field.id, pergunta: field.pergunta });
      answers[field.id] = field.padrao;
      continue;
    }
    const c = coerce(field, raw);
    if (!c.ok) {
      invalidos.push({ id: field.id, motivo: c.motivo });
      continue;
    }
    answers[field.id] = c.value;
  }
  if (faltando.length || invalidos.length) return { ok: false, faltando, invalidos };
  for (const field of fields) {
    if (!isActive(field, answers)) continue;
    const v = answers[field.id];
    if (v === void 0) continue;
    if (field.stateKey.startsWith("eq.")) {
      if (v !== "auto") state.eq[field.stateKey.slice(3)] = v;
    } else {
      state[field.stateKey] = v;
    }
  }
  const extra = (instrucoes ?? "").trim();
  if (extra) state.notes = state.notes?.trim() ? `${state.notes.trim()}
${extra}` : extra;
  return { ok: true, state };
}
var validateTreinoAnswers = (respostas, instrucoes) => answersToState(treinoFields(), defaultTreinoWizardState(), respostas, instrucoes);
var validateCardioAnswers = (respostas, instrucoes) => answersToState(cardioFields(), defaultCardioWizardState(), respostas, instrucoes);
var publicField = ({ stateKey: _s, ...rest }) => rest;

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce2,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt2) => !values.includes(opt2)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce2 = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// src/lib/trainingMethods.ts
var METHOD_LABELS = {
  amrap_with_rir_cap: "AMRAP com RIR cap",
  antagonist_superset: "Supers\xE9rie antagonista",
  blood_flow_restriction: "BFR",
  cluster_set: "Cluster set",
  complex_training: "Complex training",
  contrast_training: "Contrast training",
  density_sets: "Densidade (EMOM/etc.)",
  double_progression: "Dupla progress\xE3o",
  drop_set: "Drop set",
  eccentric_overload: "Sobrecarga exc\xEAntrica",
  isometric_hold: "Isometria",
  lengthened_partials: "Parciais em alongamento",
  mechanical_drop_set: "Drop set mec\xE2nico",
  myo_reps: "Myo-reps",
  non_competing_superset: "Supers\xE9rie n\xE3o-competitiva",
  one_and_half_reps: "Reps 1\xBD",
  paused_reps: "Reps com pausa",
  pyramid_up: "Pir\xE2mide crescente",
  pyramid_down: "Pir\xE2mide decrescente",
  post_exhaustion: "P\xF3s-exaust\xE3o",
  pre_exhaustion: "Pr\xE9-exaust\xE3o",
  ramping_sets: "S\xE9ries em rampa",
  rest_pause: "Rest-pause",
  tempo_reps: "Tempo controlado",
  top_set_backoff: "Top set + back-off",
  traditional_sets: "S\xE9ries tradicionais",
  velocity_based_training: "VBT"
};
var methodLabel = (slug, catalog) => {
  const fromCatalog = catalog?.find((m) => m.slug === slug)?.name;
  return fromCatalog || METHOD_LABELS[slug] || slug.replace(/_/g, " ");
};
var plural = (v, one, many) => `${v} ${Number(v) === 1 ? one : many}`;
var PARAM_FORMATTERS = {
  drops: (v) => plural(v, "queda", "quedas"),
  reducao_pct: (v) => `\u2212${v}%`,
  pausa_s: (v) => `pausa ${v}s`,
  minis: (v) => plural(v, "mini", "minis"),
  intra_s: (v) => `intra ${v}s`,
  direcao: (v) => String(v),
  tempo: (v) => `tempo ${v}`,
  reps: (v) => `${v} reps`,
  series: (v) => plural(v, "s\xE9rie", "s\xE9ries"),
  segundos: (v) => `${v}s`
};
var PARAM_KEYS_BY_SLUG = {
  drop_set: ["aplicar", "drops", "reducao_pct"],
  rest_pause: ["aplicar", "minis", "pausa_s", "intra_s"],
  cluster_set: ["aplicar", "blocos", "reps_bloco", "pausa_s", "intra_s"]
};
var APLICAR_LABELS = { ultima: "\xFAltima s\xE9rie", todas: "todas as s\xE9ries" };
var formatMethodParams = (params, resolvePair, slug) => {
  if (!params) return "";
  const allowed = slug ? PARAM_KEYS_BY_SLUG[slug] : void 0;
  const parts = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === null || raw === void 0 || raw === "") continue;
    if (allowed && !allowed.includes(key)) continue;
    if (key === "com") {
      const name = resolvePair?.(String(raw)) ?? String(raw);
      parts.push(`\u2194 ${name}`);
      continue;
    }
    if (key === "aplicar") {
      parts.push(APLICAR_LABELS[String(raw)] ?? String(raw));
      continue;
    }
    const fmt = PARAM_FORMATTERS[key];
    parts.push(fmt ? fmt(raw) : `${key.replace(/_/g, " ")}: ${raw}`);
  }
  return parts.join(", ");
};
var formatMethodForMarkdown = (method, resolvePair) => {
  if (!method?.slug) return "";
  const label = methodLabel(method.slug).toUpperCase();
  const params = formatMethodParams(method.params, resolvePair);
  return params ? `${label} (${params})` : label;
};
var normalizeWorkoutMethod = (raw) => {
  if (!raw || typeof raw !== "object") return void 0;
  const o = raw;
  const slug = String(o.slug ?? "").trim();
  if (!slug) return void 0;
  const out = { slug };
  const p = o.params;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const params = {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "number" && Number.isFinite(v)) params[k] = v;
      else if (typeof v === "string" && v.trim() !== "") params[k] = v.trim();
    }
    if (Object.keys(params).length > 0) out.params = params;
  }
  return out;
};

// src/lib/workoutExecutionFields.ts
function executionFields(raw) {
  return {
    ...typeof raw.grupo_id === "string" ? { grupo_id: raw.grupo_id } : {},
    ...raw.tipo_grupo === "superset" || raw.tipo_grupo === "biset" ? { tipo_grupo: raw.tipo_grupo } : {},
    ...raw.ordem_grupo === "A" || raw.ordem_grupo === "B" ? { ordem_grupo: raw.ordem_grupo } : {},
    ...typeof raw.pausa_grupo_s === "number" ? { pausa_grupo_s: raw.pausa_grupo_s } : {},
    ...raw.metodo === "nenhum" || raw.metodo === "dropset" || raw.metodo === "restpause" || raw.metodo === "cluster" ? { metodo: raw.metodo } : {},
    ...raw.metodo_params && typeof raw.metodo_params === "object" ? { metodo_params: raw.metodo_params } : {}
  };
}

// src/lib/setPlanBuilder.ts
var toInt = (v) => {
  if (!v) return 0;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
};
var isReal = (v) => {
  if (!v) return false;
  const t = String(v).trim();
  return t.length > 0 && !["-", "\u2014", "\u2013", "n/a", "na"].includes(t.toLowerCase());
};
var splitComposedReps = (reps) => {
  if (!isReal(reps)) return [""];
  return String(reps).split("+").map((p) => p.trim()).filter((p) => p.length > 0);
};
var buildSetPlan = (series, series2, reps, setScheme) => {
  if (setScheme && setScheme.mode === "per_set" && Array.isArray(setScheme.sets) && setScheme.sets.length > 0) {
    return [...setScheme.sets].sort((a, b) => (a.set_number || 0) - (b.set_number || 0)).map((s) => ({
      type: s.set_type === "recognition" ? "recognition" : "work",
      reps: String(s.target_reps || "").trim()
    }));
  }
  const s1 = toInt(series);
  const s2 = toInt(series2);
  const repParts = splitComposedReps(reps);
  if (s1 > 0 && s2 > 0) {
    const recReps = repParts[0] || "";
    const workReps = repParts[1] || repParts[0] || "";
    const plan = [];
    for (let i = 0; i < s1; i++) plan.push({ type: "recognition", reps: recReps });
    for (let i = 0; i < s2; i++) plan.push({ type: "work", reps: workReps });
    return plan;
  }
  const total = s1 || s2 || 3;
  const r = repParts[0] || "";
  return Array.from({ length: total }, () => ({ type: "work", reps: r }));
};

// src/lib/workoutPyramid.ts
function pyramidType(exercise) {
  if (exercise.method?.slug === "pyramid_up") return "crescente";
  if (exercise.method?.slug === "pyramid_down") return "decrescente";
  return void 0;
}
function pyramidSummary(exercise) {
  const type = pyramidType(exercise);
  if (!type) return "";
  return `Pir\xE2mide ${type} \xB7 ${type === "crescente" ? "carga sobe" : "carga cai"} a cada s\xE9rie`;
}

// src/lib/workoutExecutionMethods.ts
var slugs = { drop_set: "dropset", rest_pause: "restpause", cluster_set: "cluster" };
var seriesMethod = (ex) => ex.metodo ?? slugs[ex.method?.slug ?? ""] ?? "nenhum";
var methodDefaults = (method) => ({
  aplicar: "ultima",
  drops: 2,
  reducao_pct: 25,
  pausa_s: method === "cluster" ? 20 : 15,
  minis: 2,
  blocos: 3,
  reps_bloco: 3
});
var bounded = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
var methodParameters = (ex) => {
  const method = seriesMethod(ex);
  const p = { ...ex.method?.params, ...ex.metodo_params };
  const d = methodDefaults(method);
  return {
    aplicar: p.aplicar === "todas" ? "todas" : "ultima",
    drops: bounded(p.drops, d.drops, 1, 3),
    reducao_pct: bounded(p.reducao_pct, d.reducao_pct, 1, 90),
    pausa_s: bounded(p.pausa_s ?? p.intra_s, d.pausa_s, method === "cluster" ? 15 : 10, method === "cluster" ? 30 : 20),
    minis: bounded(p.minis, d.minis, 1, 5),
    blocos: bounded(p.blocos, d.blocos, 2, 6),
    reps_bloco: bounded(p.reps_bloco, d.reps_bloco, 1, 20)
  };
};
var methodSummary = (ex) => {
  if (pyramidType(ex)) return pyramidSummary(ex);
  const m = seriesMethod(ex);
  if (m === "nenhum") return "";
  const p = methodParameters(ex);
  const application = p.aplicar === "todas" ? "todas as s\xE9ries" : "\xFAltima s\xE9rie";
  if (m === "dropset") return `Drop set (${application}) \xB7 ${p.drops} drops \xB7 \u2212${p.reducao_pct}%`;
  if (m === "restpause") return `Rest-pause (${application}) \xB7 ${p.minis} mini-s\xE9ries \xB7 ${p.pausa_s}s`;
  return `Cluster (${application}) \xB7 ${p.blocos} \xD7 ${p.reps_bloco} reps \xB7 ${p.pausa_s}s`;
};
var groupSummary = (ex) => ex.grupo_id && ex.tipo_grupo ? `${ex.ordem_grupo === "B" ? "A2" : "A1"} \u2014 ${ex.tipo_grupo === "superset" ? "Superset" : "Bi-set"}` : "";
var executionSummary = (ex) => [groupSummary(ex), methodSummary(ex)].filter(Boolean).join(" \xB7 ");
var exerciseSetCount = (ex) => buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme).length;
var validateGroups = (exercises) => {
  for (const id of new Set(exercises.map((ex) => ex.grupo_id).filter(Boolean))) {
    const members = exercises.filter((ex) => ex.grupo_id === id);
    if (members.length !== 2) return "Cada grupo precisa de exatamente 2 exerc\xEDcios.";
    if (exerciseSetCount(members[0]) !== exerciseSetCount(members[1])) return "Os dois exerc\xEDcios do grupo precisam ter o mesmo n\xFAmero de s\xE9ries.";
    if (new Set(members.map((ex) => ex.ordem_grupo)).size !== 2 || !members.some((ex) => ex.ordem_grupo === "A") || !members.some((ex) => ex.ordem_grupo === "B")) return "O grupo precisa de um exerc\xEDcio A e um B.";
    if (!members[0].tipo_grupo || members[0].tipo_grupo !== members[1].tipo_grupo) return "O tipo dos dois exerc\xEDcios do grupo deve ser igual.";
    if (members.some((ex) => (ex.pausa_grupo_s ?? 0) < 0 || (ex.pausa_grupo_s ?? 0) > 10)) return "A pausa entre A e B deve ficar entre 0 e 10 segundos.";
  }
  return null;
};

// src/lib/trainingDayOrder.ts
var WEEKDAYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
var WEEKDAY_PREFIX = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
var normalizeDayLabel = (label) => (label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
var trainingDaySortKey = (label) => {
  const n = normalizeDayLabel(label);
  if (!n) return 200;
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (n.includes(WEEKDAYS[i])) return i;
  }
  const words = n.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < WEEKDAY_PREFIX.length; i++) {
    if (words.some((w) => w === WEEKDAY_PREFIX[i] || w === `${WEEKDAY_PREFIX[i]}feira`)) return i;
  }
  const treino = n.match(/\btreino\s+([a-z])\b/);
  if (treino) return 100 + (treino[1].charCodeAt(0) - 97);
  return 200;
};
var sortTrainingDays = (days) => days.map((d, i) => ({ d, i, k: trainingDaySortKey(d.day ?? "") })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.d);

// src/lib/workoutSchema.ts
var WORKOUT_PLAN_VERSION = "2.0";
var trimmedString = external_exports.string().min(1).transform((v) => v.trim());
var normalizeTargetLoadPerSetValue = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const o = item;
    const load = Number(o.load_kg);
    if (!Number.isFinite(load) || load <= 0) return;
    const n = Number(o.set_number);
    out.push({ set_number: Number.isFinite(n) && n > 0 ? Math.trunc(n) : i + 1, load_kg: load });
  });
  if (out.length === 0) return null;
  return out.sort((a, b) => a.set_number - b.set_number);
};
var optionalString = external_exports.union([external_exports.string(), external_exports.null(), external_exports.undefined()]).transform((v) => v == null ? "" : String(v).trim());
var SetSchemeSetSchema = external_exports.object({
  set_number: external_exports.number().int().positive(),
  set_type: external_exports.enum(["work", "recognition"]),
  target_reps: external_exports.string().min(1)
});
var SetSchemeSchema = external_exports.object({
  mode: external_exports.enum(["uniform", "recognition_work", "per_set"]),
  sets: external_exports.array(SetSchemeSetSchema).min(1)
});
var WorkoutMethodSchema = external_exports.object({
  slug: external_exports.string().min(1),
  params: external_exports.record(external_exports.union([external_exports.string(), external_exports.number()])).optional()
});
var WorkoutExerciseSchema = external_exports.object({
  id: external_exports.string().min(1),
  exercise: external_exports.string().min(1),
  exerciseId: optionalString.optional(),
  series: optionalString,
  series2: optionalString.optional(),
  reps: optionalString,
  rir: optionalString.optional(),
  restSeconds: external_exports.union([external_exports.number(), external_exports.string(), external_exports.null(), external_exports.undefined()]).transform((v) => {
    if (v == null || v === "") return void 0;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : void 0;
  }).optional(),
  /** Legacy display fallback ("60s", "1min", "-"). Use restSeconds when present. */
  pause: optionalString.optional(),
  description: optionalString.optional(),
  variation: optionalString.optional(),
  tempo: optionalString.optional(),
  notes: optionalString.optional(),
  /** Carga alvo definida pelo professor (kg). Ausente/null = sem alvo manual. */
  targetLoadKg: external_exports.union([external_exports.number(), external_exports.string(), external_exports.null(), external_exports.undefined()]).transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }).optional(),
  targetLoadNote: external_exports.union([external_exports.string(), external_exports.null(), external_exports.undefined()]).transform((v) => v == null || String(v).trim() === "" ? null : String(v).trim()).optional(),
  /** Carga alvo por série. Quando presente, tem prioridade sobre targetLoadKg. */
  targetLoadPerSet: external_exports.union([
    external_exports.array(external_exports.object({ set_number: external_exports.number(), load_kg: external_exports.number() })),
    external_exports.null(),
    external_exports.undefined()
  ]).transform((v) => normalizeTargetLoadPerSetValue(v)).optional(),
  setScheme: SetSchemeSchema.optional(),
  /**
   * Método de treino aplicado ao exercício. `slug` deve existir e estar ativo
   * em `training_methods`; a validação contra o catálogo é feita por
   * `validateWorkoutMethod` (precisa do banco) — aqui validamos só a forma.
   */
  method: WorkoutMethodSchema.optional(),
  grupo_id: external_exports.string().optional(),
  tipo_grupo: external_exports.enum(["superset", "biset"]).optional(),
  ordem_grupo: external_exports.enum(["A", "B"]).optional(),
  pausa_grupo_s: external_exports.number().min(0).max(10).optional(),
  metodo: external_exports.enum(["nenhum", "dropset", "restpause", "cluster"]).optional(),
  // Parciais: cada método persiste apenas as suas chaves (cleanMethodParams).
  metodo_params: external_exports.object({ aplicar: external_exports.enum(["ultima", "todas"]), drops: external_exports.number().min(1).max(3), reducao_pct: external_exports.number().min(1).max(90), pausa_s: external_exports.number().min(10).max(30), minis: external_exports.number().min(1).max(5), blocos: external_exports.number().min(2).max(6), reps_bloco: external_exports.number().min(1).max(20) }).partial().optional()
});
var WorkoutDaySchema = external_exports.object({
  id: external_exports.string().min(1),
  day: external_exports.string().min(1),
  focus: optionalString.optional(),
  exercises: external_exports.array(WorkoutExerciseSchema)
});
var WorkoutMetadataSchema = external_exports.object({
  goal: optionalString.optional(),
  frequency: external_exports.union([external_exports.number(), external_exports.string(), external_exports.null(), external_exports.undefined()]).transform((v) => {
    if (v == null || v === "") return void 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : void 0;
  }).optional(),
  notes: optionalString.optional(),
  muscleGroups: external_exports.array(external_exports.string()).optional()
});
var WorkoutPlanSchema = external_exports.object({
  version: external_exports.literal(WORKOUT_PLAN_VERSION).or(external_exports.string()),
  type: external_exports.literal("workout"),
  metadata: WorkoutMetadataSchema.default({}),
  days: external_exports.array(WorkoutDaySchema)
});
var newId = (prefix = "id") => {
  try {
    const c = typeof crypto !== "undefined" ? crypto : void 0;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};
var parsePauseToSeconds = (raw) => {
  if (!raw) return void 0;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-" || s === "\u2014") return void 0;
  const min = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|m)\b/);
  if (min) return Math.round(Number(min[1].replace(",", ".")) * 60);
  const sec = s.match(/^(\d+)\s*(?:s|seg|segundos?|["''”″`])?$/);
  if (sec) return Number(sec[1]);
  return void 0;
};
var normalizeSetScheme = (raw) => {
  if (!raw || typeof raw !== "object") return void 0;
  const mode = raw.mode;
  if (mode !== "uniform" && mode !== "recognition_work" && mode !== "per_set") return void 0;
  const setsRaw = Array.isArray(raw.sets) ? raw.sets : [];
  const sets = [];
  setsRaw.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const so = s;
    const target = String(so.target_reps ?? so.reps ?? "").trim();
    if (!target) return;
    const setType2 = so.set_type === "recognition" ? "recognition" : "work";
    const setNumber = Number(so.set_number);
    sets.push({
      set_number: Number.isFinite(setNumber) && setNumber > 0 ? Math.trunc(setNumber) : i + 1,
      set_type: setType2,
      target_reps: target
    });
  });
  if (sets.length === 0) return void 0;
  return { mode, sets };
};
var workoutPlanToParsedDays = (plan) => (
  // Ordena na leitura: planos antigos salvos fora de ordem ficam certos sem migração.
  sortTrainingDays(plan.days).map((d) => ({
    id: d.id,
    day: String(d.day),
    exercises: d.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId || void 0,
      exercise: String(e.exercise),
      series: e.series || "",
      series2: e.series2 || "",
      reps: e.reps || "",
      rir: e.rir || "",
      pause: e.pause || (e.restSeconds ? `${e.restSeconds}s` : ""),
      description: e.description || "",
      variation: e.variation || "",
      targetLoadKg: e.targetLoadKg ?? null,
      targetLoadNote: e.targetLoadNote ?? null,
      targetLoadPerSet: normalizeTargetLoadPerSetValue(e.targetLoadPerSet),
      setScheme: e.setScheme,
      method: e.method,
      ...executionFields(e)
    }))
  }))
);
var normalizeWorkoutPlan = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  if (r.type !== "workout" || !Array.isArray(r.days)) return null;
  const normalized = {
    version: typeof r.version === "string" ? r.version : WORKOUT_PLAN_VERSION,
    type: "workout",
    metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : {},
    days: r.days.filter((d) => d && typeof d === "object").map((d) => ({
      id: typeof d.id === "string" && d.id ? d.id : newId("day"),
      day: String(d.day || "Treino").trim(),
      focus: typeof d.focus === "string" ? d.focus : "",
      exercises: Array.isArray(d.exercises) ? d.exercises.filter((e) => e && typeof e === "object").map((e) => ({
        id: typeof e.id === "string" && e.id ? e.id : newId("ex"),
        exercise: String(e.exercise || "").trim(),
        exerciseId: typeof e.exerciseId === "string" ? e.exerciseId : void 0,
        series: String(e.series ?? "").trim(),
        series2: String(e.series2 ?? "").trim(),
        reps: String(e.reps ?? "").trim(),
        rir: String(e.rir ?? "").trim(),
        pause: String(e.pause ?? "").trim(),
        restSeconds: typeof e.restSeconds === "number" && Number.isFinite(e.restSeconds) ? e.restSeconds : parsePauseToSeconds(e.pause),
        description: String(e.description ?? "").trim(),
        variation: String(e.variation ?? "").trim(),
        tempo: typeof e.tempo === "string" ? e.tempo : void 0,
        notes: typeof e.notes === "string" ? e.notes : void 0,
        targetLoadKg: typeof e.targetLoadKg === "number" && Number.isFinite(e.targetLoadKg) && e.targetLoadKg > 0 ? e.targetLoadKg : null,
        targetLoadNote: typeof e.targetLoadNote === "string" && e.targetLoadNote.trim() ? e.targetLoadNote.trim() : null,
        targetLoadPerSet: normalizeTargetLoadPerSetValue(e.targetLoadPerSet),
        setScheme: normalizeSetScheme(e.setScheme ?? e.set_scheme),
        method: normalizeWorkoutMethod(e.method ?? e.metodo),
        ...executionFields(e)
      })).filter((e) => e.exercise.length > 0) : []
    })).filter((d) => d.day.length > 0)
  };
  return normalized;
};
var validateWorkoutPlan = (raw) => {
  const normalized = normalizeWorkoutPlan(raw);
  if (!normalized) return { success: false, error: "Estrutura JSON inv\xE1lida para treino" };
  const parsed = WorkoutPlanSchema.safeParse(normalized);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  if (parsed.data.days.length === 0) {
    return { success: false, error: "Plano sem dias de treino" };
  }
  const hasExercise = parsed.data.days.some((d) => d.exercises.length > 0);
  if (!hasExercise) return { success: false, error: "Plano sem exerc\xEDcios v\xE1lidos" };
  for (const day of workoutPlanToParsedDays(parsed.data)) {
    const groupError = validateGroups(day.exercises);
    if (groupError) return { success: false, error: groupError };
  }
  return { success: true, data: parsed.data };
};

// src/lib/workoutMarkdownSerializer.ts
var cell = (v) => {
  if (v == null) return "-";
  const s = String(v).trim();
  return s.length === 0 ? "-" : s.replace(/\|/g, "/");
};
var restCell = (restSeconds, pause) => {
  if (typeof restSeconds === "number" && restSeconds > 0) return `${restSeconds}s`;
  return cell(pause);
};
var repsForMarkdown = (ex) => {
  if (ex.setScheme?.mode === "per_set" && ex.setScheme.sets.length > 0) {
    return ex.setScheme.sets.map((s) => s.target_reps).join(" / ");
  }
  return cell(ex.reps);
};
var seriesForMarkdown = (ex) => {
  if (ex.setScheme?.mode === "per_set" && ex.setScheme.sets.length > 0) {
    return String(ex.setScheme.sets.length);
  }
  return cell(ex.series);
};
var workoutPlanToMarkdown = (plan) => {
  const lines = [];
  if (plan.metadata?.goal) {
    lines.push(`**Objetivo:** ${plan.metadata.goal}`);
    lines.push("");
  }
  lines.push(
    "| TREINO DO DIA | EXERC\xCDCIO | S\xC9RIE | S\xC9RIE 2 | REPETI\xC7\xD5ES | RIR | PAUSA | DESCRI\xC7\xC3O | VARIA\xC7\xC3O |"
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const day of plan.days) {
    const resolvePair = (idOrName) => {
      const found = day.exercises.find((e) => e.id === idOrName || e.exerciseId === idOrName);
      return found?.exercise ?? idOrName;
    };
    for (const ex of day.exercises) {
      const metodo = executionSummary(ex) || formatMethodForMarkdown(ex.method, resolvePair);
      const desc = [metodo, (ex.description || "").trim()].filter((s) => s && s !== "-").join(" \xB7 ");
      lines.push(
        `| ${cell(day.day)} | ${cell(ex.exercise)} | ${seriesForMarkdown(ex)} | ${cell(ex.series2)} | ${repsForMarkdown(ex)} | ${cell(ex.rir)} | ${restCell(ex.restSeconds, ex.pause)} | ${cell(desc)} | ${cell(ex.variation)} |`
      );
    }
  }
  lines.push("");
  if (plan.metadata?.notes) {
    lines.push("");
    lines.push(`> ${plan.metadata.notes}`);
  }
  return lines.join("\n");
};

// src/lib/officeWizard/officeSummaries.ts
var NEXT_WEEK = { semana_1: "2", semana_2: "3", semana_3: "4", deload: "1" };
function suggestTreinoValues(fields, input) {
  const { lastPlan, health } = input;
  const out = {};
  const set = (id, v, origem) => {
    out[id] = { valor_atual: v, origem_valor: origem };
  };
  const plan = lastPlan?.conteudo_json ? normalizeWorkoutPlan(lastPlan.conteudo_json) : null;
  const when = lastPlan?.created_at ? new Date(lastPlan.created_at).toLocaleDateString("pt-BR") : "";
  const src = `treino atual${when ? ` (${when})` : ""}`;
  if (plan) {
    const days = plan.days.filter((d) => d.exercises.length > 0).length;
    if (days >= 2 && days <= 7) set("dias_semana", String(days), src);
  }
  if (lastPlan?.fase && NEXT_WEEK[lastPlan.fase]) set("semana_ciclo", NEXT_WEEK[lastPlan.fase], `pr\xF3xima semana ap\xF3s ${lastPlan.fase} do ${src}`);
  if (lastPlan?.periodization_model && MODEL_LABELS[lastPlan.periodization_model]) set("periodizacao", lastPlan.periodization_model, src);
  if (lastPlan?.mobility_count != null) set("mobilidade_qtd", String(lastPlan.mobility_count), src);
  if (lastPlan?.main_exercises_count != null) set("principais_qtd", String(lastPlan.main_exercises_count), src);
  const hmap = [
    ["hasLesao", "possui_lesao", "cadastro do aluno (les\xF5es)"],
    ["hasDor", "possui_dor", "anamnese (dores)"],
    ["tabagismo", "tabagismo", "anamnese"],
    ["stressAlto", "stress_alto", "anamnese"],
    ["sonoRuim", "sono_ruim", "anamnese"],
    ["hipercifose", "hipercifose", "scan postural"],
    ["escoliose", "escoliose", "scan postural"],
    ["hiperlordose", "hiperlordose", "scan postural"],
    ["protrusaoOmbro", "protrusao_ombro", "scan postural"],
    ["valgoJoelho", "valgo_joelho", "scan postural"]
  ];
  for (const [k, id, origem] of hmap) if (health[k]) set(id, true, origem);
  if (health.dorLocal) set("local_dor", health.dorLocal, "anamnese (dores)");
  return fillDefaults(fields, out);
}
function suggestCardioValues(fields, lastCardio) {
  const out = {};
  const payload = lastCardio?.conteudo ? parseCardioPayload(lastCardio.conteudo) : null;
  if (payload) {
    const when = lastCardio?.created_at ? new Date(lastCardio.created_at).toLocaleDateString("pt-BR") : "";
    const src = `cardio atual${when ? ` (${when})` : ""}`;
    const protocols = isWeeklyPlan(payload) ? payload.protocols : [payload];
    const freq = isWeeklyPlan(payload) ? payload.frequencyPerWeek || protocols.length : payload.frequencyPerWeek;
    if (freq >= 1 && freq <= 6) out.frequencia_semana = { valor_atual: String(freq), origem_valor: src };
    const mods = Array.from(new Set(protocols.map((p) => p.modality).filter(Boolean)));
    if (mods.length) out.modalidades = { valor_atual: mods, origem_valor: src };
    const structs = Array.from(new Set(protocols.map((p) => p.structure)));
    if (structs.length === 1 && structs[0]) out.estilo = { valor_atual: structs[0], origem_valor: src };
    const ints = Array.from(new Set(protocols.map((p) => p.intensity)));
    if (ints.length === 1 && ints[0]) out.intensidade = { valor_atual: ints[0], origem_valor: src };
  }
  return fillDefaults(fields, out);
}
function fillDefaults(fields, out) {
  for (const f of fields) {
    if (out[f.id]) continue;
    const p = f.padrao;
    const empty = p === "" || p === null || p === void 0 || p === false || Array.isArray(p) && p.length === 0 || typeof p === "object" && p && !Array.isArray(p) && Object.keys(p).length === 0;
    out[f.id] = empty ? { valor_atual: null, origem_valor: null } : { valor_atual: p, origem_valor: "padr\xE3o do wizard" };
  }
  return out;
}
function resumoTreinoAtual(lastPlan) {
  if (!lastPlan) return "Aluno sem treino publicado.";
  const plan = lastPlan.conteudo_json ? normalizeWorkoutPlan(lastPlan.conteudo_json) : null;
  const when = lastPlan.created_at ? new Date(lastPlan.created_at).toLocaleDateString("pt-BR") : "";
  if (!plan) return `${lastPlan.titulo ?? "Treino"}${when ? ` (${when})` : ""}`;
  const days = plan.days.filter((d) => d.exercises.length);
  return [
    `${lastPlan.titulo ?? "Treino"}${when ? ` \u2014 publicado em ${when}` : ""}; ${days.length} dia(s)/semana${lastPlan.fase ? `; fase ${lastPlan.fase}` : ""}.`,
    ...days.map((d) => `- ${d.day}${d.focus ? ` (${d.focus})` : ""}: ${d.exercises.length} exerc\xEDcios`)
  ].join("\n");
}
function resumoTreinoCompleto(json) {
  const plan = normalizeWorkoutPlan(json);
  return plan ? workoutPlanToMarkdown(plan) : "";
}
var fmtProtocol = (p, i) => {
  const head = `${i != null ? `Sess\xE3o ${i + 1}: ` : ""}${p.title} \u2014 ${MODALITY_LABEL[p.modality] ?? p.modality}, ${STRUCTURE_LABEL[p.structure] ?? p.structure}, intensidade ${INTENSITY_LABEL[p.intensity] ?? p.intensity}, ${formatDurationFromSec(totalCardioDurationSec(p))}`;
  const blocks = (p.blocks ?? []).map((b) => {
    const parts = [
      `${b.type} ${formatDurationFromSec(b.durationSec)}`,
      b.intensityLabel,
      b.targetZone,
      b.targetHrRange ? `FC ${b.targetHrRange}` : "",
      b.speedKmh != null ? `${b.speedKmh} km/h` : "",
      b.inclinePct != null ? `${b.inclinePct}%` : "",
      b.resistanceLevel != null ? `n\xEDvel ${b.resistanceLevel}` : "",
      b.cadenceRpm != null ? `${b.cadenceRpm} rpm` : "",
      b.bikePosition ?? "",
      b.notes ?? ""
    ].filter(Boolean);
    return `   \u2022 ${parts.join(" \xB7 ")}`;
  });
  const extra = [
    p.targetZoneSummary ? `   Zona alvo: ${p.targetZoneSummary}` : "",
    ...(p.safetyNotes ?? []).map((n) => `   Seguran\xE7a: ${n}`),
    ...(p.executionTips ?? []).map((n) => `   Dica: ${n}`)
  ].filter(Boolean);
  return [head, ...blocks, ...extra].join("\n");
};
function resumoCardioCompleto(payload) {
  if (!payload) return "";
  if (isWeeklyPlan(payload)) {
    return [`Plano semanal de cardio \u2014 ${payload.frequencyPerWeek}x/semana`, ...payload.protocols.map((p, i) => fmtProtocol(p, i))].join("\n\n");
  }
  return fmtProtocol(payload);
}
function resumoCardioAtual(lastCardio) {
  if (!lastCardio) return "Aluno sem cardio publicado.";
  const p = parseCardioPayload(lastCardio.conteudo);
  const when = lastCardio.created_at ? new Date(lastCardio.created_at).toLocaleDateString("pt-BR") : "";
  if (!p) return `${lastCardio.titulo ?? "Cardio"}${when ? ` (${when})` : ""}`;
  const protocols = isWeeklyPlan(p) ? p.protocols : [p];
  return [
    `${lastCardio.titulo ?? "Cardio"}${when ? ` \u2014 publicado em ${when}` : ""}`,
    ...protocols.map((x) => `- ${x.title}: ${MODALITY_LABEL[x.modality] ?? x.modality}, ${STRUCTURE_LABEL[x.structure] ?? x.structure}, ${x.totalDurationMin} min`)
  ].join("\n");
}

// src/lib/workoutEmptyDays.ts
var hasName = (e) => !!e && typeof e === "object" && typeof e.exercise === "string" && e.exercise.trim().length > 0;
var sanitizeTrainingDays = (days) => (Array.isArray(days) ? days : []).filter((d) => !!d && typeof d === "object").map((d) => ({ ...d, exercises: (Array.isArray(d.exercises) ? d.exercises : []).filter(hasName) })).filter((d) => d.exercises.length > 0);
var removeEmptyDays = (plan) => ({
  ...plan,
  days: sanitizeTrainingDays(plan.days)
});

// src/lib/trainingPhase.ts
var TRAINING_PHASES = ["semana_1", "semana_2", "semana_3", "deload"];
var getPhaseByMonthDay = (date = /* @__PURE__ */ new Date()) => {
  const day = date.getDate();
  if (day <= 7) return "semana_1";
  if (day <= 14) return "semana_2";
  if (day <= 21) return "semana_3";
  return "deload";
};
var parseDateUTC = (dateStr) => {
  if (!dateStr) return null;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let y = parseInt(dmy[3]);
    if (y < 100) y += 2e3;
    return new Date(Date.UTC(y, parseInt(dmy[2]) - 1, parseInt(dmy[1])));
  }
  return null;
};
var calculateCurrentPhase = (startDate) => {
  const start = parseDateUTC(startDate || "");
  if (!start) return "semana_1";
  const now = /* @__PURE__ */ new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((todayUTC - start.getTime()) / (1e3 * 60 * 60 * 24));
  if (diffDays < 0) return "semana_1";
  const weekInCycle = Math.floor(diffDays / 7) % 4;
  return TRAINING_PHASES[weekInCycle];
};

// src/lib/workoutPlanInsert.ts
var buildWorkoutPlanInsertPayload = (studentId, json, extras = {}) => {
  const validation = validateWorkoutPlan(removeEmptyDays(json));
  if (!validation.success) {
    return { success: false, error: validation.error };
  }
  const markdown = workoutPlanToMarkdown(validation.data);
  const insertPayload = {
    student_id: studentId,
    tipo: extras.tipo ?? "treino",
    titulo: extras.titulo ?? `Treino - ${(/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")}`,
    conteudo: markdown,
    conteudo_json: validation.data,
    migration_status: "completed",
    cycle_status: extras.cycle_status ?? "em_dia",
    // `fase` is NOT NULL on ai_plans. Always derive a fallback so insert never fails.
    fase: extras.fase ?? calculateCurrentPhase(extras.fase_inicio_data ?? null) ?? getPhaseByMonthDay(),
    fase_inicio_data: extras.fase_inicio_data ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    ...extras.periodization ?? {}
  };
  return { success: true, payload: insertPayload, markdown, json: validation.data };
};
export {
  buildCardioPlanInsert,
  buildCardioRequestBody,
  buildTreinoGenerationRequest,
  buildWorkoutPlanInsertPayload,
  canGenerateTreino,
  cardioFields,
  defaultCardioWizardState,
  defaultTreinoWizardState,
  loadCardioWizardData,
  loadTreinoWizardData,
  normalizeWorkoutPlan,
  parseCardioPayload,
  publicField,
  resumoCardioAtual,
  resumoCardioCompleto,
  resumoTreinoAtual,
  resumoTreinoCompleto,
  snapshotToPlanColumns,
  suggestCardioValues,
  suggestTreinoValues,
  treinoFields,
  validateCardioAnswers,
  validateTreinoAnswers
};
