/**
 * PRESCRIÇÃO DE REPETIÇÕES POR EXERCÍCIO.
 *
 * O perfil da sessão (tensão / hipertrofia / volume) é uma TENDÊNCIA da
 * sessão — não uma faixa obrigatória para todas as linhas do treino.
 *
 * Hierarquia:
 *   perfil da sessão → função do exercício → faixa específica → prescrição.
 *
 * Aqui NÃO existe periodização nova: o perfil chega pronto do resolver.
 */

import { variationFamilyOf, normFamilyName, type VariationFamily } from "./variationFamilies.ts";

export type SessionProfileName = "tensao" | "hipertrofia" | "volume" | "deload";

export type ExerciseFunction =
  | "COMPOUND_PRIMARY"
  | "COMPOUND_SECONDARY"
  | "ISOLATION_LARGE"
  | "ISOLATION_SMALL"
  | "CALF"
  | "CORE_DYNAMIC"
  | "CORE_ISOMETRIC"
  | "MOBILITY"
  | "CARDIO"
  | "OTHER";

const PRIMARY_FAMILIES = new Set<VariationFamily>([
  "squat_pattern",
  "hip_hinge",
  "leg_press",
  "chest_press_horizontal",
  "chest_press_incline",
  "vertical_pull",
  "horizontal_row",
  "shoulder_press",
]);

const SECONDARY_FAMILIES = new Set<VariationFamily>(["lunge_pattern", "hip_thrust", "pullover"]);

const ISOLATION_LARGE_FAMILIES = new Set<VariationFamily>([
  "leg_curl",
  "knee_extension_isolation",
  "chest_fly",
  "hip_abduction",
  "hip_adduction",
  "hip_extension_kickback",
  "shrug",
]);

const ISOLATION_SMALL_FAMILIES = new Set<VariationFamily>([
  "biceps_curl",
  "triceps_pressdown",
  "triceps_extension_overhead",
  "lateral_raise",
  "front_raise",
  "rear_delt",
  "wrist_flexion",
  "wrist_extension",
]);

/** Classificação funcional reutilizando as famílias já existentes. */
export function classifyExerciseFunction(name: string | null | undefined): ExerciseFunction {
  const fam = variationFamilyOf(name);
  if (fam === "cardio") return "CARDIO";
  if (fam === "mobility") return "MOBILITY";
  if (fam === "calf_raise") return "CALF";
  if (fam === "core_isometric") return "CORE_ISOMETRIC";
  if (
    fam === "core_flexion_upper" ||
    fam === "core_flexion_lower" ||
    fam === "core_rotation" ||
    fam === "core_antirotation"
  ) {
    return "CORE_DYNAMIC";
  }
  if (fam && PRIMARY_FAMILIES.has(fam)) return "COMPOUND_PRIMARY";
  if (fam && SECONDARY_FAMILIES.has(fam)) return "COMPOUND_SECONDARY";
  if (fam && ISOLATION_LARGE_FAMILIES.has(fam)) return "ISOLATION_LARGE";
  if (fam && ISOLATION_SMALL_FAMILIES.has(fam)) return "ISOLATION_SMALL";
  const n = normFamilyName(String(name ?? ""));
  if (!n) return "OTHER";
  return "OTHER";
}

export interface RepRange {
  /** Faixa textual sugerida (ex.: "8-12" ou "20-40s"). */
  text: string;
  min: number;
  max: number;
  /** Prescrição em segundos (isometria / mobilidade). */
  isTime: boolean;
}

const R = (min: number, max: number, isTime = false): RepRange => ({
  min,
  max,
  isTime,
  text: isTime ? `${min}-${max}s` : `${min}-${max}`,
});

type Table = Record<ExerciseFunction, RepRange>;

const TABLES: Record<SessionProfileName, Table> = {
  tensao: {
    COMPOUND_PRIMARY: R(5, 8),
    COMPOUND_SECONDARY: R(6, 10),
    ISOLATION_LARGE: R(8, 12),
    ISOLATION_SMALL: R(10, 15),
    CALF: R(10, 15),
    CORE_DYNAMIC: R(10, 15),
    CORE_ISOMETRIC: R(20, 40, true),
    MOBILITY: R(30, 60, true),
    CARDIO: R(0, 0, true),
    OTHER: R(8, 12),
  },
  hipertrofia: {
    COMPOUND_PRIMARY: R(6, 10),
    COMPOUND_SECONDARY: R(8, 12),
    ISOLATION_LARGE: R(10, 15),
    ISOLATION_SMALL: R(10, 15),
    CALF: R(12, 20),
    CORE_DYNAMIC: R(10, 15),
    CORE_ISOMETRIC: R(20, 45, true),
    MOBILITY: R(30, 60, true),
    CARDIO: R(0, 0, true),
    OTHER: R(8, 12),
  },
  volume: {
    COMPOUND_PRIMARY: R(10, 15),
    COMPOUND_SECONDARY: R(10, 15),
    ISOLATION_LARGE: R(12, 18),
    ISOLATION_SMALL: R(12, 20),
    CALF: R(15, 25),
    CORE_DYNAMIC: R(12, 20),
    CORE_ISOMETRIC: R(30, 60, true),
    MOBILITY: R(30, 60, true),
    CARDIO: R(0, 0, true),
    OTHER: R(12, 18),
  },
  deload: {
    COMPOUND_PRIMARY: R(8, 12),
    COMPOUND_SECONDARY: R(8, 12),
    ISOLATION_LARGE: R(10, 15),
    ISOLATION_SMALL: R(12, 15),
    CALF: R(12, 20),
    CORE_DYNAMIC: R(10, 15),
    CORE_ISOMETRIC: R(20, 40, true),
    MOBILITY: R(30, 60, true),
    CARDIO: R(0, 0, true),
    OTHER: R(10, 15),
  },
};

export function resolveRepRange(
  exerciseName: string,
  profile: SessionProfileName | null | undefined,
): { fn: ExerciseFunction; range: RepRange } {
  const fn = classifyExerciseFunction(exerciseName);
  const table = TABLES[(profile ?? "hipertrofia") as SessionProfileName] ?? TABLES.hipertrofia;
  return { fn, range: table[fn] };
}

// ------------------------------------------------------------------
// Parsing / normalização
// ------------------------------------------------------------------

export interface ParsedReps {
  min: number | null;
  max: number | null;
  isTime: boolean;
  /** Prescrições especiais (AMRAP, "15 + 8", per-set) não são normalizadas. */
  complex: boolean;
}

export function parseReps(raw: unknown): ParsedReps {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return { min: null, max: null, isTime: false, complex: false };
  const isTime = /s\b|seg|"|min/.test(s);
  if (/amrap|\+|\/|falha/.test(s)) return { min: null, max: null, isTime, complex: true };
  const nums = (s.match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return { min: null, max: null, isTime, complex: true };
  const min = nums[0];
  const max = nums.length > 1 ? nums[1] : nums[0];
  return { min, max, isTime, complex: false };
}

export interface RepRangeFix {
  day: string;
  exercise: string;
  fn: ExerciseFunction;
  profile: SessionProfileName;
  previous: string;
  next: string;
  reason: "inherited_session_range" | "missing" | "isometric_should_be_time";
}

const clean = (v: unknown) => String(v ?? "").trim();

/**
 * Repara APENAS as linhas que herdaram indevidamente a faixa da sessão.
 * Compostos principais continuam livres para seguir a tendência do dia.
 */
export function validateAndNormalizeRepRanges(
  plan: any,
  profiles: Array<{ sessionIndex: number; profile: string }> = [],
): RepRangeFix[] {
  const fixes: RepRangeFix[] = [];
  if (!plan?.days || !Array.isArray(plan.days)) return fixes;

  const profileByIndex = new Map<number, SessionProfileName>();
  for (const p of profiles) {
    const name = String(p?.profile ?? "") as SessionProfileName;
    if (TABLES[name]) profileByIndex.set(Number(p.sessionIndex), name);
  }

  plan.days.forEach((day: any, dayIdx: number) => {
    const profile = profileByIndex.get(dayIdx) ?? "hipertrofia";
    const dayLabel = clean(day?.day) || clean(day?.label) || `Dia ${dayIdx + 1}`;
    for (const ex of day?.exercises ?? []) {
      const name = clean(ex?.exercise);
      if (!name) continue;
      // Prescrições por série ficam sob responsabilidade do set_scheme.
      if (ex?.set_scheme?.mode === "per_set") continue;

      const { fn, range } = resolveRepRange(name, profile);
      if (fn === "CARDIO") continue;

      const current = clean(ex?.reps);
      const parsed = parseReps(current);
      if (parsed.complex) continue;

      if (parsed.min === null) {
        ex.reps = range.text;
        fixes.push({ day: dayLabel, exercise: name, fn, profile, previous: current, next: range.text, reason: "missing" });
        continue;
      }

      if ((fn === "CORE_ISOMETRIC" || fn === "MOBILITY") && !parsed.isTime) {
        ex.reps = range.text;
        fixes.push({
          day: dayLabel, exercise: name, fn, profile, previous: current, next: range.text,
          reason: "isometric_should_be_time",
        });
        continue;
      }

      // Compostos principais podem seguir a tendência da sessão à risca.
      if (fn === "COMPOUND_PRIMARY") continue;

      // Só corrigimos quando a linha está claramente ABAIXO do piso funcional
      // do exercício (sintoma clássico do "tudo 5-8" num dia de tensão).
      // A tolerância de 2 reps evita reescrever prescrições legítimas.
      if (!parsed.isTime && parsed.min !== null && parsed.min < range.min - 2) {
        ex.reps = range.text;
        fixes.push({
          day: dayLabel, exercise: name, fn, profile, previous: current, next: range.text,
          reason: "inherited_session_range",
        });
      }
    }
  });

  return fixes;
}

/**
 * Identidade da sessão = TENDÊNCIA dos compostos principais, não uniformidade.
 */
export function assessSessionProfileIdentity(
  day: any,
  profile: SessionProfileName,
): { ok: boolean; primaries: number; aligned: number } {
  const table = TABLES[profile] ?? TABLES.hipertrofia;
  let primaries = 0;
  let aligned = 0;
  for (const ex of day?.exercises ?? []) {
    const name = clean(ex?.exercise);
    if (!name) continue;
    const fn = classifyExerciseFunction(name);
    if (fn !== "COMPOUND_PRIMARY" && fn !== "COMPOUND_SECONDARY") continue;
    primaries += 1;
    const parsed = parseReps(ex?.reps);
    const target = table[fn];
    if (parsed.min !== null && parsed.max !== null && parsed.min <= target.max + 2 && parsed.max >= target.min - 2) {
      aligned += 1;
    }
  }
  return { ok: primaries === 0 || aligned / primaries >= 0.5, primaries, aligned };
}

/** Bloco de prompt: perfil da sessão como tendência + faixas por função. */
export function buildRepRangePromptBlock(): string {
  return [
    "",
    "========================================",
    "🎯 FAIXAS DE REPETIÇÃO POR EXERCÍCIO (HIERARQUIA OBRIGATÓRIA)",
    "========================================",
    "O perfil da sessão (tensão / hipertrofia / volume) é uma TENDÊNCIA DOS EXERCÍCIOS PRINCIPAIS.",
    "NUNCA aplique a mesma faixa de repetições a todas as linhas do dia.",
    "Ordem de decisão: perfil da sessão → função do exercício → faixa específica → nível/objetivo/restrições.",
    "",
    "Referência por função (dia de TENSÃO como exemplo):",
    "  • Composto principal (supino, agachamento, puxada, remada, terra): 5-8",
    "  • Composto secundário (afundo, elevação pélvica): 6-10",
    "  • Isolador de grupo grande (peck deck, extensora, flexora): 10-15",
    "  • Isolador de grupo pequeno (tríceps, bíceps, elevação lateral): 8-12 a 12-15",
    "  • Antebraço (flexão/extensão de punho): 12-20",
    "  • Panturrilha: 10-20",
    "  • Core dinâmico (abdominal): 10-15",
    "  • Core isométrico (prancha): 20-40s — SEMPRE em segundos",
    "  • Mobilidade: duração em segundos",
    "Em dia de VOLUME as faixas sobem, mas continuam DIFERENTES entre si (ex.: leg press 10-15, extensora 12-18, flexora 10-15, kick back 12-20, abdutora 15-20).",
    "A identidade da sessão é dada pelos PRINCIPAIS; acessórios com reps maiores não descaracterizam um dia de tensão.",
    "========================================",
    "",
  ].join("\n");
}
