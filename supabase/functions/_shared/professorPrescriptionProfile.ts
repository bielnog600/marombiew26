/**
 * ETAPA 3 — PROFESSOR PRESCRIPTION PROFILE (BUILDER DETERMINÍSTICO)
 *
 * Transforma edições manuais confiáveis (workout_prescription_edits) em
 * EVIDÊNCIAS DE PREFERÊNCIA do professor.
 *
 * Regras não-negociáveis:
 * - Função PURA: sem I/O, sem Date.now(), sem randomicidade. `load` é separado.
 * - Só `changes[]` alimenta preferência. Campo não editado NUNCA vira evidência.
 * - Só `action_origin = manual` e `exclude_from_profile = false`.
 * - Unidade de evidência é o CASO (case_key), não o evento.
 * - Uma operação de reorder (reorder_operation_id) é UMA decisão estrutural.
 * - Nome de aluno / student_id / plan_id nunca entram no conteúdo da preferência.
 * - Taxonomia é derivada na análise (enriquecimento), nunca escrita de volta.
 * - Nenhuma preferência ultrapassa confidence 0.85. Tudo é soft prior.
 *
 * NÃO integra com trainer-agent. NÃO altera geração de treinos.
 */

import { variationFamilyOf, familyRole, normFamilyName } from "./variationFamilies.ts";
import { classifyExerciseFunction } from "./repRangePolicy.ts";

// ---------------------------------------------------------------------------
// Tipos de entrada (espelham a tabela workout_prescription_edits)
// ---------------------------------------------------------------------------

export type PrescriptionEditOrigin = "manual" | "ai_assisted" | "mixed";

export interface PrescriptionEditChange {
  type: string;
  day_id?: string | null;
  day_name?: string | null;
  exercise_id?: string | null;
  exercise_before?: string | null;
  exercise_after?: string | null;
  position_before?: number | null;
  position_after?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: {
    exercise_function?: string | null;
    exercise_family?: string | null;
    exercise_role?: string | null;
    reorder_operation_id?: string | null;
  } | null;
}

export interface PrescriptionEditContextSnapshot {
  objective?: string | null;
  level?: string | null;
  days_per_week?: number | null;
  priority_muscles?: string[] | null;
  periodization?: {
    model?: string | null;
    block_type?: string | null;
    block_number?: number | null;
    week?: number | null;
    volume_target?: number | null;
  } | null;
  restrictions?: {
    status?: string | null;
    explicit_restrictions?: string[] | null;
    pain_flags?: string[] | null;
  } | null;
  recovery?: {
    recent_rpe?: number | null;
    adherence?: number | null;
    data_quality?: string | null;
  } | null;
  session_context?: {
    day_id?: string | null;
    day_name?: string | null;
    session_role?: string | null;
  } | null;
}

export interface WorkoutPrescriptionEditRecord {
  id?: string;
  professor_id: string;
  student_id: string;
  plan_id: string;
  plan_version?: number | null;
  cycle_key?: string | null;
  source?: string | null;
  action_origin?: PrescriptionEditOrigin | string | null;
  before_json?: unknown;
  after_json?: unknown;
  changes?: PrescriptionEditChange[] | null;
  context_snapshot?: PrescriptionEditContextSnapshot | null;
  exclude_from_profile?: boolean | null;
  created_at?: string | null;
}

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

export type PreferenceCategory =
  | "ORDERING"
  | "SETS"
  | "RECOGNITION_SETS"
  | "REPS"
  | "PER_SET_REPS"
  | "RIR"
  | "REST"
  | "VARIATION"
  | "EXERCISE_REPLACEMENT"
  | "SESSION_STRUCTURE";

export type TriState = true | false | "unknown";

export interface PreferenceContext {
  level?: string;
  days_per_week?: number;
  block_type?: string;
  periodization_model?: string;
  restriction_status?: string;
  session_role?: string;
  exercise_role?: string;
  exercise_function?: string;
  priority_match?: TriState;
}

export interface PreferenceEvidence {
  supporting_event_count: number;
  supporting_case_count: number;
  opposing_case_count: number;
  total_case_count: number;
  distinct_student_count: number;
  distinct_plan_count: number;
  distinct_cycle_count: number;
  longitudinal_support: boolean;
  cross_student_support: boolean;
}

export type PreferenceStrength = "very_low" | "low" | "moderate" | "strong";

export interface ProfessorPreference {
  id: string;
  category: PreferenceCategory;
  pattern: Record<string, unknown> & { direction: string };
  applicable_context: PreferenceContext;
  evidence: PreferenceEvidence;
  consistency: number;
  confidence: number;
  strength: PreferenceStrength;
  generalizable: boolean;
  explanation: string;
}

export interface ProfessorPrescriptionProfile {
  professor_id: string;
  generated_from: {
    total_manual_edits: number;
    total_events_considered: number;
    distinct_students: number;
    distinct_plans: number;
    distinct_cycles: number;
    ignored_ai_assisted: number;
    excluded_count: number;
    ignored_empty_edits: number;
  };
  preferences: ProfessorPreference[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Constantes auditáveis
// ---------------------------------------------------------------------------

/** Casos independentes necessários para manter um contexto mais específico. */
export const MIN_CASES_FOR_SPECIFIC_CONTEXT = 3;
/** Teto rígido de confidence. Nenhuma preferência passa disso. */
export const MAX_CONFIDENCE = 0.85;
/** Divisor do fator de evidência (casos independentes). */
export const EVIDENCE_SATURATION_CASES = 5;
/** Divisor do fator cross-student (alunos distintos). */
export const CROSS_STUDENT_SATURATION = 3;

// ---------------------------------------------------------------------------
// Helpers determinísticos
// ---------------------------------------------------------------------------

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

const intOf = (v: unknown): number => {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const mode = <T extends string | number>(values: T[]): T | null => {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = -1;
  // Ordena as chaves para determinismo em empate.
  const keys = [...counts.keys()].sort((a, b) => String(a).localeCompare(String(b)));
  for (const k of keys) {
    const c = counts.get(k)!;
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
};

/** Faixa de reps -> ponto médio. Retorna null para prescrições complexas. */
const repsMidpoint = (raw: unknown): number | null => {
  const s = String(raw ?? "").toLowerCase();
  if (!s.trim()) return null;
  if (/amrap|falha/.test(s)) return null;
  const nums = (s.match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return null;
  const min = nums[0];
  const max = nums.length > 1 ? nums[1] : nums[0];
  return (min + max) / 2;
};

const setCountsFromSnapshot = (snap: unknown): { recon: number; work: number } => {
  const s = (snap ?? {}) as { series?: unknown; series2?: unknown };
  const s1 = intOf(s.series);
  const s2 = intOf(s.series2);
  if (s2 > 0) return { recon: s1, work: s2 };
  return { recon: 0, work: s1 };
};

const schemeMode = (snap: unknown): string | null => {
  const s = (snap ?? {}) as { setScheme?: { mode?: string } | null };
  return str(s.setScheme?.mode);
};

/** Papel do exercício derivado da taxonomia canônica. `unknown` quando não há match. */
export const deriveExerciseRole = (name: string | null | undefined): string => {
  const role = familyRole(variationFamilyOf(name));
  return role ?? "unknown";
};

/** Função do exercício derivada da taxonomia canônica. `unknown` quando não há match. */
export const deriveExerciseFunction = (name: string | null | undefined): string => {
  if (!str(name)) return "unknown";
  if (!variationFamilyOf(name)) return "unknown";
  const fn = classifyExerciseFunction(name);
  return fn === "OTHER" ? "unknown" : fn;
};

const FAMILY_MUSCLES: Record<string, string[]> = {
  leg_curl: ["posterior", "isquiotibiais", "hamstring", "perna"],
  knee_extension_isolation: ["quadriceps", "quadríceps", "perna"],
  squat_pattern: ["quadriceps", "quadríceps", "gluteo", "glúteo", "perna"],
  lunge_pattern: ["quadriceps", "quadríceps", "gluteo", "glúteo", "perna"],
  leg_press: ["quadriceps", "quadríceps", "gluteo", "glúteo", "perna"],
  hip_hinge: ["posterior", "gluteo", "glúteo", "hamstring"],
  hip_thrust: ["gluteo", "glúteo"],
  hip_abduction: ["gluteo", "glúteo"],
  hip_adduction: ["adutor"],
  hip_extension_kickback: ["gluteo", "glúteo"],
  calf_raise: ["panturrilha"],
  vertical_pull: ["costas", "dorsal"],
  horizontal_row: ["costas", "dorsal"],
  pullover: ["costas", "dorsal"],
  chest_press_horizontal: ["peito", "peitoral"],
  chest_press_incline: ["peito", "peitoral"],
  chest_fly: ["peito", "peitoral"],
  shoulder_press: ["ombro", "ombros", "deltoide"],
  lateral_raise: ["ombro", "ombros", "deltoide"],
  front_raise: ["ombro", "ombros", "deltoide"],
  rear_delt: ["ombro", "ombros", "deltoide"],
  shrug: ["trapezio", "trapézio"],
  biceps_curl: ["biceps", "bíceps", "braco", "braço"],
  triceps_pressdown: ["triceps", "tríceps", "braco", "braço"],
  triceps_extension_overhead: ["triceps", "tríceps", "braco", "braço"],
  core_flexion_upper: ["abdomen", "abdômen", "abdominal", "core"],
  core_flexion_lower: ["abdomen", "abdômen", "abdominal", "core"],
  core_antirotation: ["abdomen", "abdômen", "abdominal", "core"],
  core_isometric: ["abdomen", "abdômen", "abdominal", "core"],
  core_rotation: ["abdomen", "abdômen", "abdominal", "core"],
};

/**
 * O exercício pertence a um dos músculos prioritários do aluno?
 * Retorna `unknown` quando não há evidência suficiente — nunca `false` por omissão.
 */
export const doesExerciseMatchPriority = (
  exerciseName: string | null | undefined,
  priorityMuscles: string[] | null | undefined,
): TriState => {
  const priorities = (priorityMuscles ?? []).map((m) => normFamilyName(String(m))).filter(Boolean);
  if (priorities.length === 0) return "unknown";
  const family = variationFamilyOf(exerciseName);
  if (!family) return "unknown";
  const muscles = (FAMILY_MUSCLES[family] ?? []).map((m) => normFamilyName(m));
  if (muscles.length === 0) return "unknown";
  for (const p of priorities) {
    for (const m of muscles) {
      if (p === m || p.includes(m) || m.includes(p)) return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
// Observações (evento normalizado)
// ---------------------------------------------------------------------------

interface Observation {
  category: PreferenceCategory;
  /** Grupo de padrões mutuamente comparáveis (onde oposição faz sentido). */
  groupKey: string;
  direction: string;
  /** Dados numéricos opcionais para descrever o padrão (ex.: delta de séries). */
  delta?: number;
  caseKey: string;
  studentId: string;
  planId: string;
  cycleKey: string;
  /** Deduplicação de operações estruturais (reorder). */
  operationKey: string | null;
  context: PreferenceContext;
}

/** Direções incompatíveis dentro do mesmo grupo (oposição real). */
const OPPOSITES: Record<string, string> = {
  increase: "decrease",
  decrease: "increase",
  add_recognition: "remove_recognition",
  remove_recognition: "add_recognition",
  increase_recognition: "decrease_recognition",
  decrease_recognition: "increase_recognition",
  higher_reps: "lower_reps",
  lower_reps: "higher_reps",
  adopt_per_set: "remove_per_set",
  remove_per_set: "adopt_per_set",
  higher_rir: "lower_rir",
  lower_rir: "higher_rir",
  increase_rest: "decrease_rest",
  decrease_rest: "increase_rest",
  move_earlier: "move_later",
  move_later: "move_earlier",
  add_exercise: "remove_exercise",
  remove_exercise: "add_exercise",
  same_family: "cross_family",
  cross_family: "same_family",
};

/** Ordem de especificidade do contexto por categoria (mais amplo -> mais fino). */
const CONTEXT_ORDER: Record<PreferenceCategory, Array<keyof PreferenceContext>> = {
  SETS: ["exercise_role", "level", "priority_match"],
  RECOGNITION_SETS: ["exercise_role", "level", "block_type"],
  REPS: ["exercise_role", "level", "priority_match"],
  PER_SET_REPS: ["exercise_role", "level"],
  RIR: ["level", "restriction_status", "block_type"],
  REST: ["exercise_function", "level"],
  VARIATION: ["exercise_role", "level"],
  ORDERING: ["priority_match", "exercise_role", "level"],
  EXERCISE_REPLACEMENT: ["exercise_role", "level"],
  SESSION_STRUCTURE: ["session_role", "level"],
};

const cycleKeyOf = (edit: WorkoutPrescriptionEditRecord): string =>
  str(edit.cycle_key) ?? edit.plan_id;

const caseKeyOf = (edit: WorkoutPrescriptionEditRecord): string =>
  [edit.professor_id, edit.student_id, edit.plan_id, cycleKeyOf(edit)].join("|");

const contextOf = (
  edit: WorkoutPrescriptionEditRecord,
  exerciseName: string | null,
): PreferenceContext => {
  const snap = edit.context_snapshot ?? {};
  const ctx: PreferenceContext = {};
  const level = str(snap.level);
  if (level) ctx.level = level;
  const dpw = numOrNull(snap.days_per_week);
  if (dpw !== null) ctx.days_per_week = dpw;
  const blockType = str(snap.periodization?.block_type);
  if (blockType) ctx.block_type = blockType;
  const model = str(snap.periodization?.model);
  if (model) ctx.periodization_model = model;
  const restriction = str(snap.restrictions?.status);
  if (restriction) ctx.restriction_status = restriction;
  const sessionRole = str(snap.session_context?.session_role);
  if (sessionRole && sessionRole !== "unknown") ctx.session_role = sessionRole;

  const role = deriveExerciseRole(exerciseName);
  if (role !== "unknown") ctx.exercise_role = role;
  const fn = deriveExerciseFunction(exerciseName);
  if (fn !== "unknown") ctx.exercise_function = fn;

  const priority = doesExerciseMatchPriority(exerciseName, snap.priority_muscles ?? []);
  if (priority !== "unknown") ctx.priority_match = priority;

  return ctx;
};

/**
 * Converte um evento de diff em observação de preferência.
 * Retorna null quando o evento não forma preferência nesta etapa
 * (DESCRIPTION/TEMPO/NOTES/DAY_CHANGED) ou quando não há direção clara.
 */
const observationFor = (
  edit: WorkoutPrescriptionEditRecord,
  change: PrescriptionEditChange,
): Observation | null => {
  const name = str(change.exercise_after) ?? str(change.exercise_before);
  const base = {
    caseKey: caseKeyOf(edit),
    studentId: edit.student_id,
    planId: edit.plan_id,
    cycleKey: cycleKeyOf(edit),
    operationKey: null as string | null,
    context: contextOf(edit, name),
  };

  switch (change.type) {
    case "SETS_CHANGED": {
      const b = setCountsFromSnapshot(change.before).work;
      const a = setCountsFromSnapshot(change.after).work;
      if (a === b) return null;
      return {
        ...base,
        category: "SETS",
        groupKey: "SETS",
        direction: a > b ? "increase" : "decrease",
        delta: a - b,
      };
    }
    case "RECOGNITION_SETS_CHANGED": {
      const b = setCountsFromSnapshot(change.before).recon;
      const a = setCountsFromSnapshot(change.after).recon;
      if (a === b) return null;
      let direction: string;
      if (b === 0) direction = "add_recognition";
      else if (a === 0) direction = "remove_recognition";
      else direction = a > b ? "increase_recognition" : "decrease_recognition";
      return { ...base, category: "RECOGNITION_SETS", groupKey: "RECOGNITION_SETS", direction, delta: a - b };
    }
    case "REPS_CHANGED": {
      const b = repsMidpoint((change.before as { reps?: unknown })?.reps);
      const a = repsMidpoint((change.after as { reps?: unknown })?.reps);
      if (b === null || a === null || a === b) return null;
      return {
        ...base,
        category: "REPS",
        groupKey: "REPS",
        direction: a > b ? "higher_reps" : "lower_reps",
        delta: a - b,
      };
    }
    case "PER_SET_REPS_CHANGED": {
      const b = schemeMode(change.before);
      const a = schemeMode(change.after);
      if (a === "per_set" && b !== "per_set") {
        return { ...base, category: "PER_SET_REPS", groupKey: "PER_SET_REPS", direction: "adopt_per_set" };
      }
      if (b === "per_set" && a !== "per_set") {
        return { ...base, category: "PER_SET_REPS", groupKey: "PER_SET_REPS", direction: "remove_per_set" };
      }
      // Ajuste da distribuição interna: evidência própria, nunca "adoção".
      return {
        ...base,
        category: "PER_SET_REPS",
        groupKey: "PER_SET_DISTRIBUTION",
        direction: "adjust_per_set_distribution",
      };
    }
    case "RIR_CHANGED": {
      const b = numOrNull((change.before as { rir?: unknown })?.rir);
      const a = numOrNull((change.after as { rir?: unknown })?.rir);
      if (b === null || a === null || a === b) return null;
      return {
        ...base,
        category: "RIR",
        groupKey: "RIR",
        direction: a > b ? "higher_rir" : "lower_rir",
        delta: a - b,
      };
    }
    case "REST_CHANGED": {
      const b = numOrNull((change.before as { restSeconds?: unknown })?.restSeconds);
      const a = numOrNull((change.after as { restSeconds?: unknown })?.restSeconds);
      if (b === null || a === null || a === b) return null;
      return {
        ...base,
        category: "REST",
        groupKey: "REST",
        direction: a > b ? "increase_rest" : "decrease_rest",
        delta: a - b,
      };
    }
    case "VARIATION_CHANGED": {
      return { ...base, category: "VARIATION", groupKey: "VARIATION", direction: "adjust_variation" };
    }
    case "EXERCISE_REORDERED": {
      const b = numOrNull(change.position_before);
      const a = numOrNull(change.position_after);
      if (b === null || a === null || a === b) return null;
      return {
        ...base,
        category: "ORDERING",
        groupKey: "ORDERING",
        direction: a < b ? "move_earlier" : "move_later",
        delta: a - b,
        operationKey: str(change.metadata?.reorder_operation_id) ?? null,
      };
    }
    case "EXERCISE_REPLACED": {
      const beforeName = str(change.exercise_before);
      const afterName = str(change.exercise_after);
      const bFam = variationFamilyOf(beforeName);
      const aFam = variationFamilyOf(afterName);
      const direction = !bFam || !aFam ? "unknown_family" : bFam === aFam ? "same_family" : "cross_family";
      return {
        ...base,
        category: "EXERCISE_REPLACEMENT",
        groupKey: "EXERCISE_REPLACEMENT",
        direction,
        context: contextOf(edit, afterName),
      };
    }
    case "EXERCISE_ADDED":
      return { ...base, category: "SESSION_STRUCTURE", groupKey: "SESSION_STRUCTURE", direction: "add_exercise" };
    case "EXERCISE_REMOVED":
      return {
        ...base,
        category: "SESSION_STRUCTURE",
        groupKey: "SESSION_STRUCTURE",
        direction: "remove_exercise",
        context: contextOf(edit, str(change.exercise_before)),
      };
    default:
      // DESCRIPTION/TEMPO/NOTES/DAY_CHANGED não formam preferência nesta etapa.
      return null;
  }
};

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

const contextSignature = (ctx: PreferenceContext): string =>
  Object.keys(ctx)
    .sort()
    .map((k) => `${k}=${String((ctx as Record<string, unknown>)[k])}`)
    .join("&");

const projectContext = (
  ctx: PreferenceContext,
  dims: Array<keyof PreferenceContext>,
): PreferenceContext => {
  const out: PreferenceContext = {};
  for (const d of dims) {
    const v = ctx[d];
    if (v !== undefined) (out as Record<string, unknown>)[d] = v;
  }
  return out;
};

interface Bucket {
  category: PreferenceCategory;
  groupKey: string;
  context: PreferenceContext;
  /** direção -> casos */
  casesByDirection: Map<string, Set<string>>;
  eventsByDirection: Map<string, number>;
  studentsByDirection: Map<string, Set<string>>;
  plansByDirection: Map<string, Set<string>>;
  cyclesByDirection: Map<string, Set<string>>;
  deltasByDirection: Map<string, number[]>;
}

const bucketKey = (category: string, groupKey: string, level: number, sig: string) =>
  `${category}::${groupKey}::L${level}::${sig}`;

const addTo = <K, V>(map: Map<K, Set<V>>, key: K, value: V) => {
  if (!map.has(key)) map.set(key, new Set<V>());
  map.get(key)!.add(value);
};

const strengthOf = (confidence: number): PreferenceStrength => {
  if (confidence < 0.25) return "very_low";
  if (confidence < 0.45) return "low";
  if (confidence < 0.65) return "moderate";
  return "strong";
};

const DIRECTION_LABELS: Record<string, string> = {
  increase: "aumentou o número de séries de trabalho",
  decrease: "reduziu o número de séries de trabalho",
  add_recognition: "acrescentou séries de reconhecimento",
  remove_recognition: "removeu séries de reconhecimento",
  increase_recognition: "aumentou as séries de reconhecimento",
  decrease_recognition: "reduziu as séries de reconhecimento",
  higher_reps: "elevou a faixa de repetições",
  lower_reps: "reduziu a faixa de repetições",
  adopt_per_set: "passou a prescrever repetições por série",
  remove_per_set: "abandonou as repetições por série",
  adjust_per_set_distribution: "reajustou a distribuição das repetições por série",
  higher_rir: "elevou o RIR",
  lower_rir: "reduziu o RIR",
  increase_rest: "aumentou o descanso",
  decrease_rest: "reduziu o descanso",
  adjust_variation: "ajustou a variação do exercício",
  move_earlier: "antecipou o exercício na sessão",
  move_later: "adiou o exercício na sessão",
  add_exercise: "acrescentou exercícios à sessão",
  remove_exercise: "removeu exercícios da sessão",
  same_family: "substituiu por exercício da mesma família funcional",
  cross_family: "substituiu por exercício de outra família funcional",
  unknown_family: "substituiu o exercício (família não classificável)",
};

const CONTEXT_LABELS: Record<string, string> = {
  level: "nível",
  days_per_week: "dias por semana",
  block_type: "bloco",
  periodization_model: "modelo de periodização",
  restriction_status: "restrição",
  session_role: "papel da sessão",
  exercise_role: "papel do exercício",
  exercise_function: "função do exercício",
  priority_match: "exercício prioritário",
};

const describeContext = (ctx: PreferenceContext): string => {
  const parts = Object.keys(ctx)
    .sort()
    .map((k) => `${CONTEXT_LABELS[k] ?? k}=${String((ctx as Record<string, unknown>)[k])}`);
  return parts.length ? ` (contexto: ${parts.join(", ")})` : "";
};

/**
 * CONSISTENCY = supporting_cases / (supporting_cases + opposing_cases).
 * Sem oposição -> 1.0. Consistência alta com 1 caso NÃO é confiança alta.
 *
 * CONFIDENCE (fórmula inicial, conservadora e auditável — não alterar em silêncio):
 *   evidence_factor      = min(1, supporting_case_count / 5)
 *   cross_student_factor = min(1, distinct_student_count / 3)
 *   base                 = consistency * evidence_factor * (0.6 + 0.4 * cross_student_factor)
 *   confidence           = min(0.85, base)
 */
const scoreOf = (
  consistency: number,
  supportingCases: number,
  distinctStudents: number,
): number => {
  const evidenceFactor = Math.min(1, supportingCases / EVIDENCE_SATURATION_CASES);
  const crossStudentFactor = Math.min(1, distinctStudents / CROSS_STUDENT_SATURATION);
  const base = consistency * evidenceFactor * (0.6 + 0.4 * crossStudentFactor);
  return Math.min(MAX_CONFIDENCE, Math.round(base * 1000) / 1000);
};

export const buildProfessorPrescriptionProfile = (
  edits: WorkoutPrescriptionEditRecord[],
  options: { professorId?: string } = {},
): ProfessorPrescriptionProfile => {
  let ignoredAiAssisted = 0;
  let excludedCount = 0;
  let ignoredEmpty = 0;

  const usable: WorkoutPrescriptionEditRecord[] = [];
  for (const e of edits ?? []) {
    if (e.exclude_from_profile === true) {
      excludedCount += 1;
      continue;
    }
    if ((e.action_origin ?? "manual") !== "manual") {
      ignoredAiAssisted += 1;
      continue;
    }
    if (!Array.isArray(e.changes) || e.changes.length === 0) {
      ignoredEmpty += 1;
      continue;
    }
    usable.push(e);
  }

  const professorId =
    options.professorId ?? usable[0]?.professor_id ?? edits?.[0]?.professor_id ?? "unknown";

  // 1. Normalizar eventos -> observações.
  const observations: Observation[] = [];
  for (const edit of usable) {
    // Uma operação de reorder = uma decisão. Colapsamos para o movimento
    // de maior deslocamento (determinístico), sem inflar evidência.
    const reorderByOperation = new Map<string, Observation>();
    for (const change of edit.changes ?? []) {
      const obs = observationFor(edit, change);
      if (!obs) continue;
      if (obs.category === "ORDERING" && obs.operationKey) {
        const key = `${obs.caseKey}::${obs.operationKey}`;
        const current = reorderByOperation.get(key);
        const currentDelta = Math.abs(current?.delta ?? 0);
        const nextDelta = Math.abs(obs.delta ?? 0);
        if (!current || nextDelta > currentDelta) reorderByOperation.set(key, obs);
        continue;
      }
      observations.push(obs);
    }
    for (const obs of reorderByOperation.values()) observations.push(obs);
  }

  // 2. Buckets hierárquicos por contexto (L0 = amplo, Ln = mais específico).
  const buckets = new Map<string, Bucket>();
  for (const obs of observations) {
    const dims = CONTEXT_ORDER[obs.category] ?? [];
    for (let level = 0; level <= dims.length; level++) {
      const ctx = projectContext(obs.context, dims.slice(0, level));
      const sig = contextSignature(ctx);
      // Não duplicar níveis que colapsam na mesma assinatura.
      const key = bucketKey(obs.category, obs.groupKey, level, sig);
      if (!buckets.has(key)) {
        buckets.set(key, {
          category: obs.category,
          groupKey: obs.groupKey,
          context: ctx,
          casesByDirection: new Map(),
          eventsByDirection: new Map(),
          studentsByDirection: new Map(),
          plansByDirection: new Map(),
          cyclesByDirection: new Map(),
          deltasByDirection: new Map(),
        });
      }
      const b = buckets.get(key)!;
      addTo(b.casesByDirection, obs.direction, obs.caseKey);
      addTo(b.studentsByDirection, obs.direction, obs.studentId);
      addTo(b.plansByDirection, obs.direction, obs.planId);
      addTo(b.cyclesByDirection, obs.direction, obs.cycleKey);
      b.eventsByDirection.set(obs.direction, (b.eventsByDirection.get(obs.direction) ?? 0) + 1);
      if (typeof obs.delta === "number") {
        if (!b.deltasByDirection.has(obs.direction)) b.deltasByDirection.set(obs.direction, []);
        b.deltasByDirection.get(obs.direction)!.push(obs.delta);
      }
    }
  }

  // 3. Selecionar, por (categoria + grupo), o contexto MAIS ESPECÍFICO com
  //    evidência suficiente; recuar para o mais amplo quando escasso.
  interface Candidate {
    level: number;
    bucket: Bucket;
    direction: string;
    supportingCases: number;
  }
  const byGroup = new Map<string, Candidate[]>();
  for (const [key, bucket] of buckets.entries()) {
    const level = Number(key.split("::")[2].slice(1));
    // Direção dominante = maior número de casos independentes (desempate estável).
    const directions = [...bucket.casesByDirection.keys()].sort((a, b) => {
      const ca = bucket.casesByDirection.get(a)!.size;
      const cb = bucket.casesByDirection.get(b)!.size;
      return cb - ca || a.localeCompare(b);
    });
    const direction = directions[0];
    if (!direction) continue;
    const group = `${bucket.category}::${bucket.groupKey}`;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push({
      level,
      bucket,
      direction,
      supportingCases: bucket.casesByDirection.get(direction)!.size,
    });
  }

  const preferences: ProfessorPreference[] = [];
  const groupKeys = [...byGroup.keys()].sort();
  for (const group of groupKeys) {
    const candidates = byGroup.get(group)!;
    const specific = candidates
      .filter((c) => c.supportingCases >= MIN_CASES_FOR_SPECIFIC_CONTEXT && c.level > 0)
      .sort((a, b) => b.level - a.level || b.supportingCases - a.supportingCases);
    const chosen = specific[0] ?? candidates.filter((c) => c.level === 0)[0];
    if (!chosen) continue;

    const { bucket, direction } = chosen;
    const supportingCaseSet = bucket.casesByDirection.get(direction)!;
    const opposite = OPPOSITES[direction];
    const opposingCaseSet = opposite ? bucket.casesByDirection.get(opposite) : undefined;
    const supportingCases = supportingCaseSet.size;
    const opposingCases = opposingCaseSet ? opposingCaseSet.size : 0;
    const consistency =
      supportingCases + opposingCases === 0
        ? 1
        : Math.round((supportingCases / (supportingCases + opposingCases)) * 1000) / 1000;

    const students = bucket.studentsByDirection.get(direction)!;
    const plans = bucket.plansByDirection.get(direction)!;
    const cycles = bucket.cyclesByDirection.get(direction)!;
    const confidence = scoreOf(consistency, supportingCases, students.size);
    const deltas = bucket.deltasByDirection.get(direction) ?? [];
    const typicalDelta = mode(deltas.map((d) => Math.round(d)));

    const pattern: Record<string, unknown> & { direction: string } = { direction };
    if (typicalDelta !== null) pattern.typical_delta = typicalDelta;

    const evidence: PreferenceEvidence = {
      supporting_event_count: bucket.eventsByDirection.get(direction) ?? 0,
      supporting_case_count: supportingCases,
      opposing_case_count: opposingCases,
      total_case_count: supportingCases + opposingCases,
      distinct_student_count: students.size,
      distinct_plan_count: plans.size,
      distinct_cycle_count: cycles.size,
      longitudinal_support: cycles.size > students.size,
      cross_student_support: students.size >= 2,
    };

    const label = DIRECTION_LABELS[direction] ?? direction;
    const explanation =
      `Em ${supportingCases} de ${supportingCases + opposingCases} casos independentes` +
      `${describeContext(bucket.context)}, o professor ${label}.` +
      ` Alunos distintos: ${students.size}. Ciclos distintos: ${cycles.size}.` +
      (opposingCases > 0 ? ` Casos em direção oposta: ${opposingCases}.` : "");

    preferences.push({
      id: `${bucket.category}:${bucket.groupKey}:${direction}:${contextSignature(bucket.context) || "global"}`,
      category: bucket.category,
      pattern,
      applicable_context: bucket.context,
      evidence,
      consistency,
      confidence,
      strength: strengthOf(confidence),
      generalizable: students.size >= 2,
      explanation,
    });
  }

  preferences.sort(
    (a, b) => b.confidence - a.confidence || a.category.localeCompare(b.category) || a.id.localeCompare(b.id),
  );

  const notes: string[] = [];
  if (usable.length === 0) notes.push("no_manual_edits");
  if (preferences.length > 0 && preferences.every((p) => p.confidence < 0.25)) {
    notes.push("insufficient_evidence");
  }
  if (preferences.some((p) => p.consistency < 0.6)) notes.push("insufficient_consistency");

  return {
    professor_id: professorId,
    generated_from: {
      total_manual_edits: usable.length,
      total_events_considered: observations.length,
      distinct_students: new Set(usable.map((e) => e.student_id)).size,
      distinct_plans: new Set(usable.map((e) => e.plan_id)).size,
      distinct_cycles: new Set(usable.map((e) => cycleKeyOf(e))).size,
      ignored_ai_assisted: ignoredAiAssisted,
      excluded_count: excludedCount,
      ignored_empty_edits: ignoredEmpty,
    },
    preferences,
    notes,
  };
};
