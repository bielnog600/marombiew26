/**
 * PERFIL DE EQUIPAMENTO DOS EXERCÍCIOS (basic / articulated).
 *
 * "Articulado" é um PERFIL DE EQUIPAMENTO, nunca um padrão biomecânico.
 * Este módulo é puro e determinístico: classifica pelo nome canônico do
 * catálogo real e aceita (opcionalmente) metadata explícita no futuro, sem
 * quebrar a API.
 *
 * Ele NUNCA decide equivalência funcional — isso continua sendo
 * variationFamilies / variationSelection / workoutRedundancy.
 */

export type EquipmentStyle = "articulated" | "basic";

export type ExerciseProfile = "basic" | "articulated_plus_basic" | "mixed";

export const EXERCISE_PROFILES: ExerciseProfile[] = [
  "basic",
  "articulated_plus_basic",
  "mixed",
];

export const DEFAULT_EXERCISE_PROFILE: ExerciseProfile = "mixed";

export function normalizeExerciseProfile(value: unknown): ExerciseProfile {
  const v = String(value ?? "").trim().toLowerCase();
  return (EXERCISE_PROFILES as string[]).includes(v)
    ? (v as ExerciseProfile)
    : DEFAULT_EXERCISE_PROFILE;
}

export const EXERCISE_PROFILE_LABELS: Record<ExerciseProfile, string> = {
  basic: "Básico / Tradicional",
  articulated_plus_basic: "Articulados + Básicos",
  mixed: "Misto / Sem preferência",
};

/** Metadata explícita opcional (hoje pode estar vazia / não confiável). */
export interface ExerciseEquipmentMetadata {
  equipment_type?: string | null;
  equipment_style?: string | null;
}

const tokenize = (name: string): string[] =>
  String(name ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** Tokens que indicam máquina articulada no catálogo real (abreviações inclusas). */
const ARTICULATED_TOKENS = new Set([
  "ART",
  "ARTIC",
  "ARTICULADO",
  "ARTICULADA",
  "ARTICULADOS",
  "ARTICULADAS",
]);

/**
 * Classifica o estilo de equipamento de um exercício.
 *
 * Regras:
 * - metadata explícita (quando existir e for confiável) vence;
 * - caso contrário, token exato ART / ARTICULADO / ARTICULADA no nome;
 * - MÁQUINA / MAQ. / MACHINE NÃO é considerado articulado
 *   (ex.: "REMADA MÁQUINA" é máquina tradicional → basic).
 */
export function classifyExerciseEquipmentStyle(
  name: string,
  metadata?: ExerciseEquipmentMetadata | null,
): EquipmentStyle {
  const meta = `${metadata?.equipment_style ?? ""} ${metadata?.equipment_type ?? ""}`
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (meta.includes("ARTICULAD") || /\bART\b/.test(meta)) return "articulated";

  const tokens = tokenize(name);
  for (const t of tokens) {
    if (ARTICULATED_TOKENS.has(t)) return "articulated";
  }
  return "basic";
}

export const isArticulatedExercise = (
  name: string,
  metadata?: ExerciseEquipmentMetadata | null,
): boolean => classifyExerciseEquipmentStyle(name, metadata) === "articulated";

/**
 * Hard gate do perfil. Disponibilidade física de equipamento continua
 * superior e é aplicada em outra camada.
 */
export function isExerciseAllowedByProfile(
  name: string,
  profile: ExerciseProfile,
  metadata?: ExerciseEquipmentMetadata | null,
): boolean {
  if (profile !== "basic") return true;
  return classifyExerciseEquipmentStyle(name, metadata) !== "articulated";
}

/**
 * Bônus determinístico de ranking usado APENAS como desempate dentro do
 * mesmo tier funcional. Nunca vence equivalência biomecânica.
 *
 * - basic: candidato articulado é bloqueado antes disso (score negativo aqui
 *   só por segurança);
 * - articulated_plus_basic: para VARIAÇÃO, preferir estilo DIFERENTE do
 *   principal (alternativa real de equipamento);
 * - mixed: neutro.
 */
export function equipmentStylePreferenceScore(input: {
  mainName: string;
  candidate: string;
  profile: ExerciseProfile;
}): number {
  const { mainName, candidate, profile } = input;
  const candStyle = classifyExerciseEquipmentStyle(candidate);
  if (profile === "basic") return candStyle === "articulated" ? -100 : 0;
  if (profile !== "articulated_plus_basic") return 0;
  const mainStyle = classifyExerciseEquipmentStyle(mainName);
  return candStyle !== mainStyle ? 6 : 0;
}

// ---------------------------------------------------------------- audit

export type ExerciseProfileAuditStatus = "PASS" | "REPAIRED" | "REVIEW_REQUIRED";

export interface ExerciseProfileViolation {
  day: string;
  where: "main" | "variation";
  exercise: string;
  offending: string;
  style: EquipmentStyle;
}

export interface ExerciseProfileRepair {
  day: string;
  where: "main" | "variation";
  previous: string;
  next: string | null;
}

export interface ExerciseProfileAudit {
  profile: ExerciseProfile;
  violations: ExerciseProfileViolation[];
  repairs: ExerciseProfileRepair[];
  status: ExerciseProfileAuditStatus;
}

export const emptyExerciseProfileAudit = (
  profile: ExerciseProfile,
): ExerciseProfileAudit => ({ profile, violations: [], repairs: [], status: "PASS" });

export function buildExerciseProfilePromptBlock(profile: ExerciseProfile): string {
  if (profile === "basic") {
    return `

========================================
PERFIL DE EQUIPAMENTO DO TREINO: BÁSICO/TRADICIONAL
========================================
REGRA:
- NÃO selecionar exercícios classificados como articulados (nomes com "ART.", "ART" ou "ARTICULADO/ARTICULADA");
- NÃO colocar exercícios articulados na coluna VARIAÇÃO;
- utilizar apenas exercícios tradicionais disponíveis (pesos livres, polias e máquinas convencionais).
Observação: "MÁQUINA" tradicional (ex.: REMADA MÁQUINA) é permitido.
========================================`;
  }
  if (profile === "articulated_plus_basic") {
    return `

========================================
PERFIL DE EQUIPAMENTO DO TREINO: ARTICULADOS + BÁSICOS
========================================
REGRA:
- quando existir alternativa articulada funcionalmente equivalente, priorize-a como EXERCÍCIO principal;
- exercícios básicos continuam permitidos, principalmente em acessórios;
- na coluna VARIAÇÃO, prefira uma alternativa BÁSICA funcionalmente equivalente quando o principal for articulado (e vice-versa);
- NÃO force articulado quando não existir equivalente adequado no catálogo;
- equivalência funcional e segurança sempre vencem a preferência de equipamento.
========================================`;
  }
  return `

========================================
PERFIL DE EQUIPAMENTO: MISTO
========================================
- catálogo normal; nenhuma preferência adicional de equipamento.
========================================`;
}
