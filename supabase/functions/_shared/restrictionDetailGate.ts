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
