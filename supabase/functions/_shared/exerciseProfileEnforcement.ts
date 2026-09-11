/**
 * Quality gate determinístico do PERFIL DE EQUIPAMENTO.
 *
 * Roda DEPOIS da geração (nunca confia só no LLM) e usa exclusivamente a
 * engine de variação existente (`selectVariation` / `evaluateVariationCandidate`)
 * para achar substitutos: mesma família funcional, mesmo grupo, sem
 * redundância e sem conflito com restrições. Nunca inventa nome fora do
 * catálogo.
 *
 * Ordem de prioridade respeitada (nunca invertida):
 * 1 segurança → 2 referência exata / âncora protegida → 3 disponibilidade de
 * equipamento → 4 equivalência funcional → 5 redundância → 6 perfil.
 */

import {
  evaluateVariationCandidate,
  selectVariation,
  type CatalogEntryLike,
  type VariationOptions,
} from "./variationSelection.ts";
import { normalizeName } from "./planSimilarity.ts";
import { validateWorkoutRedundancy } from "./workoutRedundancy.ts";
import {
  classifyExerciseEquipmentStyle,
  emptyExerciseProfileAudit,
  type ExerciseProfile,
  type ExerciseProfileAudit,
  type ExerciseProfileOpportunity,
  type ExerciseProfileRepair,
  type ExerciseProfileViolation,
} from "./exerciseEquipmentProfile.ts";

const clean = (s: unknown): string => String(s ?? "").trim();
const isEmpty = (s: string): boolean => !s || s === "-" || s === "—";

export interface ExerciseProfileEnforcementOptions extends VariationOptions {
  /** Nomes de exercícios que não podem ser trocados por preferência. */
  protectedAnchors?: string[];
  /** Modo do treino de referência: em `exact` nenhum principal é trocado por perfil. */
  referenceMode?: "exact" | "free";
}

/** Metadata de catálogo (equipment_type) do exercício, quando existir. */
function metadataFor(catalog: CatalogEntryLike[], name: string) {
  const key = normalizeName(name);
  const entry = catalog.find((c) => normalizeName(c.nome) === key);
  return entry ? { equipment_type: entry.equipment_type ?? null } : null;
}

const styleOf = (catalog: CatalogEntryLike[], name: string) =>
  classifyExerciseEquipmentStyle(name, metadataFor(catalog, name));

function planRedundancyScore(plan: any): number {
  const v = validateWorkoutRedundancy(plan);
  return (v.issues?.length ?? 0) + (v.exactDuplicate ? 100 : 0) + (v.strongFunctionalDuplicate ? 100 : 0);
}

/**
 * Perfil BASIC: nenhum exercício principal nem variação articulada pode
 * sobreviver no plano final. Repara deterministicamente quando existir
 * candidato seguro; caso contrário sinaliza revisão (principal) ou limpa a
 * variação (opcional por natureza).
 *
 * Perfil ARTICULATED_PLUS_BASIC: auditoria de OPORTUNIDADE nos principais —
 * nunca hard replace agressivo (ver `applyArticulatedPreference`).
 */
export function enforceExerciseProfile(
  plan: any,
  profile: ExerciseProfile,
  catalog: CatalogEntryLike[] = [],
  options: ExerciseProfileEnforcementOptions = {},
): ExerciseProfileAudit {
  const audit = emptyExerciseProfileAudit(profile);
  if (!plan?.days || !Array.isArray(plan.days)) return audit;
  if (profile === "articulated_plus_basic") {
    return applyArticulatedPreference(plan, catalog, options);
  }
  if (profile !== "basic") return audit;

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
      if (styleOf(catalog, name) !== "articulated") continue;

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

      if (replacement && styleOf(catalog, replacement.name) !== "articulated") {
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
      if (styleOf(catalog, variation) !== "articulated") {
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
        replacement && styleOf(catalog, replacement.name) !== "articulated"
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

/**
 * ARTICULADOS + BÁSICOS: preferência, nunca obrigação.
 *
 * Para cada principal BÁSICO procura um candidato ARTICULADO Tier A do mesmo
 * grupo/papel, seguro, sem restrição, sem redundância e dentro do equipamento
 * disponível. Só aplica automaticamente quando não houver razão superior para
 * preservar o exercício atual (referência exata / âncora protegida).
 */
export function applyArticulatedPreference(
  plan: any,
  catalog: CatalogEntryLike[] = [],
  options: ExerciseProfileEnforcementOptions = {},
): ExerciseProfileAudit {
  const audit = emptyExerciseProfileAudit("articulated_plus_basic");
  const opportunities: ExerciseProfileOpportunity[] = [];
  const repairs: ExerciseProfileRepair[] = [];
  const protectedAnchors = new Set(
    (options.protectedAnchors ?? []).map((n) => normalizeName(String(n))),
  );
  const exactReference = options.referenceMode === "exact";

  // Disponibilidade de equipamento (prioridade 3) vem ANTES da preferência de
  // perfil (prioridade 6): exercício articulado exige estação de musculação.
  const availability = Array.isArray(options.availableEquipment)
    ? options.availableEquipment.map((e) => String(e).toLowerCase())
    : [];
  if (availability.length > 0 && !availability.includes("machine")) return audit;

  const articulatedCatalog = catalog.filter((c) => styleOf(catalog, c.nome) === "articulated");
  if (articulatedCatalog.length === 0) return audit;

  for (const day of plan?.days ?? []) {
    const dayLabel = clean(day?.day) || clean(day?.label) || "Dia";
    for (const ex of day?.exercises ?? []) {
      const name = clean(ex?.exercise);
      if (!name) continue;
      if (styleOf(catalog, name) !== "basic") continue;

      const mainEntry = catalog.find((c) => normalizeName(c.nome) === normalizeName(name));
      if (!mainEntry) continue;

      const candidates = articulatedCatalog
        .filter((c) => c.grupo === mainEntry.grupo)
        .map((c) => c.nome)
        .sort((a, b) => a.localeCompare(b));

      let chosen: string | null = null;
      for (const candidate of candidates) {
        const verdict = evaluateVariationCandidate({
          day,
          exerciseName: name,
          candidate,
          catalog,
          options: { ...options, exerciseProfile: undefined },
        });
        if (verdict.valid && verdict.tier === "A") {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) continue;

      if (exactReference || protectedAnchors.has(normalizeName(name))) {
        opportunities.push({
          day: dayLabel,
          exercise: name,
          articulatedCandidate: chosen,
          applied: false,
          reason: exactReference ? "reference_exact" : "protected_anchor",
        });
        continue;
      }

      // Repair nunca pode piorar redundância do plano inteiro.
      const before = planRedundancyScore(plan);
      const previous = name;
      const previousVariation = ex.variation;
      ex.exercise = chosen;
      if (normalizeName(clean(ex?.variation)) === normalizeName(chosen)) ex.variation = null;
      const after = planRedundancyScore(plan);
      if (after > before) {
        ex.exercise = previous;
        ex.variation = previousVariation;
        opportunities.push({
          day: dayLabel,
          exercise: previous,
          articulatedCandidate: chosen,
          applied: false,
          reason: "creates_redundancy",
        });
        continue;
      }

      repairs.push({ day: dayLabel, where: "main", previous, next: chosen });
      opportunities.push({
        day: dayLabel,
        exercise: previous,
        articulatedCandidate: chosen,
        applied: true,
        reason: "articulated_preference_applied",
      });
    }
  }

  audit.opportunities = opportunities;
  audit.repairs = repairs;
  // Manter um BÁSICO nunca é motivo de revisão.
  audit.status = repairs.length > 0 ? "REPAIRED" : "PASS";
  return audit;
}

/** Conta exercícios articulados que sobraram (principais + variações). */
export function countArticulated(plan: any, catalog: CatalogEntryLike[] = []): number {
  let n = 0;
  for (const day of plan?.days ?? []) {
    for (const ex of day?.exercises ?? []) {
      if (styleOf(catalog, clean(ex?.exercise)) === "articulated") n += 1;
      const v = clean(ex?.variation);
      if (!isEmpty(v) && styleOf(catalog, v) === "articulated") n += 1;
    }
  }
  return n;
}

/**
 * Verificação FINAL do perfil, executada depois de TODAS as mutações do
 * pipeline. Nunca confia no audit intermediário.
 */
export function verifyExerciseProfileFinal(
  plan: any,
  profile: ExerciseProfile,
  audit: ExerciseProfileAudit,
  catalog: CatalogEntryLike[] = [],
): ExerciseProfileAudit {
  if (profile !== "basic") return audit;
  const remaining = countArticulated(plan, catalog);
  if (remaining === 0) return audit;

  const violations = [...audit.violations];
  for (const day of plan?.days ?? []) {
    const dayLabel = clean(day?.day) || clean(day?.label) || "Dia";
    for (const ex of day?.exercises ?? []) {
      const name = clean(ex?.exercise);
      const variation = clean(ex?.variation);
      if (name && styleOf(catalog, name) === "articulated") {
        violations.push({
          day: dayLabel,
          where: "main",
          exercise: name,
          offending: name,
          style: "articulated",
        });
      }
      if (!isEmpty(variation) && styleOf(catalog, variation) === "articulated") {
        violations.push({
          day: dayLabel,
          where: "variation",
          exercise: name,
          offending: variation,
          style: "articulated",
        });
      }
    }
  }
  return { ...audit, violations, status: "REVIEW_REQUIRED" };
}
