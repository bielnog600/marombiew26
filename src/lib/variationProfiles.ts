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
};

export function describeSimilarity(s: SimilarityFeedback): {
  level: "ok" | "warn" | "info";
  label: string;
} {
  if (s.historyCount === 0) {
    return { level: "info", label: "Primeiro plano do aluno — sem comparação." };
  }
  const pct = Math.round(s.score * 100);
  if (s.warning === "high_similarity") {
    return {
      level: "warn",
      label: `⚠ Similaridade alta (${pct}%) mesmo após regerar — revise antes de salvar.`,
    };
  }
  if (s.regenerated) {
    return {
      level: "ok",
      label: `Plano regerado para reduzir repetição (similaridade final: ${pct}%).`,
    };
  }
  return { level: "ok", label: `Similaridade com histórico: ${pct}%.` };
}