/**
 * GATE DE QUALIDADE DA INFORMAÇÃO DE LESÃO / RESTRIÇÃO.
 *
 * Objetivo: quando existe lesão declarada SEM local/movimentos provocativos,
 * o gerador não pode inventar uma articulação nem criar trabalho corretivo
 * específico. O rascunho fica REVIEW_REQUIRED até o professor completar.
 *
 * Determinístico, sem IA e sem alterar periodização/progressão.
 */

export type RestrictionDetailStatus = "none" | "complete" | "incomplete" | "conflicting";

export type JointArea =
  | "joelho"
  | "lombar"
  | "ombro"
  | "quadril"
  | "cervical"
  | "tornozelo"
  | "cotovelo"
  | "punho";

export interface RestrictionAssessment {
  status: RestrictionDetailStatus;
  hasInjuryFlag: boolean;
  knownAreas: JointArea[];
  missingFields: string[];
  reviewRequired: boolean;
  reasonCode: "MISSING_INJURY_DETAILS" | null;
  rawText: string;
}

const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const AREA_TERMS: Record<JointArea, string[]> = {
  joelho: ["joelho", "joelhos", "patela", "patelar", "menisco", "ligamento cruzado", "lca", "condromalacia"],
  lombar: ["lombar", "lombalgia", "hernia de disco", "coluna lombar", "l4", "l5", "sacro"],
  ombro: ["ombro", "ombros", "manguito", "supraespinhal", "acromio", "bursite de ombro", "labrum"],
  quadril: ["quadril", "coxofemoral", "gluteo medio lesao", "impacto femoroacetabular"],
  cervical: ["cervical", "pescoco", "cervicalgia", "c5", "c6"],
  tornozelo: ["tornozelo", "aquiles", "fascite"],
  cotovelo: ["cotovelo", "epicondilite", "epicondilo"],
  punho: ["punho", "tunel do carpo", "carpo"],
};

const INJURY_FLAG_TERMS = [
  "lesao",
  "lesoes",
  "dor",
  "dores",
  "restricao",
  "restricoes",
  "cirurgia",
  "hernia",
  "tendinite",
  "tendinopatia",
  "bursite",
  "artrose",
  "limitacao",
  "desconforto",
  "machucado",
  "fisioterapia",
];

const NEGATIVE_TERMS = ["sem lesao", "nao possui lesao", "nenhuma lesao", "sem restricao", "nenhuma restricao", "sem dores"];

const PROVOCATIVE_TERMS = [
  "dor ao",
  "dói ao",
  "doi ao",
  "piora com",
  "evitar",
  "nao pode",
  "não pode",
  "proibido",
  "amplitude",
  "limitado a",
  "somente ate",
  "movimento",
];

export interface RestrictionInput {
  restricoes?: string | null;
  lesoes?: string | null;
  observacoes?: string | null;
  anamnese?: string | null;
  /** Flag estruturada, quando existir na fonte real. */
  hasInjury?: boolean | null;
}

export function assessRestrictionDetail(input: RestrictionInput): RestrictionAssessment {
  const rawText = [input.restricoes, input.lesoes, input.observacoes, input.anamnese]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n");
  const text = norm(rawText);

  const negated = NEGATIVE_TERMS.some((t) => text.includes(t));
  const mentionsInjury = INJURY_FLAG_TERMS.some((t) => text.includes(t));
  const hasInjuryFlag = input.hasInjury === true || (mentionsInjury && !negated);

  const knownAreas = (Object.keys(AREA_TERMS) as JointArea[]).filter((area) =>
    AREA_TERMS[area].some((t) => text.includes(norm(t))),
  );

  if (!hasInjuryFlag && knownAreas.length === 0) {
    return {
      status: "none",
      hasInjuryFlag: false,
      knownAreas: [],
      missingFields: [],
      reviewRequired: false,
      reasonCode: null,
      rawText,
    };
  }

  if (negated && knownAreas.length > 0) {
    return {
      status: "conflicting",
      hasInjuryFlag: true,
      knownAreas,
      missingFields: ["confirmação: o texto nega e ao mesmo tempo cita uma lesão"],
      reviewRequired: true,
      reasonCode: "MISSING_INJURY_DETAILS",
      rawText,
    };
  }

  const hasProvocative = PROVOCATIVE_TERMS.some((t) => text.includes(norm(t)));
  const missingFields: string[] = [];
  if (knownAreas.length === 0) missingFields.push("localização da lesão/restrição");
  if (!hasProvocative) missingFields.push("movimentos que provocam dor ou movimentos proibidos");

  // Local conhecido é o dado mínimo para adaptação específica.
  if (knownAreas.length > 0 && hasProvocative) {
    return {
      status: "complete",
      hasInjuryFlag: true,
      knownAreas,
      missingFields: [],
      reviewRequired: false,
      reasonCode: null,
      rawText,
    };
  }

  if (knownAreas.length > 0 && !hasProvocative) {
    // Local existe: adaptação específica é permitida, sem bloqueio de revisão.
    return {
      status: "complete",
      hasInjuryFlag: true,
      knownAreas,
      missingFields,
      reviewRequired: false,
      reasonCode: null,
      rawText,
    };
  }

  return {
    status: "incomplete",
    hasInjuryFlag: true,
    knownAreas: [],
    missingFields,
    reviewRequired: true,
    reasonCode: "MISSING_INJURY_DETAILS",
    rawText,
  };
}

/** Bloco enviado ao trainer-agent. */
export function buildRestrictionQualityPromptBlock(a: RestrictionAssessment): string {
  if (a.status === "none") return "";
  if (a.status === "complete") {
    return [
      "",
      "=== RESTRICTION DATA QUALITY ===",
      "STATUS: COMPLETE",
      `KNOWN: ${a.knownAreas.join(", ")}`,
      "RULE: adapte apenas ao que está descrito. Não invente outras articulações afetadas.",
      "",
    ].join("\n");
  }
  return [
    "",
    "=== RESTRICTION DATA QUALITY ===",
    "STATUS: INCOMPLETE",
    "KNOWN: o aluno relata lesão/restrição.",
    `UNKNOWN: ${a.missingFields.join(", ") || "localização, movimentos provocativos, restrições de movimento"}`,
    "RULE:",
    "- NÃO infira o local da lesão (joelho, lombar, ombro, quadril, cervical, tornozelo, cotovelo, punho).",
    "- NÃO crie exercícios corretivos ou terapêuticos específicos de articulação.",
    "- NÃO escreva instruções do tipo 'proteger o joelho' / 'poupar a lombar'.",
    "- Use apenas programação conservadora genérica: cargas moderadas, RIR preservado, técnica controlada, amplitude confortável, exercícios estáveis, sem técnicas avançadas nem impacto.",
    "- O rascunho permanecerá REVIEW_REQUIRED até o professor completar os dados.",
    "",
  ].join("\n");
}

const CORRECTIVE_TERMS: Record<JointArea, string[]> = {
  joelho: ["estabilidade de joelho", "mini squat", "proteger o joelho", "poupar o joelho", "joelho"],
  lombar: ["proteger a lombar", "poupar a lombar", "estabilizacao lombar", "lombar"],
  ombro: ["estabilizacao do ombro", "proteger o ombro", "manguito", "ombro"],
  quadril: ["mobilidade especifica de quadril", "proteger o quadril", "quadril"],
  cervical: ["mobilidade cervical", "proteger a cervical", "cervical"],
  tornozelo: ["proteger o tornozelo", "mobilidade especifica de tornozelo"],
  cotovelo: ["proteger o cotovelo", "epicondil"],
  punho: ["proteger o punho", "tunel do carpo"],
};

export interface InferenceViolation {
  area: JointArea;
  where: string;
  evidence: string;
}

/**
 * Procura inferência indevida de articulação quando o dado é incompleto.
 * Só considera sinais explícitos (exercício corretivo nomeado ou instrução de
 * proteção articular) — exercícios normais de perna/costas continuam válidos.
 */
export function detectUnfoundedJointInference(
  plan: any,
  a: RestrictionAssessment,
): { ok: boolean; violations: InferenceViolation[] } {
  if (a.status !== "incomplete") return { ok: true, violations: [] };
  const violations: InferenceViolation[] = [];
  const days = Array.isArray(plan?.days) ? plan.days : [];

  const scan = (where: string, value: unknown) => {
    const text = norm(value);
    if (!text) return;
    for (const area of Object.keys(CORRECTIVE_TERMS) as JointArea[]) {
      for (const term of CORRECTIVE_TERMS[area]) {
        const t = norm(term);
        // Menção nua da articulação só conta em texto descritivo com verbo de proteção.
        const isBareArea = t === norm(area);
        if (isBareArea) {
          if (/(proteg|poupa|preserva|cuidado com|evitar carga n)/.test(text) && text.includes(t)) {
            violations.push({ area, where, evidence: String(value).slice(0, 160) });
          }
          continue;
        }
        if (text.includes(t)) {
          violations.push({ area, where, evidence: String(value).slice(0, 160) });
        }
      }
    }
  };

  for (const day of days) {
    const label = String(day?.day ?? day?.label ?? "Dia");
    scan(label, day?.notes);
    for (const ex of day?.exercises ?? []) {
      scan(`${label} / ${ex?.exercise ?? ""}`, ex?.exercise);
      scan(`${label} / ${ex?.exercise ?? ""}`, ex?.description);
    }
  }
  scan("observacoes", plan?.notes);

  // Deduplicação por área + local.
  const seen = new Set<string>();
  const unique = violations.filter((v) => {
    const k = `${v.area}|${v.where}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { ok: unique.length === 0, violations: unique };
}

export function buildRestrictionRetryInstruction(violations: InferenceViolation[]): string {
  const areas = [...new Set(violations.map((v) => v.area))].join(", ");
  return [
    "🚨 RESTRICTION_DETAIL_VALIDATION_FAILED.",
    `A restrição informada está incompleta, mas o plano introduziu trabalho corretivo específico de ${areas || "articulação"}:`,
    violations.map((v) => `${v.where}: "${v.evidence}"`).join(" | "),
    "Remova qualquer suposição de articulação lesionada, remova exercícios corretivos específicos e use apenas programação conservadora genérica (carga moderada, RIR preservado, amplitude confortável, exercícios estáveis).",
  ].join(" ");
}

/* ============================================================
 * EVIDENCE PROVENANCE — separa DADO EXPLÍCITO de INFERÊNCIA.
 * Região anatômica NÃO implica movimento provocativo.
 * ============================================================ */

export type MovementToken =
  | "deep_squat"
  | "squat"
  | "knee_flexion"
  | "knee_extension"
  | "lunge"
  | "leg_press"
  | "impact"
  | "unilateral"
  | "overhead"
  | "bench_press"
  | "row"
  | "scapular_retraction"
  | "thoracic_rotation"
  | "thoracic_extension"
  | "axial_load"
  | "hinge";

const MOVEMENT_TERMS: Record<MovementToken, string[]> = {
  deep_squat: ["agachar fundo", "agachar profundo", "agachamento profundo", "flexao profunda", "amplitude profunda", "profundidade total"],
  squat: ["agachar", "agachamento"],
  knee_flexion: ["flexao de joelho", "flexao do joelho", "flexionar o joelho"],
  knee_extension: ["extensao de joelho", "extensao do joelho", "extensao terminal", "cadeira extensora"],
  lunge: ["avanco", "afundo", "passada", "bulgaro"],
  leg_press: ["leg press"],
  impact: ["impacto", "corrida", "correr", "salto", "pular", "pliometria"],
  unilateral: ["unilateral"],
  overhead: ["acima da cabeca", "overhead", "desenvolvimento"],
  bench_press: ["supino"],
  row: ["remada"],
  scapular_retraction: ["retracao escapular"],
  thoracic_rotation: ["rotacao toracica", "rotacao de tronco"],
  thoracic_extension: ["extensao toracica"],
  axial_load: ["carga axial", "barra nas costas"],
  hinge: ["levantamento terra", "terra", "stiff", "hip hinge"],
};

const PROVOCATIVE_CONTEXT = /(dor|doi|dói|piora|agrav|desconforto|incomod|evitar|nao pode|nao consigo|proibid|limit|contraindic)/;
const NEGATION_CONTEXT = /(sem dor|nao sente dor|nao doi|nao dói|nao tem dor|nenhuma dor|sem desconforto|nao piora|liberado|permitid|autorizad|desejado)/;

export interface RestrictionEvidence {
  bodyRegions: string[];
  symptoms: string[];
  provocativeMovements: MovementToken[];
  romLimits: string[];
  painThreshold: number | null;
  correctiveAuthorized: boolean;
  breathingAuthorized: boolean;
  stressFlag: boolean;
  rawText: string;
}

const splitClauses = (text: string): string[] =>
  text
    .split(/[.;\n]|,\s/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

const REGION_EXTRA: Record<string, string[]> = {
  toracica: ["toracica", "regiao toracica", "dorsal", "peito"],
};

export function extractRestrictionEvidence(input: RestrictionInput & { estresse?: string | null }): RestrictionEvidence {
  const rawText = [input.restricoes, input.lesoes, input.observacoes, input.anamnese, input.estresse]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n");
  const text = norm(rawText);
  const clauses = splitClauses(text);

  const bodyRegions: string[] = (Object.keys(AREA_TERMS) as JointArea[]).filter((area) =>
    AREA_TERMS[area].some((t) => text.includes(norm(t))),
  );
  for (const [region, terms] of Object.entries(REGION_EXTRA)) {
    if (terms.some((t) => text.includes(norm(t)))) bodyRegions.push(region);
  }

  const symptoms: string[] = [];
  if (/(dor|dores|doi|dói)/.test(text)) symptoms.push("dor");
  if (/(desconforto|incomodo)/.test(text)) symptoms.push("desconforto");

  const provocativeMovements: MovementToken[] = [];
  for (const clause of clauses) {
    if (!PROVOCATIVE_CONTEXT.test(clause)) continue;
    if (NEGATION_CONTEXT.test(clause)) continue;
    for (const token of Object.keys(MOVEMENT_TERMS) as MovementToken[]) {
      if (MOVEMENT_TERMS[token].some((t) => clause.includes(norm(t)))) {
        if (!provocativeMovements.includes(token)) provocativeMovements.push(token);
      }
    }
  }
  // "agachar profundo" implica o token genérico squat também.
  if (provocativeMovements.includes("deep_squat") && !provocativeMovements.includes("squat")) {
    provocativeMovements.push("squat");
  }

  const romLimits: string[] = [];
  for (const clause of clauses) {
    const deg = clause.match(/(\d{2,3})\s*(graus|gruas|°)/);
    if (deg) romLimits.push(deg[1]);
    if (/(amplitude|flexao)\s+(maxima|limitada|ate)/.test(clause)) romLimits.push(clause.slice(0, 80));
  }

  let painThreshold: number | null = null;
  const thr = text.match(/(\d{1,2})\s*\/\s*10/) ?? text.match(/(?:limite|maximo|nao ultrapassar)[^\d]{0,20}(\d{1,2})/);
  if (thr) {
    const v = Number(thr[1]);
    if (Number.isFinite(v) && v >= 0 && v <= 10) painThreshold = v;
  }

  const correctiveAuthorized =
    /(corretivo|corretiva|fisioterap|reabilitac|isometric[oa][^.;\n]{0,40}(permitid|liberad|desejad|indicad)|(permitid|liberad|desejad|indicad)[^.;\n]{0,40}isometric)/.test(text);
  const breathingAuthorized = /(respirac|breathing|meditac|relaxamento)/.test(text);
  const stressFlag = /(stress|estresse)/.test(text);

  return {
    bodyRegions,
    symptoms,
    provocativeMovements,
    romLimits,
    painThreshold,
    correctiveAuthorized,
    breathingAuthorized,
    stressFlag,
    rawText,
  };
}

export type ClinicalInferenceCode =
  | "unsupported_provocative_movement"
  | "invented_rom_limit"
  | "invented_pain_threshold"
  | "unsupported_corrective_prescription"
  | "unsupported_therapeutic_purpose"
  | "unsupported_breathing_technique"
  | "implicit_diagnosis";

export interface ClinicalInferenceViolation {
  code: ClinicalInferenceCode;
  where: string;
  evidence: string;
  detail?: string;
}

const RESTRICTIVE_CLAIM = /(evitar|evite|nao (fazer|realizar|executar|usar)|sem\s|proibid|limitar|limitad|nao ultrapassar|restring|reduzir a amplitude|amplitude reduzida)/;

const CORRECTIVE_TERMS_GLOBAL = [
  "corretivo",
  "corretiva",
  "compensator",
  "estabilidade de joelho",
  "estabilizacao patelar",
  "estabilizacao escapular",
  "estabilizacao lombar",
  "ativacao de vmo",
  "vmo",
  "fortalecimento corretivo",
  "correcao postural",
  "reabilitac",
  "terapeutic",
  "manguito rotador para tratar",
];

const THERAPEUTIC_PURPOSE = /(para corrigir|para tratar|para aliviar a dor|proteger (o|a) (joelho|lombar|ombro|quadril|cervical|coluna|tornozelo|cotovelo|punho)|poupar (o|a) (joelho|lombar|ombro|quadril|cervical|coluna)|aliviar o sintoma|melhorar a extensao toracica)/;

const BREATHING_TERMS = ["respiracao nasal", "respiracao diafragmatica", "exercicio respiratorio", "breathing", "meditac", "tecnica de relaxamento"];

const DIAGNOSIS_TERMS = [
  "condromalacia",
  "tendinite",
  "tendinopatia",
  "menisco",
  "ligamento cruzado",
  "hernia de disco",
  "bursite",
  "impacto femoroacetabular",
  "sindrome patelofemoral",
  "artrose",
];

const ROM_CLAIM = /(\d{2,3})\s*(graus|°)|amplitude parcial|meia amplitude|agachamento raso|flexao parcial|nao ultrapassar a linha dos pes|flexao profunda|amplitude profunda/;

/**
 * Gate pós-geração: compara as AFIRMAÇÕES do plano com a EVIDÊNCIA explícita.
 * Só bloqueia o que não tem suporte nos dados do aluno.
 */
export function detectUnsupportedClinicalInference(
  plan: any,
  evidence: RestrictionEvidence,
): { ok: boolean; violations: ClinicalInferenceViolation[] } {
  const violations: ClinicalInferenceViolation[] = [];

  const push = (code: ClinicalInferenceCode, where: string, value: unknown, detail?: string) => {
    violations.push({ code, where, evidence: String(value).slice(0, 180), detail });
  };

  const scan = (where: string, value: unknown) => {
    const original = String(value ?? "");
    const text = norm(original);
    if (!text.trim()) return;

    // 1. Movimento provocativo inventado.
    if (RESTRICTIVE_CLAIM.test(text)) {
      for (const token of Object.keys(MOVEMENT_TERMS) as MovementToken[]) {
        if (!MOVEMENT_TERMS[token].some((t) => text.includes(norm(t)))) continue;
        if (evidence.provocativeMovements.includes(token)) continue;
        push("unsupported_provocative_movement", where, original, token);
        break;
      }
    }

    // 2. Limite de ROM inventado.
    const rom = text.match(ROM_CLAIM);
    if (rom && evidence.romLimits.length === 0) {
      push("invented_rom_limit", where, original, rom[0]);
    }

    // 3. Threshold numérico de dor inventado.
    const thr = text.match(/(\d{1,2})\s*\/\s*10/);
    if (thr && evidence.painThreshold === null) {
      push("invented_pain_threshold", where, original, thr[0]);
    }

    // 4. Prescrição corretiva/terapêutica inventada.
    if (!evidence.correctiveAuthorized) {
      const term = CORRECTIVE_TERMS_GLOBAL.find((t) => text.includes(norm(t)));
      if (term) push("unsupported_corrective_prescription", where, original, term);
      if (THERAPEUTIC_PURPOSE.test(text)) push("unsupported_therapeutic_purpose", where, original);
    }

    // 5. Técnica respiratória inventada.
    if (!evidence.breathingAuthorized) {
      const b = BREATHING_TERMS.find((t) => text.includes(norm(t)));
      if (b) push("unsupported_breathing_technique", where, original, b);
    }

    // 6. Diagnóstico implícito.
    const evidenceText = norm(evidence.rawText);
    const dx = DIAGNOSIS_TERMS.find((t) => text.includes(norm(t)) && !evidenceText.includes(norm(t)));
    if (dx) push("implicit_diagnosis", where, original, dx);
  };

  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    const label = String(day?.day ?? day?.label ?? "Dia");
    scan(`${label} / observações`, day?.notes);
    for (const ex of day?.exercises ?? []) {
      const w = `${label} / ${ex?.exercise ?? ""}`;
      scan(w, ex?.exercise);
      scan(w, ex?.description);
      scan(w, ex?.observacao ?? ex?.obs);
    }
  }
  scan("resumo", plan?.notes);
  scan("resumo", plan?.summary);
  scan("resumo", plan?.observacoes);

  const seen = new Set<string>();
  const unique = violations.filter((v) => {
    const k = `${v.code}|${v.where}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { ok: unique.length === 0, violations: unique };
}

export function buildClinicalInferenceRetryInstruction(violations: ClinicalInferenceViolation[]): string {
  const lines = violations.slice(0, 12).map((v) => `- [${v.code}] ${v.where}: "${v.evidence}"`);
  return [
    "🚨 RESTRICTION_INFERENCE_FAILED.",
    "O plano criou afirmações clínicas que NÃO estão suportadas pelos dados do aluno:",
    ...lines,
    "Regras obrigatórias na regeneração:",
    "- NÃO afirme quais movimentos provocam dor se isso não foi informado.",
    "- NÃO invente limites de amplitude (graus, 'flexão profunda', 'amplitude parcial').",
    "- NÃO invente escala numérica de dor (ex.: 3/10). Use linguagem qualitativa: 'interrompa se houver dor nova ou aumento claro da dor'.",
    "- NÃO prescreva trabalho corretivo, terapêutico, compensatório ou de reabilitação.",
    "- NÃO prescreva técnicas respiratórias ou de relaxamento.",
    "- NÃO cite diagnósticos que o aluno não informou.",
    "- Use apenas orientação neutra: carga moderada, execução controlada, amplitude confortável.",
  ].join("\n");
}

/** Bloco de prompt de evidência explícita enviado ao trainer-agent. */
export function buildEvidenceProvenanceBlock(evidence: RestrictionEvidence): string {
  if (
    evidence.bodyRegions.length === 0 &&
    evidence.symptoms.length === 0 &&
    !evidence.stressFlag
  ) {
    return "";
  }
  const list = (arr: string[]) => (arr.length ? arr.join(", ") : "não informado");
  return [
    "",
    "=== EVIDÊNCIA EXPLÍCITA DE RESTRIÇÃO ===",
    `REGIÕES: ${list(evidence.bodyRegions)}`,
    `SINTOMAS: ${list(evidence.symptoms)}`,
    `MOVIMENTOS PROVOCATIVOS INFORMADOS: ${list(evidence.provocativeMovements)}`,
    `LIMITES DE AMPLITUDE INFORMADOS: ${list(evidence.romLimits)}`,
    `LIMITE NUMÉRICO DE DOR INFORMADO: ${evidence.painThreshold ?? "não informado"}`,
    `TRABALHO CORRETIVO AUTORIZADO: ${evidence.correctiveAuthorized ? "sim" : "não"}`,
    `TÉCNICA RESPIRATÓRIA AUTORIZADA: ${evidence.breathingAuthorized ? "sim" : "não"}`,
    `ESTRESSE ELEVADO: ${evidence.stressFlag ? "sim" : "não"}`,
    "REGRAS:",
    "- Região anatômica NÃO implica movimento provocativo. Só restrinja um movimento se ele estiver na lista acima.",
    "- Sem limite de amplitude informado, escreva apenas 'amplitude confortável e tecnicamente controlada'.",
    "- Sem limite numérico de dor informado, use linguagem qualitativa ('interrompa se houver dor nova ou aumento claro da dor').",
    "- Sem autorização, é PROIBIDO prescrever trabalho corretivo, terapêutico, compensatório, de reabilitação ou respiratório.",
    "- Estresse elevado influencia apenas RIR/volume/proximidade da falha. Não gere intervenção clínica por causa dele.",
    "- Nunca cite diagnóstico que o aluno não informou.",
    "",
  ].join("\n");
}
