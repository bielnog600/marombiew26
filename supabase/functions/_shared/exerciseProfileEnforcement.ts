/**
 * Quality gate determinístico do PERFIL DE EQUIPAMENTO.
 *
 * Roda DEPOIS da geração (nunca confia só no LLM) e usa exclusivamente a
 * engine de variação existente (`selectVariation`) para achar substitutos:
 * mesma família funcional, mesmo grupo, sem redundância e sem conflito com
 * restrições. Nunca inventa nome fora do catálogo.
 */

import { selectVariation, type CatalogEntryLike, type VariationOptions } from "./variationSelection.ts";
import { normalizeName } from "./planSimilarity.ts";
import {
  classifyExerciseEquipmentStyle,
  emptyExerciseProfileAudit,
  type ExerciseProfile,
  type ExerciseProfileAudit,
  type ExerciseProfileRepair,
  type ExerciseProfileViolation,
} from "./exerciseEquipmentProfile.ts";

const clean = (s: unknown): string => String(s ?? "").trim();
const isEmpty = (s: string): boolean => !s || s === "-" || s === "—";

/**
 * Perfil BASIC: nenhum exercício principal nem variação articulada pode
 * sobreviver no plano final. Repara deterministicamente quando existir
 * candidato seguro; caso contrário sinaliza revisão (principal) ou limpa a
 * variação (opcional por natureza).
 */
export function enforceExerciseProfile(
  plan: any,
  profile: ExerciseProfile,
  catalog: CatalogEntryLike[] = [],
  options: VariationOptions = {},
): ExerciseProfileAudit {
  const audit = emptyExerciseProfileAudit(profile);
  if (profile !== "basic") return audit;
  if (!plan?.days || !Array.isArray(plan.days)) return audit;

  const violations: ExerciseProfileViolation[] = [];
  const repairs: ExerciseProfileRepair[] = [];
  let unrepaired = 0;

  const profileOptions: VariationOptions = { ...options, exerciseProfile: "basic" };

  for (const day of plan.days) {
    const dayLabel = clean(day?.day) || clean(day?.label) || "Dia";

    // 1) Exercícios principais.
    for (const ex of day?.exercises ?? []) {
      const name = clean(ex?.exercise);
      if (!name) continue;
      if (classifyExerciseEquipmentStyle(name) !== "articulated") continue;

      violations.push({
        day: dayLabel,
        where: "main",
        exercise: name,
        offending: name,
        style: "articulated",
      });

      const replacement = selectVariation({
        day,
        exerciseName: name,
        catalog,
        usedVariations: new Set<string>(),
        options: profileOptions,
      });

      if (replacement && classifyExerciseEquipmentStyle(replacement.name) !== "articulated") {
        repairs.push({ day: dayLabel, where: "main", previous: name, next: replacement.name });
        ex.exercise = replacement.name;
        // A variação antiga pode ter virado o próprio exercício: revalidada abaixo.
        if (normalizeName(clean(ex?.variation)) === normalizeName(replacement.name)) {
          ex.variation = null;
        }
      } else {
        unrepaired += 1;
      }
    }

    // 2) Variações.
    const used = new Set<string>();
    for (const ex of day?.exercises ?? []) {
      const name = clean(ex?.exercise);
      const variation = clean(ex?.variation);
      if (!name || isEmpty(variation)) continue;
      if (classifyExerciseEquipmentStyle(variation) !== "articulated") {
        used.add(normalizeName(variation));
        continue;
      }

      violations.push({
        day: dayLabel,
        where: "variation",
        exercise: name,
        offending: variation,
        style: "articulated",
      });

      const replacement = selectVariation({
        day,
        exerciseName: name,
        catalog,
        usedVariations: used,
        options: profileOptions,
      });
      const next =
        replacement && classifyExerciseEquipmentStyle(replacement.name) !== "articulated"
          ? replacement.name
          : null;
      ex.variation = next;
      if (next) used.add(normalizeName(next));
      repairs.push({ day: dayLabel, where: "variation", previous: variation, next });
    }
  }

  audit.violations = violations;
  audit.repairs = repairs;
  audit.status =
    violations.length === 0 ? "PASS" : unrepaired > 0 ? "REVIEW_REQUIRED" : "REPAIRED";
  return audit;
}

/** Conta exercícios articulados que sobraram (principais + variações). */
export function countArticulated(plan: any): number {
  let n = 0;
  for (const day of plan?.days ?? []) {
    for (const ex of day?.exercises ?? []) {
      if (classifyExerciseEquipmentStyle(clean(ex?.exercise)) === "articulated") n += 1;
      const v = clean(ex?.variation);
      if (!isEmpty(v) && classifyExerciseEquipmentStyle(v) === "articulated") n += 1;
    }
  }
  return n;
}
