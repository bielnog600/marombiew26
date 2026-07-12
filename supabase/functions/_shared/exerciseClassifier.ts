// Deterministic rule-based classifier — writes ONLY to
// exercise_metadata_suggestions. Never mutates exercises directly.

export const CLASSIFIER_VERSION = "rules-1.0.0";

export interface RawExercise {
  id: string;
  nome: string;
  grupo_muscular: string;
  ajustes?: string[] | null;
  requires_load_logging?: boolean | null;
  imagem_url?: string | null;
  video_embed?: string | null;
}

export interface ClassifierOutput {
  proposedMetadata: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
  matchedRules: string[];
  unresolvedFields: string[];
  warnings: string[];
  classifierVersion: string;
}

function nrm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Equipment lookup by name tokens
const EQUIP_RULES: Array<{ eq: string; tokens: string[]; conf: number }> = [
  { eq: "machine",   tokens: ["maquina", "cadeira", "leg press", "hack", "pec deck", "voador", "smith", "chest press", "seated row", "peck deck"], conf: 0.9 },
  { eq: "cable",     tokens: ["cabo", "polia", "cross over", "crossover", "pulley"], conf: 0.92 },
  { eq: "barbell",   tokens: ["barra "], conf: 0.9 },
  { eq: "dumbbell",  tokens: ["halter", "dumbbell"], conf: 0.9 },
  { eq: "kettlebell",tokens: ["kettlebell"], conf: 0.95 },
  { eq: "bodyweight",tokens: ["peso corporal", "livre de peso", "sem carga"], conf: 0.75 },
  { eq: "band",      tokens: ["elastico", "band "], conf: 0.85 },
];

// Class hints by name
const ISOLATION_TOKENS = [
  "extensora", "flexora", "rosca", "triceps", "elevacao lateral", "elevacao frontal",
  "crucifixo", "voador", "pec deck", "panturrilha", "abducao", "aducao",
  "extensao de", "flexao de perna", "kickback",
];
const COMPOUND_TOKENS = [
  "agachamento", "levantamento terra", "supino", "desenvolvimento",
  "remada", "puxada", "afundo", "avanco", "stiff", "leg press", "clean", "snatch",
];
const POWER_TOKENS = ["clean", "snatch", "arremesso", "push jerk", "jerk"];
const PLYO_TOKENS = ["salto", "jump", "pliometrico"];
const MOBILITY_TOKENS = ["mobilidade", "alongamento", "stretch"];
const CARDIO_TOKENS = ["corrida", "esteira", "bike", "ciclismo", "remo ergometro", "cardio"];
const CORE_TOKENS = ["prancha", "abdominal", "russo", "wood chop", "core", "ab wheel"];

// Movement pattern hints
const MOVEMENT_PATTERNS: Array<{ pattern: string; tokens: string[]; conf: number }> = [
  { pattern: "knee_extension", tokens: ["cadeira extensora", "extensao de joelho"], conf: 0.97 },
  { pattern: "knee_flexion",   tokens: ["mesa flexora", "flexora deitad", "flexora sentad"], conf: 0.95 },
  { pattern: "hip_hinge",      tokens: ["stiff", "levantamento terra", "good morning", "romanian"], conf: 0.9 },
  { pattern: "squat",          tokens: ["agachamento", "leg press", "hack"], conf: 0.88 },
  { pattern: "horizontal_push",tokens: ["supino", "chest press", "flexao "], conf: 0.88 },
  { pattern: "vertical_push",  tokens: ["desenvolvimento", "military press", "overhead press", "arnold"], conf: 0.88 },
  { pattern: "horizontal_pull",tokens: ["remada"], conf: 0.9 },
  { pattern: "vertical_pull",  tokens: ["puxada", "pull up", "chin up", "barra fixa"], conf: 0.9 },
  { pattern: "elbow_flexion",  tokens: ["rosca"], conf: 0.9 },
  { pattern: "elbow_extension",tokens: ["triceps", "kickback", "frances"], conf: 0.9 },
  { pattern: "shoulder_abduction", tokens: ["elevacao lateral"], conf: 0.93 },
  { pattern: "calf_raise",     tokens: ["panturrilha", "calf raise"], conf: 0.95 },
];

// Primary muscle guess from grupo_muscular
const MUSCLE_MAP: Record<string, string[]> = {
  peito: ["chest"],
  costas: ["lats", "upper_back"],
  quadriceps: ["quadriceps"],
  quadríceps: ["quadriceps"],
  posterior: ["hamstrings"],
  gluteos: ["glutes"],
  glúteos: ["glutes"],
  ombros: ["deltoids"],
  ombro: ["deltoids"],
  triceps: ["triceps"],
  tríceps: ["triceps"],
  biceps: ["biceps"],
  bíceps: ["biceps"],
  panturrilha: ["calves"],
  abdominal: ["abs"],
  abdomen: ["abs"],
  core: ["abs", "obliques"],
};

export function classifyExerciseByRules(exercise: RawExercise): ClassifierOutput {
  const name = nrm(exercise.nome);
  const group = nrm(exercise.grupo_muscular);
  const matched: string[] = [];
  const unresolved: string[] = [];
  const warnings: string[] = [];
  const proposed: Record<string, unknown> = {};
  const fieldConf: Record<string, number> = {};

  // Equipment
  let eqMatch: (typeof EQUIP_RULES)[number] | null = null;
  for (const r of EQUIP_RULES) {
    if (r.tokens.some((t) => name.includes(t))) { eqMatch = r; break; }
  }
  if (eqMatch) {
    proposed.equipment_type = eqMatch.eq;
    fieldConf.equipment_type = eqMatch.conf;
    matched.push(`equipment:${eqMatch.eq}`);
  } else {
    unresolved.push("equipment_type");
  }

  // Exercise class
  let clsGuess: string | null = null;
  let clsConf = 0;
  const testCls = (cls: string, tokens: string[], conf: number) => {
    if (clsGuess) return;
    if (tokens.some((t) => name.includes(t))) { clsGuess = cls; clsConf = conf; matched.push(`class:${cls}`); }
  };
  testCls("cardio", CARDIO_TOKENS, 0.95);
  testCls("mobility", MOBILITY_TOKENS, 0.95);
  testCls("plyometric", PLYO_TOKENS, 0.9);
  testCls("power", POWER_TOKENS, 0.9);
  testCls("core", CORE_TOKENS, 0.85);
  testCls("isolation", ISOLATION_TOKENS, 0.9);
  testCls("compound", COMPOUND_TOKENS, 0.85);
  if (clsGuess) {
    proposed.exercise_class = clsGuess;
    fieldConf.exercise_class = clsConf;
  } else {
    unresolved.push("exercise_class");
  }

  // Movement pattern
  let mp: (typeof MOVEMENT_PATTERNS)[number] | null = null;
  for (const r of MOVEMENT_PATTERNS) {
    if (r.tokens.some((t) => name.includes(t))) { mp = r; break; }
  }
  if (mp) {
    proposed.movement_pattern = mp.pattern;
    fieldConf.movement_pattern = mp.conf;
    matched.push(`movement:${mp.pattern}`);
  } else {
    unresolved.push("movement_pattern");
  }

  // Primary muscles from group
  const grpKey = Object.keys(MUSCLE_MAP).find((k) => group.includes(k));
  if (grpKey) {
    proposed.primary_muscles = MUSCLE_MAP[grpKey];
    fieldConf.primary_muscles = 0.85;
    matched.push(`muscles:${grpKey}`);
  } else {
    unresolved.push("primary_muscles");
  }

  // High-risk fields: only propose safe_to_failure when a strong combo matches
  const isIsolation = clsGuess === "isolation";
  const isSafeEquip = eqMatch?.eq === "machine" || eqMatch?.eq === "cable";
  if (isIsolation && isSafeEquip) {
    proposed.safe_to_failure = true;
    fieldConf.safe_to_failure = 0.75;
    proposed.stability_level = "high";
    fieldConf.stability_level = 0.8;
    proposed.technical_complexity = "low";
    fieldConf.technical_complexity = 0.75;
    proposed.axial_load = "none";
    fieldConf.axial_load = 0.85;
    proposed.lumbar_load = "low";
    fieldConf.lumbar_load = 0.75;
    proposed.balance_requirement = "none";
    fieldConf.balance_requirement = 0.85;
    proposed.fatigue_cost = "low";
    fieldConf.fatigue_cost = 0.7;
    matched.push("safe_isolation_machine_combo");
    warnings.push("high_risk_fields_require_human_review");
  } else {
    unresolved.push("safe_to_failure");
    unresolved.push("stability_level");
    unresolved.push("technical_complexity");
    unresolved.push("axial_load");
    unresolved.push("lumbar_load");
    unresolved.push("balance_requirement");
    unresolved.push("fatigue_cost");
  }

  // Do NOT auto-propose contraindications from name only.
  unresolved.push("contraindications");

  // Overall confidence = average of proposed field confidences
  const values = Object.values(fieldConf);
  const overall = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return {
    proposedMetadata: proposed,
    fieldConfidence: fieldConf,
    overallConfidence: Math.round(overall * 100) / 100,
    matchedRules: matched,
    unresolvedFields: unresolved,
    warnings,
    classifierVersion: CLASSIFIER_VERSION,
  };
}