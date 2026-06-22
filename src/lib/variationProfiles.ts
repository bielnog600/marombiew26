/**
 * UI-side mirror of supabase/functions/_shared/variationProfiles.ts.
 * Used to render the intensity selector and label similarity feedback.
 */

export type VariationIntensity = "baixa" | "media" | "alta";

export const DEFAULT_INTENSITY: VariationIntensity = "media";

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
};

export function describeSimilarity(s: SimilarityFeedback): {
  level: "ok" | "warn" | "info";
  label: string;
} {
  if (s.historyCount === 0) {
    return { level: "info", label: "Primeiro plano do aluno — sem comparação." };
  }
  const pct = Math.round(s.score * 100);
  // Diet-specific: portion-only is a strong warning even when "regenerated".
  if (s.changeKind === "portion_only") {
    return {
      level: "warn",
      label: `⚠ Apenas ajuste de quantidades (sem variação real de cardápio). Similaridade: ${pct}%.`,
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