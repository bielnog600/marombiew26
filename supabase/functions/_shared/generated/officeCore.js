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
  const block2 = resolveBlockPlan(
    decision.model,
    input.blockNumber ?? 1,
    !!input.context.priorityFocus
  );
  const week = resolveWeekStrategy({
    model: decision.model,
    blockType: block2.blockType,
    phase: input.phase,
    daysPerWeek: input.context.daysPerWeek ?? null
  });
  return {
    version: 1,
    model: decision.model,
    reason: decision.reason,
    manual: decision.manual,
    dataSufficiency: decision.dataSufficiency,
    block: block2,
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
var optStr = (arr, fmt2 = (v) => v) => arr.map((v) => ({ valor: v, rotulo: fmt2(v) }));
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
    case "numero": {
      const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, motivo: "esperado n\xFAmero" };
      if (field.minimo != null && n < field.minimo) return { ok: false, motivo: `m\xEDnimo ${field.minimo}` };
      if (field.maximo != null && n > field.maximo) return { ok: false, motivo: `m\xE1ximo ${field.maximo}` };
      return { ok: true, value: n };
    }
    case "kcal_por_dia": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, motivo: "esperado objeto {seg: kcal, ...}" };
      const out = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!valid.has(k)) return { ok: false, motivo: `dia inv\xE1lido: ${k}` };
        const n = typeof v === "string" ? Number(v) : v;
        if (typeof n !== "number" || !Number.isInteger(n) || Math.abs(n) > 2e3) return { ok: false, motivo: `ajuste inv\xE1lido em ${k} (inteiro entre -2000 e 2000)` };
        out[k] = n;
      }
      return { ok: true, value: out };
    }
    case "substituicoes": {
      if (!Array.isArray(raw)) return { ok: false, motivo: "esperado lista [{alimento, porcao}]" };
      const out = [];
      for (const it of raw) {
        const food = typeof it === "string" ? it : it?.alimento;
        const portion = typeof it === "string" ? "" : it?.porcao;
        if (typeof food !== "string" || !food.trim()) return { ok: false, motivo: 'cada item precisa de "alimento"' };
        out.push({ food: food.trim(), portion: typeof portion === "string" && portion.trim() || "a definir" });
      }
      return { ok: true, value: out };
    }
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
function answersToState(fields, defaults, respostas, instrucoes, notesKey = "notes") {
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
    if (c.ok !== true) {
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
    if (field.stateKey.startsWith("adj.")) {
      const key = field.stateKey.slice(4);
      state[key] = Array.from(/* @__PURE__ */ new Set([...state[key] ?? [], ...v]));
    } else if (field.toState) {
      state[field.stateKey] = field.toState(v);
    } else if (field.stateKey.startsWith("eq.")) {
      if (v !== "auto") state.eq[field.stateKey.slice(3)] = v;
    } else {
      state[field.stateKey] = v;
    }
  }
  const extra = (instrucoes ?? "").trim();
  if (extra) state[notesKey] = state[notesKey]?.trim() ? `${state[notesKey].trim()}
${extra}` : extra;
  return { ok: true, state };
}
var validateTreinoAnswers = (respostas, instrucoes) => answersToState(treinoFields(), defaultTreinoWizardState(), respostas, instrucoes);
var validateCardioAnswers = (respostas, instrucoes) => answersToState(cardioFields(), defaultCardioWizardState(), respostas, instrucoes);
var publicField = ({ stateKey: _s, toState: _t, ...rest }) => rest;

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
    return _ZodEnum.create(this.options.filter((opt3) => !values.includes(opt3)), {
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
    const fmt2 = PARAM_FORMATTERS[key];
    parts.push(fmt2 ? fmt2(raw) : `${key.replace(/_/g, " ")}: ${raw}`);
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
var mdCell = (v) => {
  const s = v == null ? "" : String(v).replace(/\s*\n\s*/g, " ").replace(/\|/g, "/").trim();
  return s || "\u2014";
};
function resumoTreinoCompleto(json) {
  const plan = normalizeWorkoutPlan(json);
  if (!plan) return "";
  const out = [];
  if (plan.metadata?.goal) out.push(`**Objetivo:** ${mdCell(plan.metadata.goal)}`, "");
  for (const day of plan.days) {
    if (!day.exercises.length) continue;
    out.push(`### ${mdCell(day.day)}${day.focus ? ` \u2014 ${mdCell(day.focus)}` : ""}`, "");
    out.push("| Dia | Exerc\xEDcio | S\xE9ries | Reps | RIR | Pausa | M\xE9todo | Varia\xE7\xE3o | Descri\xE7\xE3o |");
    out.push("|---|---|---|---|---|---|---|---|---|");
    const pair = (idOrName) => day.exercises.find((e) => e.id === idOrName || e.exerciseId === idOrName)?.exercise ?? idOrName;
    for (const ex of day.exercises) {
      const perSet = ex.setScheme?.mode === "per_set" && ex.setScheme.sets.length > 0;
      const series = perSet ? String(ex.setScheme.sets.length) : ex.series && ex.series2 ? `${ex.series} rec. + ${ex.series2}` : ex.series || ex.series2;
      const reps = perSet ? ex.setScheme.sets.map((x) => x.target_reps).join(" / ") : ex.reps;
      const pausa = ex.restSeconds ? `${ex.restSeconds}s` : ex.pause;
      const metodo = executionSummary(ex) || formatMethodForMarkdown(ex.method, pair);
      out.push(`| ${mdCell(day.day)} | ${mdCell(ex.exercise)} | ${mdCell(series)} | ${mdCell(reps)} | ${mdCell(ex.rir)} | ${mdCell(pausa)} | ${mdCell(metodo)} | ${mdCell(ex.variation)} | ${mdCell(ex.description)} |`);
    }
    out.push("");
  }
  if (plan.metadata?.notes) out.push(`**Observa\xE7\xF5es:** ${mdCell(plan.metadata.notes)}`);
  return out.join("\n").trim();
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
var mdProtocol = (txt) => txt.split("\n").map((l, i) => i === 0 ? `**${l.trim()}**` : `- ${l.replace(/^\s*•\s*/, "").trim()}`).join("\n");
function resumoCardioCompleto(payload) {
  if (!payload) return "";
  if (isWeeklyPlan(payload)) {
    return [`### Plano semanal de cardio \u2014 ${payload.frequencyPerWeek}x/semana`, ...payload.protocols.map((p, i) => mdProtocol(fmtProtocol(p, i)))].join("\n\n");
  }
  return mdProtocol(fmtProtocol(payload));
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
var buildWorkoutPlanUpdatePayload = (json, extras = {}) => {
  const validation = validateWorkoutPlan(removeEmptyDays(json));
  if (!validation.success) {
    return { success: false, error: validation.error };
  }
  const markdown = workoutPlanToMarkdown(validation.data);
  const { periodization, ...rest } = extras;
  const clean = { ...rest };
  if (clean.fase === null || clean.fase === void 0) delete clean.fase;
  if (clean.fase_inicio_data === void 0) delete clean.fase_inicio_data;
  if (periodization) Object.assign(clean, periodization);
  const updates = {
    conteudo: markdown,
    conteudo_json: validation.data,
    migration_status: "completed",
    ...clean
  };
  return { success: true, updates, markdown, json: validation.data };
};

// src/lib/weeklyEnergy.ts
var ENERGY_WEEKDAYS = [
  "seg",
  "ter",
  "qua",
  "qui",
  "sex",
  "sab",
  "dom"
];
var WEEKDAY_LABELS = {
  seg: "Segunda",
  ter: "Ter\xE7a",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "S\xE1bado",
  dom: "Domingo"
};
function computeDayTarget(entry) {
  if (entry.fixed_kcal != null && entry.fixed_kcal > 0) {
    return Math.round(entry.fixed_kcal);
  }
  return Math.round(entry.base_kcal + entry.adjustment_kcal);
}
function buildDefaultSchedule(params) {
  const base = Math.round(params.baseDailyKcal);
  const days = {};
  for (const wd of ENERGY_WEEKDAYS) {
    days[wd] = {
      base_kcal: base,
      adjustment_kcal: 0,
      fixed_kcal: null,
      workout: params.workoutByWeekday[wd] ?? null
    };
  }
  return {
    version: 1,
    base_daily_kcal: base,
    ...params.baseSource ? { base_source: params.baseSource } : {},
    ...params.calculationSnapshot ? { calculation_snapshot: params.calculationSnapshot } : {},
    days
  };
}
var MIN_DAILY_KCAL = 900;
function validateSchedule(s) {
  const issues = [];
  if (!Number.isFinite(s.base_daily_kcal) || s.base_daily_kcal <= 0) {
    issues.push("Meta cal\xF3rica base inv\xE1lida.");
  } else if (s.base_daily_kcal < MIN_DAILY_KCAL) {
    issues.push(`Meta cal\xF3rica base muito baixa (${s.base_daily_kcal} kcal, m\xEDnimo ${MIN_DAILY_KCAL}).`);
  }
  if (s.base_source != null && s.base_source !== "automatic" && s.base_source !== "manual") {
    issues.push("Origem da meta cal\xF3rica base inv\xE1lida.");
  }
  for (const wd of ENERGY_WEEKDAYS) {
    const target = computeDayTarget(s.days[wd]);
    if (!Number.isFinite(target) || target <= 0) {
      issues.push(`${WEEKDAY_LABELS[wd]}: meta inv\xE1lida.`);
    } else if (target < MIN_DAILY_KCAL) {
      issues.push(
        `${WEEKDAY_LABELS[wd]}: meta muito baixa (${target} kcal, m\xEDnimo ${MIN_DAILY_KCAL}).`
      );
    }
  }
  return issues;
}
function scheduleToJson(s) {
  return JSON.parse(JSON.stringify(s));
}

// src/lib/trainingResultParser.ts
var splitMarkdownRow = (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed.split("|").slice(1, -1).map((cell3) => cell3.trim());
};
var cleanCell = (value) => value.replace(/\*\*/g, "").trim();
var normalizeText = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
var cleanTitle = (value) => cleanCell(value).replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").replace(/:$/, "").trim();
var extractDayFromTitle = (title) => {
  const cleaned = cleanTitle(title);
  const normalized = normalizeText(cleaned);
  const match = normalized.match(/\b(segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|treino\s+[a-z])\b/i);
  return match ? cleaned : "";
};
var normalizePause = (value) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "\u2014") return trimmed;
  const match = trimmed.match(/^(\d+)\s*(?:["''”″`]|seg(?:undos?)?|s)?\s*$/i);
  if (match) return `${match[1]}s`;
  return trimmed;
};
var isTrainingTable = (firstLine) => {
  const lower = firstLine.toLowerCase();
  return (lower.includes("treino") || lower.includes("exerc") || lower.includes("s\xE9rie") || lower.includes("serie")) && (lower.includes("repeti") || lower.includes("rir") || lower.includes("pausa") || lower.includes("exerc"));
};
var parseTrainingTable = (tableLines, fallbackTitle = "") => {
  const rows = [];
  const headerCells = splitMarkdownRow(tableLines.find((line) => line.trim().startsWith("|") && !line.includes("---")) || "");
  const header = headerCells.map(normalizeText);
  const findHeader = (predicate) => header.findIndex(predicate);
  const dayIndex = findHeader((cell3) => cell3.includes("treino") && cell3.includes("dia") || (cell3 === "dia" || cell3.includes("dia do treino")));
  const exerciseIndex = findHeader((cell3) => cell3.includes("exerc"));
  const seriesIndex = findHeader((cell3) => cell3.includes("serie") && !cell3.includes("2"));
  const series2Index = findHeader((cell3) => cell3.includes("serie") && cell3.includes("2"));
  const repsIndex = findHeader((cell3) => cell3.includes("repet"));
  const rirIndex = findHeader((cell3) => cell3.includes("rir"));
  const pauseIndex = findHeader((cell3) => cell3.includes("pausa") || cell3.includes("descanso"));
  const descIndex = findHeader((cell3) => cell3.includes("descr") || cell3.includes("instr"));
  const variationIndex = findHeader((cell3) => cell3.includes("vari"));
  const fallbackDay = extractDayFromTitle(fallbackTitle);
  const hasMappedHeader = exerciseIndex >= 0;
  for (const line of tableLines) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("---")) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;
    const first = normalizeText(cells[0] || "");
    if (first.includes("treino do dia") || first.includes("exerc\xEDcio") || first.includes("exercicio")) {
      continue;
    }
    rows.push(cells);
  }
  if (rows.length === 0) return [];
  const days = [];
  let currentDay = null;
  let lastDayName = "";
  for (const cells of rows) {
    const hasDayColumn = dayIndex >= 0;
    const get = (idx, positionalFallback, optional = false) => {
      if (idx >= 0) return cleanCell(cells[idx] || "");
      if (hasMappedHeader && optional) return "";
      return cleanCell(cells[positionalFallback] || "");
    };
    const dayCell = hasDayColumn ? get(dayIndex, 0) : fallbackDay;
    const exerciseCell = hasMappedHeader ? get(exerciseIndex, hasDayColumn ? 1 : 0) : get(hasDayColumn ? 1 : 0, hasDayColumn ? 1 : 0);
    const seriesCell = hasMappedHeader ? get(seriesIndex, hasDayColumn ? 2 : 1) : get(hasDayColumn ? 2 : 1, hasDayColumn ? 2 : 1);
    const series2Cell = hasMappedHeader ? get(series2Index, hasDayColumn ? 3 : 2, true) : get(hasDayColumn ? 3 : 2, hasDayColumn ? 3 : 2);
    const repsCell = hasMappedHeader ? get(repsIndex, hasDayColumn ? 4 : 3) : get(hasDayColumn ? 4 : 3, hasDayColumn ? 4 : 3);
    const rirCell = hasMappedHeader ? get(rirIndex, hasDayColumn ? 5 : 4, true) : get(hasDayColumn ? 5 : 4, hasDayColumn ? 5 : 4);
    const pauseCell = normalizePause(hasMappedHeader ? get(pauseIndex, hasDayColumn ? 6 : 5, true) : get(hasDayColumn ? 6 : 5, hasDayColumn ? 6 : 5));
    const descCell = hasMappedHeader ? get(descIndex, hasDayColumn ? 7 : 6, true) : get(hasDayColumn ? 7 : 6, hasDayColumn ? 7 : 6);
    const variationCell = hasMappedHeader ? get(variationIndex, hasDayColumn ? 8 : 7, true) : get(hasDayColumn ? 8 : 7, hasDayColumn ? 8 : 7);
    if (dayCell && dayCell !== "-" && dayCell.toLowerCase() !== lastDayName.toLowerCase()) {
      if (currentDay && currentDay.exercises.length > 0) {
        days.push(currentDay);
      }
      currentDay = { day: dayCell, exercises: [] };
      lastDayName = dayCell;
    }
    if (!currentDay) {
      currentDay = { day: dayCell || lastDayName || "Treino", exercises: [] };
      if (dayCell) lastDayName = dayCell;
    }
    const normalizedExercise = normalizeText(exerciseCell);
    if (exerciseCell && exerciseCell !== "-" && exerciseCell !== "\u2014" && normalizedExercise !== "exercicio") {
      const parsed = {
        exercise: exerciseCell,
        series: seriesCell,
        series2: series2Cell,
        reps: repsCell,
        rir: rirCell,
        pause: pauseCell,
        description: descCell,
        variation: variationCell,
        targetLoadKg: null,
        targetLoadNote: null
      };
      const perSetMatch = repsCell.includes("/") && !repsCell.includes("+") ? repsCell.split("/").map((p) => p.trim()).filter((p) => p.length > 0) : null;
      if (perSetMatch && perSetMatch.length >= 2) {
        const seriesN = parseInt(seriesCell.replace(/\D/g, ""), 10) || perSetMatch.length;
        if (seriesN === perSetMatch.length) {
          parsed.setScheme = {
            mode: "per_set",
            sets: perSetMatch.map((r, i) => ({
              set_number: i + 1,
              set_type: "work",
              target_reps: r
            }))
          };
        }
      }
      currentDay.exercises.push(parsed);
    }
  }
  if (currentDay && currentDay.exercises.length > 0) {
    days.push(currentDay);
  }
  const merged = [];
  const seen = /* @__PURE__ */ new Map();
  for (const day of days) {
    const key = day.day.toUpperCase();
    if (seen.has(key)) {
      merged[seen.get(key)] = day;
    } else {
      seen.set(key, merged.length);
      merged.push(day);
    }
  }
  return merged;
};
var parseTrainingSections = (markdown) => {
  const sections = [];
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.toLowerCase().includes("whatsapp") || line.startsWith("#") && line.toLowerCase().includes("mensagen")) {
      let msgContent = "";
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith("#") && !l.toLowerCase().includes("whatsapp") && !l.toLowerCase().includes("mensag") && !l.toLowerCase().includes("parte")) break;
        msgContent += lines[i] + "\n";
        i++;
      }
      const msgBlocks = msgContent.split(/(?=(?:^|\n)(?:\*\*Parte|\*\*Mensagem|---|\*\*\d))/gi).filter((b) => b.trim());
      for (const block2 of msgBlocks) {
        if (block2.trim()) sections.push({ type: "message", content: block2.trim() });
      }
      continue;
    }
    if ((line.startsWith("#") || line.startsWith("**")) && (line.toLowerCase().includes("dica") || line.toLowerCase().includes("observ") || line.toLowerCase().includes("nota"))) {
      let tipContent = line + "\n";
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith("#") && !l.toLowerCase().includes("dica")) break;
        if (l.startsWith("|")) break;
        tipContent += lines[i] + "\n";
        i++;
      }
      if (tipContent.trim()) sections.push({ type: "tip", content: tipContent.trim() });
      continue;
    }
    if (line.startsWith("|")) {
      const tableLines = [];
      let title = "";
      if (sections.length > 0 && sections[sections.length - 1].type === "text") {
        const lastText = sections[sections.length - 1].content.trim();
        if (lastText.startsWith("#") || lastText.startsWith("**")) {
          title = lastText.replace(/^#+\s*/, "").replace(/\*\*/g, "");
          sections.pop();
        }
      }
      while (i < lines.length && (lines[i].trim().startsWith("|") || lines[i].trim() === "")) {
        if (lines[i].trim()) tableLines.push(lines[i]);
        i++;
      }
      const firstLine = tableLines[0]?.toLowerCase() || "";
      if (isTrainingTable(firstLine)) {
        const days = parseTrainingTable(tableLines, title);
        if (days.length > 0) {
          sections.push({ type: "training", title, content: tableLines.join("\n"), days });
        } else {
          sections.push({ type: "table", title, content: tableLines.join("\n") });
        }
      } else {
        sections.push({ type: "summary", title, content: tableLines.join("\n") });
      }
      continue;
    }
    if (line) sections.push({ type: "text", content: lines[i] });
    i++;
  }
  return sections;
};

// src/lib/trainingContextExtractor.ts
var WEEKDAY_MAP = {
  seg: "seg",
  segunda: "seg",
  "segunda-feira": "seg",
  ter: "ter",
  terca: "ter",
  "ter\xE7a": "ter",
  "ter\xE7a-feira": "ter",
  qua: "qua",
  quarta: "qua",
  "quarta-feira": "qua",
  qui: "qui",
  quinta: "qui",
  "quinta-feira": "qui",
  sex: "sex",
  sexta: "sex",
  "sexta-feira": "sex",
  sab: "sab",
  sabado: "sab",
  "s\xE1bado": "sab",
  dom: "dom",
  domingo: "dom"
};
var normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
var detectWeekday = (label) => {
  const n = normalize(label);
  for (const key of Object.keys(WEEKDAY_MAP)) {
    if (n.includes(normalize(key))) return WEEKDAY_MAP[key];
  }
  return void 0;
};
var classifyDayType = (day) => {
  const label = normalize(day.day);
  if (/(off|descanso|rest|folga|livre)/.test(label)) return "rest";
  if (/(cardio|esteira|bike|caminhada)/.test(label)) return "cardio";
  if (/(tabata|hiit|emom|amrap)/.test(label)) return "tabata";
  if (/(corrida|running|trote)/.test(label)) return "corrida";
  const exercisesText = day.exercises.map((e) => normalize(e.exercise)).join(" ");
  const lowerKeywords = /(agacha|leg ?press|stiff|levantam|terra|cadeira|panturri|gluteo|gl[uú]teo|hack|afundo)/;
  const upperKeywords = /(supino|remada|desenv|rosca|tr[ií]ceps|b[ií]ceps|crucifix|elevac|puxada|encolhimento|press)/;
  const hasLower = lowerKeywords.test(label) || lowerKeywords.test(exercisesText);
  const hasUpper = upperKeywords.test(label) || upperKeywords.test(exercisesText);
  if (hasLower && !hasUpper) return "lower";
  if (hasUpper && !hasLower) return "upper";
  if (hasUpper && hasLower) return "full";
  if (/(push|empurr)/.test(label)) return "push";
  if (/(pull|puxar)/.test(label)) return "pull";
  if (/(legs|perna)/.test(label)) return "legs";
  return "mixed";
};
var estimateIntensity = (day) => {
  const exCount = day.exercises.length;
  if (exCount === 0) return "low";
  if (exCount <= 4) return "low";
  if (exCount <= 8) return "medium";
  return "high";
};
var inferSplit = (days) => {
  const types = days.map(classifyDayType);
  const u = types.filter((t) => t === "upper").length;
  const l = types.filter((t) => t === "lower").length;
  const f = types.filter((t) => t === "full").length;
  const ppl = types.filter((t) => t === "push" || t === "pull" || t === "legs").length;
  if (ppl >= 3) return "PPL";
  if (u >= 1 && l >= 1) return "Upper/Lower";
  if (f >= 2) return "Full Body";
  if (days.length === 3) return "ABC";
  if (days.length === 4) return "ABCD";
  if (days.length === 5) return "ABCDE";
  return "Custom";
};
var extractTrainingContext = (input) => {
  if (!input.trainingMarkdown) return void 0;
  const sections = parseTrainingSections(input.trainingMarkdown);
  const days = sections.flatMap((s) => s.days ?? []);
  if (days.length === 0) return void 0;
  const daysOfWeek = {};
  for (const day of days) {
    const wd = detectWeekday(day.day);
    const load = {
      type: classifyDayType(day),
      intensity: estimateIntensity(day),
      timeOfDay: input.trainingTime || void 0
    };
    if (wd) daysOfWeek[wd] = load;
  }
  const splitType = inferSplit(days);
  const weeklySessions = days.filter((d) => classifyDayType(d) !== "rest").length;
  const summary = `${splitType} \xB7 ${weeklySessions}x/sem` + (input.trainingTime ? ` \xB7 ${input.trainingTime}` : "");
  return {
    splitType,
    weeklySessions,
    defaultTime: input.trainingTime || void 0,
    daysOfWeek: Object.keys(daysOfWeek).length > 0 ? daysOfWeek : void 0,
    summary
  };
};

// src/lib/energyFormula.ts
var LEAN_MASS_FRESH_DAYS = 120;
var finite = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var isLeanMassUsable = (leanKg, weightKg) => {
  const lean = finite(leanKg);
  const weight = finite(weightKg);
  if (lean === null || weight === null) return false;
  if (lean <= 0 || weight <= 0) return false;
  if (lean >= weight) return false;
  return lean / weight >= 0.3;
};
var mifflinStJeor = (sex, weightKg, heightCm, ageYears) => sex === "female" ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161 : 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
var harrisBenedict = (sex, weightKg, heightCm, ageYears) => sex === "female" ? 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * ageYears : 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * ageYears;
var cunningham = (leanMassKg) => 500 + 22 * leanMassKg;
var katchMcArdle = (leanMassKg) => 370 + 21.6 * leanMassKg;
var daysBetween = (a, b) => Math.abs(a.getTime() - b.getTime()) / (1e3 * 60 * 60 * 24);
var selectEnergyFormula = (input) => {
  const { sex, weightKg, heightCm, ageYears } = input;
  const now = input.now ?? /* @__PURE__ */ new Date();
  const warnings = [];
  if (sex === null) {
    warnings.push(
      "Sexo biol\xF3gico n\xE3o informado \u2014 Mifflin e Harris-Benedict dependem do sexo e n\xE3o podem ser aplicadas."
    );
  }
  const leanKg = finite(input.leanMass?.kg ?? null);
  const leanUsable = isLeanMassUsable(leanKg, weightKg);
  if (leanKg !== null && !leanUsable) {
    warnings.push("Massa magra registrada \xE9 implaus\xEDvel para o peso atual \u2014 n\xE3o usada no c\xE1lculo.");
  }
  let staleLeanMass = false;
  if (leanUsable && input.leanMass?.measuredAt) {
    const measured = new Date(input.leanMass.measuredAt);
    if (!Number.isNaN(measured.getTime()) && daysBetween(now, measured) > LEAN_MASS_FRESH_DAYS) {
      staleLeanMass = true;
      warnings.push(
        `Composi\xE7\xE3o corporal de ${measured.toLocaleDateString("pt-BR")}${input.leanMass.source ? ` (${input.leanMass.source})` : ""} \u2014 confira se ainda representa o aluno.`
      );
    }
  }
  if (leanUsable && !input.leanMass?.measuredAt) {
    warnings.push("Massa magra sem data de avalia\xE7\xE3o registrada.");
  }
  const alternatives = {};
  if (sex !== null) {
    alternatives.mifflin = Math.round(mifflinStJeor(sex, weightKg, heightCm, ageYears));
    alternatives.harris_benedict = Math.round(harrisBenedict(sex, weightKg, heightCm, ageYears));
  }
  if (leanUsable && leanKg !== null) {
    alternatives.cunningham = Math.round(cunningham(leanKg));
    alternatives.katch_mcardle = Math.round(katchMcArdle(leanKg));
  }
  const bmrFor = (formula) => {
    const value = alternatives[formula];
    return value != null ? value : null;
  };
  if (input.manualFormula) {
    const manualBmr = bmrFor(input.manualFormula);
    if (manualBmr != null) {
      return {
        formula: input.manualFormula,
        bmr: manualBmr,
        reason: "F\xF3rmula escolhida manualmente pelo treinador.",
        alternatives,
        warnings,
        insufficientData: false,
        leanMassUsable: leanUsable,
        manual: true
      };
    }
    warnings.push("F\xF3rmula escolhida manualmente n\xE3o \xE9 aplic\xE1vel com os dados atuais.");
  }
  if (leanUsable && staleLeanMass && alternatives.mifflin != null) {
    return {
      formula: "mifflin",
      bmr: alternatives.mifflin,
      reason: "Composi\xE7\xE3o corporal antiga \u2014 usando Mifflin-St Jeor automaticamente. Cunningham segue dispon\xEDvel para escolha manual.",
      alternatives,
      warnings,
      insufficientData: false,
      leanMassUsable: true,
      manual: false
    };
  }
  if (leanUsable && alternatives.cunningham != null) {
    return {
      formula: "cunningham",
      bmr: alternatives.cunningham,
      reason: staleLeanMass ? "Massa magra dispon\xEDvel na composi\xE7\xE3o corporal mais recente (avalia\xE7\xE3o antiga \u2014 confira a data)." : "Massa magra dispon\xEDvel na avalia\xE7\xE3o mais recente.",
      alternatives,
      warnings,
      insufficientData: false,
      leanMassUsable: true,
      manual: false
    };
  }
  if (alternatives.mifflin == null) {
    return {
      formula: "mifflin",
      bmr: 0,
      reason: "Dados insuficientes: sem sexo biol\xF3gico e sem massa magra utiliz\xE1vel n\xE3o existe f\xF3rmula aplic\xE1vel.",
      alternatives,
      warnings,
      insufficientData: true,
      leanMassUsable: false,
      manual: false
    };
  }
  return {
    formula: "mifflin",
    bmr: alternatives.mifflin,
    reason: "Sem massa magra utiliz\xE1vel \u2014 usando Mifflin-St Jeor com peso, altura e idade.",
    alternatives,
    warnings,
    insufficientData: false,
    leanMassUsable: false,
    manual: false
  };
};
var ENERGY_FORMULA_LABEL = {
  cunningham: "Cunningham (massa magra)",
  katch_mcardle: "Katch-McArdle (massa magra)",
  mifflin: "Mifflin-St Jeor",
  harris_benedict: "Harris-Benedict"
};

// src/lib/macroConfig.ts
var MACRO_KCAL_PER_G = {
  protein: 4,
  carbs: 4,
  fat: 9
};
var MACRO_LABEL = {
  protein: "Prote\xEDna",
  carbs: "Carboidrato",
  fat: "Gordura"
};
var finite2 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var round1 = (n) => Math.round(n * 10) / 10;
var round2 = (n) => Math.round(n * 100) / 100;
var basisWeight = (basis, body) => {
  if (basis === "lean_mass") {
    const lean = finite2(body.leanMassKg ?? null);
    return lean && lean > 0 ? lean : null;
  }
  const weight = finite2(body.weightKg);
  return weight && weight > 0 ? weight : null;
};
var gramsFromPerKg = (perKg, basis, body) => {
  const reference = basisWeight(basis, body);
  const value = finite2(perKg);
  if (reference === null || value === null) return null;
  return round1(value * reference);
};
var perKgFromGrams = (grams, basis, body) => {
  const reference = basisWeight(basis, body);
  const value = finite2(grams);
  if (reference === null || value === null) return null;
  return round2(value / reference);
};
var setMacroPerKg = (setting, perKg, body) => (
  // Limpar o campo limpa os DOIS lados: nunca manter valor antigo escondido.
  perKg === null ? { ...setting, perKg: null, grams: null } : { ...setting, perKg, grams: gramsFromPerKg(perKg, setting.basis, body) }
);
var kcalOf = (grams) => grams.protein * MACRO_KCAL_PER_G.protein + grams.carbs * MACRO_KCAL_PER_G.carbs + grams.fat * MACRO_KCAL_PER_G.fat;
var MACRO_KEYS = ["protein", "carbs", "fat"];
var resolveMacroConfig = ({
  kcalTarget,
  config,
  body,
  closingMacro,
  toleranceKcal = 50
}) => {
  const base = {
    status: "ok",
    grams: null,
    closingMacro: null,
    kcalTarget,
    kcalDelta: 0,
    message: null,
    closingOptions: []
  };
  const declared = {};
  for (const key of MACRO_KEYS) {
    const setting = config[key];
    const grams2 = finite2(setting.grams) ?? (setting.perKg != null ? gramsFromPerKg(setting.perKg, setting.basis, body) : null);
    if (grams2 != null) declared[key] = grams2;
  }
  const locked = MACRO_KEYS.filter((k) => config[k].locked);
  const free = MACRO_KEYS.filter((k) => !config[k].locked);
  const lockedMissing = locked.filter((k) => declared[k] == null);
  if (lockedMissing.length > 0) {
    return {
      ...base,
      status: "incomplete",
      message: `Defina o valor de ${lockedMissing.map((k) => MACRO_LABEL[k]).join(" e ")} antes de travar.`
    };
  }
  if (!Number.isFinite(kcalTarget) || kcalTarget <= 0) {
    return { ...base, status: "incomplete", message: "Meta cal\xF3rica inv\xE1lida." };
  }
  if (locked.length === 3) {
    const grams2 = {
      protein: declared.protein,
      carbs: declared.carbs,
      fat: declared.fat
    };
    const delta = kcalOf(grams2) - kcalTarget;
    if (Math.abs(delta) > toleranceKcal) {
      return {
        ...base,
        status: "infeasible",
        grams: grams2,
        kcalDelta: Math.round(delta),
        message: `Essa combina\xE7\xE3o de macros ${delta > 0 ? "ultrapassa" : "fica abaixo d"}a meta cal\xF3rica em ${Math.abs(
          Math.round(delta)
        )} kcal.`
      };
    }
    return { ...base, grams: grams2, kcalDelta: Math.round(delta) };
  }
  let closing = null;
  if (free.length === 1) {
    closing = free[0];
  } else {
    if (!closingMacro || !free.includes(closingMacro)) {
      return {
        ...base,
        status: "needs_closing_macro",
        closingOptions: free,
        message: "Existe mais de um macro livre. Escolha qual deles fecha as calorias \u2014 o app n\xE3o divide a diferen\xE7a sozinho."
      };
    }
    closing = closingMacro;
    const others = free.filter((k) => k !== closing);
    const missing = others.filter((k) => declared[k] == null);
    if (missing.length > 0) {
      return {
        ...base,
        status: "incomplete",
        closingOptions: free,
        message: `Defina ${missing.map((k) => MACRO_LABEL[k]).join(" e ")} ou trave esse macro.`
      };
    }
  }
  const fixedKcal = MACRO_KEYS.filter((k) => k !== closing).reduce(
    (acc, k) => acc + declared[k] * MACRO_KCAL_PER_G[k],
    0
  );
  const remaining = kcalTarget - fixedKcal;
  const closingGrams = remaining / MACRO_KCAL_PER_G[closing];
  if (closingGrams < 0) {
    return {
      ...base,
      status: "infeasible",
      closingMacro: closing,
      kcalDelta: Math.round(-remaining),
      message: `Essa combina\xE7\xE3o de macros ultrapassa a meta cal\xF3rica em ${Math.abs(
        Math.round(remaining)
      )} kcal.`
    };
  }
  const grams = {
    protein: closing === "protein" ? round1(closingGrams) : declared.protein,
    carbs: closing === "carbs" ? round1(closingGrams) : declared.carbs,
    fat: closing === "fat" ? round1(closingGrams) : declared.fat
  };
  return {
    ...base,
    grams,
    closingMacro: closing,
    kcalDelta: Math.round(kcalOf(grams) - kcalTarget)
  };
};
var closingMacroWarning = (resolution, body) => {
  if (resolution.status !== "ok" || !resolution.grams || !resolution.closingMacro) return null;
  const key = resolution.closingMacro;
  const grams = resolution.grams[key];
  const perKg = perKgFromGrams(grams, "body_weight", body);
  if (perKg === null) return null;
  const limits = {
    protein: [1.2, 3.5],
    carbs: [0.5, 8],
    fat: [0.4, 1.6]
  };
  const [min, max] = limits[key];
  if (perKg < min || perKg > max) {
    return `Para manter ${resolution.kcalTarget} kcal com essa configura\xE7\xE3o, ${MACRO_LABEL[key].toLowerCase()} precisaria ficar em ${Math.round(grams)} g (${perKg} g/kg). Revise a configura\xE7\xE3o.`;
  }
  return null;
};
var defaultMacroConfig = () => ({
  protein: { perKg: 2.2, grams: null, basis: "body_weight", locked: true },
  fat: { perKg: 0.8, grams: null, basis: "body_weight", locked: true },
  carbs: { perKg: null, grams: null, basis: "body_weight", locked: false }
});
var MACRO_BASIS_LABEL = {
  body_weight: "peso corporal",
  lean_mass: "massa magra"
};
var getMacroPrescription = (config, resolution, body) => {
  if (!resolution.grams) return null;
  const out = {};
  for (const key of MACRO_KEYS) {
    const basis = config[key].basis;
    const grams = resolution.grams[key];
    out[key] = {
      grams,
      perKg: perKgFromGrams(grams, basis, body),
      basis,
      basisLabel: MACRO_BASIS_LABEL[basis]
    };
  }
  return out;
};

// src/lib/dietDayTargets.ts
var WEEKDAY_KEYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
var positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
var scheduleDayTarget = (schedule, dayIndex, planTargetKcal) => {
  const key = WEEKDAY_KEYS[dayIndex];
  if (!schedule?.days || !key) return null;
  const day = schedule.days[key];
  if (!day) return null;
  const fixed = positive(day.fixed_kcal);
  if (fixed) return fixed;
  const target = positive(day.target_kcal);
  if (target) return target;
  const base = positive(schedule.base_daily_kcal) ?? positive(planTargetKcal);
  if (base) return Math.round(base + (Number(day.adjustment_kcal) || 0));
  return null;
};
var macro = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
var defined = (v) => v != null && Number.isFinite(v);
var resolveDayTarget = ({
  schedule,
  dayIndex,
  planTargetKcal,
  currentTotalKcal,
  planTargetMacros,
  dayTarget
}) => {
  const explicitKcal = positive(dayTarget?.kcal);
  if (explicitKcal) {
    return {
      kcal: explicitKcal,
      // Zero é valor válido: só cai no target geral quando é null/undefined.
      p: defined(dayTarget?.p) ? macro(dayTarget?.p) : macro(planTargetMacros?.p),
      c: defined(dayTarget?.c) ? macro(dayTarget?.c) : macro(planTargetMacros?.c),
      g: defined(dayTarget?.g) ? macro(dayTarget?.g) : macro(planTargetMacros?.g)
    };
  }
  const fromSchedule = scheduleDayTarget(schedule, dayIndex, planTargetKcal);
  const kcal = fromSchedule ?? positive(planTargetKcal) ?? positive(currentTotalKcal) ?? 0;
  const p = macro(planTargetMacros?.p);
  let c = macro(planTargetMacros?.c);
  const g = macro(planTargetMacros?.g);
  const base = positive(planTargetKcal);
  if (fromSchedule && base && fromSchedule !== base && (p || c || g)) {
    c = Math.max(0, Math.round(c + (fromSchedule - base) / 4));
  }
  return { kcal, p, c, g };
};

// src/lib/carbCycling.ts
var CARB_DAY_LIMITS = { fatPerKgMax: 1.5, proteinPerKgMax: 3, kcalDeviationPct: 0.2 };
var carbDayTargetSanityIssues = (t, weightKg, baseKcal) => {
  const issues = [];
  if (t.c < 0) issues.push("Carboidrato negativo");
  if (weightKg && weightKg > 0) {
    const gkg = t.g / weightKg;
    const pkg = t.p / weightKg;
    if (gkg > CARB_DAY_LIMITS.fatPerKgMax) issues.push(`Gordura ${t.g} g (${gkg.toFixed(1)} g/kg) acima de ${CARB_DAY_LIMITS.fatPerKgMax} g/kg`);
    if (pkg > CARB_DAY_LIMITS.proteinPerKgMax) issues.push(`Prote\xEDna ${t.p} g (${pkg.toFixed(1)} g/kg) acima de ${CARB_DAY_LIMITS.proteinPerKgMax} g/kg`);
  }
  if (baseKcal && baseKcal > 0 && Math.abs(t.kcal - baseKcal) / baseKcal > CARB_DAY_LIMITS.kcalDeviationPct) {
    issues.push(`${t.kcal} kcal muito longe da meta base (${Math.round(baseKcal)} kcal)`);
  }
  return issues;
};
var CARB_DAY_TYPES = ["low", "medium", "high"];
var CARB_DAY_TYPE_LABEL = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH"
};
var defaultCarbCyclingConfig = () => ({
  enabled: false,
  mode: "variable_calories",
  types: {
    low: { carbsPerKg: 1.5, carbGrams: null, carbBasis: "body_weight", targetKcal: null },
    medium: { carbsPerKg: 2.5, carbGrams: null, carbBasis: "body_weight", targetKcal: null },
    high: { carbsPerKg: 3.5, carbGrams: null, carbBasis: "body_weight", targetKcal: null }
  },
  assignments: {
    seg: "medium",
    ter: "medium",
    qua: "medium",
    qui: "medium",
    sex: "medium",
    sab: "low",
    dom: "low"
  },
  manual: { seg: false, ter: false, qua: false, qui: false, sex: false, sab: false, dom: false },
  fixedClosingMacro: null
});
var round12 = (n) => Math.round(n * 10) / 10;
var carbGramsForType = (type, body) => {
  if (type.carbGrams != null && Number.isFinite(type.carbGrams)) return round12(type.carbGrams);
  if (type.carbsPerKg == null) return null;
  return gramsFromPerKg(type.carbsPerKg, type.carbBasis, body);
};
var buildCarbDayTypeTargets = ({
  mode,
  carbCycling,
  macroConfig,
  body,
  baseKcal,
  closingMacro,
  baseResolvedMacros
}) => {
  const out = {};
  for (const type of CARB_DAY_TYPES) {
    const cfg = carbCycling.types[type];
    const carbs = carbGramsForType(cfg, body);
    const base = {
      type,
      status: "ok",
      target: null,
      carbsPerKg: cfg.carbsPerKg,
      carbBasis: cfg.carbBasis,
      message: null,
      warning: null
    };
    if (carbs == null) {
      out[type] = { ...base, status: "incomplete", message: "Defina o carboidrato deste tipo de dia." };
      continue;
    }
    if (mode === "variable_calories") {
      const declared = (m) => m.grams ?? (m.perKg != null ? gramsFromPerKg(m.perKg, m.basis, body) : null);
      const protein = declared(macroConfig.protein) ?? baseResolvedMacros?.p ?? null;
      const fat = declared(macroConfig.fat) ?? baseResolvedMacros?.g ?? null;
      if (protein == null || fat == null) {
        out[type] = {
          ...base,
          status: "incomplete",
          message: "Defina prote\xEDna e gordura na configura\xE7\xE3o de macros."
        };
        continue;
      }
      const kcal = protein * MACRO_KCAL_PER_G.protein + carbs * MACRO_KCAL_PER_G.carbs + fat * MACRO_KCAL_PER_G.fat;
      const target = {
        kcal: Math.round(kcal),
        p: Math.round(protein),
        c: Math.round(carbs),
        g: Math.round(fat)
      };
      const issues = carbDayTargetSanityIssues(target, body.weightKg ?? null, baseKcal);
      out[type] = {
        ...base,
        warning: issues.length ? issues.join(" \xB7 ") : null,
        target
      };
      continue;
    }
    const fixedClosing = carbCycling.fixedClosingMacro ?? null;
    if (!fixedClosing) {
      out[type] = {
        ...base,
        status: "needs_closing_macro",
        message: "Escolha qual macro deve fechar as calorias nos dias do ciclo."
      };
      continue;
    }
    const kcalTarget = cfg.targetKcal && cfg.targetKcal > 0 ? cfg.targetKcal : baseKcal;
    const otherMacro = fixedClosing === "protein" ? "fat" : "protein";
    const otherResolved = otherMacro === "fat" ? baseResolvedMacros?.g ?? null : baseResolvedMacros?.p ?? null;
    const config = {
      ...macroConfig,
      carbs: {
        ...macroConfig.carbs,
        perKg: cfg.carbsPerKg,
        grams: carbs,
        basis: cfg.carbBasis,
        locked: true
      },
      [fixedClosing]: { ...macroConfig[fixedClosing], locked: false },
      [otherMacro]: {
        ...macroConfig[otherMacro],
        // A resolução canônica da Fase 2 vence o valor cru do macroConfig.
        grams: otherResolved ?? macroConfig[otherMacro].grams,
        locked: true
      }
    };
    const resolution = resolveMacroConfig({ kcalTarget, config, body, closingMacro: fixedClosing });
    out[type] = {
      ...base,
      status: resolution.status,
      message: resolution.message,
      warning: closingMacroWarning(resolution, body),
      target: resolution.status === "ok" && resolution.grams ? {
        kcal: Math.round(kcalTarget),
        p: Math.round(resolution.grams.protein),
        c: Math.round(resolution.grams.carbs),
        g: Math.round(resolution.grams.fat)
      } : null
    };
  }
  return out;
};
var buildWeeklyCarbTargets = (carbCycling, typeTargets) => {
  const out = {};
  for (const wd of WEEKDAY_KEYS) {
    const type = carbCycling.assignments[wd];
    const target = typeTargets[type]?.target;
    if (target) out[wd] = { ...target, type };
  }
  return out;
};
var suggestCarbDayTypeForWorkout = (workout) => {
  const text = [workout?.label, workout?.type, ...workout?.muscles ?? []].filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return "medium";
  if (/descanso|rest|folga|off/.test(text)) return "low";
  if (/perna|lower|quadr|gl[uú]teo|posterior|full ?body|corpo inteiro/.test(text)) return "high";
  if (/cardio|caminhada|aer[oó]bic/.test(text)) return "low";
  return "medium";
};
var isCarbCyclingValid = (config, typeTargets, weekly) => {
  if (!config.enabled) return { valid: true, reason: null };
  for (const wd of WEEKDAY_KEYS) {
    const type = config.assignments[wd];
    const result = typeTargets[type];
    if (!weekly[wd] || !result || result.status !== "ok" || !result.target) {
      return {
        valid: false,
        reason: result?.message ?? `Carb cycling incompleto: o dia ${wd.toUpperCase()} (${CARB_DAY_TYPE_LABEL[type]}) n\xE3o tem meta v\xE1lida.`
      };
    }
  }
  return { valid: true, reason: null };
};

// src/lib/structuredDietPrompt.ts
var STRUCTURED_CONTRACT_BLOCK = `
=== CONTRATO DE SA\xCDDA (OBRIGAT\xD3RIO) ===
- Escolha os alimentos SOMENTE entre os IDs do FOOD CATALOG desta requisi\xE7\xE3o.
- Cada item deve conter apenas "foodId" (UUID do cat\xE1logo) e "qtyGrams" (> 0).
- NUNCA informe calorias, prote\xEDna, carboidrato ou gordura de nenhum item.
- NUNCA informe totais de refei\xE7\xE3o nem totais do dia: o sistema calcula tudo pela base.
- Respeite a estrutura de refei\xE7\xF5es, hor\xE1rios, restri\xE7\xF5es e prefer\xEAncias informadas.
- "foodId": null \xE9 permitido SOMENTE para os alimentos previamente autorizados;
  nesse caso use o nome exato da dieta modelo \u2014 o sistema marcar\xE1 o item como
  N\xC3O VALIDADO para resolu\xE7\xE3o manual.
- N\xE3o crie substitui\xE7\xF5es textuais fora da base nesta etapa.
`;
var MODEL_DIET_RULES_BLOCK = `
=== DIETA MODELO (REGRAS OBRIGAT\xD3RIAS) ===
1) Preserve EXATAMENTE os mesmos alimentos da dieta modelo, na MESMA ordem, refei\xE7\xE3o por refei\xE7\xE3o.
2) Ajuste apenas as QUANTIDADES (qtyGrams) para atingir as metas determin\xEDsticas.
3) Troque um alimento SOMENTE quando houver restri\xE7\xE3o, alergia ou incompatibilidade expl\xEDcita.
4) Alimento previamente identificado como sem cadastro: "foodId": null com o nome exato da dieta modelo (ficar\xE1 como N\xC3O VALIDADO para resolu\xE7\xE3o manual).
5) Ignore quaisquer calorias, macros, "Estimativa" ou "TOTAL DI\xC1RIO" escritos na dieta modelo.
`;
var block = (title, body) => {
  const content = String(body ?? "").trim();
  if (!content) return "";
  return `=== ${title} ===
${content}
`;
};
var buildStructuredDietPrompt = (input) => {
  const parts = [
    "Monte o plano alimentar escolhendo alimentos do FOOD CATALOG desta requisi\xE7\xE3o.",
    block("CONTEXTO DO ALUNO", input.studentContext),
    block("ROTINA DO ALUNO", input.routine),
    block("TREINO", input.training),
    block("FASE ATUAL", input.phase),
    block("ESTRAT\xC9GIA", input.strategy),
    block("ESTILO DE DIETA", input.style),
    block("REFEI\xC7\xD5ES (NOME E HOR\xC1RIO)", input.meals),
    block("RESTRI\xC7\xD5ES OBRIGAT\xD3RIAS", input.restrictions),
    block("PREFER\xCANCIAS", input.preferences),
    block("METAS DETERMIN\xCDSTICAS (DEFINITIVAS \u2014 N\xC3O RECALCULE)", input.targets),
    block("CARB CYCLING \u2014 METAS POR DIA", input.carbCycling),
    block("EXTRAS", input.extras)
  ].filter(Boolean);
  if (String(input.modelDiet ?? "").trim()) {
    parts.push(MODEL_DIET_RULES_BLOCK.trim() + "\n");
    parts.push(block("DIETA MODELO", input.modelDiet));
  }
  const allowed = (input.allowedUnresolved ?? []).filter((n) => String(n ?? "").trim());
  if (allowed.length > 0) {
    parts.push(
      block(
        "ALIMENTOS AUTORIZADOS SEM CADASTRO (foodId: null)",
        allowed.map((n) => `- ${n}`).join("\n")
      )
    );
  }
  parts.push(STRUCTURED_CONTRACT_BLOCK.trim());
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

// supabase/functions/_shared/nutritionCore.ts
var ZERO_MACROS = { kcal: 0, p: 0, c: 0, g: 0 };
var normalizeFoodName = (value) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
var buildFoodIndex = (foods) => {
  const byId = /* @__PURE__ */ new Map();
  const byName = /* @__PURE__ */ new Map();
  for (const food of foods ?? []) {
    if (food?.id) byId.set(food.id, food);
    const key = normalizeFoodName(food?.name ?? "");
    if (!key) continue;
    const list2 = byName.get(key);
    if (list2) list2.push(food);
    else byName.set(key, [food]);
  }
  return { byId, byName };
};
var resolveFoodForItem = (item, index, mode = "draft", policy = "legacy") => {
  if (mode === "published" && item.nutritionSnapshot) {
    return {
      status: "snapshot",
      food: item.foodId ? index.byId.get(item.foodId) ?? null : null,
      snapshot: item.nutritionSnapshot,
      ambiguous: false
    };
  }
  if (item.foodId) {
    const byId = index.byId.get(item.foodId);
    if (byId) {
      return { status: "resolved_by_id", food: byId, snapshot: null, ambiguous: false };
    }
  }
  if (policy === "strict_id") {
    return { status: "unresolved", food: null, snapshot: item.nutritionSnapshot ?? null, ambiguous: false };
  }
  const matches = index.byName.get(normalizeFoodName(item.name)) ?? [];
  if (matches.length === 1) {
    return { status: "resolved_by_name", food: matches[0], snapshot: null, ambiguous: false };
  }
  return {
    status: "unresolved",
    food: null,
    snapshot: item.nutritionSnapshot ?? null,
    ambiguous: matches.length > 1
  };
};
var portionOf = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 100;
};
var numberOr0 = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
var kcalFromMacros = (m) => m.p * 4 + m.c * 4 + m.g * 9;
var isMacroSetSuspicious = (m) => {
  const calc = kcalFromMacros(m);
  if (m.kcal <= 0) return calc > 0;
  const ratio = calc / m.kcal;
  return ratio < 0.78 || ratio > 1.22;
};
var computeItemMacros = (item, index, mode = "draft", policy = "legacy") => {
  const resolved = resolveFoodForItem(item, index, mode, policy);
  const qtyGrams = Math.max(0, numberOr0(item.qtyGrams));
  if (resolved.status === "snapshot" && resolved.snapshot) {
    const scale = qtyGrams / portionOf(resolved.snapshot.portionSize);
    const macros = {
      kcal: resolved.snapshot.kcal * scale,
      p: resolved.snapshot.p * scale,
      c: resolved.snapshot.c * scale,
      g: resolved.snapshot.g * scale
    };
    return {
      status: resolved.status,
      food: resolved.food,
      ambiguous: false,
      validated: true,
      qtyGrams,
      macros,
      suspicious: isMacroSetSuspicious(macros)
    };
  }
  if (resolved.food) {
    const scale = qtyGrams / portionOf(resolved.food.portion_size);
    const macros = {
      kcal: numberOr0(resolved.food.calories) * scale,
      p: numberOr0(resolved.food.protein) * scale,
      c: numberOr0(resolved.food.carbs) * scale,
      g: numberOr0(resolved.food.fats) * scale
    };
    return {
      status: resolved.status,
      food: resolved.food,
      ambiguous: false,
      validated: true,
      qtyGrams,
      macros,
      suspicious: isMacroSetSuspicious(macros)
    };
  }
  const fallback = {
    kcal: numberOr0(item.macros?.kcal),
    p: numberOr0(item.macros?.p),
    c: numberOr0(item.macros?.c),
    g: numberOr0(item.macros?.g)
  };
  return {
    status: "unresolved",
    food: null,
    ambiguous: resolved.ambiguous,
    validated: false,
    qtyGrams,
    macros: fallback,
    suspicious: isMacroSetSuspicious(fallback)
  };
};
var addMacros = (a, b) => ({
  kcal: a.kcal + b.kcal,
  p: a.p + b.p,
  c: a.c + b.c,
  g: a.g + b.g
});
var computeMealTotals = (items, index, mode = "draft", policy = "legacy") => {
  const computed = (items ?? []).map((it) => computeItemMacros(it, index, mode, policy));
  const totals = computed.reduce((acc, it) => addMacros(acc, it.macros), ZERO_MACROS);
  return {
    items: computed,
    totals,
    // O nome acompanha o próprio item computado (índices alinhados com `items`).
    unresolvedNames: computed.map((c, i) => c.status === "unresolved" ? (items ?? [])[i]?.name : null).filter((n) => Boolean(n))
  };
};
var computeDayTotals = (meals, index, mode = "draft", policy = "legacy") => {
  const computedMeals = (meals ?? []).map((m) => computeMealTotals(m.items ?? [], index, mode, policy));
  const totals = computedMeals.reduce((acc, m) => addMacros(acc, m.totals), ZERO_MACROS);
  const unresolvedNames = Array.from(
    new Set(computedMeals.flatMap((m) => m.unresolvedNames))
  );
  return { meals: computedMeals, totals, unresolvedNames };
};

// src/lib/modelDietFoods.ts
var QTY_PREFIX = /^\s*(?:[-*•>]|\d+[\).])\s*/;
var QTY_TOKEN = /\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|un|und|unid|unidade|unidades|colher(?:es)?|fatia[s]?|xícara[s]?|scoop[s]?|ovo[s]?)\b/gi;
var MEAL_HEADER = /^(refei[çc][ãa]o|caf[ée]|almo[çc]o|jantar|lanche|ceia|pr[ée]|p[óo]s|total|macros?|obs)/i;
var BULLET_LINE = /^\s*(?:[-*•]|\d+[\).])\s+/;
var TABLE_ROW = /^\s*\|.*\|\s*$/;
var NAME_QTY_LINE = /^[^:|]{3,60}:\s*\S+/;
var NARRATIVE = /^(observa|nota|aten[çc]|dica|coment|importante|resumo|estimativa)/i;
var DASH_QTY_LINE = /^[^|]{3,80}\s[—–-]\s*\d+(?:[.,]\d+)?\s*\S/;
var SUBSTITUTION_LINE = /^\s*(?:→|->|=>)/;
var REPORT_LABEL = /^(macros?|meta|gerado|diferen[çc]a|status|observa[çc][õo]es|substitui[çc][õo]es)\b/i;
var TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
var TABLE_HEADER_CELL = /^(alimento|quantidade|qtd|medida|porç[ãa]o|kcal|calorias|prote[íi]na|carbo\w*|gordura|macros?|refei[çc][ãa]o|hor[áa]rio|substitui\w*)$/i;
var isTableHeaderRow = (line) => {
  const cells = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()).filter(Boolean);
  if (cells.length === 0) return true;
  return cells.every((c) => TABLE_HEADER_CELL.test(c));
};
var hasPlausibleQuantity = (line) => {
  QTY_TOKEN.lastIndex = 0;
  if (QTY_TOKEN.test(line)) return true;
  return /[:\-—–]\s*\d/.test(line) || /\b\d+(?:[.,]\d+)?\s*\S/.test(line);
};
var looksLikeFoodLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (NARRATIVE.test(trimmed)) return false;
  if (SUBSTITUTION_LINE.test(trimmed)) return false;
  if (REPORT_LABEL.test(trimmed)) return false;
  if (trimmed.startsWith("#")) return false;
  if (TABLE_ROW.test(trimmed)) {
    if (TABLE_SEPARATOR.test(trimmed)) return false;
    if (isTableHeaderRow(trimmed)) return false;
    return /\d/.test(trimmed) && /[A-Za-zÀ-ÿ]{3,}/.test(trimmed);
  }
  if (BULLET_LINE.test(trimmed)) {
    const body = trimmed.replace(BULLET_LINE, "").trim();
    if (!body || NARRATIVE.test(body)) return false;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(body)) return false;
    return hasPlausibleQuantity(body);
  }
  if (DASH_QTY_LINE.test(trimmed) && /[A-Za-zÀ-ÿ]{3,}/.test(trimmed)) return true;
  return NAME_QTY_LINE.test(trimmed) && /\d/.test(trimmed);
};
function extractModelDietFoodNames(text) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const rawLine of String(text ?? "").split("\n")) {
    if (!looksLikeFoodLine(rawLine)) continue;
    let line = rawLine.replace(/^\s*\|/, "").replace(QTY_PREFIX, "").trim();
    if (!line || MEAL_HEADER.test(line)) continue;
    line = line.split(/[—–|:]/)[0];
    line = line.replace(QTY_TOKEN, " ");
    line = line.replace(/\b\d+(?:[.,]\d+)?\b/g, " ");
    line = line.replace(/\(.*?\)/g, " ");
    line = line.replace(/^\s*(?:de|da|do)\s+/i, "");
    const name = line.replace(/\s{2,}/g, " ").replace(/[.,;]+$/, "").replace(/[\s\-—–]+$/, "").trim();
    if (name.length < 3) continue;
    const key = normalizeFoodName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
function buildAllowedUnresolvedFromModelDiet(modelDietText, foods) {
  const byName = /* @__PURE__ */ new Map();
  for (const f of foods ?? []) {
    const key = normalizeFoodName(f?.name ?? "");
    if (!key) continue;
    byName.set(key, (byName.get(key) ?? 0) + 1);
  }
  return extractModelDietFoodNames(modelDietText).filter((name) => (byName.get(normalizeFoodName(name)) ?? 0) !== 1).map((name) => ({ name, source: "model_diet" }));
}
var ALIAS_STOPWORDS = /* @__PURE__ */ new Set(["de", "da", "do", "das", "dos", "no", "na", "em", "com", "sem", "shake", "e", "ou", "tipo", "protein", "proteina"]);
function matchFoodNamesToCatalog(names, foods) {
  const matched = [];
  const unmatched = [];
  const seen = /* @__PURE__ */ new Set();
  const catalog = (foods ?? []).map((f) => ({ f, key: normalizeFoodName(f.name) })).filter((x) => x.key);
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    const key = normalizeFoodName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const exact = catalog.filter((x) => x.key === key);
    if (exact.length === 1) continue;
    const tokens = key.split(" ").filter((t) => t.length >= 3 && !ALIAS_STOPWORDS.has(t));
    const all = key.split(" ").filter((t) => t.length >= 3);
    const useTokens = tokens.length ? tokens : all;
    if (!useTokens.length) continue;
    let best = null;
    for (const x of catalog) {
      const words = x.key.split(" ");
      const score = useTokens.filter((t) => words.some((w) => w.startsWith(t))).length;
      if (score === 0 || !words.some((w) => w.startsWith(useTokens[0]))) continue;
      if (!best || score > best.score || score === best.score && x.key.length < best.len) {
        best = { f: x.f, score, len: x.key.length };
      }
    }
    if (best) matched.push({ from: name, to: best.f.name, id: best.f.id });
    else unmatched.push(name);
  }
  return { matched, unmatched };
}

// src/lib/dietSchema.ts
var DIET_PLAN_SCHEMA_VERSION = "1.0";
var DietObjective = external_exports.enum([
  "cutting",
  "bulking",
  "recomp",
  "manutencao",
  "performance",
  "precontest"
]);
var DietStrategy = external_exports.enum([
  "linear",
  "carb_cycle",
  "refeed",
  "diet_break",
  "low_carb",
  "if",
  "custom"
]);
var DietStyle = external_exports.enum([
  "tradicional",
  "mediterranea",
  "low_carb",
  "vegana",
  "vegetariana",
  "flexivel",
  "cetogenica",
  "paleo",
  "outra"
]);
var DayLoadType = external_exports.enum([
  "rest",
  "upper",
  "lower",
  "full",
  "push",
  "pull",
  "legs",
  "cardio",
  "tabata",
  "corrida",
  "mixed"
]);
var DayIntensity = external_exports.enum(["low", "medium", "high"]);
var DayPeriod = external_exports.enum(["manha", "tarde", "noite"]);
var Weekday = external_exports.enum([
  "seg",
  "ter",
  "qua",
  "qui",
  "sex",
  "sab",
  "dom"
]);
var DayLoad = external_exports.object({
  type: DayLoadType,
  intensity: DayIntensity.optional(),
  timeOfDay: DayPeriod.optional(),
  notes: external_exports.string().optional()
});
var TrainingContext = external_exports.object({
  splitType: external_exports.string().optional(),
  // ex: "Upper/Lower", "PPL", "ABC", "Full"
  weeklySessions: external_exports.number().int().min(0).max(14).optional(),
  defaultTime: DayPeriod.optional(),
  daysOfWeek: external_exports.record(Weekday, DayLoad).optional(),
  summary: external_exports.string().optional()
  // free-text resumo legível
});
var Macros = external_exports.object({
  kcal: external_exports.number().min(0),
  p: external_exports.number().min(0),
  c: external_exports.number().min(0),
  g: external_exports.number().min(0)
});
var DietTargets = external_exports.object({
  tmb: external_exports.number().optional(),
  get: external_exports.number().optional(),
  adjustmentPct: external_exports.number().optional(),
  // déficit (-) ou superávit (+) em %
  kcal: external_exports.number().min(0),
  p: external_exports.number().min(0),
  c: external_exports.number().min(0),
  g: external_exports.number().min(0),
  // percentuais derivados (opcionais, para UI)
  pPct: external_exports.number().optional(),
  cPct: external_exports.number().optional(),
  gPct: external_exports.number().optional()
});
var NutritionSnapshot = external_exports.object({
  version: external_exports.string(),
  portionSize: external_exports.number().min(0),
  kcal: external_exports.number().min(0),
  p: external_exports.number().min(0),
  c: external_exports.number().min(0),
  g: external_exports.number().min(0),
  brand: external_exports.string().nullable().optional(),
  source: external_exports.string().nullable().optional()
});
var ResolutionStatus = external_exports.enum([
  "resolved_by_id",
  "resolved_by_name",
  "unresolved",
  "snapshot"
]);
var MealItem = external_exports.object({
  foodId: external_exports.string().uuid().nullable().optional(),
  name: external_exports.string().min(1),
  qtyGrams: external_exports.number().min(0).optional(),
  portionLabel: external_exports.string().optional(),
  // ex: "1 colher de sopa", "1 unidade média"
  substitution: external_exports.string().optional(),
  /** Como o item foi ligado à base alimentar (preenchido pelo nutritionEngine). */
  resolutionStatus: ResolutionStatus.optional(),
  /** Valores congelados na publicação — não recalculados em silêncio. */
  nutritionSnapshot: NutritionSnapshot.optional(),
  /** Quantidade ajustada manualmente pelo treinador. */
  manualLocked: external_exports.boolean().optional(),
  macros: Macros
});
var Meal = external_exports.object({
  id: external_exports.string(),
  name: external_exports.string(),
  time: external_exports.string().optional(),
  // "07:00"
  order: external_exports.number().int().min(0),
  items: external_exports.array(MealItem),
  totals: Macros,
  notes: external_exports.string().optional()
});
var DietDay = external_exports.object({
  label: external_exports.string(),
  // "Padrão" | "Segunda" | "Treino" | "Off"
  weekday: Weekday.optional(),
  carbBias: external_exports.enum(["low", "normal", "high"]).optional(),
  trainingDay: external_exports.boolean().optional(),
  meals: external_exports.array(Meal),
  totals: Macros
});
var ValidationIssue = external_exports.object({
  code: external_exports.string(),
  message: external_exports.string(),
  severity: external_exports.enum(["info", "warning", "error"]),
  path: external_exports.string().optional()
});
var ValidationReport = external_exports.object({
  status: external_exports.enum(["ok", "warning", "invalid"]),
  kcalDelta: external_exports.number(),
  macroDeltas: external_exports.object({
    p: external_exports.number(),
    c: external_exports.number(),
    g: external_exports.number()
  }),
  issues: external_exports.array(ValidationIssue),
  recomputedAt: external_exports.string()
  // ISO timestamp
});
var DietPlanMeta = external_exports.object({
  version: external_exports.string().default(DIET_PLAN_SCHEMA_VERSION),
  generatedAt: external_exports.string().optional(),
  model: external_exports.string().optional(),
  objective: DietObjective.optional(),
  strategy: DietStrategy.optional(),
  style: DietStyle.optional(),
  phase: external_exports.string().optional(),
  mealCount: external_exports.number().int().min(1).max(10).optional(),
  restrictions: external_exports.array(external_exports.string()).optional(),
  preferences: external_exports.array(external_exports.string()).optional(),
  trainingAware: external_exports.boolean().optional(),
  decision: external_exports.enum(["manter", "ajustar", "nova", "pedir_dados"]).optional(),
  confidence: external_exports.number().min(0).max(100).optional(),
  rationale: external_exports.string().optional(),
  /** Versão do motor de nutrição que calculou este plano. */
  nutritionEngineVersion: external_exports.string().optional(),
  /** Versão do formato dos snapshots gravados nos itens. */
  nutritionSnapshotVersion: external_exports.string().optional(),
  /** Versão do contrato {foodId, qtyGrams} usado pela IA. */
  foodContractVersion: external_exports.string().optional(),
  /** FASE 6 — preenchidos SOMENTE pelo RPC de publicação (nunca pela IA). */
  publishedAt: external_exports.string().optional(),
  publishedBy: external_exports.string().optional(),
  publicationRevision: external_exports.number().optional()
});
var DietPlan = external_exports.object({
  meta: DietPlanMeta,
  targets: DietTargets,
  trainingContext: TrainingContext.optional(),
  days: external_exports.array(DietDay).min(1),
  tips: external_exports.array(external_exports.string()).optional(),
  notes: external_exports.array(external_exports.string()).optional(),
  whatsappMessages: external_exports.array(external_exports.string()).optional(),
  validation: ValidationReport.optional()
});
var parseDietPlanStrict = (raw) => DietPlan.safeParse(raw);
var parseDietPlanLoose = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const parsed = DietPlan.safeParse(raw);
  if (parsed.success) return parsed.data;
  return null;
};

// src/lib/dietValidation.ts
var ZERO = { kcal: 0, p: 0, c: 0, g: 0 };
var round = (n, decimals = 1) => {
  if (!Number.isFinite(n)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
};
var sumMacros = (a, b) => ({
  kcal: a.kcal + b.kcal,
  p: a.p + b.p,
  c: a.c + b.c,
  g: a.g + b.g
});
var roundMacros = (m) => ({
  kcal: round(m.kcal, 0),
  p: round(m.p, 1),
  c: round(m.c, 1),
  g: round(m.g, 1)
});
var itemMacrosLookConsistent = (item) => {
  const calc = item.macros.p * 4 + item.macros.c * 4 + item.macros.g * 9;
  if (item.macros.kcal <= 0 && calc <= 0) return true;
  if (item.macros.kcal <= 0) return false;
  const ratio = calc / item.macros.kcal;
  return ratio > 0.78 && ratio < 1.22;
};
var recomputePlanTotals = (plan) => {
  const days = plan.days.map((day) => {
    const meals = day.meals.map((meal) => {
      const totals = roundMacros(meal.items.reduce((acc, it) => sumMacros(acc, it.macros), ZERO));
      return { ...meal, totals };
    });
    const dayTotals = roundMacros(meals.reduce((acc, m) => sumMacros(acc, m.totals), ZERO));
    return { ...day, meals, totals: dayTotals };
  });
  return { ...plan, days };
};
var KCAL_WARN_PCT = 0.05;
var KCAL_ERR_PCT = 0.12;
var MACRO_WARN_G = 10;
var MACRO_WARN_PCT = 0.15;
var MACRO_ERR_PCT = 0.3;
var classifyDelta = (delta, targetValue, warnAbs) => {
  const pct = targetValue > 0 ? Math.abs(delta) / targetValue : 0;
  if (pct >= MACRO_ERR_PCT) return "error";
  if (Math.abs(delta) >= warnAbs || pct >= MACRO_WARN_PCT) return "warning";
  return null;
};
var validateDietPlan = (inputPlan, targets) => {
  const plan = recomputePlanTotals(inputPlan);
  const t = targets ?? plan.targets;
  const issues = [];
  const referenceDays = plan.meta.strategy === "carb_cycle" ? plan.days.filter((d) => d.trainingDay || d.carbBias === "high") : [plan.days[0]];
  const baseline = referenceDays.length > 0 ? referenceDays : plan.days;
  const avg = baseline.reduce((acc, d) => sumMacros(acc, d.totals), ZERO);
  const avgKcal = avg.kcal / baseline.length;
  const avgP = avg.p / baseline.length;
  const avgC = avg.c / baseline.length;
  const avgG = avg.g / baseline.length;
  const kcalDelta = round(avgKcal - t.kcal, 0);
  const macroDeltas = {
    p: round(avgP - t.p, 1),
    c: round(avgC - t.c, 1),
    g: round(avgG - t.g, 1)
  };
  if (t.kcal > 0) {
    const pct = Math.abs(kcalDelta) / t.kcal;
    if (pct >= KCAL_ERR_PCT) {
      issues.push({
        code: "kcal_off",
        severity: "error",
        message: `Calorias fora da meta: ${kcalDelta > 0 ? "+" : ""}${kcalDelta} kcal (${Math.round(pct * 100)}%)`
      });
    } else if (pct >= KCAL_WARN_PCT) {
      issues.push({
        code: "kcal_off",
        severity: "warning",
        message: `Calorias acima da toler\xE2ncia: ${kcalDelta > 0 ? "+" : ""}${kcalDelta} kcal (${Math.round(pct * 100)}%)`
      });
    }
  }
  const macroChecks = [
    ["p", t.p, "Prote\xEDna"],
    ["c", t.c, "Carboidrato"],
    ["g", t.g, "Gordura"]
  ];
  for (const [key, targetValue, label] of macroChecks) {
    const delta = macroDeltas[key];
    const sev = classifyDelta(delta, targetValue, MACRO_WARN_G);
    if (sev) {
      issues.push({
        code: `macro_${key}_off`,
        severity: sev,
        message: `${label} fora da meta: ${delta > 0 ? "+" : ""}${delta} g (meta ${Math.round(targetValue)} g)`
      });
    }
  }
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const item of meal.items) {
        if (!itemMacrosLookConsistent(item)) {
          issues.push({
            code: "item_macros_inconsistent",
            severity: "warning",
            message: `Macros incoerentes em "${item.name}" (${day.label} \xB7 ${meal.name})`,
            path: `${day.label}/${meal.name}/${item.name}`
          });
        }
      }
    }
  }
  if (plan.meta.strategy === "carb_cycle" && plan.days.length > 1) {
    const carbs = plan.days.map((d) => d.totals.c);
    const min = Math.min(...carbs);
    const max = Math.max(...carbs);
    if (max <= 0 || (max - min) / max < 0.15) {
      issues.push({
        code: "carb_cycle_flat",
        severity: "warning",
        message: "Ciclagem de carboidratos pouco evidente entre os dias (<15% de varia\xE7\xE3o)."
      });
    }
  }
  const status = issues.some((i) => i.severity === "error") ? "invalid" : issues.some((i) => i.severity === "warning") ? "warning" : "ok";
  return {
    status,
    kcalDelta,
    macroDeltas,
    issues,
    recomputedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
};
var finalizeDietPlan = (plan, targets) => {
  const recomputed = recomputePlanTotals(plan);
  const validation = validateDietPlan(recomputed, targets);
  return { ...recomputed, validation };
};

// src/lib/dailyAdjustments.ts
function buildRequestedFromSchedule(schedule) {
  const base = Math.round(schedule.base_daily_kcal);
  const out = {};
  for (const wd of ENERGY_WEEKDAYS) {
    const target = computeDayTarget(schedule.days[wd]);
    out[wd] = {
      target_kcal: target,
      requested_adjustment_kcal: target - base
    };
  }
  return out;
}
function sanitizeInstruction(raw) {
  if (!raw || typeof raw !== "object") return null;
  const action = raw.action === "remove" ? "remove" : raw.action === "add" ? "add" : null;
  if (!action) return null;
  const food_name = typeof raw.food_name === "string" ? raw.food_name.trim() : "";
  if (!food_name) return null;
  const quantity = Number(raw.quantity);
  const estimated_kcal = Number(raw.estimated_kcal);
  const unit = typeof raw.unit === "string" ? raw.unit.trim() : "g";
  const food_id = typeof raw.food_id === "string" ? raw.food_id.trim() : "";
  return {
    action,
    food_id,
    food_name,
    quantity: Number.isFinite(quantity) ? Math.round(quantity) : 0,
    unit: unit || "g",
    estimated_kcal: Number.isFinite(estimated_kcal) ? Math.round(estimated_kcal) : 0
  };
}
function normalizeDailyAdjustments(modelAdjustments, schedule) {
  const requested = buildRequestedFromSchedule(schedule);
  const raw = modelAdjustments && typeof modelAdjustments === "object" ? modelAdjustments : {};
  const out = {};
  const missing = [];
  for (const wd of ENERGY_WEEKDAYS) {
    const req = requested[wd];
    const modelDay = raw[wd];
    if (!modelDay || typeof modelDay !== "object") {
      if (req.requested_adjustment_kcal !== 0) {
        missing.push(wd);
        out[wd] = {
          target_kcal: req.target_kcal,
          requested_adjustment_kcal: req.requested_adjustment_kcal,
          estimated_adjustment_kcal: 0,
          model_estimated_adjustment_kcal: 0,
          status: "adjusted",
          instructions: [],
          summary: ""
        };
      } else {
        out[wd] = {
          target_kcal: req.target_kcal,
          requested_adjustment_kcal: 0,
          estimated_adjustment_kcal: 0,
          model_estimated_adjustment_kcal: 0,
          status: "base",
          instructions: [],
          summary: "Manter plano base",
          validation_status: "base_day"
        };
      }
      continue;
    }
    const estRaw = Number(modelDay.estimated_adjustment_kcal);
    const isBaseDay = req.requested_adjustment_kcal === 0;
    const rawInstructions = Array.isArray(modelDay.instructions) ? modelDay.instructions : [];
    const instructions = isBaseDay ? [] : rawInstructions.map(sanitizeInstruction).filter((x) => x !== null);
    const serverEstimated = isBaseDay ? 0 : instructions.reduce((acc, inst) => {
      const kcal = Math.abs(inst.estimated_kcal);
      return acc + (inst.action === "add" ? kcal : -kcal);
    }, 0);
    out[wd] = {
      target_kcal: req.target_kcal,
      requested_adjustment_kcal: req.requested_adjustment_kcal,
      estimated_adjustment_kcal: serverEstimated,
      model_estimated_adjustment_kcal: Number.isFinite(estRaw) ? Math.round(estRaw) : 0,
      status: isBaseDay ? "base" : "adjusted",
      instructions,
      summary: typeof modelDay.summary === "string" ? modelDay.summary.slice(0, 500) : ""
    };
  }
  return { adjustments: out, missing };
}
function validateDailyAdjustments(adj, missing = []) {
  const errors = [];
  if (!adj) {
    return { ok: false, errors: ["dailyAdjustments ausente."] };
  }
  for (const wd of missing) {
    errors.push(`${WEEKDAY_LABELS[wd]}: dia ausente na resposta do modelo.`);
  }
  for (const wd of ENERGY_WEEKDAYS) {
    const d = adj[wd];
    if (!d) {
      errors.push(`${WEEKDAY_LABELS[wd]}: dia ausente.`);
      continue;
    }
    const req = d.requested_adjustment_kcal;
    if (req === 0) {
      if (d.status !== "base") {
        errors.push(`${WEEKDAY_LABELS[wd]}: status inv\xE1lido para dia base (${d.status}).`);
      }
      if (d.instructions.length > 0) {
        errors.push(`${WEEKDAY_LABELS[wd]}: dia base n\xE3o pode ter instru\xE7\xF5es.`);
      }
      if (d.estimated_adjustment_kcal !== 0) {
        errors.push(`${WEEKDAY_LABELS[wd]}: dia base deve ter estimated_adjustment_kcal = 0.`);
      }
    } else {
      if (d.status !== "adjusted") {
        errors.push(`${WEEKDAY_LABELS[wd]}: status inv\xE1lido para dia ajustado (${d.status}).`);
      }
      if (d.instructions.length === 0) {
        errors.push(`${WEEKDAY_LABELS[wd]}: dia ajustado precisa de pelo menos uma instru\xE7\xE3o.`);
      } else {
        const expectedAction = req > 0 ? "add" : "remove";
        for (const inst of d.instructions) {
          if (!inst.food_id) {
            errors.push(`${WEEKDAY_LABELS[wd]}: instru\xE7\xE3o sem food_id ("${inst.food_name}").`);
            break;
          }
          if (inst.action !== expectedAction) {
            errors.push(
              `${WEEKDAY_LABELS[wd]}: instru\xE7\xE3o com action="${inst.action}" incompat\xEDvel com ajuste ${req > 0 ? "positivo" : "negativo"}.`
            );
            break;
          }
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
var TOLERANCE_TEXT = {
  within_tolerance: "Dentro da toler\xE2ncia",
  outside_tolerance: "Fora da toler\xE2ncia \u2014 regere ou edite manualmente",
  base_day: "Manter plano base",
  missing_data: "Dados de ajuste ausentes"
};
var TOLERANCE_KCAL = 75;
function evaluateTolerance(requested_adjustment_kcal, estimated_adjustment_kcal) {
  if (estimated_adjustment_kcal == null || !Number.isFinite(estimated_adjustment_kcal)) {
    return { state: "missing_data", tolerance_kcal: 0, difference_kcal: 0 };
  }
  if (requested_adjustment_kcal === 0) {
    return { state: "base_day", tolerance_kcal: 0, difference_kcal: estimated_adjustment_kcal };
  }
  const tolerance = TOLERANCE_KCAL;
  const diff = estimated_adjustment_kcal - requested_adjustment_kcal;
  return {
    state: Math.abs(diff) <= tolerance ? "within_tolerance" : "outside_tolerance",
    tolerance_kcal: tolerance,
    difference_kcal: diff
  };
}

// src/lib/officeWizard/dietaWizard.ts
var BASE_SOURCE_LABELS = {
  automatic: "C\xE1lculo autom\xE1tico",
  manual: "Manual"
};
var emptyCalculationSnapshot = () => ({
  bmr: null,
  activity_factor: null,
  tdee: null,
  strategy_percent: null,
  formula: null
});
var parsePositiveNumber = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
var calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const time = new Date(String(birthDate)).getTime();
  if (!Number.isFinite(time)) return null;
  const age = Math.floor((Date.now() - time) / (365.25 * 24 * 60 * 60 * 1e3));
  return age > 0 ? age : null;
};
var normalizeSex = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["masculino", "m", "male", "homem"].includes(normalized)) return "masculino";
  if (["feminino", "f", "female", "mulher"].includes(normalized)) return "feminino";
  return null;
};
var ACTIVITY_LEVELS = [
  { value: "1.2", factor: 1.2, label: "Sedent\xE1rio", desc: "Rotina parada, quase sem deslocamento" },
  { value: "1.3", factor: 1.3, label: "Super Leve", desc: "Trabalho sentado, pouca caminhada e rotina pouco ativa" },
  { value: "1.375", factor: 1.375, label: "Leve", desc: "Alguma caminhada ou rotina di\xE1ria levemente ativa" },
  { value: "1.55", factor: 1.55, label: "Moderado", desc: "Rotina ativa ou trabalho com movimenta\xE7\xE3o frequente" },
  { value: "1.725", factor: 1.725, label: "Alto", desc: "Trabalho f\xEDsico ou rotina di\xE1ria muito ativa" },
  { value: "1.9", factor: 1.9, label: "Extremo", desc: "Atividade f\xEDsica profissional ou trabalho f\xEDsico muito intenso" }
];
var STRATEGIES = [
  { value: "deficit_leve", label: "D\xE9ficit Leve (-10%)", desc: "Emagrecimento gradual, preserva massa", pct: -10 },
  { value: "deficit_moderado", label: "D\xE9ficit Moderado (-20%)", desc: "Emagrecimento acelerado", pct: -20 },
  { value: "deficit_agressivo", label: "D\xE9ficit Agressivo (-30%)", desc: "Perda r\xE1pida, mais restritivo", pct: -30 },
  { value: "manutencao", label: "Manuten\xE7\xE3o (0%)", desc: "Manter peso e composi\xE7\xE3o", pct: 0 },
  { value: "superavit_leve", label: "Super\xE1vit Leve (+10%)", desc: "Lean bulk \u2014 ganho limpo", pct: 10 },
  { value: "superavit_moderado", label: "Super\xE1vit Moderado (+20%)", desc: "Bulk agressivo", pct: 20 }
];
var MEAL_COUNTS = [
  { value: "4", label: "4 refei\xE7\xF5es" },
  { value: "5", label: "5 refei\xE7\xF5es" },
  { value: "6", label: "6 refei\xE7\xF5es" },
  { value: "7", label: "7 refei\xE7\xF5es" }
];
var DIET_STYLES = [
  { value: "flexivel", label: "Flex\xEDvel (IIFYM)", desc: "Foco nos macros, liberdade de escolha dos alimentos" },
  { value: "low_carb", label: "Low Carb", desc: "Redu\xE7\xE3o significativa de carboidratos" },
  { value: "cetogenica", label: "Cetog\xEAnica", desc: "Ultra low carb, alto em gorduras" },
  { value: "mediterranea", label: "Mediterr\xE2nea", desc: "Baseada em azeite, peixes, gr\xE3os integrais" },
  { value: "paleolitica", label: "Paleol\xEDtica", desc: "Alimentos naturais, sem processados" },
  { value: "vegetariana", label: "Vegetariana", desc: "Sem carnes, permite ovos/latic\xEDnios" },
  { value: "vegana", label: "Vegana", desc: "Sem alimentos de origem animal" },
  { value: "convencional", label: "Convencional", desc: "Dieta tradicional balanceada" }
];
var PHASES = [
  { value: "bulking", label: "Bulking", desc: "Fase de ganho de massa" },
  { value: "cutting", label: "Cutting", desc: "Fase de defini\xE7\xE3o" },
  { value: "manutencao", label: "Manuten\xE7\xE3o", desc: "Manter composi\xE7\xE3o corporal" },
  { value: "recomposicao", label: "Recomposi\xE7\xE3o", desc: "Perder gordura e ganhar massa simultaneamente" },
  { value: "pre_contest", label: "Pr\xE9-Contest", desc: "Prepara\xE7\xE3o para competi\xE7\xE3o" }
];
var TRAINING_TIMES = [
  { value: "manha_jejum", label: "Manh\xE3 (jejum)" },
  { value: "manha", label: "Manh\xE3" },
  { value: "tarde", label: "Tarde" },
  { value: "noite", label: "Noite" },
  { value: "madrugada", label: "Madrugada" }
];
var TRAINING_DAYS_OPTIONS = [
  { value: "3", label: "3x/semana" },
  { value: "4", label: "4x/semana" },
  { value: "5", label: "5x/semana" },
  { value: "6", label: "6x/semana" },
  { value: "7", label: "Todos os dias" }
];
var RESTRICTION_OPTIONS = [
  "Sem lactose",
  "Sem gl\xFAten",
  "Sem frutos do mar",
  "Sem carne vermelha",
  "Sem porco",
  "Vegetariano",
  "Vegano",
  "Sem ovo",
  "Sem soja",
  "Diab\xE9tico",
  "Hipertenso",
  "Intoler\xE2ncia \xE0 frutose",
  "Alergia a amendoim"
];
var PREFERENCE_OPTIONS = [
  "Frango",
  "Carne vermelha",
  "Peixe",
  "Ovos",
  "Arroz integral",
  "Batata doce",
  "Aveia",
  "Whey no shake",
  "Frutas",
  "Pasta de amendoim",
  "Iogurte",
  "Queijo cottage",
  "Tapioca",
  "Macarr\xE3o integral",
  "Abacate"
];
var PROTOCOL_ADJUSTMENTS = [
  { id: "calorie_adjust", label: "Ajuste de Calorias", desc: "Aumento ou redu\xE7\xE3o cal\xF3rica semanal" },
  { id: "carb_adjust", label: "Ajuste de Carboidrato", desc: "Manipula\xE7\xE3o de carbs por dia da semana" },
  { id: "sodium_adjust", label: "Ajuste de S\xF3dio", desc: "Protocolo de manipula\xE7\xE3o de s\xF3dio" },
  { id: "water_adjust", label: "Ajuste de \xC1gua", desc: "Protocolo de ingest\xE3o h\xEDdrica" },
  { id: "meal_change", label: "Mudan\xE7a de Refei\xE7\xF5es", desc: "Alterar n\xFAmero/distribui\xE7\xE3o de refei\xE7\xF5es" },
  { id: "plato", label: "Estrat\xE9gia para Plat\xF4", desc: "Quebrar estagna\xE7\xE3o metab\xF3lica" },
  { id: "refeed", label: "Refeed", desc: "Dias de recarga de carboidrato" },
  { id: "diet_break", label: "Diet Break", desc: "Pausa programada na dieta" },
  { id: "carb_cycling", label: "Carb Cycling", desc: "Ciclagem de carboidrato (high/medium/low)" }
];
var buildInitialMacroPreset = ({
  calories,
  weight,
  strategyValue,
  phaseValue,
  hormoneUse,
  proteinPerKgOverride,
  fatPerKgOverride
}) => {
  const isDeficit = strategyValue.includes("deficit") || phaseValue === "cutting" || phaseValue === "pre_contest";
  const isMaintenance = (phaseValue === "manutencao" || strategyValue === "manutencao") && !isDeficit;
  let proteinPerKg = isDeficit ? 2.2 : isMaintenance ? 1.8 : 2;
  const proteinMax = isDeficit ? 2.6 : isMaintenance ? 2.2 : 2.4;
  const fatPerKg = isDeficit ? 0.8 : 0.9;
  void hormoneUse;
  proteinPerKg = Math.min(proteinPerKg, proteinMax);
  const finalProteinPerKg = typeof proteinPerKgOverride === "number" && proteinPerKgOverride > 0 ? Math.min(Math.max(proteinPerKgOverride, 0.8), 3.5) : proteinPerKg;
  const finalFatPerKg = typeof fatPerKgOverride === "number" && fatPerKgOverride > 0 ? Math.min(Math.max(fatPerKgOverride, 0.3), 2) : fatPerKg;
  const proteinGrams = Math.round(finalProteinPerKg * weight);
  const fatGrams = Math.round(finalFatPerKg * weight);
  const carbGrams = Math.max(Math.round((calories - proteinGrams * 4 - fatGrams * 9) / 4), 0);
  return {
    proteinPerKg: finalProteinPerKg,
    proteinGrams,
    fatPerKg: finalFatPerKg,
    fatGrams,
    carbGrams
  };
};
var WEEKDAY_KEY_PATTERNS = [
  ["seg", /\bseg(?:unda)?\b/i],
  ["ter", /\bter(?:ça|ca)?\b/i],
  ["qua", /\bqua(?:rta)?\b/i],
  ["qui", /\bqui(?:nta)?\b/i],
  ["sex", /\bsex(?:ta)?\b/i],
  ["sab", /\bs[áa]b(?:ado)?\b/i],
  ["dom", /\bdom(?:ingo)?\b/i]
];
var MUSCLE_KEYWORDS = [
  ["peito", /\bpeito|peitoral|supino|crossover|crucifix/i],
  ["costas", /\bcostas|dorsal|puxad|remada|pull|barra fixa/i],
  ["ombros", /\bombro|deltoid|elevaç(ão|ao)|desenvolvim/i],
  ["b\xEDceps", /\bb[íi]ceps|rosca/i],
  ["tr\xEDceps", /\btr[íi]ceps|test(a|ão)|fr(a|â)nc[eê]s|corda/i],
  ["pernas", /\bperna|quadr[íi]ceps|leg press|agachamento|passada|extensora|hack/i],
  ["posterior", /\bposterior|isquio|stiff|mesa flexora|flex(a|ão) de perna/i],
  ["gl\xFAteos", /\bgl[úu]teo|hip thrust/i],
  ["panturrilha", /\bpanturrilh|gastrocn[eê]mio|s[óo]leo/i],
  ["abd\xF4men", /\babdom(en|inal)|prancha|core/i],
  ["cardio", /\bcardio|corrida|esteira|bike|elipt/i]
];
function parseWeekdayWorkouts(md) {
  try {
    const sections = parseTrainingSections(md);
    const result = {};
    for (const section of sections) {
      if (section.type !== "training" || !section.days) continue;
      for (const trainingDay of section.days) {
        const rawTitle = (trainingDay.day || "").trim();
        if (!rawTitle) continue;
        const match = WEEKDAY_KEY_PATTERNS.find(([, re]) => re.test(rawTitle));
        if (!match) continue;
        const [weekday, wdRe] = match;
        const afterSeparator = rawTitle.replace(wdRe, "").replace(/^[\s–—:\-]+/, "").trim();
        const label = afterSeparator || rawTitle;
        const exList = Array.isArray(trainingDay.exercises) ? trainingDay.exercises : [];
        const isRest = /\bdescanso|off\b/i.test(rawTitle) || exList.length === 0;
        const musclesSet = /* @__PURE__ */ new Set();
        const haystack = [rawTitle, ...exList.map((e) => e.exercise || "")].join(" | ");
        for (const [muscle, re] of MUSCLE_KEYWORDS) {
          if (re.test(haystack)) musclesSet.add(muscle);
        }
        if (!result[weekday]) {
          result[weekday] = {
            label: isRest ? "Descanso" : label,
            type: isRest ? "rest" : null,
            muscles: Array.from(musclesSet)
          };
        }
      }
    }
    return result;
  } catch (e) {
    console.warn("parseWeekdayWorkouts failed", e);
    return {};
  }
}
var emptyScheduleAdjustments = () => ({
  seg: { adjustment_kcal: 0, fixed_kcal: null },
  ter: { adjustment_kcal: 0, fixed_kcal: null },
  qua: { adjustment_kcal: 0, fixed_kcal: null },
  qui: { adjustment_kcal: 0, fixed_kcal: null },
  sex: { adjustment_kcal: 0, fixed_kcal: null },
  sab: { adjustment_kcal: 0, fixed_kcal: null },
  dom: { adjustment_kcal: 0, fixed_kcal: null }
});
var defaultDietaWizardState = () => ({
  dailyRoutine: "",
  trainingTime: "",
  trainingDays: "",
  dietStyle: "",
  phase: "",
  usesHormones: null,
  hormoneDetails: "",
  activityLevel: "",
  strategy: "",
  mealCount: "",
  selectedRestrictions: [],
  customRestriction: "",
  selectedPreferences: [],
  customPreference: "",
  selectedAdjustments: [],
  enableFitoterapia: false,
  enableSuplementos: false,
  enableEmagrecimentoRapido: false,
  enableJejumIntermitente: false,
  substitutions: [],
  modelDiet: "",
  variationIntensity: DEFAULT_INTENSITY,
  baseKcalMode: "automatic",
  manualBaseKcalInput: "",
  manualFormula: null,
  proteinPerKgOverride: null,
  fatPerKgOverride: null,
  scheduleAdjustments: emptyScheduleAdjustments()
});
var dietRestrictionsText = (s) => {
  const parts = [...s.selectedRestrictions];
  if (s.customRestriction.trim()) parts.push(s.customRestriction.trim());
  return parts.join(", ");
};
var dietPreferencesText = (s) => {
  const parts = [...s.selectedPreferences];
  if (s.customPreference.trim()) parts.push(s.customPreference.trim());
  return parts.join(", ");
};
function computeEnergySelection(studentCtx, manualFormula) {
  const weight = parsePositiveNumber(studentCtx?.peso);
  const height = parsePositiveNumber(studentCtx?.altura);
  const age = calculateAge(studentCtx?.data_nascimento);
  const sex = normalizeSex(studentCtx?.sexo);
  if (!weight || !height || !age) return null;
  return selectEnergyFormula({
    sex: sex === "masculino" ? "male" : sex === "feminino" ? "female" : null,
    weightKg: weight,
    heightCm: height,
    ageYears: age,
    bodyFatPct: parsePositiveNumber(studentCtx?.percentual_gordura),
    leanMass: {
      kg: parsePositiveNumber(studentCtx?.massa_magra),
      measuredAt: studentCtx?.massa_magra_data ?? null,
      source: studentCtx?.massa_magra_origem ?? "Composi\xE7\xE3o corporal mais recente"
    },
    manualFormula
  });
}
function computeAutomaticBaseKcal(studentCtx, activityLevel, strategy, phase, energySelection) {
  const missing = [];
  const weight = parsePositiveNumber(studentCtx?.peso);
  const height = parsePositiveNumber(studentCtx?.altura);
  const age = calculateAge(studentCtx?.data_nascimento);
  const sex = normalizeSex(studentCtx?.sexo);
  const activityFactor = parsePositiveNumber(activityLevel);
  const selectedStrategy = STRATEGIES.find((s) => s.value === strategy);
  const selectedPhase = PHASES.find((p) => p.value === phase);
  if (!weight) missing.push("peso");
  if (!height) missing.push("altura");
  if (!age) missing.push("idade");
  if (!sex) missing.push("sexo");
  if (!activityFactor) missing.push("n\xEDvel de atividade");
  if (!selectedPhase) missing.push("fase");
  if (!selectedStrategy) missing.push("estrat\xE9gia");
  if (missing.length > 0 || !weight || !height || !age || !sex || !activityFactor || !selectedPhase || !selectedStrategy) {
    return { source: "automatic", base_daily_kcal: null, calculation: emptyCalculationSnapshot(), missing };
  }
  if (!energySelection || energySelection.insufficientData) {
    return {
      source: "automatic",
      base_daily_kcal: null,
      calculation: emptyCalculationSnapshot(),
      missing: energySelection?.insufficientData ? ["sexo biol\xF3gico ou massa magra v\xE1lida"] : ["dados corporais"]
    };
  }
  const formula = ENERGY_FORMULA_LABEL[energySelection.formula];
  const roundedBmr = Math.round(energySelection.bmr);
  const tdee = Math.round(roundedBmr * activityFactor);
  const strategyPercent = selectedStrategy.pct;
  const base = Math.round(tdee * (1 + strategyPercent / 100));
  return {
    source: "automatic",
    base_daily_kcal: base,
    calculation: { bmr: roundedBmr, activity_factor: activityFactor, tdee, strategy_percent: strategyPercent, formula },
    missing: []
  };
}
var parseManualBaseKcal = (manualBaseKcalInput) => {
  const parsed = parsePositiveNumber(manualBaseKcalInput);
  return parsed == null ? null : Math.round(parsed);
};
function resolveBaseKcal(baseKcalMode, manualBaseKcal, automatic) {
  if (baseKcalMode === "manual") {
    return {
      source: "manual",
      base_daily_kcal: manualBaseKcal,
      calculation: emptyCalculationSnapshot(),
      missing: manualBaseKcal == null ? ["meta cal\xF3rica base manual"] : []
    };
  }
  return automatic;
}
function computeBaseKcalIssues(baseKcal, baseKcalMode, automatic) {
  const issues = [];
  if (baseKcal.source !== "automatic" && baseKcal.source !== "manual") issues.push("Origem da meta cal\xF3rica base inv\xE1lida.");
  if (baseKcal.base_daily_kcal == null) {
    issues.push("Meta cal\xF3rica base ausente.");
  } else if (!Number.isFinite(baseKcal.base_daily_kcal) || baseKcal.base_daily_kcal <= 0) {
    issues.push("Meta cal\xF3rica base inv\xE1lida.");
  } else if (baseKcal.base_daily_kcal < MIN_DAILY_KCAL) {
    issues.push(`Meta cal\xF3rica base abaixo do m\xEDnimo permitido (${MIN_DAILY_KCAL} kcal).`);
  }
  if (baseKcalMode === "automatic" && automatic.missing.length > 0) {
    issues.push(`Dados ausentes para c\xE1lculo autom\xE1tico: ${automatic.missing.join(", ")}.`);
  }
  return issues;
}
var computeMacroBody = (studentCtx) => ({
  weightKg: parsePositiveNumber(studentCtx?.peso) ?? 0,
  leanMassKg: parsePositiveNumber(studentCtx?.massa_magra)
});
function applyMacroPreset(prev, p) {
  const preset = buildInitialMacroPreset({
    calories: p.baseKcal ?? 2e3,
    weight: p.body.weightKg,
    strategyValue: p.strategy,
    phaseValue: p.phase,
    hormoneUse: false,
    proteinPerKgOverride: p.proteinPerKgOverride,
    fatPerKgOverride: p.fatPerKgOverride
  });
  return {
    ...prev,
    protein: setMacroPerKg({ ...prev.protein, locked: true }, preset.proteinPerKg, p.body),
    fat: setMacroPerKg({ ...prev.fat, locked: true }, preset.fatPerKg, p.body),
    carbs: { ...prev.carbs, perKg: null, grams: null, locked: false }
  };
}
var computeCanonicalTargets = (baseKcal, macroResolution) => ({
  kcal: baseKcal.base_daily_kcal ?? 0,
  p: Math.round(macroResolution.grams?.protein ?? 0),
  c: Math.round(macroResolution.grams?.carbs ?? 0),
  g: Math.round(macroResolution.grams?.fat ?? 0)
});
function computeWeeklySchedule(baseKcal, baseKcalIssuesCount, workoutByWeekday, scheduleAdjustments) {
  if (baseKcal.base_daily_kcal == null || baseKcalIssuesCount > 0) return null;
  const draft = buildDefaultSchedule({
    baseDailyKcal: baseKcal.base_daily_kcal,
    workoutByWeekday,
    baseSource: baseKcal.source,
    calculationSnapshot: baseKcal.calculation
  });
  for (const wd of ENERGY_WEEKDAYS) {
    const adj = scheduleAdjustments[wd];
    draft.days[wd].adjustment_kcal = adj.adjustment_kcal;
    draft.days[wd].fixed_kcal = adj.fixed_kcal;
  }
  return draft;
}
function suggestCarbAssignments(prev, workoutByWeekday) {
  let changed = false;
  const assignments = { ...prev.assignments };
  for (const wd of WEEKDAY_KEYS) {
    if (prev.manual[wd]) continue;
    const suggestion = suggestCarbDayTypeForWorkout(workoutByWeekday[wd] ?? null);
    if (assignments[wd] !== suggestion) {
      assignments[wd] = suggestion;
      changed = true;
    }
  }
  return changed ? { ...prev, assignments } : prev;
}
function deriveDietaWizard(state, studentCtx, workoutByWeekday) {
  const energySelection = computeEnergySelection(studentCtx, state.manualFormula);
  const automaticBaseKcal = computeAutomaticBaseKcal(studentCtx, state.activityLevel, state.strategy, state.phase, energySelection);
  const baseKcal = resolveBaseKcal(state.baseKcalMode, parseManualBaseKcal(state.manualBaseKcalInput), automaticBaseKcal);
  const baseKcalIssues = computeBaseKcalIssues(baseKcal, state.baseKcalMode, automaticBaseKcal);
  const macroBody = computeMacroBody(studentCtx);
  const closingMacro = null;
  const macroConfig = macroBody.weightKg ? applyMacroPreset(defaultMacroConfig(), {
    baseKcal: baseKcal.base_daily_kcal,
    body: macroBody,
    strategy: state.strategy,
    phase: state.phase,
    proteinPerKgOverride: state.proteinPerKgOverride,
    fatPerKgOverride: state.fatPerKgOverride
  }) : defaultMacroConfig();
  const macroResolution = resolveMacroConfig({ kcalTarget: baseKcal.base_daily_kcal ?? 0, config: macroConfig, body: macroBody, closingMacro });
  const canonicalTargets = computeCanonicalTargets(baseKcal, macroResolution);
  const carbCycling = suggestCarbAssignments(
    { ...defaultCarbCyclingConfig(), enabled: state.selectedAdjustments.includes("carb_cycling") },
    workoutByWeekday
  );
  const carbTypeTargets = buildCarbDayTypeTargets({
    mode: carbCycling.mode,
    carbCycling,
    macroConfig,
    body: macroBody,
    baseKcal: baseKcal.base_daily_kcal ?? 0,
    closingMacro,
    baseResolvedMacros: macroResolution.grams ? { p: canonicalTargets.p, c: canonicalTargets.c, g: canonicalTargets.g } : null
  });
  const weeklyCarbTargets = carbCycling.enabled ? buildWeeklyCarbTargets(carbCycling, carbTypeTargets) : {};
  const weeklySchedule = computeWeeklySchedule(baseKcal, baseKcalIssues.length, workoutByWeekday, state.scheduleAdjustments);
  const carbCyclingValidity = isCarbCyclingValid(carbCycling, carbTypeTargets, weeklyCarbTargets);
  const scheduleIssues = weeklySchedule ? validateSchedule(weeklySchedule) : ["Cronograma semanal indispon\xEDvel."];
  const canGenerate = Boolean(
    state.activityLevel && state.strategy && state.mealCount && state.phase && weeklySchedule && baseKcalIssues.length === 0 && macroResolution.status === "ok" && carbCyclingValidity.valid
  );
  return {
    energySelection,
    automaticBaseKcal,
    baseKcal,
    baseKcalIssues,
    macroBody,
    macroConfig,
    macroResolution,
    canonicalTargets,
    carbCycling,
    carbTypeTargets,
    weeklyCarbTargets,
    weeklySchedule,
    carbCyclingValidity,
    scheduleIssues,
    canGenerate
  };
}
function buildDietGenerationPrompts(input) {
  const { state, studentCtx, baseKcal, macroConfig, macroResolution, macroBody, canonicalTargets, carbCycling, weeklyCarbTargets, weeklySchedule } = input;
  const {
    dailyRoutine,
    trainingTime,
    trainingDays,
    dietStyle,
    phase,
    usesHormones,
    hormoneDetails,
    activityLevel,
    strategy,
    mealCount,
    selectedRestrictions,
    selectedPreferences,
    selectedAdjustments,
    enableFitoterapia,
    enableSuplementos,
    enableEmagrecimentoRapido,
    enableJejumIntermitente,
    substitutions,
    modelDiet
  } = state;
  const getRestrictionsText = () => dietRestrictionsText(state);
  const getPreferencesText = () => dietPreferencesText(state);
  const selectedStrategy = STRATEGIES.find((s) => s.value === strategy);
  const selectedActivity = ACTIVITY_LEVELS.find((a) => a.value === activityLevel);
  const selectedPhase = PHASES.find((p) => p.value === phase);
  const selectedTrainingTime = TRAINING_TIMES.find((t) => t.value === trainingTime);
  const selectedDietStyle = DIET_STYLES.find((d) => d.value === dietStyle);
  const adjustmentLabels = selectedAdjustments.map((id) => PROTOCOL_ADJUSTMENTS.find((a) => a.id === id)?.label).filter(Boolean);
  const getMealNames = (count) => {
    const base = ["Caf\xE9 da Manh\xE3", "Almo\xE7o", "Lanche da Tarde", "Jantar"];
    if (count <= 4) return base.slice(0, count);
    const extra = ["P\xF3s-Treino", "Ceia", "Lanche da Manh\xE3"];
    return [...base, ...extra.slice(0, count - 4)];
  };
  const mealNames = getMealNames(Number(mealCount));
  let alimentosPorRefeicaoText = "";
  if (studentCtx.questionario_dieta?.alimentos_por_refeicao) {
    const apr = studentCtx.questionario_dieta.alimentos_por_refeicao;
    if (typeof apr === "object" && apr !== null) {
      const entries = Object.entries(apr).filter(([, v]) => v && String(v).trim());
      if (entries.length > 0) {
        alimentosPorRefeicaoText = `
=== ALIMENTOS POR REFEI\xC7\xC3O (informados pelo aluno na ficha) ===
${entries.map(([k, v]) => `- ${k}: ${v}`).join("\n")}
IMPORTANTE: Respeite esses alimentos nas refei\xE7\xF5es correspondentes.
`;
      }
    }
  }
  const observationsList = [
    dailyRoutine && `Observa\xE7\xF5es digitadas no wizard: ${dailyRoutine}`,
    studentCtx.observacoes && `Observa\xE7\xF5es do perfil do aluno: ${studentCtx.observacoes}`,
    studentCtx.anamnese?.rotina && `Rotina registrada na anamnese: ${studentCtx.anamnese.rotina}`,
    studentCtx.questionario_dieta?.observacoes && `Observa\xE7\xF5es do question\xE1rio: ${studentCtx.questionario_dieta.observacoes}`,
    studentCtx.questionario_dieta?.como_se_sente && `Como o aluno se sente: ${studentCtx.questionario_dieta.como_se_sente}`
  ].filter(Boolean);
  const criticalInputsText = `
=== INPUTS OBRIGAT\xD3RIOS DO WIZARD E DA FICHA ===
Use TODOS os dados abaixo como prioridade m\xE1xima. N\xC3O ignore, N\xC3O substitua por suposi\xE7\xF5es e N\xC3O contradiga esses campos.
- Frequ\xEAncia de treino selecionada: ${trainingDays ? `${trainingDays}x/semana` : studentCtx.questionario_dieta?.dias_treino || "N\xE3o informada"}
- Fase atual selecionada: ${selectedPhase?.label || studentCtx.questionario_dieta?.fase_atual || "N\xE3o informada"}
- N\xEDvel de atividade f\xEDsica selecionado: ${selectedActivity?.label || "N\xE3o informado"} (FA = ${activityLevel || "n\xE3o informado"})
- Restri\xE7\xF5es alimentares obrigat\xF3rias: ${getRestrictionsText() || studentCtx.questionario_dieta?.restricoes_alimentares || studentCtx.restricoes || "Nenhuma informada"}
- Prefer\xEAncias alimentares: ${getPreferencesText() || studentCtx.questionario_dieta?.preferencias_alimentares || "N\xE3o informadas"}
- Estilo de dieta selecionado: ${selectedDietStyle?.label || studentCtx.questionario_dieta?.estilo_dieta || "N\xE3o informado"}
${observationsList.length > 0 ? observationsList.map((item) => `- ${item}`).join("\n") : "- Observa\xE7\xF5es adicionais: Nenhuma informada"}
IMPORTANTE: Se houver conflito entre uma infer\xEAncia sua e os dados acima, os dados acima vencem.
`;
  let recText = "";
  let currentTargets = null;
  const currentCalories = baseKcal.base_daily_kcal;
  const currentFA = baseKcal.calculation.activity_factor;
  const currentStrategyPct = baseKcal.calculation.strategy_percent;
  const currentGET = baseKcal.calculation.tdee;
  const currentBmr = baseKcal.calculation.bmr;
  const currentFormula = baseKcal.calculation.formula;
  const prescription = getMacroPrescription(macroConfig, macroResolution, macroBody);
  const macros = {
    proteinGrams: canonicalTargets.p,
    carbGrams: canonicalTargets.c,
    fatGrams: canonicalTargets.g,
    proteinPerKg: prescription?.protein.perKg ?? null,
    fatPerKg: prescription?.fat.perKg ?? null,
    proteinBasis: prescription?.protein.basisLabel ?? "peso corporal",
    fatBasis: prescription?.fat.basisLabel ?? "peso corporal"
  };
  currentTargets = {
    calories: currentCalories,
    protein: macros.proteinGrams,
    carbs: macros.carbGrams,
    fats: macros.fatGrams
  };
  recText = `
=== RECOMENDA\xC7\xC3O CALCULADA (VALORES OBRIGAT\xD3RIOS \u2014 N\xC3O RECALCULE) ===
- Origem da meta base: ${BASE_SOURCE_LABELS[baseKcal.source]}
- TMB: ${currentBmr ?? "n\xE3o aplicada"} kcal${currentFormula ? ` (calculado por ${currentFormula})` : ""}
- Fator de Atividade: ${currentFA ?? "n\xE3o aplicado"}
- GET: ${currentGET ?? "n\xE3o aplicado"} kcal
- Estrat\xE9gia: ${selectedStrategy?.label} (${(currentStrategyPct ?? 0) > 0 ? "+" : ""}${currentStrategyPct ?? 0}%)
- Calorias alvo EXATAS: ${currentCalories} kcal
- Prote\xEDna EXATA: ${macros.proteinGrams}g${macros.proteinPerKg ? ` (${macros.proteinPerKg} g/kg de ${macros.proteinBasis})` : ""}
- Carboidrato EXATO: ${macros.carbGrams}g
- Gordura EXATA: ${macros.fatGrams}g${macros.fatPerKg ? ` (${macros.fatPerKg} g/kg de ${macros.fatBasis})` : ""}
\u26A0\uFE0F OBRIGAT\xD3RIO: O TOTAL DI\xC1RIO da tabela DEVE ser EXATAMENTE ${currentCalories} kcal (toler\xE2ncia \xB150 kcal). Prote\xEDna total = ${macros.proteinGrams}g, Carboidrato total = ${macros.carbGrams}g, Gordura total = ${macros.fatGrams}g. N\xC3O use outros valores. N\xC3O recalcule a TMB. Estes valores j\xE1 s\xE3o definitivos.
\u26A0\uFE0F REGRA DE CORRE\xC7\xC3O: Se faltar caloria para bater a meta, ajuste CARBOIDRATO. N\xC3O aumente prote\xEDna acima de ${macros.proteinGrams}g para completar calorias.
\u26A0\uFE0F VALIDA\xC7\xC3O FINAL: Antes de responder, some alimento por alimento. A dieta s\xF3 \xE9 aceit\xE1vel se ficar entre ${currentCalories - 50} e ${currentCalories + 50} kcal, prote\xEDna entre ${macros.proteinGrams - 10} e ${macros.proteinGrams + 10}g, carboidrato entre ${macros.carbGrams - 15} e ${macros.carbGrams + 15}g e gordura entre ${macros.fatGrams - 8} e ${macros.fatGrams + 8}g.
`;
  if (carbCycling.enabled) {
    const dayLines = WEEKDAY_KEYS.map((wd) => {
      const d = weeklyCarbTargets[wd];
      if (!d) return "";
      return `${WEEKDAY_LABELS[wd].toUpperCase()} \u2014 ${d.type.toUpperCase()}
Kcal: ${d.kcal}
P: ${d.p}g
C: ${d.c}g
G: ${d.g}g`;
    }).filter(Boolean).join("\n\n");
    recText = `
=== REFER\xCANCIA METAB\xD3LICA (N\xC3O \xC9 A META DE TODOS OS DIAS) ===
- TMB: ${currentBmr ?? "n\xE3o aplicada"} kcal${currentFormula ? ` (calculado por ${currentFormula})` : ""}
- GET: ${currentGET ?? "n\xE3o aplicado"} kcal
- Meta base di\xE1ria (apenas refer\xEAncia): ${currentCalories} kcal

=== METAS DI\xC1RIAS OBRIGAT\xD3RIAS (CARB CYCLING) ===
${dayLines}

\u26A0\uFE0F Cada dia deve respeitar sua pr\xF3pria meta. N\xE3o aplicar a meta base global por cima dessas metas.
\u26A0\uFE0F N\xC3O recalcule a TMB nem os macros. Os valores acima s\xE3o definitivos (toler\xE2ncia \xB150 kcal por dia).
`;
  }
  const prompt = `Gere o plano alimentar COMPLETO para fisiculturismo com as seguintes configura\xE7\xF5es:
${criticalInputsText}
${recText}

=== ROTINA DO ALUNO ===
- Rotina di\xE1ria: ${dailyRoutine || "N\xE3o informada"}
- Hor\xE1rio de treino: ${selectedTrainingTime?.label || "N\xE3o informado"}
- Dias de treino: ${trainingDays ? `${trainingDays}x/semana` : "N\xE3o informado"}

=== ESTILO DE DIETA ===
- Estilo: ${selectedDietStyle?.label || "N\xE3o definido"} \u2014 ${selectedDietStyle?.desc || ""}
IMPORTANTE: Siga o estilo selecionado sem quebrar os macros obrigat\xF3rios. Se Low Carb/Cetog\xEAnica conflitar com a meta de carboidrato calculada, a meta calculada vence. Se Vegetariana/Vegana, respeite as restri\xE7\xF5es proteicas sem aumentar a prote\xEDna total.

=== FASE ATUAL ===
- Fase: ${selectedPhase?.label} \u2014 ${selectedPhase?.desc}
- Uso de horm\xF4nios: ${usesHormones === null ? "N\xE3o informado" : usesHormones ? `Sim \u2014 ${hormoneDetails || "detalhes n\xE3o especificados"}` : "N\xE3o (natural)"}

=== PAR\xC2METROS NUTRICIONAIS ===
- Fator de Atividade: ${selectedActivity?.label} (FA = ${activityLevel})
- Estrat\xE9gia: ${selectedStrategy?.label} (${(selectedStrategy?.pct ?? 0) > 0 ? "+" : ""}${selectedStrategy?.pct}%)
- N\xFAmero de refei\xE7\xF5es: ${mealCount} por dia
- NOMES DAS REFEI\xC7\xD5ES (use EXATAMENTE estes nomes na coluna "Refei\xE7\xE3o" da tabela): ${mealNames.join(", ")}
${getRestrictionsText() ? `- Restri\xE7\xF5es alimentares: ${getRestrictionsText()}` : ""}
${getPreferencesText() ? `- Prefer\xEAncias alimentares: ${getPreferencesText()}` : ""}
${alimentosPorRefeicaoText}
=== AJUSTES DO PROTOCOLO ===
${adjustmentLabels.length > 0 ? adjustmentLabels.map((a) => `- ${a}`).join("\n") : "- Nenhum ajuste selecionado"}

=== EXTRAS ===
${enableFitoterapia ? "- INCLUIR RECEITAS DE FITOTERAPIA: Sugira ch\xE1s, infus\xF5es e prepara\xE7\xF5es fitoter\xE1picas complementares. Inclua dosagens, hor\xE1rios e benef\xEDcios." : ""}
${enableSuplementos ? "- INCLUIR SUPLEMENTA\xC7\xC3O COMPLETA: Protocolo de suplementos com dosagem, hor\xE1rio e justificativa." : ""}
${enableEmagrecimentoRapido ? "- ESTRAT\xC9GIA DE EMAGRECIMENTO R\xC1PIDO: Estrat\xE9gias avan\xE7adas (jejum intermitente, HIIT, termog\xEAnicos)." : ""}
${enableJejumIntermitente ? "- JEJUM INTERMITENTE: Estruturar o dia alimentar respeitando a janela alimentar. Concentrar refei\xE7\xF5es na janela e indicar hor\xE1rios explicitamente. N\xE3o criar refei\xE7\xF5es fora da janela." : ""}
=== SUBSTITUI\xC7\xD5ES DE ALIMENTOS ===
OBRIGAT\xD3RIO: Para CADA alimento na tabela de refei\xE7\xF5es, a coluna "Substitui\xE7\xE3o" deve conter EXATAMENTE 3 op\xE7\xF5es de troca, cada uma com nome e quantidade (em gramas), que tenham macros e calorias equivalentes ao alimento principal.
Formato da coluna Substitui\xE7\xE3o: "1) Alimento X (Xg); 2) Alimento Y (Xg); 3) Alimento Z (Xg)"
Exemplo: "1) Batata-doce (150g); 2) Inhame (140g); 3) Mandioca (120g)"
As 3 op\xE7\xF5es devem ser alimentos DIFERENTES entre si e diferentes do alimento principal, respeitando os macros e calorias equivalentes.
${substitutions.length > 0 ? `Use PREFERENCIALMENTE os alimentos abaixo como op\xE7\xF5es de substitui\xE7\xE3o:
${substitutions.map((s) => `- ${s.food}: ${s.portion}`).join("\n")}` : ""}
${modelDiet.trim() ? `
 === DIETA MODELO (APENAS LISTA DE ALIMENTOS) ===
 IMPORTANTE: A dieta modelo serve APENAS como fonte da LISTA DE ALIMENTOS por refei\xE7\xE3o. IGNORE completamente as calorias, macros, "Estimativa" e "TOTAL DI\xC1RIO" da dieta modelo \u2014 esses valores N\xC3O devem ser copiados nem usados como refer\xEAncia. ${carbCycling.enabled ? "Use as metas espec\xEDficas de cada dia definidas no bloco METAS DI\xC1RIAS OBRIGAT\xD3RIAS \u2014 n\xE3o existe meta \xFAnica para todos os dias." : `A meta cal\xF3rica e de macros do aluno \xE9 a definida acima (${currentCalories} kcal, P=${macros.proteinGrams}g, C=${macros.carbGrams}g, G=${macros.fatGrams}g) e SEMPRE prevalece.`}
 REGRAS OBRIGAT\xD3RIAS:
 1) Use EXATAMENTE os mesmos alimentos da dieta modelo, na MESMA ordem, refei\xE7\xE3o por refei\xE7\xE3o, preservando o NOME EXATO (ex.: "Arroz basmati cozido") \u2014 n\xE3o renomeie nem simplifique. Se o alimento n\xE3o estiver na base do sistema, use-o mesmo assim e devolva kcal/P/C/G estimados por voc\xEA.
 2) AJUSTE LIVREMENTE AS QUANTIDADES (gramas/ml/unidades) de cada item para bater EXATAMENTE a meta cal\xF3rica e de macros do aluno \u2014 as quantidades da dieta modelo s\xE3o apenas ponto de partida e devem ser recalculadas do zero conforme a meta do aluno.
 3) Substitui\xE7\xE3o do alimento S\xD3 \xE9 permitida quando o alimento da dieta modelo estiver listado como restri\xE7\xE3o/alergia/intoler\xE2ncia do aluno. Nesse caso, substitua por um item de perfil nutricional semelhante e explique o motivo na coluna "Substitui\xE7\xE3o".
 4) N\xC3O adicione alimentos que n\xE3o estejam na dieta modelo, exceto quando absolutamente necess\xE1rio para fechar um macro \u2014 nesse caso, prefira alimentos que j\xE1 apare\xE7am em outras refei\xE7\xF5es da pr\xF3pria dieta modelo.
 5) Para cada alimento, preencha SEMPRE Kcal, P, C, G reais daquela quantidade.
 6) FORMATO DA DIETA MODELO: markdown com t\xEDtulos "### N. Nome da refei\xE7\xE3o \u2014 HHhMM" seguidos por bullets "* Nome do alimento: quantidade". Extraia cada bullet como um alimento; use o hor\xE1rio do t\xEDtulo na coluna "Hor\xE1rio" (ex.: "13:30"); mapeie o nome da refei\xE7\xE3o para os nomes oficiais (${mealNames.join(", ")}). Linhas de "Estimativa" e "TOTAL DI\xC1RIO" devem ser IGNORADAS.
Dieta modelo:
${modelDiet.trim()}
` : ""}
${studentCtx.questionario_dieta?.preferencias_alimentares ? `
=== PREFER\xCANCIAS ALIMENTARES DO ALUNO ===
Estes s\xE3o os alimentos que o aluno GOSTA e PODE comer. Ao usar dieta modelo, substitua qualquer alimento que n\xE3o esteja nesta lista por um equivalente desta lista:
${studentCtx.questionario_dieta.preferencias_alimentares}` : ""}
${studentCtx.questionario_dieta?.restricoes_alimentares ? `
=== RESTRI\xC7\xD5ES ALIMENTARES DO ALUNO ===
O aluno N\xC3O PODE comer os alimentos/grupos abaixo. Se aparecerem na dieta modelo, SUBSTITUA obrigatoriamente por alternativas permitidas:
${studentCtx.questionario_dieta.restricoes_alimentares}` : ""}
${selectedPreferences.length > 0 ? `
=== ALIMENTOS PREFERIDOS (selecionados pelo nutricionista) ===
Priorize estes alimentos ao montar o plano ou ao substituir itens da dieta modelo:
${selectedPreferences.join(", ")}` : ""}
${selectedRestrictions.length > 0 ? `
=== RESTRI\xC7\xD5ES (selecionadas pelo nutricionista) ===
O aluno possui estas restri\xE7\xF5es. Nunca inclua alimentos incompat\xEDveis:
${selectedRestrictions.join(", ")}` : ""}
Use tamb\xE9m a base de alimentos dispon\xEDvel do sistema para escolher substitui\xE7\xF5es adequadas.

=== ESTRUTURA OBRIGAT\xD3RIA DA TABELA ===
A tabela DEVE ter as colunas: Refei\xE7\xE3o | Hor\xE1rio | Alimento | Quantidade (g) | Kcal | P | C | G | Substitui\xE7\xE3o
REGRA CR\xCDTICA: A coluna "Refei\xE7\xE3o" deve conter SOMENTE os nomes das refei\xE7\xF5es: ${mealNames.join(", ")}
Cada refei\xE7\xE3o deve ter V\xC1RIOS alimentos (linhas), onde a primeira linha de cada refei\xE7\xE3o mostra o nome da refei\xE7\xE3o e as linhas seguintes ficam com a c\xE9lula "Refei\xE7\xE3o" VAZIA (continua\xE7\xE3o da mesma refei\xE7\xE3o).
N\xC3O coloque nomes de refei\xE7\xF5es na coluna "Alimento". A coluna "Alimento" \xE9 SOMENTE para os alimentos.
Inclua uma linha de TOTAL por refei\xE7\xE3o e TOTAL DI\xC1RIO no final.

GERE TUDO DE UMA VEZ:
${studentCtx.questionario_dieta ? `
=== FEEDBACK DO ALUNO (Question\xE1rio respondido em ${new Date(studentCtx.questionario_dieta.respondido_em).toLocaleDateString("pt-BR")}) ===
- Estilo de dieta preferido: ${studentCtx.questionario_dieta.estilo_dieta || "N\xE3o informado"}
- Fase informada pelo aluno: ${studentCtx.questionario_dieta.fase_atual || "N\xE3o informada"}
- Alimentos preferidos: ${studentCtx.questionario_dieta.preferencias_alimentares || "N\xE3o informado"}
- Restri\xE7\xF5es do aluno: ${studentCtx.questionario_dieta.restricoes_alimentares || "Nenhuma"}
- Usa horm\xF4nios: ${studentCtx.questionario_dieta.usa_hormonios || "N\xE3o informado"}
- Como se sente: ${studentCtx.questionario_dieta.como_se_sente || "N\xE3o informou"}
- Sintomas relatados: ${[
    studentCtx.questionario_dieta.fraqueza && "Fraqueza muscular",
    studentCtx.questionario_dieta.dor_cabeca && "Dor de cabe\xE7a",
    studentCtx.questionario_dieta.reduziu_peso && "Reduziu peso",
    studentCtx.questionario_dieta.pele_fina && "Pele mais fina",
    studentCtx.questionario_dieta.fome_excessiva && "Fome excessiva",
    studentCtx.questionario_dieta.insonia && "Ins\xF4nia",
    studentCtx.questionario_dieta.baixa_energia && "Baixa energia",
    studentCtx.questionario_dieta.irritabilidade && "Irritabilidade"
  ].filter(Boolean).join(", ") || "Nenhum"}
- Observa\xE7\xF5es do aluno: ${studentCtx.questionario_dieta.observacoes || "Nenhuma"}

IMPORTANTE: Considere os sintomas e feedback do aluno ao montar a dieta. Se h\xE1 fraqueza/baixa energia, priorize mais calorias ou distribui\xE7\xE3o melhor. Se h\xE1 ins\xF4nia, evite estimulantes \xE0 noite. Se reduziu peso, pode estar em d\xE9ficit excessivo.
` : ""}
1) Utilize a TMB e o GET fornecidos pelo app apenas como refer\xEAncia
2) N\xC3O recalcule a TMB/GET nem escolha outra f\xF3rmula \u2014 a f\xF3rmula j\xE1 foi definida pelo app
3) Monte o plano exatamente conforme os targets fornecidos${carbCycling.enabled ? " para CADA dia (bloco METAS DI\xC1RIAS OBRIGAT\xD3RIAS)" : ""}
4) Apresente a distribui\xE7\xE3o de macronutrientes usando os gramas fornecidos
5) EXATAMENTE 1 card\xE1pio completo em tabela com: Refei\xE7\xE3o | Hor\xE1rio | Alimento | Quantidade (g) | Kcal | P | C | G | Substitui\xE7\xE3o.
6) Total de cada refei\xE7\xE3o e do dia
7) Timing nutricional (pr\xE9-treino, intra-treino, p\xF3s-treino) baseado no hor\xE1rio de treino informado
${selectedAdjustments.includes("carb_cycling") ? "8) Protocolo de Carb Cycling com tabela de dias High/Medium/Low" : ""}
${selectedAdjustments.includes("refeed") ? "9) Protocolo de Refeed: frequ\xEAncia, calorias e macros no dia de refeed" : ""}
${selectedAdjustments.includes("diet_break") ? "10) Protocolo de Diet Break: dura\xE7\xE3o, calorias de manuten\xE7\xE3o" : ""}
${selectedAdjustments.includes("plato") ? "11) Estrat\xE9gias para quebrar plat\xF4 metab\xF3lico" : ""}
${selectedAdjustments.includes("sodium_adjust") ? "12) Protocolo de manipula\xE7\xE3o de s\xF3dio (especialmente para pr\xE9-contest)" : ""}
${selectedAdjustments.includes("water_adjust") ? "13) Protocolo de manipula\xE7\xE3o h\xEDdrica" : ""}
${enableFitoterapia ? "14) Receitas e protocolos de fitoterapia" : ""}
${enableSuplementos ? "15) Protocolo de suplementa\xE7\xE3o completo" : ""}
${enableEmagrecimentoRapido ? "16) Estrat\xE9gias avan\xE7adas de emagrecimento" : ""}
17) Mensagens prontas para WhatsApp`;
  const cyclePlan = null;
  const structuredPrompt = buildStructuredDietPrompt({
    studentContext: criticalInputsText,
    routine: [
      `Rotina di\xE1ria: ${dailyRoutine || "N\xE3o informada"}`,
      `Hor\xE1rio de treino: ${selectedTrainingTime?.label || "N\xE3o informado"}`
    ].join("\n"),
    training: trainingDays ? `${trainingDays}x/semana` : "N\xE3o informado",
    phase: `${selectedPhase?.label ?? "N\xE3o informada"} \u2014 ${selectedPhase?.desc ?? ""}`,
    strategy: `${selectedStrategy?.label ?? "N\xE3o informada"} (${(selectedStrategy?.pct ?? 0) > 0 ? "+" : ""}${selectedStrategy?.pct ?? 0}%)`,
    style: `${selectedDietStyle?.label || "N\xE3o definido"} \u2014 ${selectedDietStyle?.desc || ""}`,
    meals: [
      `N\xFAmero de refei\xE7\xF5es: ${mealCount} por dia`,
      `Nomes das refei\xE7\xF5es (use exatamente): ${mealNames.join(", ")}`,
      alimentosPorRefeicaoText.trim()
    ].filter(Boolean).join("\n"),
    restrictions: [getRestrictionsText(), ...selectedRestrictions].filter(Boolean).join("; "),
    preferences: [getPreferencesText(), ...selectedPreferences].filter(Boolean).join("; "),
    targets: carbCycling.enabled ? "" : recText,
    carbCycling: carbCycling.enabled ? recText : "",
    modelDiet: modelDiet.trim(),
    extras: adjustmentLabels.length > 0 ? adjustmentLabels.map((a) => `- ${a}`).join("\n") : ""
  });
  const dietConfig = {
    objective: phase || void 0,
    strategy: strategy || void 0,
    style: dietStyle || void 0,
    ...cyclePlan ? { carbCyclePlan: cyclePlan } : {},
    // Autoridade explícita: carb cycling materializa cada weekday e
    // por isso NÃO exige dailyAdjustments add/remove.
    carbCyclingEnabled: carbCycling.enabled,
    weeklyEnergySchedule: {
      base_daily_kcal: currentTargets.calories,
      base_source: weeklySchedule.base_source,
      calculation_snapshot: weeklySchedule.calculation_snapshot,
      days: Object.fromEntries(
        ENERGY_WEEKDAYS.map((wd) => {
          const entry = weeklySchedule.days[wd];
          const adj = entry.adjustment_kcal;
          const fixed = entry.fixed_kcal;
          const cycleDay = carbCycling.enabled ? weeklyCarbTargets[wd] : void 0;
          const dayTarget = resolveDayTarget({
            schedule: weeklySchedule,
            dayIndex: ENERGY_WEEKDAYS.indexOf(wd),
            planTargetKcal: currentTargets.calories,
            planTargetMacros: { p: canonicalTargets.p, c: canonicalTargets.c, g: canonicalTargets.g },
            dayTarget: cycleDay ?? null
          });
          const target = cycleDay ? dayTarget.kcal : fixed != null && fixed > 0 ? Math.round(fixed) : Math.round(currentTargets.calories + adj);
          return [wd, {
            base_kcal: currentTargets.calories,
            adjustment_kcal: cycleDay ? 0 : adj,
            fixed_kcal: cycleDay ? target : fixed,
            target_kcal: target,
            day_type: cycleDay?.type ?? null,
            protein_g: dayTarget.p || null,
            carbs_g: dayTarget.c || null,
            fat_g: dayTarget.g || null,
            workout: entry.workout
          }];
        })
      )
    }
  };
  const targets = {
    kcal: currentTargets.calories,
    p: currentTargets.protein,
    c: currentTargets.carbs,
    g: currentTargets.fats,
    tmb: currentBmr ?? void 0,
    get: currentGET ?? void 0
  };
  return { prompt, structuredPrompt, dietConfig, targets, currentTargets, criticalInputsText, recText };
}
function buildDietTrainingContext(trainingMarkdown, trainingTime) {
  if (!trainingMarkdown) return void 0;
  return extractTrainingContext({
    trainingMarkdown,
    trainingTime: ["manha", "tarde", "noite"].find((t) => trainingTime?.includes(t)) || null
  });
}
async function loadDietFoodRecords(sb) {
  const { data, error } = await sb.from("foods").select("id, name, calories, protein, carbs, fats, portion_size").order("name");
  if (error) throw new Error("Erro ao carregar base alimentar: " + error.message);
  return (data || []).map((food) => ({
    id: String(food.id),
    name: food.name,
    calories: Number(food.calories) || 0,
    protein: Number(food.protein) || 0,
    carbs: Number(food.carbs) || 0,
    fats: Number(food.fats) || 0,
    portion_size: Number(food.portion_size) || 100
  }));
}
function buildDietFoodHints(modelDiet, preferencesText, foodsForCheck) {
  let allowedUnresolvedFoods = [];
  let foodAliasBlock = "";
  if (modelDiet.trim()) {
    allowedUnresolvedFoods = buildAllowedUnresolvedFromModelDiet(modelDiet, foodsForCheck);
  }
  const freeNames = [
    ...preferencesText.split(/[,;\n]/),
    ...extractModelDietFoodNames(modelDiet),
    ...modelDiet.split(/[,;\n]/).filter((x) => x.trim().length <= 40 && !/\d/.test(x))
  ].map((x) => x.replace(/^\s*[-*•]\s*/, "").trim()).filter((x) => x.length >= 3);
  const { matched, unmatched } = matchFoodNamesToCatalog(freeNames, foodsForCheck);
  if (matched.length) {
    const matchedKeys = new Set(matched.map((m) => m.from.toLowerCase()));
    allowedUnresolvedFoods = allowedUnresolvedFoods.filter((a) => !matchedKeys.has(a.name.toLowerCase()));
    foodAliasBlock = `

=== ALIMENTOS CITADOS \u2192 USE ESTES DO CAT\xC1LOGO ===
${matched.map((m) => `- "${m.from}" = ${m.to}${m.id ? ` [id=${m.id}]` : ""}`).join("\n")}
Use SEMPRE o foodId indicado para esses alimentos.`;
  }
  const modelNames = new Set(extractModelDietFoodNames(modelDiet).map((n) => n.toLowerCase()));
  const unmatchedModel = unmatched.filter((n) => modelNames.has(n.toLowerCase()));
  return { allowedUnresolvedFoods, foodAliasBlock, matched, unmatchedModel };
}
function buildDietAgentBody(p) {
  return {
    mode: "structured",
    // Progresso em tempo real: a função devolve SSE com fases + resultado final.
    progressStream: true,
    messages: [{ role: "user", content: p.userPrompt + p.foodAliasBlock }],
    studentContext: p.studentCtx,
    dietConfig: p.dietConfig,
    trainingContext: p.trainingContext,
    studentId: p.studentId,
    variationIntensity: p.variationIntensity,
    intent: p.intent,
    regenerateIntent: p.intent === "regenerate",
    // Dieta modelo colada: o plano deve repetir os alimentos de referência,
    // então os filtros de variação/repetição não podem bloquear a geração.
    referenceDietProvided: Boolean(p.modelDiet.trim()),
    // Target determinístico do app: única autoridade de meta no servidor.
    canonicalTargets: { kcal: p.targets.kcal, p: p.targets.p, c: p.targets.c, g: p.targets.g },
    allowedUnresolvedFoods: p.allowedUnresolvedFoods
  };
}
function parseDietAgentSse(text) {
  let status = 500;
  let body = "";
  for (const block2 of text.replace(/\r\n/g, "\n").split("\n\n")) {
    for (const line of block2.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let evt;
      try {
        evt = JSON.parse(raw);
      } catch {
        continue;
      }
      if (evt.type === "result") {
        status = Number(evt.status) || 500;
        body = typeof evt.body === "string" ? evt.body : "";
      }
    }
  }
  return { status, body };
}
function finalizeDietAgentPlan(raw, targets) {
  if (!raw) return { plan: null };
  if (raw.targets) {
    raw.targets = { ...raw.targets, ...targets };
  } else {
    raw.targets = targets;
  }
  const parsed = parseDietPlanStrict(raw);
  if (!parsed.success) {
    const loose = parseDietPlanLoose(raw);
    if (!loose) return { plan: null, errorCode: "schema_rejected", issues: parsed.error?.issues?.slice(0, 5) };
    return { plan: finalizeDietPlan(loose, targets) };
  }
  return { plan: finalizeDietPlan(parsed.data, targets) };
}
function processDietDailyAdjustments(adjRaw, weeklySchedule) {
  const { adjustments, missing } = normalizeDailyAdjustments(adjRaw, weeklySchedule);
  const validation = validateDailyAdjustments(adjustments, missing);
  const warnings = [];
  for (const wd of ENERGY_WEEKDAYS) {
    const d = adjustments[wd];
    const tol = evaluateTolerance(d.requested_adjustment_kcal, d.estimated_adjustment_kcal);
    if (tol.state === "outside_tolerance") {
      warnings.push(
        `${WEEKDAY_LABELS[wd]}: ${TOLERANCE_TEXT.outside_tolerance} \u2014 Ajuste cal\xF3rico estimado (solicitado ${d.requested_adjustment_kcal >= 0 ? "+" : ""}${d.requested_adjustment_kcal} kcal, estimado ${d.estimated_adjustment_kcal >= 0 ? "+" : ""}${d.estimated_adjustment_kcal} kcal, toler\xE2ncia \xB1${tol.tolerance_kcal} kcal, diferen\xE7a ${tol.difference_kcal >= 0 ? "+" : ""}${tol.difference_kcal} kcal).`
      );
    }
  }
  for (const err of validation.errors) warnings.push(err);
  return { adjustments, missing, validation, warnings };
}
function buildDietProtocols(p) {
  const scheduleJson = scheduleToJson(p.weeklySchedule);
  if (p.dailyAdjustments && scheduleJson && typeof scheduleJson === "object") {
    scheduleJson.generated_adjustments = p.dailyAdjustments;
  }
  return {
    adjustments: p.selectedAdjustments,
    extras: {
      fitoterapia: p.enableFitoterapia,
      suplementos: p.enableSuplementos,
      emagrecimento_rapido: p.enableEmagrecimentoRapido,
      jejum_intermitente: p.enableJejumIntermitente
    },
    weekly_energy_schedule: scheduleJson,
    carb_cycling: JSON.parse(JSON.stringify({
      enabled: p.carbCycling.enabled,
      mode: p.carbCycling.mode,
      types: p.carbCycling.types,
      assignments: p.carbCycling.assignments,
      manual: p.carbCycling.manual,
      fixedClosingMacro: p.carbCycling.fixedClosingMacro
    })),
    weekly_day_targets: p.carbCycling.enabled ? JSON.parse(JSON.stringify(p.weeklyCarbTargets)) : null
  };
}
function buildDietDraftInsert(p) {
  return {
    student_id: p.studentId,
    tipo: "dieta",
    titulo: `Dieta - ${(p.now ?? /* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")}`,
    conteudo: p.markdown,
    protocols: p.protocols,
    is_draft: true,
    cycle_status: "em_dia",
    conteudo_json: p.plan,
    migration_status: "completed",
    diet_strategy: p.strategy || null,
    strategy_source: "manual",
    generation_intent: p.intent,
    viability_score: p.viability?.score ?? null,
    viability_breakdown: p.viability?.breakdown ?? null
  };
}

// src/lib/officeWizard/dietaStudentData.ts
function computeDietaPrefill({ latestQuestionnaire, sp, anthro, comp }) {
  const out = {};
  if (latestQuestionnaire) {
    if (latestQuestionnaire.num_refeicoes) out.mealCount = String(latestQuestionnaire.num_refeicoes);
    if (latestQuestionnaire.horario_treino) {
      const timeMap = { "05:00": "manha", "06:00": "manha", "07:00": "manha", "08:00": "manha", "09:00": "manha", "10:00": "manha", "11:00": "manha", "12:00": "tarde", "13:00": "tarde", "14:00": "tarde", "15:00": "tarde", "16:00": "tarde", "17:00": "noite", "18:00": "noite", "19:00": "noite", "20:00": "noite", "21:00": "noite", "22:00": "madrugada" };
      if (timeMap[latestQuestionnaire.horario_treino]) out.trainingTime = timeMap[latestQuestionnaire.horario_treino];
    }
    if (latestQuestionnaire.dias_treino) {
      const days = latestQuestionnaire.dias_treino.replace("x", "");
      if (["3", "4", "5", "6", "7"].includes(days)) out.trainingDays = days;
    }
    if (latestQuestionnaire.restricoes_alimentares) out.customRestriction = latestQuestionnaire.restricoes_alimentares;
    if (latestQuestionnaire.preferencias_alimentares) out.customPreference = latestQuestionnaire.preferencias_alimentares;
    if (latestQuestionnaire.usa_hormonios) {
      const uh = latestQuestionnaire.usa_hormonios;
      if (uh === "N\xE3o" || uh === "n\xE3o" || uh === "Natural") out.usesHormones = false;
      else {
        out.usesHormones = true;
        out.hormoneDetails = uh;
      }
    }
  }
  const peso = anthro?.peso ? Number(anthro.peso) : null;
  const altura = sp?.altura || anthro?.altura ? Number(sp?.altura || anthro?.altura) : null;
  const bf = comp?.percentual_gordura ? Number(comp.percentual_gordura) : null;
  const isMale = sp?.sexo === "masculino";
  let birthAge = null;
  if (sp?.data_nascimento) {
    birthAge = Math.floor((Date.now() - new Date(sp.data_nascimento).getTime()) / (365.25 * 24 * 60 * 60 * 1e3));
  }
  if (peso && altura && birthAge) {
    let suggestedStrategy = "manutencao";
    let suggestedPhase = "manutencao";
    let suggestedDietStyle = "convencional";
    if (bf !== null) {
      if (isMale && bf > 20 || !isMale && bf > 28) {
        suggestedStrategy = "deficit_moderado";
        suggestedPhase = "cutting";
      } else if (isMale && bf < 12 || !isMale && bf < 18) {
        suggestedStrategy = "superavit_leve";
        suggestedPhase = "bulking";
      }
    }
    const obj = (sp?.objetivo || "").toLowerCase();
    if (obj.includes("emagrec") || obj.includes("perd") || obj.includes("defin")) {
      suggestedStrategy = "deficit_leve";
      suggestedPhase = "cutting";
    }
    if (obj.includes("hipertrofia") || obj.includes("massa") || obj.includes("ganho")) {
      suggestedStrategy = "superavit_leve";
      suggestedPhase = "bulking";
    }
    if (obj.includes("recomp")) {
      suggestedStrategy = "manutencao";
      suggestedPhase = "recomposicao";
    }
    if (latestQuestionnaire?.fase_atual) {
      const fase = latestQuestionnaire.fase_atual.toLowerCase();
      if (fase.includes("bulk")) {
        suggestedStrategy = "superavit_leve";
        suggestedPhase = "bulking";
      }
      if (fase.includes("cut")) {
        suggestedStrategy = "deficit_moderado";
        suggestedPhase = "cutting";
      }
      if (fase.includes("recomp")) {
        suggestedStrategy = "manutencao";
        suggestedPhase = "recomposicao";
      }
      if (fase.includes("manuten\xE7\xE3o") || fase.includes("manut")) {
        suggestedPhase = "manutencao";
      }
      if (fase.includes("pr\xE9-contest") || fase.includes("pre_contest") || fase.includes("contest")) {
        suggestedPhase = "pre_contest";
        suggestedStrategy = "deficit_agressivo";
      }
    }
    if (latestQuestionnaire?.estilo_dieta) {
      const estiloMap = { "Flex\xEDvel (IIFYM)": "flexivel", "Low Carb": "low_carb", "Cetog\xEAnica": "cetogenica", "Mediterr\xE2nea": "mediterranea", "Paleol\xEDtica": "paleolitica", "Vegetariana": "vegetariana", "Vegana": "vegana", "Convencional": "convencional" };
      suggestedDietStyle = estiloMap[latestQuestionnaire.estilo_dieta] || suggestedDietStyle;
    }
    if (suggestedPhase === "cutting" && bf !== null && bf > (isMale ? 25 : 32) && !latestQuestionnaire?.estilo_dieta) {
      suggestedDietStyle = "low_carb";
    }
    if (latestQuestionnaire && (latestQuestionnaire.baixa_energia || latestQuestionnaire.fraqueza)) {
      if (suggestedStrategy === "deficit_agressivo") suggestedStrategy = "deficit_moderado";
      else if (suggestedStrategy === "deficit_moderado") suggestedStrategy = "deficit_leve";
    }
    out.strategy = suggestedStrategy;
    out.phase = suggestedPhase;
    out.dietStyle = suggestedDietStyle;
  } else if (bf !== null) {
    if (isMale && bf > 20 || !isMale && bf > 28) out.strategy = "deficit_moderado";
    else if (isMale && bf < 12 || !isMale && bf < 18) out.strategy = "superavit_leve";
    else out.strategy = "manutencao";
  }
  if (!latestQuestionnaire && sp?.restricoes) out.customRestriction = sp.restricoes;
  return out;
}
async function loadDietaStudentData(sb, studentId) {
  const [profileRes, spRes, assessRes, questRes] = await Promise.all([
    sb.from("profiles").select("*").eq("user_id", studentId).maybeSingle(),
    sb.from("students_profile").select("*").eq("user_id", studentId).maybeSingle(),
    sb.from("assessments").select("id, created_at").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1),
    sb.from("diet_questionnaires").select("*").eq("student_id", studentId).eq("status", "completed").order("created_at", { ascending: false }).limit(1)
  ]);
  const profile = profileRes.data;
  const sp = spRes.data;
  const latestAssessmentId = assessRes.data?.[0]?.id;
  const latestAssessmentDate = assessRes.data?.[0]?.created_at ?? null;
  const latestQuestionnaire = questRes.data?.[0] || null;
  let anthro = null, comp = null, vitals = null, anamnese = null;
  let photos = [];
  let skinfolds = null, perfTests = null, posture = null;
  const [postureScansRes, hrZonesRes] = await Promise.all([
    sb.from("posture_scans").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1),
    sb.from("hr_zones").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1)
  ]);
  const latestPostureScan = postureScansRes.data?.[0] || null;
  const latestHrZones = hrZonesRes.data?.[0] || null;
  if (latestAssessmentId) {
    const [anthroRes, compRes, vitalsRes, anRes, photosRes, skinRes, perfRes, postureRes] = await Promise.all([
      sb.from("anthropometrics").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      sb.from("composition").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      sb.from("vitals").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      sb.from("anamnese").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      sb.from("assessment_photos").select("*").eq("assessment_id", latestAssessmentId),
      sb.from("skinfolds").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      sb.from("performance_tests").select("*").eq("assessment_id", latestAssessmentId).maybeSingle(),
      sb.from("posture").select("*").eq("assessment_id", latestAssessmentId).maybeSingle()
    ]);
    anthro = anthroRes.data;
    comp = compRes.data;
    vitals = vitalsRes.data;
    anamnese = anRes.data;
    photos = photosRes.data ?? [];
    skinfolds = skinRes.data;
    perfTests = perfRes.data;
    posture = postureRes.data;
  }
  try {
    const { data: latestWeightLog } = await sb.from("weight_logs").select("peso, data").eq("student_id", studentId).order("data", { ascending: false }).limit(1).maybeSingle();
    if (latestWeightLog?.peso != null) {
      const logDate = latestWeightLog.data;
      const assessDate = anthro && latestAssessmentId ? (await sb.from("assessments").select("created_at").eq("id", latestAssessmentId).maybeSingle()).data?.created_at?.slice(0, 10) : null;
      if (!anthro || !assessDate || logDate >= assessDate) {
        anthro = { ...anthro || {}, peso: Number(latestWeightLog.peso) };
      }
    }
  } catch {
  }
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  const [lastDietRes, trendAssessRes, trackingRes, lastReadjustRes] = await Promise.all([
    sb.from("ai_plans").select("id, titulo, fase, conteudo, created_at, protocols").eq("student_id", studentId).eq("tipo", "dieta").eq("is_draft", false).order("created_at", { ascending: false }).limit(1),
    sb.from("assessments").select("id, created_at").eq("student_id", studentId).order("created_at", { ascending: false }).limit(4),
    sb.from("daily_tracking").select("date, meals_completed, water_glasses, workout_completed").eq("student_id", studentId).gte("date", since14).order("date", { ascending: false }),
    sb.from("diet_readjustments").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1)
  ]);
  const lastDiet = lastDietRes.data?.[0] || null;
  let ultima_dieta = null;
  if (lastDiet) {
    const c = lastDiet.conteudo || "";
    const grab = (re) => {
      const m = c.match(re);
      return m ? Number(m[1].replace(/[^\d.]/g, "")) || null : null;
    };
    const totalKcal = grab(/total\s+di[áa]rio[^\n]*?(\d{3,5})\s*kcal/i) || grab(/calorias?\s*(?:totais|alvo|consumo)?[:\s]+(\d{3,5})/i);
    const totalP = grab(/prote[íi]na[^\n]*?(\d{2,4})\s*g/i);
    const totalC = grab(/carboidrato[^\n]*?(\d{2,4})\s*g/i);
    const totalG = grab(/gordura[^\n]*?(\d{2,4})\s*g/i);
    const mealMatches = c.match(/(?:caf[eé]\s+da\s+manh[ãa]|almo[çc]o|jantar|lanche|ceia|p[óo]s[\s-]?treino|pr[eé][\s-]?treino)/gi) || [];
    const numRef = new Set(mealMatches.map((m) => m.toLowerCase())).size;
    const dias = Math.floor((Date.now() - new Date(lastDiet.created_at).getTime()) / 864e5);
    ultima_dieta = {
      titulo: lastDiet.titulo,
      fase: lastDiet.fase,
      criada_em: lastDiet.created_at,
      dias_desde: dias,
      kcal_total: totalKcal,
      proteina_g: totalP,
      carbs_g: totalC,
      gordura_g: totalG,
      num_refeicoes: numRef || null,
      excerto: c.slice(0, 1800)
    };
  }
  let tendencia_peso = null;
  const trendIds = (trendAssessRes.data || []).map((a) => a.id);
  if (trendIds.length >= 1) {
    const [anthArr, compArr] = await Promise.all([
      sb.from("anthropometrics").select("assessment_id, peso, cintura").in("assessment_id", trendIds),
      sb.from("composition").select("assessment_id, percentual_gordura, massa_magra").in("assessment_id", trendIds)
    ]);
    const byAssId = {};
    (trendAssessRes.data || []).forEach((a) => {
      byAssId[a.id] = { data: a.created_at };
    });
    (anthArr.data || []).forEach((r) => {
      Object.assign(byAssId[r.assessment_id] || {}, { peso: r.peso, cintura: r.cintura });
    });
    (compArr.data || []).forEach((r) => {
      Object.assign(byAssId[r.assessment_id] || {}, { percentual_gordura: r.percentual_gordura, massa_magra: r.massa_magra });
    });
    const historico = trendIds.map((id) => byAssId[id]).filter((x) => x && x.peso != null);
    let direcao = "estavel";
    let variacao_kg = 0;
    let intervalo_dias = 0;
    let velocidade_kg_semana = 0;
    let relevancia = "irrelevante";
    if (historico.length >= 2) {
      variacao_kg = Number(historico[0].peso) - Number(historico[historico.length - 1].peso);
      const dRecent = new Date(historico[0].data).getTime();
      const dOldest = new Date(historico[historico.length - 1].data).getTime();
      intervalo_dias = Math.max(1, Math.round((dRecent - dOldest) / 864e5));
      velocidade_kg_semana = Number((variacao_kg / intervalo_dias * 7).toFixed(2));
      const pesoBase = Number(historico[historico.length - 1].peso) || 70;
      const pctVar = Math.abs(variacao_kg) / pesoBase;
      if (pctVar < 5e-3) relevancia = "irrelevante";
      else if (pctVar < 0.015) relevancia = "leve";
      else if (pctVar < 0.04) relevancia = "moderada";
      else relevancia = "alta";
      if (variacao_kg > 0.5) direcao = "subindo";
      else if (variacao_kg < -0.5) direcao = "descendo";
    }
    tendencia_peso = {
      peso_atual: historico[0]?.peso ?? anthro?.peso ?? null,
      variacao_kg: Number(variacao_kg.toFixed(2)),
      direcao,
      intervalo_dias,
      velocidade_kg_semana,
      relevancia,
      historico
    };
  }
  let aderencia_recente = null;
  const tracking = trackingRes.data || [];
  if (tracking.length > 0) {
    const totalRef = tracking.reduce((s, d) => s + (Array.isArray(d.meals_completed) ? d.meals_completed.length : 0), 0);
    const expectedPerDay = lastDiet ? ultima_dieta?.num_refeicoes || 5 : 5;
    const expectedTotal = 14 * expectedPerDay;
    const aguaMedia = tracking.reduce((s, d) => s + (d.water_glasses || 0), 0) / tracking.length;
    const consistencia_por_refeicao = {};
    for (let i = 0; i < expectedPerDay; i++) consistencia_por_refeicao[i] = 0;
    for (const d of tracking) {
      const arr = Array.isArray(d.meals_completed) ? d.meals_completed : [];
      for (const idx of arr) {
        const n = Number(idx);
        if (Number.isInteger(n) && n >= 0 && n < expectedPerDay) {
          consistencia_por_refeicao[n] = (consistencia_por_refeicao[n] || 0) + 1;
        }
      }
    }
    const refeicoes_mais_falhadas = Object.entries(consistencia_por_refeicao).map(([idx, c]) => ({ indice: Number(idx), marcadas: c, falhadas: tracking.length - c })).sort((a, b) => b.falhadas - a.falhadas).slice(0, 3);
    aderencia_recente = {
      dias_com_registro: tracking.length,
      dias_total: 14,
      dias_com_registro_pct: Math.round(tracking.length / 14 * 100),
      refeicoes_marcadas: totalRef,
      refeicoes_esperadas: expectedTotal,
      percentual_aderencia: Math.round(totalRef / expectedTotal * 100),
      agua_media_copos_dia: Number(aguaMedia.toFixed(1)),
      consistencia_por_refeicao,
      refeicoes_mais_falhadas
    };
  }
  let ultimo_reajuste = null;
  const lr = lastReadjustRes.data?.[0];
  if (lr) {
    const sintomas = [];
    if (lr.fome_excessiva) sintomas.push("fome excessiva");
    if (lr.insonia) sintomas.push("ins\xF4nia");
    if (!lr.energia_ok) sintomas.push("energia baixa");
    if (!lr.humor_ok) sintomas.push("humor inst\xE1vel");
    if (!lr.intestino_ok) sintomas.push("desconforto intestinal");
    if (lr.perdeu_peso) sintomas.push("perdeu peso");
    if (lr.ganhou_massa) sintomas.push("ganhou massa");
    ultimo_reajuste = {
      data: lr.created_at,
      peso_atual: lr.peso_atual,
      sintomas,
      rendimento_treino: lr.rendimento_treino,
      satisfacao: lr.satisfacao,
      observacoes: lr.observacoes
    };
  }
  const factors = [];
  let score = 0;
  if (ultima_dieta) {
    factors.push({ key: "last_diet", label: "Dieta anterior encontrada", weight: 25, status: "positive" });
    score += 25;
  } else factors.push({ key: "last_diet", label: "Sem dieta anterior \u2014 gera\xE7\xE3o inicial", weight: 0, status: "neutral" });
  if (tendencia_peso && tendencia_peso.historico?.length >= 2) {
    factors.push({ key: "weight_trend", label: `Tend\xEAncia de peso dispon\xEDvel (${tendencia_peso.historico.length} avalia\xE7\xF5es em ${tendencia_peso.intervalo_dias}d)`, weight: 25, status: "positive" });
    score += 25;
  } else {
    factors.push({ key: "weight_trend", label: "Tend\xEAncia de peso indispon\xEDvel (avalia\xE7\xF5es insuficientes)", weight: 0, status: "negative" });
  }
  if (aderencia_recente && aderencia_recente.dias_com_registro >= 7) {
    factors.push({ key: "adherence", label: `Ader\xEAncia recente suficiente (${aderencia_recente.dias_com_registro}/14 dias)`, weight: 25, status: "positive" });
    score += 25;
  } else if (aderencia_recente && aderencia_recente.dias_com_registro >= 3) {
    factors.push({ key: "adherence", label: `Ader\xEAncia parcial (${aderencia_recente.dias_com_registro}/14 dias)`, weight: 10, status: "neutral" });
    score += 10;
  } else {
    factors.push({ key: "adherence", label: "Sem ader\xEAncia registrada nos \xFAltimos 14 dias", weight: 0, status: "negative" });
  }
  if (ultimo_reajuste) {
    factors.push({ key: "readjustment", label: "\xDAltimo reajuste/feedback encontrado", weight: 15, status: "positive" });
    score += 15;
  } else factors.push({ key: "readjustment", label: "Sem reajuste anterior registrado", weight: 0, status: "neutral" });
  if (latestQuestionnaire) {
    factors.push({ key: "questionnaire", label: "Question\xE1rio de dieta recente", weight: 10, status: "positive" });
    score += 10;
  } else factors.push({ key: "questionnaire", label: "Sem question\xE1rio recente respondido", weight: 0, status: "negative" });
  let decisao_recomendada = "nova";
  const motivos_decisao = [];
  if (!ultima_dieta) {
    decisao_recomendada = "nova";
    motivos_decisao.push("Nenhuma dieta anterior \u2014 gerar do zero.");
  } else {
    const adesaoBaixa = aderencia_recente && aderencia_recente.percentual_aderencia < 60;
    const sintomasNeg = !!ultimo_reajuste?.sintomas?.some((s) => /fome|insônia|insonia|energia baixa|humor/i.test(s));
    const tendenciaContraria = tendencia_peso?.relevancia === "alta" || tendencia_peso?.relevancia === "moderada";
    const reajusteRecente = ultimo_reajuste && (Date.now() - new Date(ultimo_reajuste.data).getTime()) / 864e5 < 21;
    if (adesaoBaixa) {
      motivos_decisao.push("Ader\xEAncia <60% \u2014 simplificar.");
      decisao_recomendada = "ajustar";
    }
    if (sintomasNeg) {
      motivos_decisao.push("Sintomas negativos no \xFAltimo reajuste \u2014 revisar.");
      decisao_recomendada = "ajustar";
    }
    if (tendenciaContraria) {
      motivos_decisao.push(`Tend\xEAncia ${tendencia_peso.direcao} relevante (${tendencia_peso.velocidade_kg_semana}kg/sem) \u2014 calibrar.`);
      decisao_recomendada = "ajustar";
    }
    if (!adesaoBaixa && !sintomasNeg && !tendenciaContraria) {
      decisao_recomendada = "manter";
      motivos_decisao.push("Sem varia\xE7\xE3o relevante \u2014 preservar estrutura anterior.");
    }
    if (reajusteRecente && ultimo_reajuste?.satisfacao && /ruim|insatisf/i.test(String(ultimo_reajuste.satisfacao))) {
      decisao_recomendada = "nova";
      motivos_decisao.push("Aluno insatisfeito no \xFAltimo reajuste \u2014 repensar plano.");
    }
  }
  const confianca = { score: Math.min(score, 100), factors, motivos: factors.filter((f) => f.status === "positive").map((f) => f.label) };
  const ctx = {
    nome: profile?.nome,
    sexo: sp?.sexo,
    data_nascimento: sp?.data_nascimento,
    raca: sp?.raca,
    altura: sp?.altura || anthro?.altura,
    objetivo: sp?.objetivo,
    restricoes: sp?.restricoes,
    lesoes: sp?.lesoes,
    observacoes: sp?.observacoes,
    peso: anthro?.peso,
    imc: anthro?.imc,
    cintura: anthro?.cintura,
    quadril: anthro?.quadril,
    rcq: anthro?.rcq,
    // All anthropometric measurements
    antropometria_completa: anthro ? {
      pescoco: anthro.pescoco,
      torax: anthro.torax,
      ombro: anthro.ombro,
      abdomen: anthro.abdomen,
      braco_direito: anthro.braco_direito,
      braco_esquerdo: anthro.braco_esquerdo,
      antebraco: anthro.antebraco,
      antebraco_esquerdo: anthro.antebraco_esquerdo,
      biceps_contraido_direito: anthro.biceps_contraido_direito,
      biceps_contraido_esquerdo: anthro.biceps_contraido_esquerdo,
      coxa_direita: anthro.coxa_direita,
      coxa_esquerda: anthro.coxa_esquerda,
      panturrilha_direita: anthro.panturrilha_direita,
      panturrilha_esquerda: anthro.panturrilha_esquerda
    } : null,
    percentual_gordura: comp?.percentual_gordura,
    massa_magra: comp?.massa_magra,
    massa_gorda: comp?.massa_gorda,
    massa_magra_data: comp?.massa_magra != null ? latestAssessmentDate : null,
    massa_magra_origem: comp?.massa_magra != null ? "Composi\xE7\xE3o corporal da avalia\xE7\xE3o f\xEDsica" : null,
    composicao_obs: comp?.observacoes,
    // Skinfolds
    dobras_cutaneas: skinfolds ? {
      metodo: skinfolds.metodo,
      triceps: skinfolds.triceps,
      subescapular: skinfolds.subescapular,
      suprailiaca: skinfolds.suprailiaca,
      abdominal: skinfolds.abdominal,
      peitoral: skinfolds.peitoral,
      axilar_media: skinfolds.axilar_media,
      coxa: skinfolds.coxa
    } : null,
    // Vitals
    sinais_vitais: vitals ? {
      fc_repouso: vitals.fc_repouso,
      pressao: vitals.pressao,
      spo2: vitals.spo2,
      glicemia: vitals.glicemia,
      observacoes: vitals.observacoes
    } : null,
    fc_repouso: vitals?.fc_repouso,
    // Performance tests
    testes_performance: perfTests ? {
      pushup: perfTests.pushup,
      plank: perfTests.plank,
      cooper_12min: perfTests.cooper_12min,
      salto_vertical: perfTests.salto_vertical,
      agachamento_score: perfTests.agachamento_score,
      mobilidade_ombro: perfTests.mobilidade_ombro,
      mobilidade_quadril: perfTests.mobilidade_quadril,
      mobilidade_tornozelo: perfTests.mobilidade_tornozelo,
      observacoes: perfTests.observacoes
    } : null,
    // Posture (from assessment)
    postura: posture ? {
      vista_anterior: posture.vista_anterior,
      vista_lateral: posture.vista_lateral,
      vista_posterior: posture.vista_posterior,
      observacoes: posture.observacoes
    } : null,
    // Posture scan (latest)
    analise_postural: latestPostureScan ? {
      angles: latestPostureScan.angles_json,
      region_scores: latestPostureScan.region_scores_json,
      attention_points: latestPostureScan.attention_points_json,
      notes: latestPostureScan.notes
    } : null,
    // HR zones
    zonas_fc: latestHrZones ? {
      fc_repouso: latestHrZones.fc_repouso,
      fcmax: latestHrZones.fcmax_estimada,
      formula: latestHrZones.fcmax_formula,
      zonas: latestHrZones.zonas_karvonen
    } : null,
    anamnese: anamnese ? {
      historico_saude: anamnese.historico_saude,
      medicacao: anamnese.medicacao,
      suplementos: anamnese.suplementos,
      sono: anamnese.sono,
      stress: anamnese.stress,
      rotina: anamnese.rotina,
      treino_atual: anamnese.treino_atual,
      dores: anamnese.dores,
      cirurgias: anamnese.cirurgias,
      tabagismo: anamnese.tabagismo,
      alcool: anamnese.alcool
    } : null,
    fotos_avaliacao: photos.length > 0 ? photos.map((p) => ({ tipo: p.tipo, url: p.url })) : null,
    // ── HISTÓRICO LONGITUDINAL ──
    historico_processo: {
      ultima_dieta,
      tendencia_peso,
      aderencia_recente,
      ultimo_reajuste,
      confianca_geracao: confianca,
      decisao_recomendada,
      motivos_decisao
    },
    questionario_dieta: latestQuestionnaire ? {
      estilo_dieta: latestQuestionnaire.estilo_dieta,
      fase_atual: latestQuestionnaire.fase_atual,
      num_refeicoes: latestQuestionnaire.num_refeicoes,
      horario_treino: latestQuestionnaire.horario_treino,
      dias_treino: latestQuestionnaire.dias_treino,
      usa_hormonios: latestQuestionnaire.usa_hormonios,
      restricoes_alimentares: latestQuestionnaire.restricoes_alimentares,
      preferencias_alimentares: latestQuestionnaire.preferencias_alimentares,
      alimentos_por_refeicao: latestQuestionnaire.alimentos_por_refeicao,
      como_se_sente: latestQuestionnaire.como_se_sente,
      fraqueza: latestQuestionnaire.fraqueza,
      dor_cabeca: latestQuestionnaire.dor_cabeca,
      reduziu_peso: latestQuestionnaire.reduziu_peso,
      pele_fina: latestQuestionnaire.pele_fina,
      fome_excessiva: latestQuestionnaire.fome_excessiva,
      insonia: latestQuestionnaire.insonia,
      baixa_energia: latestQuestionnaire.baixa_energia,
      irritabilidade: latestQuestionnaire.irritabilidade,
      observacoes: latestQuestionnaire.observacoes,
      respondido_em: latestQuestionnaire.responded_at
    } : null
  };
  return {
    ctx,
    studentName: profile?.nome || "Aluno",
    lastDiet,
    latestQuestionnaire,
    prefill: computeDietaPrefill({ latestQuestionnaire, sp, anthro, comp })
  };
}
async function loadActiveTrainingMarkdown(sb, studentId) {
  const { data } = await sb.from("ai_plans").select("conteudo").eq("student_id", studentId).eq("tipo", "treino").eq("is_draft", false).order("created_at", { ascending: false }).limit(1);
  return data?.[0]?.conteudo ?? "";
}

// src/lib/officeWizard/dietaFields.ts
var DIET_STRATEGY_ADJUSTMENT_IDS = ["refeed", "diet_break", "carb_cycling", "plato"];
var DIET_STRUCTURE_ADJUSTMENT_IDS = ["meal_change"];
var DIET_FINE_TUNE_ADJUSTMENT_IDS = ["calorie_adjust", "carb_adjust", "sodium_adjust", "water_adjust"];
var opt2 = (arr) => arr.map((o) => ({ valor: o.value, rotulo: o.label, ...o.desc ? { descricao: o.desc } : {} }));
var adjOpts = (ids) => PROTOCOL_ADJUSTMENTS.filter((a) => ids.includes(a.id)).map((a) => ({ valor: a.id, rotulo: a.label, descricao: a.desc }));
var strOpts = (arr) => arr.map((v) => ({ valor: v, rotulo: v }));
function dietaFields() {
  const d = defaultDietaWizardState();
  const f = (x) => ({
    padrao: x.stateKey.startsWith("adj.") ? [] : d[x.stateKey],
    ...x
  });
  return [
    // Etapa 1 — Objetivo do Plano
    f({ id: "rotina_diaria", stateKey: "dailyRoutine", pergunta: "Rotina di\xE1ria do aluno (trabalho, hor\xE1rios, etc.)", tipo: "texto", obrigatorio: false }),
    f({ id: "horario_treino", stateKey: "trainingTime", pergunta: "Hor\xE1rio de treino", tipo: "escolha", opcoes: opt2(TRAINING_TIMES), obrigatorio: true }),
    f({ id: "intensidade_variacao", stateKey: "variationIntensity", pergunta: "Varia\xE7\xE3o em rela\xE7\xE3o \xE0 dieta anterior", tipo: "escolha", opcoes: VARIATION_OPTIONS.map((o) => ({ valor: o.value, rotulo: o.label, descricao: o.desc })), obrigatorio: false }),
    f({ id: "dias_treino", stateKey: "trainingDays", pergunta: "Frequ\xEAncia de treino", tipo: "escolha", opcoes: opt2(TRAINING_DAYS_OPTIONS), obrigatorio: true }),
    f({ id: "fase", stateKey: "phase", pergunta: "Fase atual do aluno", tipo: "escolha", opcoes: opt2(PHASES), obrigatorio: true }),
    f({ id: "usa_hormonios", stateKey: "usesHormones", pergunta: "Usa horm\xF4nios / TRT? (false = natural)", tipo: "booleano", obrigatorio: true }),
    f({ id: "detalhes_hormonios", stateKey: "hormoneDetails", pergunta: "Detalhes dos horm\xF4nios (ex.: TRT 200mg/sem)", tipo: "texto", obrigatorio: false, depende_de: { campo: "usa_hormonios", valores: [true] } }),
    f({ id: "nivel_atividade", stateKey: "activityLevel", pergunta: "N\xEDvel de atividade f\xEDsica (fator de atividade)", tipo: "escolha", opcoes: opt2(ACTIVITY_LEVELS), obrigatorio: true }),
    f({ id: "estrategia", stateKey: "strategy", pergunta: "Estrat\xE9gia cal\xF3rica", tipo: "escolha", opcoes: opt2(STRATEGIES), obrigatorio: true }),
    // Etapa 2 — Base da Dieta
    f({ id: "estilo_dieta", stateKey: "dietStyle", pergunta: "Base (estilo) da dieta", tipo: "escolha", opcoes: opt2(DIET_STYLES), obrigatorio: true }),
    // Etapa 3 — Estratégia da Dieta (nenhum = condução linear)
    f({ id: "conducao", stateKey: "adj.selectedAdjustments", pergunta: "Condu\xE7\xE3o da dieta (vazio = linear). Carb Cycling ativa metas por dia.", tipo: "multipla", opcoes: adjOpts(DIET_STRATEGY_ADJUSTMENT_IDS), obrigatorio: false }),
    // Etapa 4 — Estrutura Alimentar do Dia
    f({ id: "num_refeicoes", stateKey: "mealCount", pergunta: "N\xFAmero de refei\xE7\xF5es por dia", tipo: "escolha", opcoes: opt2(MEAL_COUNTS), obrigatorio: true }),
    f({ id: "jejum_intermitente", stateKey: "enableJejumIntermitente", pergunta: "Jejum intermitente?", tipo: "booleano", obrigatorio: false }),
    f({ id: "reorganizacao_refeicoes", stateKey: "adj.selectedAdjustments", pergunta: "Reorganiza\xE7\xE3o de refei\xE7\xF5es", tipo: "multipla", opcoes: adjOpts(DIET_STRUCTURE_ADJUSTMENT_IDS), obrigatorio: false }),
    f({ id: "restricoes", stateKey: "selectedRestrictions", pergunta: "Restri\xE7\xF5es alimentares", tipo: "multipla", opcoes: strOpts(RESTRICTION_OPTIONS), obrigatorio: false }),
    f({ id: "restricoes_outras", stateKey: "customRestriction", pergunta: "Outras restri\xE7\xF5es (texto livre)", tipo: "texto", obrigatorio: false }),
    f({ id: "preferencias", stateKey: "selectedPreferences", pergunta: "Prefer\xEAncias alimentares", tipo: "multipla", opcoes: strOpts(PREFERENCE_OPTIONS), obrigatorio: false }),
    f({ id: "preferencias_outras", stateKey: "customPreference", pergunta: "Outras prefer\xEAncias (texto livre)", tipo: "texto", obrigatorio: false }),
    // Etapa 5 — Ajustes Finos do Protocolo
    f({ id: "meta_base_modo", stateKey: "baseKcalMode", pergunta: "Meta cal\xF3rica base", tipo: "escolha", opcoes: [{ valor: "automatic", rotulo: "Autom\xE1tica (TMB \xD7 fator de atividade \xD7 estrat\xE9gia)" }, { valor: "manual", rotulo: "Manual" }], obrigatorio: false }),
    f({ id: "meta_base_manual_kcal", stateKey: "manualBaseKcalInput", pergunta: "Meta manual (kcal/dia)", tipo: "numero", minimo: 900, maximo: 8e3, obrigatorio: true, depende_de: { campo: "meta_base_modo", valores: ["manual"] }, toState: (v) => String(Math.round(Number(v))) }),
    f({ id: "formula_energetica", stateKey: "manualFormula", pergunta: "F\xF3rmula da TMB (autom\xE1tica = escolha do app)", tipo: "escolha", opcoes: [{ valor: "automatica", rotulo: "Autom\xE1tica (escolha do app)" }, ...Object.keys(ENERGY_FORMULA_LABEL).map((k) => ({ valor: k, rotulo: ENERGY_FORMULA_LABEL[k] }))], obrigatorio: false, padrao: "automatica", toState: (v) => v === "automatica" ? null : v }),
    f({ id: "ajustes_finos", stateKey: "adj.selectedAdjustments", pergunta: "Ajustes finos do protocolo", tipo: "multipla", opcoes: adjOpts(DIET_FINE_TUNE_ADJUSTMENT_IDS), obrigatorio: false }),
    f({ id: "proteina_g_kg", stateKey: "proteinPerKgOverride", pergunta: "Prote\xEDna em g/kg (vazio = preset da tela pela fase/estrat\xE9gia)", tipo: "numero", minimo: 0.8, maximo: 3.5, obrigatorio: false }),
    f({ id: "gordura_g_kg", stateKey: "fatPerKgOverride", pergunta: "Gordura em g/kg (vazio = preset da tela pela fase/estrat\xE9gia)", tipo: "numero", minimo: 0.3, maximo: 2, obrigatorio: false }),
    // Etapa 6 — Calorias por dia (desativado com Carb Cycling, como na tela)
    f({
      id: "ajuste_kcal_por_dia",
      stateKey: "scheduleAdjustments",
      pergunta: 'Ajuste de kcal por dia da semana sobre a meta base (ex.: {"sab": 300}). Ignorado com Carb Cycling.',
      tipo: "kcal_por_dia",
      opcoes: ENERGY_WEEKDAYS.map((wd) => ({ valor: wd, rotulo: WEEKDAY_LABELS[wd] })),
      obrigatorio: false,
      padrao: {},
      toState: (v) => {
        const out = emptyScheduleAdjustments();
        for (const [wd, kcal] of Object.entries(v)) out[wd].adjustment_kcal = kcal;
        return out;
      }
    }),
    // Etapa 7 — Extras e Observações
    f({ id: "fitoterapia", stateKey: "enableFitoterapia", pergunta: "Receitas de fitoterapia?", tipo: "booleano", obrigatorio: false }),
    f({ id: "suplementacao", stateKey: "enableSuplementos", pergunta: "Suplementa\xE7\xE3o?", tipo: "booleano", obrigatorio: false }),
    f({ id: "hiit_termogenicos", stateKey: "enableEmagrecimentoRapido", pergunta: "HIIT + termog\xEAnicos?", tipo: "booleano", obrigatorio: false }),
    f({ id: "substituicoes", stateKey: "substitutions", pergunta: "Alimentos para substitui\xE7\xE3o [{alimento, porcao}]", tipo: "substituicoes", obrigatorio: false }),
    f({ id: "dieta_modelo", stateKey: "modelDiet", pergunta: "Dieta modelo (texto colado; a IA ajusta as quantidades)", tipo: "texto", obrigatorio: false })
  ];
}
var validateDietaAnswers = (respostas, instrucoes) => answersToState(dietaFields(), defaultDietaWizardState(), respostas, instrucoes, "dailyRoutine");

// supabase/functions/_shared/macroTolerances.ts
var OFFICIAL_MACRO_TOLERANCE = {
  kcal: 50,
  p: 10,
  c: 15,
  g: 8
};
var OFFICIAL_MACRO_TOLERANCE_LABELS = {
  calories: OFFICIAL_MACRO_TOLERANCE.kcal,
  protein: OFFICIAL_MACRO_TOLERANCE.p,
  carbs: OFFICIAL_MACRO_TOLERANCE.c,
  fats: OFFICIAL_MACRO_TOLERANCE.g
};

// src/lib/canonicalDietValidation.ts
var sign = (n) => n > 0 ? `+${n}` : `${n}`;
var toEngineMeals = (day) => (day?.meals ?? []).map((meal) => ({
  items: (meal?.items ?? []).map((item) => ({
    foodId: item?.foodId ?? null,
    name: String(item?.name ?? ""),
    qtyGrams: Number(item?.qtyGrams) || 0
  }))
}));
var computeCanonicalDay = (day, index) => {
  const computed = computeDayTotals(toEngineMeals(day), index, "draft", "strict_id");
  const mealTotals = computed.meals.map((meal, i) => ({
    meal: String(day?.meals?.[i]?.name ?? `Refei\xE7\xE3o ${i + 1}`),
    calories: Math.round(meal.totals.kcal),
    protein: Math.round(meal.totals.p),
    carbs: Math.round(meal.totals.c),
    fats: Math.round(meal.totals.g)
  }));
  return {
    totals: {
      calories: Math.round(computed.totals.kcal),
      protein: Math.round(computed.totals.p),
      carbs: Math.round(computed.totals.c),
      fats: Math.round(computed.totals.g)
    },
    mealTotals,
    unresolved: computed.unresolvedNames
  };
};
var buildIndex = (foods) => buildFoodIndex(
  (foods ?? []).map((f) => ({
    ...f,
    id: String(f.id ?? ""),
    portion_size: f.portion_size ?? 100
  }))
);
var reasonsForDiff = (diff, prefix = "") => {
  const out = [];
  if (Math.abs(diff.calories) > OFFICIAL_MACRO_TOLERANCE.kcal) out.push(`${prefix}Calorias ${sign(diff.calories)} kcal fora da toler\xE2ncia.`);
  if (Math.abs(diff.protein) > OFFICIAL_MACRO_TOLERANCE.p) out.push(`${prefix}Prote\xEDna ${sign(diff.protein)} g fora da toler\xE2ncia.`);
  if (Math.abs(diff.carbs) > OFFICIAL_MACRO_TOLERANCE.c) out.push(`${prefix}Carboidrato ${sign(diff.carbs)} g fora da toler\xE2ncia.`);
  if (Math.abs(diff.fats) > OFFICIAL_MACRO_TOLERANCE.g) out.push(`${prefix}Gordura ${sign(diff.fats)} g fora da toler\xE2ncia.`);
  return out;
};
var validateCanonicalDietTarget = ({
  plan,
  target,
  foods
}) => {
  const index = buildIndex(foods);
  const days = (plan?.days ?? []).filter(Boolean);
  const computedDays = days.map((d) => computeCanonicalDay(d, index));
  const first = computedDays[0];
  const generated = first?.totals ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const difference = {
    calories: generated.calories - target.calories,
    protein: generated.protein - target.protein,
    carbs: generated.carbs - target.carbs,
    fats: generated.fats - target.fats
  };
  const reasons = [];
  if (computedDays.length === 0) reasons.push("Plano estruturado sem dias.");
  computedDays.forEach((d, i) => {
    const label = days[i]?.label ?? days[i]?.weekday ?? `dia ${i + 1}`;
    const diff = {
      calories: d.totals.calories - target.calories,
      protein: d.totals.protein - target.protein,
      carbs: d.totals.carbs - target.carbs,
      fats: d.totals.fats - target.fats
    };
    reasons.push(...reasonsForDiff(diff, computedDays.length > 1 ? `${label}: ` : ""));
  });
  return {
    target,
    generated,
    difference,
    valid: reasons.length === 0,
    tolerances: OFFICIAL_MACRO_TOLERANCE_LABELS,
    mealTotals: first?.mealTotals ?? [],
    unmatchedFoods: Array.from(new Set(computedDays.flatMap((d) => d.unresolved))),
    reasons
  };
};
var validateCanonicalDietDayTargets = ({
  plan,
  dayTargets,
  foods
}) => {
  const index = buildIndex(foods);
  const byWeekday = /* @__PURE__ */ new Map();
  for (const day of plan?.days ?? []) {
    const wd = String(day?.weekday ?? "");
    if (wd && !byWeekday.has(wd)) byWeekday.set(wd, day);
  }
  const out = {};
  const missingDays = [];
  for (const wd of WEEKDAY_KEYS) {
    const target = dayTargets[wd];
    if (!target) continue;
    const day = byWeekday.get(wd);
    if (!day) {
      missingDays.push(wd);
      continue;
    }
    const computed = computeCanonicalDay(day, index);
    const generated = {
      kcal: computed.totals.calories,
      p: computed.totals.protein,
      c: computed.totals.carbs,
      g: computed.totals.fats
    };
    const difference = {
      kcal: generated.kcal - target.kcal,
      p: generated.p - target.p,
      c: generated.c - target.c,
      g: generated.g - target.g
    };
    const reasons = reasonsForDiff({
      calories: difference.kcal,
      protein: difference.p,
      carbs: difference.c,
      fats: difference.g
    });
    out[wd] = {
      weekday: wd,
      type: target.type ?? null,
      target: { kcal: target.kcal, p: target.p, c: target.c, g: target.g },
      generated,
      difference,
      valid: reasons.length === 0,
      reasons,
      unmatchedFoods: computed.unresolved
    };
  }
  const valid = missingDays.length === 0 && Object.keys(out).length > 0 && WEEKDAY_KEYS.every((wd) => !dayTargets[wd] || out[wd]?.valid === true);
  return { valid, days: out, missingDays, tolerances: OFFICIAL_MACRO_TOLERANCE_LABELS };
};

// src/lib/dietViability.ts
var WEIGHTS = {
  adherence: 0.3,
  practicality: 0.2,
  familiarity: 0.25,
  complexity: 0.15,
  cost: 0.1
};
function normalize2(name) {
  return (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();
}
function collectPlanFoods(plan) {
  const out = [];
  const days = Array.isArray(plan?.days) ? plan.days : [];
  for (const d of days) {
    const meals = Array.isArray(d?.meals) ? d.meals : [];
    for (const m of meals) {
      const items = Array.isArray(m?.items) ? m.items : [];
      for (const it of items) if (it?.name) out.push(normalize2(String(it.name)));
    }
  }
  return out;
}
function collectPreferredFoods(questionnaire) {
  if (!questionnaire) return [];
  const out = [];
  const apr = questionnaire.alimentos_por_refeicao;
  if (apr && typeof apr === "object") {
    for (const arr of Object.values(apr)) {
      if (Array.isArray(arr)) {
        for (const f of arr) if (f) out.push(normalize2(String(f)));
      }
    }
  }
  const pref = questionnaire.preferencias_alimentares;
  if (typeof pref === "string") {
    for (const tok of pref.split(/[,;\n]/)) {
      const t = normalize2(tok);
      if (t.length > 2) out.push(t);
    }
  }
  return out;
}
var EXPENSIVE_TOKENS = [
  "salmao",
  "salm\xE3o",
  "fil\xE9 mignon",
  "file mignon",
  "picanha",
  "atum",
  "amendoas",
  "am\xEAndoas",
  "castanha",
  "nozes",
  "macadamia",
  "macad\xE2mia",
  "abacate",
  "queijo branco",
  "iogurte grego",
  "whey",
  "creatina"
];
function computeViabilityScore(input) {
  const notes = [];
  const planFoods = collectPlanFoods(input.plan);
  const preferred = collectPreferredFoods(input.questionnaire);
  const adherence = Math.max(0, Math.min(
    100,
    typeof input.adherencePct === "number" ? input.adherencePct : 60
  ));
  const mc = input.mealCount ?? (Array.isArray(input.plan?.days?.[0]?.meals) ? input.plan.days[0].meals.length : 5);
  let practicality = 100;
  if (mc <= 2) practicality = 50;
  else if (mc === 3) practicality = 75;
  else if (mc === 4 || mc === 5) practicality = 95;
  else if (mc === 6) practicality = 80;
  else if (mc >= 7) practicality = 60;
  if (mc >= 7) notes.push(`${mc} refei\xE7\xF5es/dia \xE9 dif\xEDcil de manter \u2014 considere reduzir.`);
  let familiarity = 70;
  if (preferred.length > 0 && planFoods.length > 0) {
    const matched = planFoods.filter(
      (f) => preferred.some((p) => f.includes(p) || p.includes(f))
    ).length;
    familiarity = Math.round(matched / planFoods.length * 100);
    if (familiarity < 50) {
      notes.push(`S\xF3 ${familiarity}% dos alimentos batem com a lista de preferidos do aluno.`);
    }
  } else if (preferred.length === 0) {
    notes.push("Sem lista de alimentos preferidos no question\xE1rio \u2014 viabilidade estimada.");
  }
  const meals = Array.isArray(input.plan?.days?.[0]?.meals) ? input.plan.days[0].meals : [];
  const avgItems = meals.length > 0 ? meals.reduce((a, m) => a + (Array.isArray(m?.items) ? m.items.length : 0), 0) / meals.length : 4;
  let complexity = 100;
  if (avgItems > 7) complexity = 55;
  else if (avgItems > 5) complexity = 75;
  else if (avgItems > 3) complexity = 95;
  else complexity = 85;
  const expensiveHits = planFoods.filter((f) => EXPENSIVE_TOKENS.some((e) => f.includes(e))).length;
  const expensiveRatio = planFoods.length ? expensiveHits / planFoods.length : 0;
  const cost = Math.round(100 - Math.min(60, expensiveRatio * 200));
  if (expensiveRatio > 0.3) notes.push("Plano com propor\xE7\xE3o alta de itens caros \u2014 pode pesar no or\xE7amento.");
  const breakdown = {
    adherence: Math.round(adherence),
    practicality: Math.round(practicality),
    familiarity: Math.round(familiarity),
    complexity: Math.round(complexity),
    cost: Math.round(cost)
  };
  const score = Math.round(
    breakdown.adherence * WEIGHTS.adherence + breakdown.practicality * WEIGHTS.practicality + breakdown.familiarity * WEIGHTS.familiarity + breakdown.complexity * WEIGHTS.complexity + breakdown.cost * WEIGHTS.cost
  );
  return { score, breakdown, notes };
}

// src/lib/newFoodsDetector.ts
var STOPWORDS = /* @__PURE__ */ new Set([
  "total",
  "totais",
  "total diario",
  "total di\xE1rio",
  "total geral",
  "subtotal",
  "observa\xE7\xF5es",
  "observacoes"
]);
var PREP_TOKENS = /* @__PURE__ */ new Set([
  "cozido",
  "cozida",
  "cozidos",
  "cozidas",
  "cru",
  "crua",
  "crus",
  "cruas",
  "assado",
  "assada",
  "assados",
  "assadas",
  "grelhado",
  "grelhada",
  "grelhados",
  "grelhadas",
  "frito",
  "frita",
  "fritos",
  "fritas",
  "refogado",
  "refogada",
  "refogados",
  "refogadas",
  "vapor",
  "ao",
  "no",
  "na",
  "natural",
  "fresco",
  "fresca"
]);
function normalizeFoodName2(raw) {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.split(" ").map((tok) => tok.length > 3 && tok.endsWith("s") ? tok.slice(0, -1) : tok).join(" ");
  return s;
}
function nameTokens(raw) {
  return normalizeFoodName2(raw).split(" ").filter((t) => t && !PREP_TOKENS.has(t));
}
function hasResolutionStatus(plan) {
  for (const day of plan.days ?? []) {
    for (const meal of day.meals ?? []) {
      for (const item of meal.items ?? []) {
        if (item.resolutionStatus) return true;
      }
    }
  }
  return false;
}
function detectFromResolutionStatus(plan) {
  const seen = /* @__PURE__ */ new Map();
  for (const day of plan.days ?? []) {
    for (const meal of day.meals ?? []) {
      for (const item of meal.items ?? []) {
        if (item.resolutionStatus !== "unresolved") continue;
        const raw = (item.name || "").trim();
        const norm3 = normalizeFoodName2(raw);
        if (!norm3 || norm3.length < 2 || STOPWORDS.has(norm3) || seen.has(norm3)) continue;
        seen.set(norm3, {
          name: raw,
          qtyGrams: item.qtyGrams,
          kcal: Number(item.macros?.kcal) || 0,
          protein: Number(item.macros?.p) || 0,
          carbs: Number(item.macros?.c) || 0,
          fats: Number(item.macros?.g) || 0
        });
      }
    }
  }
  return Array.from(seen.values());
}
function detectNewFoodsFromPlan(plan, existingFoodNames) {
  if (!plan?.days) return [];
  if (hasResolutionStatus(plan)) return detectFromResolutionStatus(plan);
  const existingSet = new Set(existingFoodNames.map(normalizeFoodName2).filter(Boolean));
  const existingTokenSets = existingFoodNames.map((n) => nameTokens(n)).filter((toks) => toks.length > 0);
  const seen = /* @__PURE__ */ new Map();
  for (const day of plan.days) {
    for (const meal of day.meals ?? []) {
      for (const item of meal.items ?? []) {
        const raw = (item.name || "").trim();
        const norm3 = normalizeFoodName2(raw);
        if (!norm3 || norm3.length < 2) continue;
        if (STOPWORDS.has(norm3)) continue;
        if (existingSet.has(norm3)) continue;
        const candTokens = new Set(nameTokens(raw));
        if (candTokens.size > 0) {
          const matched = existingTokenSets.some(
            (dbToks) => dbToks.every((t) => candTokens.has(t))
          );
          if (matched) continue;
        }
        if (seen.has(norm3)) continue;
        seen.set(norm3, {
          name: raw,
          qtyGrams: item.qtyGrams,
          kcal: Number(item.macros?.kcal) || 0,
          protein: Number(item.macros?.p) || 0,
          carbs: Number(item.macros?.c) || 0,
          fats: Number(item.macros?.g) || 0
        });
      }
    }
  }
  return Array.from(seen.values());
}

// src/lib/officeWizard/dietaOffice.ts
var has = (arr, v) => typeof v === "string" && arr.some((o) => o.value === v);
var fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
function suggestDietaValues(fields, input) {
  const { prefill, latestQuestionnaire, currentDiet, ctx } = input;
  const out = {};
  const set = (id, v, origem) => {
    if (v === void 0 || v === null || v === "" || Array.isArray(v) && v.length === 0) return;
    if (!out[id]) out[id] = { valor_atual: v, origem_valor: origem };
  };
  if (currentDiet) {
    const src = `dieta atual (${fmtDate(currentDiet.published_at ?? currentDiet.created_at)})`;
    const plan = currentDiet.conteudo_json ?? null;
    const p = currentDiet.protocols ?? {};
    const wes = p.weekly_energy_schedule ?? null;
    const snap = wes?.calculation_snapshot ?? null;
    const lvl = ACTIVITY_LEVELS.find((a) => snap?.activity_factor != null && Math.abs(a.factor - Number(snap.activity_factor)) < 1e-6);
    if (lvl) set("nivel_atividade", lvl.value, src);
    if (has(STRATEGIES, currentDiet.diet_strategy)) set("estrategia", currentDiet.diet_strategy, src);
    else if (snap?.strategy_percent != null) {
      const st = STRATEGIES.find((s) => s.pct === Number(snap.strategy_percent));
      if (st) set("estrategia", st.value, `${src} \u2014 pela % da estrat\xE9gia`);
    }
    if (has(PHASES, plan?.meta?.phase)) set("fase", plan.meta.phase, src);
    if (has(DIET_STYLES, plan?.meta?.style)) set("estilo_dieta", plan.meta.style, src);
    const meals = Array.isArray(plan?.days?.[0]?.meals) ? plan.days[0].meals.length : null;
    if (meals && has(MEAL_COUNTS, String(meals))) set("num_refeicoes", String(meals), src);
    const adj = Array.isArray(p.adjustments) ? p.adjustments : [];
    set("conducao", adj.filter((a) => DIET_STRATEGY_ADJUSTMENT_IDS.includes(a)), src);
    set("reorganizacao_refeicoes", adj.filter((a) => DIET_STRUCTURE_ADJUSTMENT_IDS.includes(a)), src);
    set("ajustes_finos", adj.filter((a) => DIET_FINE_TUNE_ADJUSTMENT_IDS.includes(a)), src);
    if (p.extras) {
      if (p.extras.fitoterapia) set("fitoterapia", true, src);
      if (p.extras.suplementos) set("suplementacao", true, src);
      if (p.extras.emagrecimento_rapido) set("hiit_termogenicos", true, src);
      if (p.extras.jejum_intermitente) set("jejum_intermitente", true, src);
    }
    if (wes?.base_source === "manual" && typeof wes.base_daily_kcal === "number") {
      set("meta_base_modo", "manual", src);
      set("meta_base_manual_kcal", wes.base_daily_kcal, src);
    } else if (wes?.base_source === "automatic") {
      set("meta_base_modo", "automatic", src);
    }
    if (wes?.days && !p.carb_cycling?.enabled) {
      const perDay = {};
      for (const wd of ENERGY_WEEKDAYS) {
        const a = Number(wes.days?.[wd]?.adjustment_kcal) || 0;
        if (a !== 0) perDay[wd] = Math.round(a);
      }
      if (Object.keys(perDay).length) set("ajuste_kcal_por_dia", perDay, src);
    }
    const peso = parsePositiveNumber(ctx?.peso);
    const t = plan?.targets;
    if (peso && t) {
      const pk = Math.round(Number(t.p) / peso * 10) / 10;
      const gk = Math.round(Number(t.g) / peso * 10) / 10;
      if (pk >= 0.8 && pk <= 3.5) set("proteina_g_kg", pk, `${src} \u2014 P ${Math.round(Number(t.p))} g \xF7 ${peso} kg`);
      if (gk >= 0.3 && gk <= 2) set("gordura_g_kg", gk, `${src} \u2014 G ${Math.round(Number(t.g))} g \xF7 ${peso} kg`);
    }
  }
  const qsrc = latestQuestionnaire ? `question\xE1rio de dieta (${fmtDate(latestQuestionnaire.responded_at ?? latestQuestionnaire.created_at)})` : "perfil do aluno";
  const recSrc = "recomenda\xE7\xE3o do wizard (avalia\xE7\xE3o/objetivo/question\xE1rio)";
  set("num_refeicoes", prefill.mealCount, qsrc);
  set("horario_treino", prefill.trainingTime, qsrc);
  set("dias_treino", prefill.trainingDays, qsrc);
  if (prefill.usesHormones !== void 0) set("usa_hormonios", prefill.usesHormones, qsrc);
  set("detalhes_hormonios", prefill.hormoneDetails, qsrc);
  set("estrategia", prefill.strategy, recSrc);
  set("fase", prefill.phase, recSrc);
  set("estilo_dieta", prefill.dietStyle, recSrc);
  const split = (txt, opts) => {
    if (!txt) return { sel: [], rest: "" };
    const parts = txt.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    const sel = parts.filter((x) => opts.includes(x));
    return { sel, rest: parts.filter((x) => !opts.includes(x)).join(", ") };
  };
  const r = split(prefill.customRestriction, RESTRICTION_OPTIONS);
  set("restricoes", r.sel, qsrc);
  set("restricoes_outras", r.rest, qsrc);
  const pf = split(prefill.customPreference, PREFERENCE_OPTIONS);
  set("preferencias", pf.sel, qsrc);
  set("preferencias_outras", pf.rest, qsrc);
  if (ctx?.anamnese?.rotina) set("rotina_diaria", String(ctx.anamnese.rotina), "anamnese (rotina)");
  return fillDefaults(fields, out);
}
var r0 = (n) => Math.round(Number(n) || 0);
function resumoDietaAtual(currentDiet) {
  if (!currentDiet) return "Aluno sem dieta publicada.";
  const plan = currentDiet.conteudo_json;
  const t = plan?.targets;
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const meals = days[0]?.meals?.length ?? null;
  const cc = currentDiet.protocols?.carb_cycling?.enabled ? "carb cycling" : "linear";
  return [
    `${currentDiet.titulo ?? "Dieta"} \u2014 publicada em ${fmtDate(currentDiet.published_at ?? currentDiet.created_at)}`,
    t ? `Meta: ${r0(t.kcal)} kcal \xB7 P ${r0(t.p)} g \xB7 C ${r0(t.c)} g \xB7 G ${r0(t.g)} g` : null,
    `${meals ?? "?"} refei\xE7\xF5es/dia \xB7 ${days.length || "?"} dia(s) no plano \xB7 ${cc}`
  ].filter(Boolean).join("\n");
}
function assessGeneratedDiet(p) {
  let validation;
  if (p.carbCyclingEnabled) {
    const rep = validateCanonicalDietDayTargets({ plan: p.plan, dayTargets: p.weeklyCarbTargets, foods: p.foods });
    const reasons = [];
    for (const [wd, d] of Object.entries(rep.days ?? {})) {
      if (d && !d.valid) reasons.push(`${WEEKDAY_LABELS[wd] ?? wd}: ${(d.reasons ?? []).join(" ")}`.trim());
    }
    for (const wd of rep.missingDays ?? []) reasons.push(`${WEEKDAY_LABELS[wd] ?? wd}: dia ausente no plano`);
    validation = { valid: rep.valid, reasons };
  } else {
    const rep = validateCanonicalDietTarget({ plan: p.plan, target: p.target, foods: p.foods });
    validation = { valid: rep.valid, reasons: rep.reasons };
  }
  let viability = null;
  try {
    viability = computeViabilityScore({ plan: p.plan, questionnaire: p.questionnaire ?? null, adherencePct: p.adherencePct, mealCount: p.mealCount || void 0 });
  } catch {
  }
  let newFoods = [];
  try {
    newFoods = detectNewFoodsFromPlan(p.plan, p.foods.map((f) => f.name)).map((f) => f.name ?? f.normalized ?? String(f));
  } catch {
  }
  const unresolved = [];
  for (const d of p.plan.days ?? []) for (const m of d.meals ?? []) for (const it of m.items ?? []) {
    if (it?.resolutionStatus === "unresolved") unresolved.push(`${d.label} \xB7 ${m.name}: ${it.name}`);
  }
  return { validation, viability, newFoods, unresolved };
}
function resumoDietaCompleto(plan, a, warnings = []) {
  const lines = [];
  const t = plan.targets;
  lines.push(`**Meta:** ${r0(t.kcal)} kcal \xB7 P ${r0(t.p)} g \xB7 C ${r0(t.c)} g \xB7 G ${r0(t.g)} g`);
  lines.push(a.validation.valid ? "Valida\xE7\xE3o: dentro da meta (\xB150 kcal / P \xB110 / C \xB115 / G \xB18)." : `Valida\xE7\xE3o: FORA da meta \u2014 ${a.validation.reasons.join(" ")}`);
  if (a.unresolved.length) lines.push(`Alimentos sem v\xEDnculo com a base (bloqueiam a publica\xE7\xE3o): ${a.unresolved.join("; ")}`);
  if (a.newFoods.length) lines.push(`Alimentos novos detectados: ${a.newFoods.join(", ")}`);
  if (a.viability) lines.push(`Viabilidade: ${a.viability.score}/100`);
  for (const w of warnings) lines.push(`Aviso: ${w}`);
  const days = plan.days ?? [];
  const showDays = days.length > 1 ? days : days.slice(0, 1);
  const c = (v) => v == null || String(v).trim() === "" ? "\u2014" : String(v).replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim();
  for (const d of showDays) {
    lines.push("");
    lines.push(`### ${days.length > 1 ? `${c(d.label)} \u2014 ` : ""}${r0(d.totals?.kcal)} kcal \xB7 P ${r0(d.totals?.p)} \xB7 C ${r0(d.totals?.c)} \xB7 G ${r0(d.totals?.g)}`);
    lines.push("");
    lines.push("| Refei\xE7\xE3o | Hor\xE1rio | Alimento | Quantidade | kcal | P | C | G |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const m of d.meals ?? []) {
      for (const it of m.items ?? []) {
        const qtd = it.qtyGrams ? `${r0(it.qtyGrams)} g${it.portionLabel ? ` (${it.portionLabel})` : ""}` : it.portionLabel;
        lines.push(`| ${c(m.name)} | ${c(m.time)} | ${c(it.name)} | ${c(qtd)} | ${r0(it.macros?.kcal)} | ${r0(it.macros?.p)} | ${r0(it.macros?.c)} | ${r0(it.macros?.g)} |`);
      }
      lines.push(`| **${c(m.name)} \u2014 total** |  |  |  | **${r0(m.totals?.kcal)}** | **${r0(m.totals?.p)}** | **${r0(m.totals?.c)}** | **${r0(m.totals?.g)}** |`);
    }
  }
  return lines.join("\n");
}

// supabase/functions/_shared/canonicalDietMarkdown.ts
var num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
var fmt = (v) => {
  if (!Number.isFinite(v) || v <= 0) return "0";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
var cell2 = (v) => num(v) ? String(Math.round(num(v) * 10) / 10) : "-";
var buildCanonicalMealTable = (meals) => {
  const rows = [
    "| Refei\xE7\xE3o | Hor\xE1rio | Alimento | Quantidade | Kcal | P | C | G |",
    "|----------|---------|----------|------------|------|---|---|---|"
  ];
  let dayKcal = 0, dayP = 0, dayC = 0, dayG = 0;
  for (const meal of meals ?? []) {
    let mealKcal = 0, mealP = 0, mealC = 0, mealG = 0;
    const items = meal?.items ?? [];
    items.forEach((item, idx) => {
      const mealCell = idx === 0 ? String(meal?.name ?? "-") : "-";
      const timeCell = idx === 0 ? String(meal?.time || "-") : "-";
      const qty = num(item?.qtyGrams);
      const m = item?.macros ?? {};
      rows.push(
        `| ${mealCell} | ${timeCell} | ${String(item?.name ?? "-")} | ${qty > 0 ? `${Math.round(qty * 10) / 10} g` : item?.portionLabel || "-"} | ${cell2(num(m.kcal))} | ${cell2(num(m.p))} | ${cell2(num(m.c))} | ${cell2(num(m.g))} |`
      );
      mealKcal += num(m.kcal);
      mealP += num(m.p);
      mealC += num(m.c);
      mealG += num(m.g);
    });
    rows.push(
      `| **Total ${String(meal?.name ?? "")}** | - | - | - | ${fmt(mealKcal)} | ${fmt(mealP)} | ${fmt(mealC)} | ${fmt(mealG)} |`
    );
    dayKcal += mealKcal;
    dayP += mealP;
    dayC += mealC;
    dayG += mealG;
  }
  rows.push(`| **TOTAL DIA** | - | - | - | ${fmt(dayKcal)} | ${fmt(dayP)} | ${fmt(dayC)} | ${fmt(dayG)} |`);
  return rows.join("\n");
};
var canonicalDietPlanToMarkdown = (plan) => {
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const meta = plan?.meta ?? {};
  const t = plan?.targets ?? {};
  const headerParts = [];
  if (meta.objective) headerParts.push(`Objetivo: **${meta.objective}**`);
  if (meta.strategy) headerParts.push(`Estrat\xE9gia: **${meta.strategy}**`);
  if (meta.style) headerParts.push(`Estilo: **${meta.style}**`);
  const lines = [];
  lines.push(days.length > 1 ? "## PLANO ALIMENTAR POR DIA" : "## CARD\xC1PIO BASE");
  if (headerParts.length) lines.push(headerParts.join(" \xB7 "));
  lines.push("");
  lines.push(
    `**Meta di\xE1ria:** ${Math.round(num(t.kcal))} kcal \xB7 ${Math.round(num(t.p))}g P \xB7 ${Math.round(num(t.c))}g C \xB7 ${Math.round(num(t.g))}g G`
  );
  lines.push("");
  days.forEach((day, i) => {
    if (days.length > 1) lines.push(`### ${String(day?.label || day?.weekday || `Dia ${i + 1}`)}`);
    lines.push(buildCanonicalMealTable(day?.meals ?? []));
    lines.push("");
  });
  if (plan?.tips?.length) {
    lines.push("## Dicas e timing nutricional");
    for (const tip of plan.tips) lines.push(`- ${tip}`);
    lines.push("");
  }
  if (plan?.whatsappMessages?.length) {
    lines.push("## Mensagens WhatsApp");
    plan.whatsappMessages.forEach((m, idx) => {
      lines.push(`**Parte ${idx + 1}:**`);
      lines.push(m);
      lines.push("");
    });
  }
  if (meta.rationale || meta.decision) {
    lines.push("## Justificativa T\xE9cnica");
    if (meta.decision) lines.push(`- **Decis\xE3o:** ${meta.decision}`);
    if (meta.rationale) lines.push(meta.rationale);
    if (typeof meta.confidence === "number") lines.push(`- **N\xEDvel de confian\xE7a:** ${meta.confidence}/100`);
  }
  return lines.join("\n").trimEnd() + "\n";
};

// src/lib/dietMarkdownSerializer.ts
var dietPlanToMarkdown = (plan) => canonicalDietPlanToMarkdown(plan);

// src/lib/prescriptionEditRow.ts
var num2 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
var str = (v) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};
var list = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
var buildPrescriptionContextSnapshot = (input = {}) => ({
  objective: str(input.objective),
  level: str(input.level),
  days_per_week: num2(input.daysPerWeek),
  priority_muscles: list(input.priorityMuscles),
  periodization: {
    model: str(input.periodization?.model),
    block_type: str(input.periodization?.block_type),
    block_number: num2(input.periodization?.block_number),
    week: num2(input.periodization?.week),
    volume_target: num2(input.periodization?.volume_target)
  },
  restrictions: {
    status: str(input.restrictions?.status),
    explicit_restrictions: list(input.restrictions?.explicit_restrictions),
    pain_flags: list(input.restrictions?.pain_flags)
  },
  recovery: {
    recent_rpe: num2(input.recovery?.recent_rpe),
    adherence: num2(input.recovery?.adherence),
    data_quality: str(input.recovery?.data_quality)
  },
  session_context: {
    day_id: str(input.sessionContext?.day_id),
    day_name: str(input.sessionContext?.day_name),
    session_role: input.sessionContext?.session_role ?? "unknown"
  },
  captured_at: (/* @__PURE__ */ new Date()).toISOString()
});
var buildPrescriptionEditRow = (input, changes) => ({
  professor_id: input.professorId,
  student_id: input.studentId,
  plan_id: input.planId,
  plan_version: input.planVersion ?? null,
  cycle_key: input.cycleKey ?? null,
  source: input.source,
  action_origin: input.actionOrigin ?? "manual",
  before_json: input.before,
  after_json: input.after,
  changes,
  context_snapshot: buildPrescriptionContextSnapshot(input.context)
});

// src/lib/workoutPlanEdit.ts
var parsePauseToSeconds2 = (raw) => {
  if (!raw) return void 0;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-" || s === "\u2014") return void 0;
  const min = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|m)\b/);
  if (min) return Math.round(Number(min[1].replace(",", ".")) * 60);
  const sec = s.match(/^(\d+)/);
  if (sec) return Number(sec[1]);
  return void 0;
};

// src/lib/workoutPlanDiff.ts
var norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
var restSecondsOf = (e) => {
  if (typeof e.restSeconds === "number" && Number.isFinite(e.restSeconds)) return e.restSeconds;
  const parsed = parsePauseToSeconds2(e.pause);
  return typeof parsed === "number" ? parsed : null;
};
var intOf = (v) => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};
var setCounts = (e) => {
  const s1 = intOf(e.series);
  const s2 = intOf(e.series2);
  if (s2 > 0) return { recon: s1, work: s2 };
  return { recon: 0, work: s1 };
};
var perSetSignature = (scheme) => {
  if (!scheme || !Array.isArray(scheme.sets) || scheme.sets.length === 0) return null;
  return [...scheme.sets].sort((a, b) => (a.set_number || 0) - (b.set_number || 0)).map((s) => `${s.set_number}:${s.set_type}:${norm(s.target_reps)}`).join("|");
};
var schemeSnapshot = (e) => ({
  series: e.series || "",
  series2: e.series2 || "",
  setScheme: e.setScheme ?? null
});
var baseChange = (type, ctx, before, after, metadata = {}) => ({
  type,
  day_id: ctx.dayId,
  day_name: ctx.dayName,
  exercise_id: ctx.exerciseId,
  exercise_before: ctx.before?.exercise ?? null,
  exercise_after: ctx.after?.exercise ?? null,
  position_before: ctx.positionBefore ?? null,
  position_after: ctx.positionAfter ?? null,
  before,
  after,
  metadata: { exercise_role: "unknown", ...metadata }
});
var matchDays = (before, after) => {
  const pairs = [];
  const beforeById = new Map(before.days.map((d) => [d.id, d]));
  const usedBefore = /* @__PURE__ */ new Set();
  after.days.forEach((ad) => {
    let bd = beforeById.get(ad.id);
    if (!bd) bd = before.days.find((d) => !usedBefore.has(d.id) && norm(d.day) === norm(ad.day));
    if (bd) usedBefore.add(bd.id);
    pairs.push({ before: bd, after: ad });
  });
  before.days.forEach((bd) => {
    if (!usedBefore.has(bd.id) && !after.days.some((ad) => ad.id === bd.id)) {
      pairs.push({ before: bd, after: void 0 });
    }
  });
  return pairs;
};
var diffWorkoutPlans = (before, after) => {
  const changes = [];
  matchDays(before, after).forEach(({ before: bDay, after: aDay }) => {
    const dayId = aDay?.id ?? bDay?.id ?? null;
    const dayName = aDay?.day ?? bDay?.day ?? null;
    if (bDay && !aDay) {
      bDay.exercises.forEach((ex, i) => {
        changes.push(
          baseChange(
            "EXERCISE_REMOVED",
            { dayId: bDay.id, dayName: bDay.day, exerciseId: ex.id, before: ex, positionBefore: i + 1 },
            { exercise: ex.exercise, exerciseId: ex.exerciseId ?? null },
            null
          )
        );
      });
      return;
    }
    if (!aDay) return;
    if (bDay && norm(bDay.day) !== norm(aDay.day)) {
      changes.push(
        baseChange(
          "DAY_CHANGED",
          { dayId: aDay.id, dayName: aDay.day, exerciseId: null },
          { day: bDay.day },
          { day: aDay.day }
        )
      );
    }
    const beforeExercises = bDay?.exercises ?? [];
    const beforeIndex = new Map(beforeExercises.map((e, i) => [e.id, { ex: e, pos: i + 1 }]));
    const afterIds = new Set(aDay.exercises.map((e) => e.id));
    beforeExercises.forEach((ex, i) => {
      if (afterIds.has(ex.id)) return;
      changes.push(
        baseChange(
          "EXERCISE_REMOVED",
          { dayId: aDay.id, dayName: aDay.day, exerciseId: ex.id, before: ex, positionBefore: i + 1 },
          { exercise: ex.exercise, exerciseId: ex.exerciseId ?? null },
          null
        )
      );
    });
    const reorderOperationId = `reorder:${aDay.id}`;
    aDay.exercises.forEach((aEx, idx) => {
      const posAfter = idx + 1;
      const prev = beforeIndex.get(aEx.id);
      if (!prev) {
        changes.push(
          baseChange(
            "EXERCISE_ADDED",
            { dayId: aDay.id, dayName: aDay.day, exerciseId: aEx.id, after: aEx, positionAfter: posAfter },
            null,
            { exercise: aEx.exercise, exerciseId: aEx.exerciseId ?? null }
          )
        );
        return;
      }
      const bEx = prev.ex;
      const posBefore = prev.pos;
      const ctx = {
        dayId: aDay.id,
        dayName: aDay.day,
        exerciseId: aEx.id,
        before: bEx,
        after: aEx,
        positionBefore: posBefore,
        positionAfter: posAfter
      };
      if (posBefore !== posAfter) {
        changes.push(
          baseChange("EXERCISE_REORDERED", ctx, { position: posBefore }, { position: posAfter }, {
            reorder_operation_id: reorderOperationId
          })
        );
      }
      const replaced = norm(bEx.exercise) !== norm(aEx.exercise) || !!bEx.exerciseId && !!aEx.exerciseId && bEx.exerciseId !== aEx.exerciseId;
      if (replaced) {
        changes.push(
          baseChange(
            "EXERCISE_REPLACED",
            ctx,
            { exercise: bEx.exercise, exerciseId: bEx.exerciseId ?? null },
            { exercise: aEx.exercise, exerciseId: aEx.exerciseId ?? null }
          )
        );
        return;
      }
      const bc = setCounts(bEx);
      const ac = setCounts(aEx);
      if (bc.recon !== ac.recon) {
        changes.push(
          baseChange("RECOGNITION_SETS_CHANGED", ctx, schemeSnapshot(bEx), schemeSnapshot(aEx))
        );
      } else if (bc.work !== ac.work) {
        changes.push(baseChange("SETS_CHANGED", ctx, schemeSnapshot(bEx), schemeSnapshot(aEx)));
      }
      const bMode = bEx.setScheme?.mode ?? null;
      const aMode = aEx.setScheme?.mode ?? null;
      const bSig = perSetSignature(bEx.setScheme);
      const aSig = perSetSignature(aEx.setScheme);
      const perSetInvolved = bMode === "per_set" || aMode === "per_set";
      if (perSetInvolved && (bSig !== aSig || bMode !== aMode)) {
        changes.push(
          baseChange(
            "PER_SET_REPS_CHANGED",
            ctx,
            { reps: bEx.reps || "", setScheme: bEx.setScheme ?? null },
            { reps: aEx.reps || "", setScheme: aEx.setScheme ?? null }
          )
        );
      } else if (norm(bEx.reps) !== norm(aEx.reps)) {
        changes.push(baseChange("REPS_CHANGED", ctx, { reps: bEx.reps || "" }, { reps: aEx.reps || "" }));
      }
      if (norm(bEx.rir) !== norm(aEx.rir)) {
        changes.push(baseChange("RIR_CHANGED", ctx, { rir: bEx.rir || "" }, { rir: aEx.rir || "" }));
      }
      const bRest = restSecondsOf(bEx);
      const aRest = restSecondsOf(aEx);
      if (bRest !== aRest) {
        changes.push(
          baseChange(
            "REST_CHANGED",
            ctx,
            { restSeconds: bRest, pause: bEx.pause || "" },
            { restSeconds: aRest, pause: aEx.pause || "" }
          )
        );
      }
      if (norm(bEx.variation) !== norm(aEx.variation)) {
        changes.push(
          baseChange("VARIATION_CHANGED", ctx, { variation: bEx.variation || "" }, { variation: aEx.variation || "" })
        );
      }
      if (norm(bEx.description) !== norm(aEx.description)) {
        changes.push(
          baseChange(
            "DESCRIPTION_CHANGED",
            ctx,
            { description: bEx.description || "" },
            { description: aEx.description || "" }
          )
        );
      }
      if (norm(bEx.tempo) !== norm(aEx.tempo)) {
        changes.push(baseChange("TEMPO_CHANGED", ctx, { tempo: bEx.tempo || "" }, { tempo: aEx.tempo || "" }));
      }
      if (norm(bEx.notes) !== norm(aEx.notes)) {
        changes.push(baseChange("NOTES_CHANGED", ctx, { notes: bEx.notes || "" }, { notes: aEx.notes || "" }));
      }
    });
  });
  return changes;
};

// src/lib/workoutEditorOptions.ts
var REC_REPS_OPTS = ["8", "10", "12", "15", "20", "15s", "20s", "30s", "45s", "60s"];
var WORK_REPS_OPTS = ["6", "8", "10", "12", "15", "6-8", "8-10", "8-12", "10-12", "12-15", "15s", "20s", "30s", "45s", "60s", "90s"];
var PAUSE_OPTS = ["10s", "15s", "30s", "45s", "60s", "90s", "120s", "180s"];
var OFFICE_PAUSE_OPTS = PAUSE_OPTS.filter((p) => p !== "180s");

// src/lib/officeWizard/treinoAnalysis.ts
var GRUPOS_PEQUENOS = ["biceps", "triceps", "ombro", "panturrilha", "abdomen"];
var GRUPOS_GRANDES = ["costas", "peito", "quadriceps", "gluteo", "posterior"];
var ALVO_PEQUENO = { min: 8, max: 12 };
var ALVO_GRANDE = { min: 12, max: 20 };
var LIMITE_DIA_SEMANA1 = 18;
var GRUPO_LABEL = {
  peito: "Peito",
  costas: "Costas",
  quadriceps: "Quadr\xEDceps",
  gluteo: "Gl\xFAteo",
  posterior: "Posterior",
  biceps: "B\xEDceps",
  triceps: "Tr\xEDceps",
  ombro: "Ombro",
  panturrilha: "Panturrilha",
  abdomen: "Abd\xF4men",
  adutores: "Adutores",
  outro: "Outros"
};
var grupoLabel = (g) => GRUPO_LABEL[g];
var norm2 = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
var isNaoContavel = (name) => /mobilidade|alongamento|liberacao|ativacao|respiracao/.test(norm2(name));
function grupoPrincipal(name, grupoBanco) {
  const n = norm2(name);
  if (/triceps/.test(n)) return "triceps";
  if (/elevacao pelvica|hip thrust|kick ?back|abdutora|abducao|gluteo|coice/.test(n)) return "gluteo";
  if (/adutora|aducao/.test(n)) return "adutores";
  if (/stiff|rdl|romeno|good morning|flexora|nordic|hiperextensao/.test(n)) return "posterior";
  if (/panturrilha|gemeos|soleo/.test(n)) return "panturrilha";
  if (/crucifixo inverso|face pull|desenvolvimento|elevacao lateral|elevacao frontal|ombro|arnold|remada alta/.test(n)) return "ombro";
  if (/afundo|agachamento|leg|hack|extensora|bulgaro|passada|sissy|avanco|step ?up/.test(n)) return "quadriceps";
  if (/rosca|biceps/.test(n)) return "biceps";
  if (/testa|frances|mergulho/.test(n)) return "triceps";
  if (/supino|crucifixo|peck|voador|crossover|cross over|flexao de braco|peitoral/.test(n)) return "peito";
  if (/puxada|remada|pulldown|pull ?down|barra fixa|pull ?up|pullover|costas|graviton|serrote/.test(n)) return "costas";
  if (/abdominal|abdomen|prancha|crunch|infra|obliquo|roda abdominal/.test(n)) return "abdomen";
  const b = norm2(grupoBanco);
  if (/peit/.test(b)) return "peito";
  if (/costa|dorsal/.test(b)) return "costas";
  if (/quadri|coxa/.test(b)) return "quadriceps";
  if (/glut/.test(b)) return "gluteo";
  if (/posterior|isquio/.test(b)) return "posterior";
  if (/bicep/.test(b)) return "biceps";
  if (/tricep/.test(b)) return "triceps";
  if (/ombro|deltoid/.test(b)) return "ombro";
  if (/pantu/.test(b)) return "panturrilha";
  if (/abdo|core/.test(b)) return "abdomen";
  return "outro";
}
var int = (v) => {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
function seriesDeTrabalho(ex) {
  if (isNaoContavel(ex.exercise)) return 0;
  if (ex.setScheme?.sets?.length) return ex.setScheme.sets.filter((s) => s.set_type === "work").length;
  const s1 = int(ex.series);
  const s2 = int(ex.series2);
  if (s1 > 0 && s2 > 0) return s2;
  return s1 || s2;
}
var isComposite = (reps) => reps.includes("+");
var pauseLabel = (ex) => ex.restSeconds ? `${ex.restSeconds}s` : String(ex.pause ?? "").trim();
function problemasCampos(ex) {
  const out = [];
  if (!String(ex.exercise ?? "").trim()) out.push("exerc\xEDcio sem nome");
  const mob = isNaoContavel(ex.exercise);
  const reps = String(ex.reps ?? "").trim();
  if (!int(ex.series) && !int(ex.series2) && !ex.setScheme?.sets?.length) out.push("s\xE9ries em branco");
  if (ex.setScheme?.sets?.length) {
    for (const s of ex.setScheme.sets) {
      const ok = s.set_type === "work" ? WORK_REPS_OPTS : [...REC_REPS_OPTS, ...WORK_REPS_OPTS];
      if (!ok.includes(String(s.target_reps).trim())) out.push(`reps "${s.target_reps}" fora do editor (s\xE9rie ${s.set_number})`);
    }
  } else if (!reps) {
    out.push("reps em branco");
  } else if (!mob) {
    if (isComposite(reps)) {
      const [r, w] = reps.split("+").map((p2) => p2.trim());
      if (!REC_REPS_OPTS.includes(r) && !WORK_REPS_OPTS.includes(r)) out.push(`reps de reconhecimento "${r}" fora do editor`);
      if (!WORK_REPS_OPTS.includes(w)) out.push(`reps "${w}" fora do editor`);
    } else if (!WORK_REPS_OPTS.includes(reps)) out.push(`reps "${reps}" fora do editor`);
  }
  const p = pauseLabel(ex);
  if (!p) {
    if (!mob) out.push("pausa em branco");
  } else if (!OFFICE_PAUSE_OPTS.includes(p)) out.push(`pausa "${p}" fora do editor`);
  return out;
}
var VARIACAO_PROPRIA = /^(kick ?back|hiperextensao lombar)/;
var isProibido = (name) => {
  const n = norm2(name);
  return /isometria (na )?parede/.test(n) || n === "elevacao pelvica unilateral" || n === "elevacao pelvica unilateral 1";
};
var isCompostoGluteo = (name) => /elevacao pelvica|hip thrust/.test(norm2(name));
var isPuxadaVertical = (name) => /puxada|pulldown|pull ?down|barra fixa|pull ?up|graviton/.test(norm2(name)) && !/(braco|bracos) estendido|pullover/.test(norm2(name));
var isInferior = (g) => ["quadriceps", "gluteo", "posterior", "adutores"].includes(g);
function analisarTreino(plan, opts = {}) {
  const semana = opts.semana ?? null;
  const porDia = [];
  const totals = /* @__PURE__ */ new Map();
  const avisos = [];
  const principaisPorDia = plan.days.map((d) => new Set(d.exercises.map((e) => norm2(e.exercise))));
  plan.days.forEach((day, di) => {
    let diaSeries = 0;
    const gruposDia = /* @__PURE__ */ new Map();
    for (const ex of day.exercises) {
      const g = grupoPrincipal(ex.exercise, opts.grupoBanco?.(ex.exercise));
      const s = seriesDeTrabalho(ex);
      diaSeries += s;
      if (s > 0) {
        totals.set(g, (totals.get(g) ?? 0) + s);
        gruposDia.set(g, (gruposDia.get(g) ?? 0) + 1);
      }
      const label = `${day.day} \xB7 ${ex.exercise || "(sem nome)"}`;
      for (const p of problemasCampos(ex)) avisos.push(`${label}: ${p}.`);
      if (isProibido(ex.exercise)) avisos.push(`${label}: exerc\xEDcio que n\xE3o entra nas regras Marombiew.`);
      if (!isNaoContavel(ex.exercise)) {
        const v = String(ex.variation ?? "").trim();
        if (!v || v === "-" || v === "\u2014") avisos.push(`${label}: varia\xE7\xE3o vazia.`);
        else {
          if (isProibido(v)) avisos.push(`${label}: varia\xE7\xE3o "${v}" n\xE3o entra nas regras Marombiew.`);
          const nv = norm2(v);
          if (!VARIACAO_PROPRIA.test(norm2(ex.exercise))) {
            const outro = principaisPorDia.findIndex((set, j) => j !== di && set.has(nv));
            if (outro >= 0) avisos.push(`${label}: varia\xE7\xE3o "${v}" repete o principal de ${plan.days[outro].day}.`);
          }
        }
      }
    }
    const temInferior = [...gruposDia.keys()].filter(isInferior).length > 0 && (gruposDia.get("quadriceps") ?? 0) + (gruposDia.get("gluteo") ?? 0) + (gruposDia.get("posterior") ?? 0) >= 2;
    if (temInferior && (gruposDia.get("gluteo") ?? 0) > 0 && !day.exercises.some((e) => isCompostoGluteo(e.exercise))) {
      avisos.push(`${day.day}: dia de inferiores com gl\xFAteo sem composto de gl\xFAteo (eleva\xE7\xE3o p\xE9lvica).`);
    }
    const costasDia = (gruposDia.get("costas") ?? 0) >= 2 || /costas|dorsal/.test(norm2(day.focus));
    if (costasDia && !day.exercises.some((e) => isPuxadaVertical(e.exercise))) {
      avisos.push(`${day.day}: dia de costas sem puxada vertical composta.`);
    }
    const acimaLimite = (semana == null || semana === 1) && diaSeries > LIMITE_DIA_SEMANA1;
    porDia.push({ dia: day.day, series: diaSeries, acimaLimite });
  });
  const porGrupo = [];
  for (const g of [...GRUPOS_GRANDES, ...GRUPOS_PEQUENOS]) {
    const s = totals.get(g) ?? 0;
    const alvo = GRUPOS_GRANDES.includes(g) ? ALVO_GRANDE : ALVO_PEQUENO;
    porGrupo.push({ grupo: g, series: s, alvo, status: s < alvo.min ? "abaixo" : s > alvo.max ? "acima" : "ok" });
  }
  for (const g of ["adutores", "outro"]) {
    const s = totals.get(g) ?? 0;
    if (s > 0) porGrupo.push({ grupo: g, series: s, alvo: null, status: "sem_alvo" });
  }
  const L = [];
  L.push(`An\xE1lise do treino${semana ? ` (semana ${semana} do ciclo)` : ""}`);
  L.push("");
  L.push("S\xE9ries de trabalho por dia (reconhecimento e mobilidade n\xE3o contam):");
  for (const d of porDia) L.push(`\u2022 ${d.dia}: ${d.series}${d.acimaLimite ? ` \u26A0 acima de ${LIMITE_DIA_SEMANA1}${semana == null ? " (semana do ciclo desconhecida; limite da semana 1)" : " na semana 1"}` : ""}`);
  L.push("");
  L.push("S\xE9ries de trabalho por grupo na semana:");
  for (const g of porGrupo) {
    const alvo = g.alvo ? ` (alvo ${g.alvo.min}\u2013${g.alvo.max})` : "";
    const st = g.status === "abaixo" ? " \u26A0 abaixo" : g.status === "acima" ? " \u26A0 acima" : g.status === "ok" ? " \u2713" : "";
    L.push(`\u2022 ${grupoLabel(g.grupo)}: ${g.series}${alvo}${st}`);
  }
  L.push("");
  if (avisos.length) {
    L.push("Pontos a corrigir:");
    for (const a of avisos) L.push(`\u2022 ${a}`);
  } else L.push("Nenhum campo em branco, valor fora do editor ou falha de estrutura encontrado.");
  return { texto: L.join("\n"), porDia, porGrupo, avisos };
}
function semanaDoCiclo(plan, now = /* @__PURE__ */ new Date()) {
  const start = plan?.block_start_date ?? plan?.fase_inicio_data ?? plan?.created_at ?? null;
  if (!start) return null;
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return null;
  const w = Math.floor((now.getTime() - t) / (7 * 864e5)) + 1;
  return w >= 1 ? w : 1;
}

// src/lib/officeWizard/officeAdjust.ts
var AJUSTE_CATEGORIAS = {
  treino: ["volume", "exercicios", "reps_pausa", "metodos", "dias", "descricoes", "revisar", "livre"],
  dieta: ["porcoes", "alimentos", "macros", "refeicoes", "revisar", "livre"],
  cardio: ["frequencia", "intensidade", "modalidade", "livre"]
};
function categoriaValida(tipo, categoria) {
  return AJUSTE_CATEGORIAS[tipo].includes(categoria);
}
var REGRAS_TREINO_MAROMBIEW = `REGRAS MAROMBIEW (TREINO)
- Volume: nunca corte s\xE9ries para segurar o dia; passe compostos/acess\xF3rios para "Reconhecimento + trabalho" (series=1 de reconhecimento, series2=2 de trabalho, reps "12 + 8-10"). Grupos pequenos (b\xEDceps, tr\xEDceps, ombro, panturrilha, abd\xF4men) 8\u201312 s\xE9ries de trabalho por semana; grandes (costas, peito, quadr\xEDceps, gl\xFAteo, posterior) 12\u201320, mesmo que o dia passe de 18.
- B\xEDceps, tr\xEDceps, extensora, flexoras, eleva\xE7\xE3o p\xE9lvica, afundo e kick back: m\xEDnimo 3 s\xE9ries de trabalho.
- Contagem por grupo principal: afundo/agachamento/leg = quadr\xEDceps; eleva\xE7\xE3o p\xE9lvica/kick back/abdu\xE7\xE3o = gl\xFAteo; stiff/RDL/good morning/flexoras = posterior. Mobilidade, alongamento, libera\xE7\xE3o, ativa\xE7\xE3o e respira\xE7\xE3o N\xC3O contam s\xE9ries e ficam sem descri\xE7\xE3o.
- Varia\xE7\xE3o: mesma fam\xEDlia do principal e sem repetir o principal de outro dia. "AGACHAMENTO" sem complemento \xE9 peso corporal. Nunca "Isometria parede". "Eleva\xE7\xE3o p\xE9lvica unilateral" (a "1") n\xE3o entra: use "Eleva\xE7\xE3o p\xE9lvica unilateral 2" ou "Eleva\xE7\xE3o p\xE9lvica". Kick back e Hiperextens\xE3o lombar: a varia\xE7\xE3o \xE9 o pr\xF3prio exerc\xEDcio.
- Dias de inferiores: um grupo por vez (quadr\xEDceps \u2192 posterior \u2192 gl\xFAteo \u2192 panturrilha), abdutora/adutora no bloco de gl\xFAteo, composto de gl\xFAteo (eleva\xE7\xE3o p\xE9lvica) em todo dia de inferiores, panturrilha com 3 s\xE9ries por dia de inferiores.
- Dia de costas sempre com puxada vertical composta.
- Descri\xE7\xE3o para avan\xE7ado = estrat\xE9gia (pico de contra\xE7\xE3o, exc\xEAntrica 3s, onde alongar, s\xE9rie de falha), n\xE3o ensinar o exerc\xEDcio.
- T\xE9cnicas pedidas (drop set, rest-pause, cluster, pir\xE2mide, bi-set/superset) v\xE3o no campo de m\xE9todo/agrupamento E explicadas na descri\xE7\xE3o. Drop set: metodo "dropset" + metodo_params {aplicar:"ultima"|"todas", drops, reducao_pct}. Rest-pause: metodo "restpause" + {aplicar, pausa_s (10\u201330), minis}. Cluster: metodo "cluster" + {blocos, reps_bloco, pausa_s}. Bi-set/superset: mesmo grupo_id nos dois exerc\xEDcios consecutivos, tipo_grupo "biset"|"superset", ordem_grupo "A"/"B", pausa_grupo_s 0\u201310. Pir\xE2mide de reps: setScheme {mode:"per_set", sets:[{set_number, set_type:"work", target_reps}]} + method {slug:"pyramid_up"} (ou pyramid_down se decrescente).`;
var REGRAS_DIETA_MAROMBIEW = `REGRAS MAROMBIEW (DIETA)
- Por\xE7\xF5es reais: ovo 50 g por unidade; fruta 1 unidade; whey 30 g ou 15 g; atum 1 lata (~80 g); iogurte 1 pote; abacate no m\xEDnimo 40 g; prote\xEDna do almo\xE7o e do jantar no m\xEDnimo 90 g.
- Manteiga n\xE3o entra.
- Para fechar a meta, mexa nos carboidratos de base (arroz, batata, aveia, p\xE3o, tapioca, macarr\xE3o\u2026), nunca em por\xE7\xF5es simb\xF3licas.
- Toler\xE2ncia da meta di\xE1ria: kcal \xB150, P \xB110 g, C \xB115 g, G \xB18 g.`;
var OPCOES_EDITOR = `VALORES ACEITOS PELO EDITOR (nada fora disso)
- Reps de trabalho: ${WORK_REPS_OPTS.join(", ")}.
- Reps de reconhecimento (antes do "+"): ${REC_REPS_OPTS.join(", ")}.
- Pausa (restSeconds em segundos, equivalente a): ${OFFICE_PAUSE_OPTS.join(", ")}.`;
var CATEGORIA_TREINO = {
  volume: "Ajuste de VOLUME (s\xE9ries por exerc\xEDcio/grupo).",
  exercicios: "Troca/inclus\xE3o/remo\xE7\xE3o de EXERC\xCDCIOS ou varia\xE7\xF5es.",
  reps_pausa: "Ajuste de REPETI\xC7\xD5ES e PAUSAS.",
  metodos: "Aplicar/remover M\xC9TODOS (drop set, rest-pause, cluster, pir\xE2mide, bi-set/superset).",
  dias: "Mudan\xE7a na estrutura de DIAS (ordem, divis\xE3o, foco).",
  descricoes: "Reescrever DESCRI\xC7\xD5ES (estrat\xE9gia para avan\xE7ado).",
  revisar: "REVISAR o treino inteiro aplicando TODAS as regras Marombiew (pode mexer onde for preciso para cumprir as regras).",
  livre: "Pedido livre."
};
var CATEGORIA_DIETA = {
  porcoes: "Ajuste de POR\xC7\xD5ES.",
  alimentos: "Troca/inclus\xE3o/remo\xE7\xE3o de ALIMENTOS.",
  macros: "Ajuste de MACROS (mantendo a meta publicada).",
  refeicoes: "Mudan\xE7a de REFEI\xC7\xD5ES (hor\xE1rios, ordem, composi\xE7\xE3o).",
  revisar: "REVISAR a dieta inteira aplicando TODAS as regras Marombiew.",
  livre: "Pedido livre."
};
var CATEGORIA_CARDIO = {
  frequencia: "Ajuste de FREQU\xCANCIA.",
  intensidade: "Ajuste de INTENSIDADE/zonas.",
  modalidade: "Troca de MODALIDADE.",
  livre: "Pedido livre."
};
function buildTreinoAjusteMessages(p) {
  const system = [
    "Voc\xEA \xE9 o assistente de prescri\xE7\xE3o do personal Fabiew (Marombiew). Recebe o treino VIGENTE em JSON e um pedido de ajuste.",
    'Devolva o treino COMPLETO alterado, no MESMO formato JSON (version, type "workout", metadata, days[].exercises[]), mudando SOMENTE o que o pedido exige. Todo o resto (ids, ordem, campos, textos) fica byte a byte id\xEAntico. Preserve os "id" de dias e exerc\xEDcios existentes; exerc\xEDcios novos recebem id novo \xFAnico.',
    "Exerc\xEDcios e varia\xE7\xF5es: SOMENTE nomes exatos do banco abaixo.",
    OPCOES_EDITOR,
    REGRAS_TREINO_MAROMBIEW,
    `M\xE9todos ativos (method.slug): ${p.metodos.join(", ") || "nenhum"}.`,
    'Resposta: JSON { "plan": <treino completo>, "mudancas": ["antes \u2192 depois", ...] }.',
    "BANCO DE EXERC\xCDCIOS:\n" + p.catalogBlock
  ].join("\n\n");
  const user = [
    `Categoria: ${CATEGORIA_TREINO[p.categoria] ?? p.categoria}`,
    `Pedido do Fabiew: ${p.pedido}`,
    ...p.correcao?.length ? [`CORRIJA estes problemas da sua resposta anterior, sem mexer em mais nada:
- ${p.correcao.join("\n- ")}`] : [],
    "Treino vigente (JSON):",
    JSON.stringify(p.plan)
  ].join("\n\n");
  return { system, user };
}
function buildDietaAjusteMessages(p) {
  const system = [
    "Voc\xEA \xE9 o assistente de nutri\xE7\xE3o do personal Fabiew (Marombiew). Recebe a dieta VIGENTE em JSON e um pedido de ajuste.",
    "Devolva a dieta COMPLETA alterada, no MESMO contrato (meta, targets, days[].meals[].items[] com foodId, name, qtyGrams, portionLabel, macros), mudando SOMENTE o que o pedido exige; o resto fica id\xEAntico. Mantenha targets (a meta publicada) intactos.",
    "Alimentos: SOMENTE da base abaixo, com o foodId e o nome exatos. Os macros ser\xE3o recalculados pela base.",
    REGRAS_DIETA_MAROMBIEW,
    'Resposta: JSON { "plan": <dieta completa>, "mudancas": ["antes \u2192 depois", ...] }.',
    "BASE DE ALIMENTOS:\n" + p.foodCatalogBlock
  ].join("\n\n");
  const user = [
    `Categoria: ${CATEGORIA_DIETA[p.categoria] ?? p.categoria}`,
    `Pedido do Fabiew: ${p.pedido}`,
    ...p.correcao?.length ? [`CORRIJA estes problemas da sua resposta anterior, sem mexer em mais nada:
- ${p.correcao.join("\n- ")}`] : [],
    "Dieta vigente (JSON):",
    JSON.stringify(p.plan)
  ].join("\n\n");
  return { system, user };
}
function buildCardioAjusteMessages(p) {
  return {
    system: [
      "Voc\xEA \xE9 o assistente de cardio do personal Fabiew (Marombiew). Recebe o plano de cardio VIGENTE em JSON e um pedido de ajuste.",
      "Devolva o plano COMPLETO alterado no MESMO formato JSON, mudando SOMENTE o que o pedido exige; o resto fica id\xEAntico.",
      'Resposta: JSON { "plan": <cardio completo>, "mudancas": ["antes \u2192 depois", ...] }.'
    ].join("\n\n"),
    user: [`Categoria: ${CATEGORIA_CARDIO[p.categoria] ?? p.categoria}`, `Pedido do Fabiew: ${p.pedido}`, "Cardio vigente (JSON):", JSON.stringify(p.payload)].join("\n\n")
  };
}
function parseAjusteResposta(content) {
  let v = content;
  if (typeof v === "string") {
    const t = v.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      v = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  let plan = "plan" in v ? v.plan : v;
  if (typeof plan === "string") {
    try {
      plan = JSON.parse(plan);
    } catch {
      return null;
    }
  }
  const mudancas = Array.isArray(v.mudancas) ? v.mudancas.map(String) : [];
  return plan && typeof plan === "object" ? { plan, mudancas } : null;
}
var MIN3 = /rosca|biceps|triceps|testa|frances|extensora|flexora|elevacao pelvica|hip thrust|afundo|kick ?back/;
function validateTreinoAjuste(before, rawAfter, catalogNames, metodos, categoria) {
  const after = normalizeWorkoutPlan(rawAfter);
  if (!after || !after.days.length) return { plan: null, erros: ["Resposta sem treino no formato do editor (days/exercises)."] };
  const names = new Set([...catalogNames].map(norm2));
  const slugs2 = /* @__PURE__ */ new Set([...metodos]);
  const beforeById = /* @__PURE__ */ new Map();
  for (const d of before.days) for (const e of d.exercises) beforeById.set(e.id, e);
  const erros = [];
  const ids = /* @__PURE__ */ new Set();
  for (const day of after.days) {
    for (const ex of day.exercises) {
      const label = `${day.day} \xB7 ${ex.exercise || "(sem nome)"}`;
      if (ids.has(ex.id)) erros.push(`${label}: id repetido (${ex.id}).`);
      ids.add(ex.id);
      const prev = beforeById.get(ex.id);
      const changed = categoria === "revisar" || !prev || JSON.stringify(prev) !== JSON.stringify(ex);
      if (!changed) continue;
      if (!names.has(norm2(ex.exercise))) erros.push(`${label}: exerc\xEDcio fora do banco (use o nome exato).`);
      const v = String(ex.variation ?? "").trim();
      if (v && v !== "-" && v !== "\u2014" && !names.has(norm2(v))) erros.push(`${label}: varia\xE7\xE3o "${v}" fora do banco.`);
      if (isProibido(ex.exercise) || v && isProibido(v)) erros.push(`${label}: exerc\xEDcio proibido pelas regras Marombiew.`);
      for (const pr of problemasCampos(ex)) erros.push(`${label}: ${pr}.`);
      if (!isNaoContavel(ex.exercise) && MIN3.test(norm2(ex.exercise)) && seriesDeTrabalho(ex) < 3) erros.push(`${label}: m\xEDnimo 3 s\xE9ries de trabalho.`);
      if (ex.method?.slug && slugs2.size && !slugs2.has(ex.method.slug)) erros.push(`${label}: m\xE9todo "${ex.method.slug}" n\xE3o existe.`);
      if (ex.grupo_id) {
        const pares = day.exercises.filter((o) => o.grupo_id === ex.grupo_id);
        if (pares.length !== 2) erros.push(`${label}: agrupamento ${ex.tipo_grupo ?? ""} precisa de exatamente 2 exerc\xEDcios.`);
      }
    }
  }
  return { plan: after, erros };
}
var exResumo = (e) => {
  const reps = e.setScheme?.mode === "per_set" ? e.setScheme.sets.map((s) => s.target_reps).join("/") : e.reps;
  const series = e.series2 ? `${e.series}+${e.series2}` : e.series;
  const pausa = e.restSeconds ? `${e.restSeconds}s` : e.pause;
  const metodo = [e.method?.slug, e.metodo && e.metodo !== "nenhum" ? e.metodo : null, e.tipo_grupo ? `${e.tipo_grupo} ${e.ordem_grupo ?? ""}`.trim() : null].filter(Boolean).join(", ");
  return `${e.exercise} ${series || "?"}x${reps || "?"}${pausa ? ` pausa ${pausa}` : ""}${metodo ? ` [${metodo}]` : ""}${e.variation ? ` (var. ${e.variation})` : ""}`;
};
var CAMPOS = [
  ["exercise", "exerc\xEDcio"],
  ["variation", "varia\xE7\xE3o"],
  ["series", "s\xE9ries"],
  ["series2", "s\xE9ries de trabalho"],
  ["reps", "reps"],
  ["rir", "RIR"],
  ["restSeconds", "pausa"],
  ["pause", "pausa"],
  ["description", "descri\xE7\xE3o"],
  ["setScheme", "esquema de s\xE9ries"],
  ["method", "m\xE9todo"],
  ["metodo", "m\xE9todo"],
  ["metodo_params", "par\xE2metros do m\xE9todo"],
  ["grupo_id", "agrupamento"],
  ["tipo_grupo", "tipo de agrupamento"]
];
var show = (v) => v == null || v === "" ? "\u2014" : typeof v === "object" ? JSON.stringify(v) : String(v);
function mudancasTreino(before, after) {
  const out = [];
  const bDays = new Map(before.days.map((d) => [d.id, d]));
  const aDays = new Map(after.days.map((d) => [d.id, d]));
  for (const d of before.days) if (!aDays.has(d.id)) out.push(`${d.day}: dia removido`);
  for (const d of after.days) {
    const b = bDays.get(d.id);
    if (!b) {
      out.push(`${d.day}: dia novo (${d.exercises.map((e) => e.exercise).join(", ")})`);
      continue;
    }
    if (b.day !== d.day || (b.focus ?? "") !== (d.focus ?? "")) out.push(`${b.day}${b.focus ? ` (${b.focus})` : ""} \u2192 ${d.day}${d.focus ? ` (${d.focus})` : ""}`);
    const bEx = new Map(b.exercises.map((e) => [e.id, e]));
    const aIds = new Set(d.exercises.map((e) => e.id));
    for (const e of b.exercises) if (!aIds.has(e.id)) out.push(`${d.day}: removido ${exResumo(e)}`);
    d.exercises.forEach((e, i) => {
      const p = bEx.get(e.id);
      if (!p) {
        out.push(`${d.day}: inclu\xEDdo ${exResumo(e)}`);
        return;
      }
      for (const [k, label] of CAMPOS) {
        if (JSON.stringify(p[k] ?? null) !== JSON.stringify(e[k] ?? null)) out.push(`${d.day} \xB7 ${p.exercise}: ${label} ${show(p[k])} \u2192 ${show(e[k])}`);
      }
      if (b.exercises.indexOf(p) !== i) out.push(`${d.day} \xB7 ${e.exercise}: posi\xE7\xE3o ${b.exercises.indexOf(p) + 1} \u2192 ${i + 1}`);
    });
  }
  return out;
}
var itemKey = (it) => String(it?.foodId || norm2(it?.name));
var itemTxt = (it) => `${it?.name ?? "?"}${it?.qtyGrams ? ` ${Math.round(Number(it.qtyGrams))}g` : ""}`;
function mudancasDieta(before, after) {
  const out = [];
  const bDays = before?.days ?? [];
  const aDays = after?.days ?? [];
  const multi = aDays.length > 1;
  aDays.forEach((d, di) => {
    const b = bDays.find((x) => x.label === d.label) ?? bDays[di];
    const pre = multi ? `${d.label} \xB7 ` : "";
    if (!b) {
      out.push(`${pre}dia novo`);
      return;
    }
    const bMeals = b.meals ?? [];
    for (const m of bMeals) if (!(d.meals ?? []).some((x) => x.id === m.id || x.name === m.name)) out.push(`${pre}${m.name}: refei\xE7\xE3o removida`);
    for (const m of d.meals ?? []) {
      const pm = bMeals.find((x) => x.id === m.id) ?? bMeals.find((x) => x.name === m.name);
      if (!pm) {
        out.push(`${pre}${m.name}: refei\xE7\xE3o nova (${(m.items ?? []).map(itemTxt).join(", ")})`);
        continue;
      }
      if ((pm.time ?? "") !== (m.time ?? "")) out.push(`${pre}${m.name}: hor\xE1rio ${pm.time ?? "\u2014"} \u2192 ${m.time ?? "\u2014"}`);
      const bi = new Map((pm.items ?? []).map((it) => [itemKey(it), it]));
      const ai = new Map((m.items ?? []).map((it) => [itemKey(it), it]));
      for (const [k, it] of bi) if (!ai.has(k)) out.push(`${pre}${m.name}: sai ${itemTxt(it)}`);
      for (const [k, it] of ai) {
        const p = bi.get(k);
        if (!p) out.push(`${pre}${m.name}: entra ${itemTxt(it)}`);
        else if (Math.round(Number(p.qtyGrams ?? 0)) !== Math.round(Number(it.qtyGrams ?? 0))) out.push(`${pre}${m.name}: ${itemTxt(p)} \u2192 ${itemTxt(it)}`);
      }
    }
    const bt = b.totals ?? {};
    const at = d.totals ?? {};
    if (Math.round(bt.kcal ?? 0) !== Math.round(at.kcal ?? 0)) out.push(`${pre}total ${Math.round(bt.kcal ?? 0)} kcal \xB7 P ${Math.round(bt.p ?? 0)} \xB7 C ${Math.round(bt.c ?? 0)} \xB7 G ${Math.round(bt.g ?? 0)} \u2192 ${Math.round(at.kcal ?? 0)} kcal \xB7 P ${Math.round(at.p ?? 0)} \xB7 C ${Math.round(at.c ?? 0)} \xB7 G ${Math.round(at.g ?? 0)}`);
  });
  return out;
}
function dietaItensProibidos(plan) {
  const out = [];
  for (const d of plan?.days ?? []) for (const m of d.meals ?? []) for (const it of m.items ?? []) {
    if (/manteiga/.test(norm2(it?.name)) && !/amendoim|castanha|amendoa/.test(norm2(it?.name))) out.push(`${d.label} \xB7 ${m.name}: ${it.name} (manteiga n\xE3o entra)`);
  }
  return out;
}
function mudancasTexto(before, after) {
  const b = new Set(before.split("\n").map((l) => l.trim()).filter(Boolean));
  const a = after.split("\n").map((l) => l.trim()).filter(Boolean);
  const aSet = new Set(a);
  return [...[...b].filter((l) => !aSet.has(l)).map((l) => `antes: ${l}`), ...a.filter((l) => !b.has(l)).map((l) => `depois: ${l}`)];
}
function secaoOQueMudou(mudancas, declaradas = []) {
  const L = ["", "## O que mudou (antes \u2192 depois)", ""];
  if (!mudancas.length) L.push("- Nenhuma diferen\xE7a encontrada no plano.");
  for (const m of mudancas) L.push(`- ${m}`);
  if (declaradas.length) {
    L.push("", "**Resumo da IA:**", "");
    for (const m of declaradas) L.push(`- ${m}`);
  }
  return L.join("\n");
}
export {
  AJUSTE_CATEGORIAS,
  analisarTreino,
  assessGeneratedDiet,
  buildCardioAjusteMessages,
  buildCardioPlanInsert,
  buildCardioRequestBody,
  buildDietAgentBody,
  buildDietDraftInsert,
  buildDietFoodHints,
  buildDietGenerationPrompts,
  buildDietProtocols,
  buildDietTrainingContext,
  buildDietaAjusteMessages,
  buildPrescriptionEditRow,
  buildTreinoAjusteMessages,
  buildTreinoGenerationRequest,
  buildWorkoutPlanInsertPayload,
  buildWorkoutPlanUpdatePayload,
  canGenerateTreino,
  cardioFields,
  categoriaValida,
  defaultCardioWizardState,
  defaultDietaWizardState,
  defaultTreinoWizardState,
  deriveDietaWizard,
  dietPlanToMarkdown,
  dietPreferencesText,
  dietaFields,
  dietaItensProibidos,
  diffWorkoutPlans,
  finalizeDietAgentPlan,
  loadActiveTrainingMarkdown,
  loadCardioWizardData,
  loadDietFoodRecords,
  loadDietaStudentData,
  loadTreinoWizardData,
  mudancasDieta,
  mudancasTexto,
  mudancasTreino,
  normalizeWorkoutPlan,
  parseAjusteResposta,
  parseCardioPayload,
  parseDietAgentSse,
  parseDietPlanLoose,
  parseWeekdayWorkouts,
  processDietDailyAdjustments,
  publicField,
  resumoCardioAtual,
  resumoCardioCompleto,
  resumoDietaAtual,
  resumoDietaCompleto,
  resumoTreinoAtual,
  resumoTreinoCompleto,
  secaoOQueMudou,
  semanaDoCiclo,
  snapshotToPlanColumns,
  suggestCardioValues,
  suggestDietaValues,
  suggestTreinoValues,
  treinoFields,
  validateCardioAnswers,
  validateDietaAnswers,
  validateTreinoAjuste,
  validateTreinoAnswers
};
