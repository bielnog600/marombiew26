import type { ParsedSection } from '@/lib/dietResultParser';

const parseNum = (value?: string) => {
  if (!value) return 0;
  const parsed = Number(value.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface DietTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export const extractTargetsFromSections = (sections: ParsedSection[]): DietTargets | null => {
  const fullText = sections.map((section) => `${section.title || ''}\n${section.content || ''}`).join('\n');

  // Try multiple patterns for calories (ordered by specificity)
  const caloriesPatterns = [
    // "Calorias alvo: 2200 kcal" or "Total diário: 2200 kcal"
    /(?:calorias(?:\s+alvo)?|total\s+di[aá]rio)[^\d]{0,20}(\d{3,5})\s*k?cal/i,
    // "Consumo Energético com Déficit: 1802 kcal" or "Consumo Energético: 2200 kcal"
    /consumo\s+energ[eé]tico[^\d]{0,30}(\d{3,5})\s*k?cal/i,
    // "GET: 2253 kcal" or "GET ajustado: 2200 kcal"
    /GET[^\d]{0,20}(\d{3,5})\s*k?cal/i,
    // "Déficit: 2200 kcal" or "Meta calórica: 2200 kcal"
    /(?:d[eé]ficit|meta\s+cal[oó]rica|valor\s+energ[eé]tico|plano\s+de)[^\d]{0,30}(\d{3,5})\s*k?cal/i,
    // "2200 kcal/dia" or "2200kcal diárias"
    /(\d{3,5})\s*k?cal\s*(?:\/\s*dia|di[aá]ri)/i,
  ];

  let caloriesMatch: RegExpMatchArray | null = null;
  for (const pattern of caloriesPatterns) {
    caloriesMatch = fullText.match(pattern);
    if (caloriesMatch) break;
  }

  // Try multiple patterns for macros
  const proteinPatterns = [
    /prote[ií]na[s]?[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i,
    /(\d{2,4}(?:[.,]\d+)?)\s*g\s*(?:de\s+)?prote[ií]na/i,
  ];
  const carbsPatterns = [
    /carbo(?:idrato|s)?[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i,
    /(\d{2,4}(?:[.,]\d+)?)\s*g\s*(?:de\s+)?carbo/i,
  ];
  const fatsPatterns = [
    /gordura[s]?[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i,
    /(\d{2,4}(?:[.,]\d+)?)\s*g\s*(?:de\s+)?gordura/i,
  ];

  const findFirst = (patterns: RegExp[]) => {
    for (const p of patterns) {
      const m = fullText.match(p);
      if (m) return m;
    }
    return null;
  };

  const parsed = {
    calories: caloriesMatch ? parseNum(caloriesMatch[1]) : 0,
    protein: parseNum(findFirst(proteinPatterns)?.[1]),
    carbs: parseNum(findFirst(carbsPatterns)?.[1]),
    fats: parseNum(findFirst(fatsPatterns)?.[1]),
  };

  return Object.values(parsed).some((value) => value > 0) ? parsed : null;
};
