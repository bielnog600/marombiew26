/**
 * FAMÍLIAS FUNCIONAIS DE VARIAÇÃO (determinísticas).
 *
 * Diferente de `workoutRedundancy.ts` (que responde "esses dois exercícios
 * ocupam o mesmo slot no MESMO DIA?"), este módulo responde:
 *
 *   "o exercício B é um SUBSTITUTO FUNCIONAL DIRETO do exercício A?"
 *
 * Regra central: mesmo músculo NÃO é suficiente. É preciso mesmo padrão de
 * movimento + mesma ação articular + mesmo papel (composto x isolador).
 */

export const normFamilyName = (s: string): string =>
  (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

export type VariationFamily =
  | "leg_curl"
  | "knee_extension_isolation"
  | "squat_pattern"
  | "lunge_pattern"
  | "leg_press"
  | "hip_hinge"
  | "hip_thrust"
  | "hip_abduction"
  | "hip_adduction"
  | "hip_extension_kickback"
  | "calf_raise"
  | "vertical_pull"
  | "horizontal_row"
  | "pullover"
  | "chest_press_horizontal"
  | "chest_press_incline"
  | "chest_fly"
  | "shoulder_press"
  | "lateral_raise"
  | "front_raise"
  | "rear_delt"
  | "shrug"
  | "biceps_curl"
  | "triceps_pressdown"
  | "triceps_extension_overhead"
  | "wrist_flexion"
  | "wrist_extension"
  | "core_flexion_upper"
  | "core_flexion_lower"
  | "core_antirotation"
  | "core_isometric"
  | "core_rotation"
  | "mobility"
  | "cardio";

interface FamilyRule {
  family: VariationFamily;
  match: (n: string) => boolean;
}

/**
 * Ordem importa: regras mais específicas primeiro (panturrilha antes de leg
 * press, abdução antes de glúteo genérico, etc.).
 */
const FAMILY_RULES: FamilyRule[] = [
  { family: "cardio", match: (n) => /\b(ESTEIRA|CORRIDA|BIKE|ELIPTICO|REMO ERGOMETRO|CARDIO|ESCADA|TRANSPORT)\b/.test(n) },
  { family: "mobility", match: (n) => /\b(MOBILIDADE|ALONGAMENTO|STRETCH|CAT COW|90 90)\b/.test(n) },

  // ---- Core
  { family: "core_isometric", match: (n) => /\b(PRANCHA|PLANK|BEAR|ISOMETRIA ABDOMINAL|HOLLOW)\b/.test(n) },
  { family: "core_antirotation", match: (n) => /\b(PALLOF|ANTI ROTACAO|ANTIRROTACAO)\b/.test(n) },
  { family: "core_rotation", match: (n) => /\b(RUSSO|WOOD CHOP|LENHADOR|ROTACAO)\b/.test(n) },
  { family: "core_flexion_lower", match: (n) => /\b(INFRA|ELEVACAO DE PERNAS|ELEVACAO DE PERNA|CANIVETE|REVERSE CRUNCH)\b/.test(n) && /\b(ABDOMINAL|PERNA|PERNAS|CANIVETE)\b/.test(n) },
  { family: "core_flexion_upper", match: (n) => /\b(ABDOMINAL|CRUNCH|SUPRA)\b/.test(n) },

  // ---- Antebraço (funções antagonistas — nunca variação uma da outra)
  { family: "wrist_flexion", match: (n) => /\bPUNHO\b/.test(n) && /\bFLEX/.test(n) },
  { family: "wrist_extension", match: (n) => /\bPUNHO\b/.test(n) && /\bEXTEN/.test(n) },

  // ---- Panturrilha
  { family: "calf_raise", match: (n) => /\b(GEMEOS|PANTURRILHA|CALF|SOLEAR)\b/.test(n) },

  // ---- Membros inferiores
  { family: "leg_curl", match: (n) => /\bFLEXORA\b/.test(n) || /\bFLEXAO DE JOELHO\b/.test(n) },
  { family: "knee_extension_isolation", match: (n) => /\bEXTENSORA\b/.test(n) || /\bEXTENSAO DE JOELHO\b/.test(n) },
  { family: "hip_abduction", match: (n) => /\b(ABDUTORA|ABDUCAO)\b/.test(n) },
  { family: "hip_adduction", match: (n) => /\b(ADUTORA|ADUCAO)\b/.test(n) },
  { family: "hip_extension_kickback", match: (n) => /\b(KICK BACK|KICKBACK|COICE|GLUTEO NA POLIA|EXTENSAO DE QUADRIL)\b/.test(n) },
  { family: "hip_thrust", match: (n) => /\b(ELEVACAO PELVICA|HIP THRUST|PONTE DE GLUTEO)\b/.test(n) },
  { family: "hip_hinge", match: (n) => /\b(STIFF|TERRA|ROMANIAN|GOOD MORNING|BOM DIA)\b/.test(n) },
  { family: "lunge_pattern", match: (n) => /\b(AFUNDO|AVANCO|PASSADA|BULGARO|BULGARA)\b/.test(n) },
  { family: "leg_press", match: (n) => /\b(LEG PRESS|LEG 180|LEG 45)\b/.test(n) },
  { family: "squat_pattern", match: (n) => /\b(AGACHAMENTO|SQUAT|HACK)\b/.test(n) },

  // ---- Costas
  { family: "pullover", match: (n) => /\bPULL OVER\b|\bPULLOVER\b/.test(n) },
  { family: "vertical_pull", match: (n) => /\b(PUXADA|PULL UP|CHIN UP|BARRA FIXA|PULLDOWN)\b/.test(n) },
  { family: "horizontal_row", match: (n) => /\b(REMADA|ROW|SERROTE)\b/.test(n) },
  { family: "shrug", match: (n) => /\b(ENCOLHIMENTO|SHRUG)\b/.test(n) },

  // ---- Peito
  { family: "chest_fly", match: (n) => /\b(CRUCIFIXO|VOADOR|PECK DECK|PEC DECK|FLY|CROSS OVER|CROSSOVER)\b/.test(n) },
  { family: "chest_press_incline", match: (n) => /\bSUPINO\b/.test(n) && /\bINCLINAD/.test(n) },
  { family: "chest_press_horizontal", match: (n) => /\b(SUPINO|CHEST PRESS|FLEXAO DE BRACO)\b/.test(n) },

  // ---- Ombros
  { family: "rear_delt", match: (n) => /\b(REAR DELT|POSTERIOR DE OMBRO|CRUCIFIXO INVERSO|DELTOIDE POSTERIOR|INVERTIDO)\b/.test(n) },
  { family: "lateral_raise", match: (n) => /\bELEVACAO LATERAL\b/.test(n) },
  { family: "front_raise", match: (n) => /\bELEVACAO FRONTAL\b/.test(n) },
  { family: "shoulder_press", match: (n) => /\b(DESENVOLVIMENTO|ARNOLD|MILITARY|OVERHEAD PRESS)\b/.test(n) },

  // ---- Braços
  { family: "triceps_extension_overhead", match: (n) => /\bTRICEPS\b/.test(n) && /\b(TESTA|FRANCES|FRANCESA|SOBRE A CABECA|OVERHEAD)\b/.test(n) },
  { family: "triceps_pressdown", match: (n) => /\bTRICEPS\b/.test(n) },
  { family: "biceps_curl", match: (n) => /\b(ROSCA|CURL)\b/.test(n) },
];

const FAMILY_CACHE = new Map<string, VariationFamily | null>();

export function variationFamilyOf(name: string | null | undefined): VariationFamily | null {
  const key = name ?? "";
  if (FAMILY_CACHE.has(key)) return FAMILY_CACHE.get(key) ?? null;
  const n = normFamilyName(String(name ?? ""));
  let out: VariationFamily | null = null;
  if (n) {
    for (const r of FAMILY_RULES) {
      if (r.match(n)) {
        out = r.family;
        break;
      }
    }
  }
  if (FAMILY_CACHE.size < 20000) FAMILY_CACHE.set(key, out);
  return out;
}

/**
 * Famílias vizinhas aceitas como TIER B (mesmo padrão, função muito próxima).
 * Deliberadamente curto: qualquer par ausente aqui é TIER C → reprovado.
 */
const NEIGHBOURS: Array<[VariationFamily, VariationFamily]> = [
  ["chest_press_horizontal", "chest_press_incline"],
  ["squat_pattern", "leg_press"],
  ["triceps_pressdown", "triceps_extension_overhead"],
];

const neighbourKey = (a: VariationFamily, b: VariationFamily) => [a, b].sort().join("|");
const NEIGHBOUR_SET = new Set(NEIGHBOURS.map(([a, b]) => neighbourKey(a, b)));

/** Papel do exercício: isolador nunca substitui composto e vice-versa. */
export type ExerciseRole = "compound" | "isolation" | "core" | "mobility" | "cardio" | null;

const COMPOUND_FAMILIES = new Set<VariationFamily>([
  "squat_pattern",
  "lunge_pattern",
  "leg_press",
  "hip_hinge",
  "vertical_pull",
  "horizontal_row",
  "chest_press_horizontal",
  "chest_press_incline",
  "shoulder_press",
]);

const CORE_FAMILIES = new Set<VariationFamily>([
  "core_flexion_upper",
  "core_flexion_lower",
  "core_antirotation",
  "core_isometric",
  "core_rotation",
]);

export function familyRole(f: VariationFamily | null): ExerciseRole {
  if (!f) return null;
  if (f === "mobility") return "mobility";
  if (f === "cardio") return "cardio";
  if (CORE_FAMILIES.has(f)) return "core";
  if (COMPOUND_FAMILIES.has(f)) return "compound";
  return "isolation";
}

export type FamilyTier = "A" | "B" | "C" | null;

/**
 * TIER A = mesma família direta.
 * TIER B = famílias vizinhas explicitamente aprovadas e mesmo papel.
 * TIER C = qualquer outra coisa (inclusive "mesmo músculo").
 */
export function familyTier(main: string, candidate: string): FamilyTier {
  const fa = variationFamilyOf(main);
  const fb = variationFamilyOf(candidate);
  if (!fa || !fb) return null; // desconhecido → decidir pelas regras genéricas
  if (fa === fb) return "A";
  if (familyRole(fa) !== familyRole(fb)) return "C";
  return NEIGHBOUR_SET.has(neighbourKey(fa, fb)) ? "B" : "C";
}

const UNILATERAL_TOKENS = [
  "UNILATERAL",
  "ALTERNANDO",
  "ALTERNADA",
  "ALTERNADO",
  "AFUNDO",
  "AVANCO",
  "BULGARO",
  "BULGARA",
  "PASSADA",
  "UM BRACO",
  "UMA PERNA",
];

export function isUnilateralName(name: string): boolean {
  const n = normFamilyName(name);
  return UNILATERAL_TOKENS.some((t) => n.includes(t));
}

const FREE_WEIGHT_TOKENS = ["HALTER", "BARRA", "LIVRE", "KETTLEBELL", "ANILHA"];
const STABLE_TOKENS = ["MAQUINA", "CADEIRA", "MESA", "SMITH", "POLIA", "CABO", "ARTICULAD", "BANCO"];

export function stabilityProfile(name: string): "stable" | "free" | null {
  const n = normFamilyName(name);
  if (STABLE_TOKENS.some((t) => n.includes(t))) return "stable";
  if (FREE_WEIGHT_TOKENS.some((t) => n.includes(t))) return "free";
  return null;
}
