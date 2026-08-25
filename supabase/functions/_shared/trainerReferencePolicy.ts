/**
 * Deterministic policy for the professor's reference workout ("treino de referência").
 *
 * Single source of truth shared by `trainer-agent` and the tests:
 *   - classification: free (loose notes) vs exact (a real prescription);
 *   - anchor extraction (days, focus, exercises, order, sets/reps/rest);
 *   - compliance of a generated candidate against those anchors (drift detection).
 *
 * The goal is NOT to parse free text into a perfect schema — only to detect
 * evident drift from an architecture the professor explicitly prescribed.
 */

export type ReferenceMode = "free" | "exact";

export type ReferenceExercise = {
  name: string;
  /** 0-based position inside the session. */
  order: number;
  series: string | null;
  reps: string | null;
  restSeconds: number | null;
};

export type ReferenceDay = {
  label: string;
  focus: string | null;
  exercises: ReferenceExercise[];
};

export type ReferenceStructure = {
  mode: ReferenceMode;
  days: ReferenceDay[];
  signals: string[];
};

export type ReferenceCompliance = {
  ok: boolean;
  missingAnchors: string[];
  unexpectedSubstitutions: string[];
  orderViolations: string[];
  justifiedSubstitutions: string[];
};

// ───────────────────────────── normalization ─────────────────────────────

export function normalizeExerciseName(raw: string | null | undefined): string {
  return (raw ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Loose synonyms used only for anchor matching (never to rename anything). */
const ANCHOR_SYNONYMS: Array<[RegExp, string]> = [
  [/\bHIP THRUST\b/g, "ELEVACAO PELVICA"],
  [/\bPONTE DE GLUTEO\b/g, "ELEVACAO PELVICA"],
  [/\bROMANIAN DEADLIFT\b/g, "STIFF ROMENO"],
  [/\bTERRA ROMENO\b/g, "STIFF ROMENO"],
  [/\bBULGARIAN SPLIT SQUAT\b/g, "BULGARO"],
  [/\bHACK SQUAT\b/g, "HACK MACHINE"],
  [/\bHACK\b/g, "HACK MACHINE"],
  [/\bPENDULUM\b/g, "HACK MACHINE"],
  [/\bPANTURRILHA\b/g, "GEMEOS"],
  [/\bABDUTORA\b/g, "CADEIRA ABDUTORA"],
  [/\bADUTORA\b/g, "CADEIRA ADUTORA"],
  [/\bEXTENSORA\b/g, "CADEIRA EXTENSORA"],
  [/\bFLEXORA DEITADA\b/g, "MESA FLEXORA"],
  [/\bFLEXORA SENTADA\b/g, "CADEIRA FLEXORA"],
  [/\bFLEXORA\b/g, "CADEIRA FLEXORA"],
];

export function canonicalAnchorName(raw: string | null | undefined): string {
  let out = normalizeExerciseName(raw);
  for (const [re, rep] of ANCHOR_SYNONYMS) out = out.replace(re, rep);
  return out.replace(/\bMACHINE MACHINE\b/g, "MACHINE").replace(/\s+/g, " ").trim();
}

const STOP = new Set(["DE", "DA", "DO", "COM", "EM", "NA", "NO", "E", "A", "O", "PARA"]);
const NOISE = new Set(["ART", "ARTICULADO", "ARTICULADA", "MAQUINA", "MACHINE", "LIVRE"]);

const anchorTokens = (name: string): string[] =>
  canonicalAnchorName(name)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t) && !NOISE.has(t) && !/^\d+$/.test(t));

/** Conservative similarity used to decide whether a candidate IS a given anchor. */
export function anchorSimilarity(a: string, b: string): number {
  const ta = anchorTokens(a);
  const tb = anchorTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const used = new Set<number>();
  let matched = 0;
  for (const x of ta) {
    for (let i = 0; i < tb.length; i++) {
      if (used.has(i)) continue;
      if (x === tb[i]) { used.add(i); matched++; break; }
    }
  }
  return (2 * matched) / (ta.length + tb.length);
}

const ANCHOR_MATCH_THRESHOLD = 0.7;

export const isSameAnchor = (a: string, b: string): boolean =>
  anchorSimilarity(a, b) >= ANCHOR_MATCH_THRESHOLD;

// ───────────────────────────── extraction ─────────────────────────────

const REFERENCE_BLOCK =
  /REFER[EÊ]NCIA DE TREINO[^\n]*:?\s*\n-{3,}\n([\s\S]*?)\n-{3,}/i;

/** Pulls the raw reference text out of the user prompt, when present. */
export function extractReferenceText(messages: Array<{ role?: string; content?: unknown }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content;
    if (typeof content !== "string") continue;
    const m = content.match(REFERENCE_BLOCK);
    if (m && m[1].trim().length > 0) return m[1].trim();
  }
  return null;
}

const DAY_LINE =
  /^\s*(?:[-*•]\s*)?(SEGUNDA|TER[ÇC]A|QUARTA|QUINTA|SEXTA|S[ÁA]BADO|DOMINGO|DIA\s*\d+|TREINO\s*[A-E]\b|UPPER\s*[A-B]?|LOWER\s*[A-B]?|PUSH|PULL|LEGS)\b(.*)$/i;

const SERIES_REPS = /(\d+)\s*[xX×]\s*(\d+\s*(?:[-–]\s*\d+)?)/;
const REST = /(?:descanso|pausa|rest)\s*[:\-]?\s*(\d+)\s*(s|seg|segundos|min|'|”)?/i;

const isNoiseLine = (line: string): boolean =>
  !line.trim() ||
  /^[-=_*•\s]+$/.test(line) ||
  /^(obs|observa|aquecimento geral|nota)/i.test(line.trim());

function cleanExerciseName(raw: string): string {
  return raw
    .replace(/^\s*(?:\d+[\).\-]|[-*•])\s*/, "")
    .split(/[—–]|\s{2,}|\s\|\s/)[0]
    .replace(SERIES_REPS, "")
    .replace(REST, "")
    .replace(/\(([^)]*)\)/g, "")
    .replace(/[:;,.]+\s*$/, "")
    .trim();
}

function parseRestSeconds(line: string): number | null {
  const m = line.match(REST);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? "s").toLowerCase();
  return unit.startsWith("min") || unit === "'" ? value * 60 : value;
}

/** Parses the professor's reference into days/exercises and classifies the mode. */
export function parseReferenceStructure(text: string | null | undefined): ReferenceStructure {
  const raw = (text ?? "").trim();
  if (!raw) return { mode: "free", days: [], signals: [] };

  const days: ReferenceDay[] = [];
  let current: ReferenceDay | null = null;
  let hasSetsReps = false;
  let hasRest = false;
  let hasFocus = false;
  let hasOrdering = false;

  for (const line of raw.split("\n")) {
    if (isNoiseLine(line)) continue;
    const dayMatch = line.match(DAY_LINE);
    if (dayMatch) {
      const rest = (dayMatch[2] ?? "").replace(/^[\s:•\-—–]+/, "").trim();
      if (rest) hasFocus = true;
      current = { label: dayMatch[1].trim().toUpperCase(), focus: rest || null, exercises: [] };
      days.push(current);
      continue;
    }
    const name = cleanExerciseName(line);
    if (!name || name.length < 3 || /^\d+$/.test(name)) continue;
    if (!current) {
      current = { label: "SESSÃO 1", focus: null, exercises: [] };
      days.push(current);
    }
    if (/^\s*\d+[\).\-]\s/.test(line)) hasOrdering = true;
    const sr = line.match(SERIES_REPS);
    if (sr) hasSetsReps = true;
    const restSeconds = parseRestSeconds(line);
    if (restSeconds !== null) hasRest = true;
    current.exercises.push({
      name,
      order: current.exercises.length,
      series: sr ? sr[1] : null,
      reps: sr ? sr[2].replace(/\s+/g, "") : null,
      restSeconds,
    });
  }

  const exerciseCount = days.reduce((acc, d) => acc + d.exercises.length, 0);
  const signals: string[] = [];
  if (days.length >= 1 && days[0].label !== "SESSÃO 1") signals.push("days");
  if (exerciseCount >= 4) signals.push("exercises");
  if (hasSetsReps) signals.push("sets_reps");
  if (hasRest) signals.push("rest");
  if (hasFocus) signals.push("focus");
  if (hasOrdering) signals.push("order");

  // Conservative: only a text that really looks like a prescription becomes "exact".
  const mode: ReferenceMode =
    exerciseCount >= 4 && signals.length >= 2 ? "exact" : "free";

  return { mode, days, signals };
}

// ───────────────────────────── compliance ─────────────────────────────

export type ComplianceInput = {
  structure: ReferenceStructure;
  /** Candidate plan days, already snapped to the catalog. */
  candidateDays: Array<{ label: string; exercises: string[] }>;
  /** Catalog names available to the model (empty = unknown, never a drift source). */
  catalogNames?: string[];
  /** Free text with safety restrictions / forbidden exercises stated by the professor. */
  restrictionsText?: string;
  /** Names flagged as strong functional duplicates in the candidate. */
  strongDuplicateNames?: string[];
};

const isConditionalOnly = (text: string): boolean =>
  /(somente|apenas)\s+(?:com\s+)?(amplitude\s+)?sem\s+dor|se\s+n[ãa]o\s+doer|conforme\s+toler[âa]ncia/i.test(text);

/**
 * A substitution is justified when the anchor cannot be honored:
 * absent from the catalog, or explicitly forbidden by a structured restriction.
 * A conditional note ("somente amplitude sem dor") is an ADAPTATION, never a ban.
 */
export function isJustifiedSubstitution(input: {
  anchor: string;
  catalogNames?: string[];
  restrictionsText?: string;
}): boolean {
  const anchor = canonicalAnchorName(input.anchor);
  const restrictions = input.restrictionsText ?? "";
  if (restrictions) {
    for (const chunk of restrictions.split(/[\n;,]/)) {
      const piece = chunk.trim();
      if (!piece) continue;
      if (isConditionalOnly(piece)) continue;
      if (isSameAnchor(piece, anchor)) return true;
    }
  }
  const catalog = input.catalogNames ?? [];
  if (catalog.length > 0 && !catalog.some((n) => isSameAnchor(n, anchor))) return true;
  return false;
}

/** Detects evident drift of the candidate against an EXACT professor reference. */
export function evaluateReferenceCompliance(input: ComplianceInput): ReferenceCompliance {
  const missingAnchors: string[] = [];
  const unexpectedSubstitutions: string[] = [];
  const orderViolations: string[] = [];
  const justifiedSubstitutions: string[] = [];

  const strongDupes = new Set((input.strongDuplicateNames ?? []).map(canonicalAnchorName));

  input.structure.days.forEach((refDay, dayIndex) => {
    const candidate = input.candidateDays[dayIndex];
    if (!candidate) {
      for (const ex of refDay.exercises) missingAnchors.push(`${refDay.label}: ${ex.name}`);
      return;
    }

    const matchedPositions: number[] = [];
    refDay.exercises.forEach((ref) => {
      const idx = candidate.exercises.findIndex((c) => isSameAnchor(c, ref.name));
      if (idx >= 0) {
        matchedPositions.push(idx);
        return;
      }
      const justified = isJustifiedSubstitution({
        anchor: ref.name,
        catalogNames: input.catalogNames,
        restrictionsText: input.restrictionsText,
      });
      if (justified) {
        justifiedSubstitutions.push(`${refDay.label}: ${ref.name}`);
        return;
      }
      missingAnchors.push(`${refDay.label}: ${ref.name}`);
      for (const c of candidate.exercises) {
        if (strongDupes.has(canonicalAnchorName(c))) {
          unexpectedSubstitutions.push(`${refDay.label}: ${ref.name} → ${c}`);
          break;
        }
      }
    });

    for (let i = 1; i < matchedPositions.length; i++) {
      if (matchedPositions[i] < matchedPositions[i - 1]) {
        orderViolations.push(`${refDay.label}: ordem alterada na posição ${i + 1}`);
      }
    }
  });

  const ok =
    missingAnchors.length === 0 &&
    unexpectedSubstitutions.length === 0 &&
    orderViolations.length === 0;

  return { ok, missingAnchors, unexpectedSubstitutions, orderViolations, justifiedSubstitutions };
}

// ───────────────────────────── prompt block ─────────────────────────────

export function buildExactReferenceBlock(text: string): string {
  return `
=== TREINO DE REFERÊNCIA EXATO DO PROFESSOR ===
O protocolo abaixo foi definido pelo professor e deve ser tratado como arquitetura base obrigatória.

${text}

Preserve:
- divisão semanal
- foco de cada sessão
- exercícios quando compatíveis
- ordem
- séries
- repetições
- descanso
- prioridades musculares
- baixo/alto volume definidos pelo professor

Não substitua exercícios apenas para criar variedade. Somente altere algo quando houver conflito real com:
1. segurança;
2. restrição estruturada;
3. equipamento;
4. catálogo.

Uma observação condicional do professor (ex.: "somente amplitude sem dor") significa ADAPTAÇÃO, e NÃO exercício proibido.
Se substituir, preserve o padrão de movimento e a função do exercício e evite redundância com os demais movimentos da sessão.
=== FIM DA REFERÊNCIA EXATA ===
`;
}

/** Ordem de prioridade aplicada quando existe referência exata. */
export const EXACT_REFERENCE_PRIORITY_BLOCK = `
ORDEM DE PRIORIDADE (REFERÊNCIA EXATA ATIVA):
1. Segurança e contraindicações absolutas
2. Restrições estruturadas do professor
3. Treino de referência exato
4. Equipamentos disponíveis / catálogo
5. Semana do ciclo
6. Ajustes mínimos necessários
7. Preferências gerais do agente
Regras genéricas de variedade NÃO podem substituir exercícios da referência sem necessidade real.
`;
