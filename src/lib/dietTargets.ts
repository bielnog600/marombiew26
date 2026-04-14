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
  const calories = fullText.match(/(?:calorias(?:\s+alvo)?|total\s+di[aá]rio)[^\d]{0,20}(\d{3,5})\s*k?cal/i);
  const protein = fullText.match(/prote[ií]na[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i);
  const carbs = fullText.match(/carbo(?:idrato|s)?[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i);
  const fats = fullText.match(/gordura[s]?[^\d]{0,20}(\d{2,4}(?:[.,]\d+)?)\s*g/i);

  const parsed = {
    calories: calories ? parseNum(calories[1]) : 0,
    protein: protein ? parseNum(protein[1]) : 0,
    carbs: carbs ? parseNum(carbs[1]) : 0,
    fats: fats ? parseNum(fats[1]) : 0,
  };

  return Object.values(parsed).some((value) => value > 0) ? parsed : null;
};
