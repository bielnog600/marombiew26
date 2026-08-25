import { normalizeName } from "../_shared/planSimilarity.ts";
import { getExerciseFunctionalProfile } from "../_shared/exerciseClassifier.ts";

export type RedundancyIssue = {
  day: string;
  family: string | "exact_duplicate" | "strong_functional_duplicate";
  exercises: string[];
  severity: "low" | "medium" | "high";
};

export type RedundancyResult = {
  ok: boolean;
  issues: RedundancyIssue[];
  exactDuplicate: boolean;
  strongFunctionalDuplicate: boolean;
  /** Names involved in a strong functional duplicate, for retry prompts and drift analysis. */
  strongDuplicateNames: string[];
};

const norm = (s: string): string =>
  (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/**
 * STRONG functional equivalence families — conservative on purpose.
 *
 * Two exercises are strongly equivalent only when they occupy essentially the
 * same movement slot and stimulus (machine/angle variants of one another).
 * "Same muscle group" is NEVER enough: Hack + Leg Press, Flexora + Stiff,
 * Remada + Puxada, Supino + Crucifixo, Extensora + Leg Press and
 * Hip Thrust + Abdutora must all stay allowed.
 */
const STRONG_FAMILIES: Array<{ family: string; match: (n: string) => boolean }> = [
  {
    family: "leg_press",
    match: (n) => /\bLEG PRESS\b/.test(n) || /\bLEG 180\b/.test(n) || /\bLEG 45\b/.test(n),
  },
  {
    family: "supino_inclinado",
    match: (n) => /\bSUPINO\b/.test(n) && /\bINCLINAD/.test(n),
  },
  {
    family: "supino_declinado",
    match: (n) => /\bSUPINO\b/.test(n) && /\bDECLINAD/.test(n),
  },
  {
    family: "supino_reto",
    match: (n) => /\bSUPINO\b/.test(n) && !/\bINCLINAD|DECLINAD/.test(n),
  },
  {
    family: "puxada_alta",
    match: (n) => /\bPUXADA ALTA\b/.test(n),
  },
  {
    family: "cadeira_flexora",
    match: (n) => /\bCADEIRA FLEXORA\b/.test(n),
  },
  {
    family: "cadeira_extensora",
    match: (n) => /\bCADEIRA EXTENSORA\b/.test(n),
  },
  {
    family: "cadeira_abdutora",
    match: (n) => /\bCADEIRA ABDUTORA\b/.test(n),
  },
  {
    family: "mesa_flexora",
    match: (n) => /\bMESA FLEXORA\b/.test(n),
  },
];

/**
 * Qualifiers that only describe the same slot in another machine/angle.
 * Names differing exclusively by these tokens stay in the same strong family.
 */
const GRIP_TOKENS = ["PRONADA", "SUPINADA", "NEUTRA", "ABERTA", "FECHADA", "TRIANGULO"];

export function strongFamilyKey(name: string): string | null {
  const n = norm(name);
  if (!n) return null;
  for (const f of STRONG_FAMILIES) {
    if (f.match(n)) {
      // Grip/pattern differences split the family (e.g. PUXADA ALTA PRONADA vs SUPINADA).
      const grip = GRIP_TOKENS.find((g) => n.includes(g));
      return grip ? `${f.family}:${grip}` : f.family;
    }
  }
  return null;
}

/** True when both exercises occupy the same strong functional slot. */
export function isStrongFunctionalEquivalent(a: string, b: string): boolean {
  const ka = strongFamilyKey(a);
  const kb = strongFamilyKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

/**
 * Checks a workout plan for redundancy within each day.
 * Hard rejects: exact nominal duplicate and strong functional equivalence.
 */
export function validateWorkoutRedundancy(plan: any): RedundancyResult {
  const issues: RedundancyIssue[] = [];
  const strongDuplicateNames: string[] = [];
  let exactDuplicate = false;
  let strongFunctionalDuplicate = false;

  if (!plan?.days || !Array.isArray(plan.days)) {
    return { ok: true, issues: [], exactDuplicate: false, strongFunctionalDuplicate: false, strongDuplicateNames: [] };
  }

  for (const day of plan.days) {
    const dayLabel = day.day || day.label || day.focus || "Dia";
    const exercises = day.exercises || [];

    // 1. Exact nominal duplicate check (count >= 2 is hard reject)
    const nameCounts = new Map<string, string[]>();
    for (const ex of exercises) {
      if (!ex.exercise) continue;
      const normalized = normalizeName(ex.exercise);
      if (!normalized) continue;
      const list = nameCounts.get(normalized) || [];
      list.push(ex.exercise);
      nameCounts.set(normalized, list);
    }

    for (const [, instances] of nameCounts.entries()) {
      if (instances.length >= 2) {
        exactDuplicate = true;
        issues.push({ day: dayLabel, family: "exact_duplicate", exercises: instances, severity: "high" });
      }
    }

    // 2. Strong functional equivalence (hard reject, conservative families)
    const strongGroups = new Map<string, string[]>();
    for (const ex of exercises) {
      if (!ex.exercise) continue;
      const key = strongFamilyKey(ex.exercise);
      if (!key) continue;
      const list = strongGroups.get(key) || [];
      list.push(ex.exercise);
      strongGroups.set(key, list);
    }
    for (const [key, list] of strongGroups.entries()) {
      const distinct = [...new Set(list.map((n) => normalizeName(n)))];
      if (list.length >= 2 && distinct.length >= 2) {
        strongFunctionalDuplicate = true;
        strongDuplicateNames.push(...list);
        issues.push({
          day: dayLabel,
          family: `strong_functional_duplicate:${key}`,
          exercises: list,
          severity: "high",
        });
      }
    }

    // 3. Soft functional density (Pattern + Equipment) — informative only
    const functionalGroups = new Map<string, string[]>();
    for (const ex of exercises) {
      if (!ex.exercise) continue;
      const profile = getExerciseFunctionalProfile(ex.exercise);
      if (profile.pattern) {
        const key = `${profile.pattern}_${profile.equipment || "none"}`;
        const list = functionalGroups.get(key) || [];
        list.push(ex.exercise);
        functionalGroups.set(key, list);
      }
    }
    for (const [key, list] of functionalGroups.entries()) {
      if (list.length >= 3) {
        issues.push({ day: dayLabel, family: key.split("_")[0], exercises: list, severity: "medium" });
      }
    }
  }

  const ok = !issues.some((i) => i.severity === "high");
  return {
    ok,
    issues,
    exactDuplicate,
    strongFunctionalDuplicate,
    strongDuplicateNames: [...new Set(strongDuplicateNames)],
  };
}

// ───────────────────────── variation integrity ─────────────────────────

/**
 * A variation must never be the exercise itself.
 * Returns the list of exercises whose variation was cleared/replaced.
 */
export function enforceVariationIntegrity(
  plan: any,
  catalog: Array<{ nome: string; grupo: string }> = [],
): string[] {
  const fixed: string[] = [];
  if (!plan?.days || !Array.isArray(plan.days)) return fixed;

  for (const day of plan.days) {
    const exercises = day?.exercises ?? [];
    const dayNames = new Set(exercises.map((e: any) => normalizeName(String(e?.exercise ?? ""))));
    for (const ex of exercises) {
      const name = String(ex?.exercise ?? "").trim();
      const variation = String(ex?.variation ?? "").trim();
      if (!name || !variation || variation === "-" || variation === "—") continue;
      if (normalizeName(name) !== normalizeName(variation)) continue;

      // Prefer another valid, non-redundant variation from the same group.
      const own = catalog.find((c) => normalizeName(c.nome) === normalizeName(name));
      const replacement = own
        ? catalog.find(
            (c) =>
              c.grupo === own.grupo &&
              normalizeName(c.nome) !== normalizeName(name) &&
              !dayNames.has(normalizeName(c.nome)) &&
              !isStrongFunctionalEquivalent(c.nome, name),
          )
        : undefined;

      ex.variation = replacement ? replacement.nome : null;
      fixed.push(name);
    }
  }
  return fixed;
}
