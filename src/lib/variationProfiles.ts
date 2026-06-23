/**
 * UI-side mirror of supabase/functions/_shared/variationProfiles.ts.
 * Used to render the intensity selector and label similarity feedback.
 */

export type VariationIntensity = "baixa" | "media" | "alta";

export const DEFAULT_INTENSITY: VariationIntensity = "media";

/** Generation intent — mirrors backend. */
export type DietIntent = "new" | "update" | "regenerate";

export const DIET_INTENT_LABELS: Record<DietIntent, { label: string; desc: string }> = {
  new: {
    label: "Nova dieta",
    desc: "Gera do zero. IA decide entre preservar, ajustar ou trocar.",
  },
  update: {
    label: "Atualizar dieta",
    desc: "Mantém pelo menos 70% da base — ajusta porções/macros, sem trocar tudo.",
  },
  regenerate: {
    label: "Regenerar dieta",
    desc: "Força variação real: troca fontes principais, combinações e preparações.",
  },
};

export const VARIATION_OPTIONS: ReadonlyArray<{
  value: VariationIntensity;
  label: string;
  desc: string;
}> = [
  {
    value: "baixa",
    label: "Baixa",
    desc: "Pequenas trocas, mantém estrutura e maioria dos itens.",
  },
  {
    value: "media",
    label: "Média (recomendado)",
    desc: "Mantém âncoras técnicas, rotaciona acessórios e variações.",
  },
  {
    value: "alta",
    label: "Alta",
    desc: "Reestrutura agressivamente; cardápio/treino quase novo.",
  },
];

export type SimilarityFeedback = {
  score: number;
  threshold: number;
  intensity: VariationIntensity;
  regenerated: boolean;
  warning: string | null;
  worstOverlap?: string[];
  historyCount: number;
  /** Diet-only: 0..1 ratio of meals that only changed portions. */
  quantityOnlyRatio?: number;
  /** Diet-only: categorization of the change vs previous plan. */
  changeKind?: "menu_variation" | "portion_only" | "mixed" | "new_menu";
  /** Diet-only: 0..1 ratio of meals whose primary protein family repeats. */
  primaryProteinRepeatRatio?: number;
  /** Diet-only: 0..1 ratio of meals whose primary carb family repeats. */
  primaryCarbRepeatRatio?: number;
  /** Diet-only: meal names where primary protein source repeated. */
  proteinRepeatMeals?: string[];
  /** Diet-only: meal names where primary carb source repeated. */
  carbRepeatMeals?: string[];
  /** Diet-only: nutrition guardrail result returned by the agent. */
  nutrition?: {
    ok: boolean;
    issues: Array<{
      meal: string;
      reason:
        | "missing_primary_protein"
        | "protein_below_floor"
        | "low_protein_share"
        | "breakfast_missing_protein"
        | "breakfast_protein_below_floor";
      proteinG: number;
    }>;
    totalProteinG?: number;
    totalKcal?: number;
  };
};

export function describeSimilarity(s: SimilarityFeedback): {
  level: "ok" | "warn" | "info";
  label: string;
} {
  if (s.historyCount === 0) {
    return { level: "info", label: "Primeiro plano do aluno — sem comparação." };
  }
  const pct = Math.round(s.score * 100);
  // Nutrition guardrail has the highest priority in UX messaging.
  if (s.warning === "incomplete_nutrition" || (s.nutrition && !s.nutrition.ok)) {
    const issues = s.nutrition?.issues ?? [];
    const missing = issues.filter((i) => i.reason === "missing_primary_protein").map((i) => i.meal);
    const lowProt = issues.filter((i) => i.reason === "protein_below_floor").map((i) => i.meal);
    const bfMissing = issues.filter((i) => i.reason === "breakfast_missing_protein").map((i) => i.meal);
    const bfLow = issues.filter((i) => i.reason === "breakfast_protein_below_floor").map((i) => i.meal);
    const parts: string[] = [];
    if (missing.length) parts.push(`sem proteína principal em ${missing.join(", ")}`);
    if (lowProt.length) parts.push(`proteína abaixo do piso em ${lowProt.join(", ")}`);
    if (bfMissing.length) parts.push(`café da manhã sem proteína em ${bfMissing.join(", ")}`);
    if (bfLow.length) parts.push(`café da manhã com proteína baixa em ${bfLow.join(", ")}`);
    const detail = parts.length ? ` (${parts.join("; ")})` : "";
    return {
      level: "warn",
      label: `⚠ Estrutura nutricional incompleta${detail} — revise antes de salvar.`,
    };
  }
  const protPct = Math.round((s.primaryProteinRepeatRatio ?? 0) * 100);
  const carbPct = Math.round((s.primaryCarbRepeatRatio ?? 0) * 100);
  const primaryRepeat = Math.max(s.primaryProteinRepeatRatio ?? 0, s.primaryCarbRepeatRatio ?? 0);
  // Diet-specific: portion-only is a strong warning even when "regenerated".
  if (s.changeKind === "portion_only") {
    return {
      level: "warn",
      label: `⚠ Apenas ajuste de quantidades (sem variação real de cardápio). Similaridade: ${pct}%.`,
    };
  }
  if (s.warning === "primary_source_repeated" || primaryRepeat >= 0.6) {
    const which = (s.primaryProteinRepeatRatio ?? 0) >= (s.primaryCarbRepeatRatio ?? 0)
      ? `proteína principal repetida em ${protPct}% das refeições`
      : `carbo principal repetido em ${carbPct}% das refeições`;
    return {
      level: "warn",
      label: `⚠ Mesma família de fonte principal (${which}). Similaridade: ${pct}%.`,
    };
  }
  if (s.warning === "high_similarity") {
    return {
      level: "warn",
      label: `⚠ Similaridade alta (${pct}%) mesmo após regerar — revise antes de salvar.`,
    };
  }
  if (s.warning === "quantity_only") {
    return {
      level: "warn",
      label: `⚠ Cardápio repetiu os mesmos alimentos com porções diferentes — revise antes de salvar.`,
    };
  }
  if (s.regenerated) {
    if (s.changeKind === "menu_variation" || s.changeKind === "new_menu") {
      return {
        level: "ok",
        label: `Variação real de cardápio aplicada após regeração (similaridade: ${pct}%).`,
      };
    }
    return {
      level: "ok",
      label: `Plano regerado para reduzir repetição (similaridade final: ${pct}%).`,
    };
  }
  if (s.changeKind === "menu_variation" || s.changeKind === "new_menu") {
    return { level: "ok", label: `Variação real de cardápio (similaridade: ${pct}%).` };
  }
  return { level: "ok", label: `Similaridade com histórico: ${pct}%.` };
}