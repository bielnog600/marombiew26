// Detects foods in a generated diet plan that are NOT present in the foods DB.
// Uses normalized exact match (lowercase + strip diacritics + strip trailing plural 's').

import type { DietPlan } from '@/lib/dietSchema';

export interface NewFoodCandidate {
  name: string;              // original name as returned by the AI (first occurrence)
  qtyGrams?: number;         // gramatura observada no plano (referência)
  kcal: number;              // por porção observada
  protein: number;
  carbs: number;
  fats: number;
}

const STOPWORDS = new Set([
  'total', 'totais', 'total diario', 'total diário', 'total geral',
  'subtotal', 'observações', 'observacoes',
]);

export function normalizeFoodName(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip accents
  s = s.replace(/\([^)]*\)/g, ' '); // drop parentheticals like "(cru)"
  s = s.replace(/[^a-z0-9\s]/g, ' '); // punctuation → space
  s = s.replace(/\s+/g, ' ').trim();
  // singularization heuristic: drop trailing 's' on each token if >3 chars
  s = s
    .split(' ')
    .map((tok) => (tok.length > 3 && tok.endsWith('s') ? tok.slice(0, -1) : tok))
    .join(' ');
  return s;
}

export function detectNewFoodsFromPlan(
  plan: DietPlan | null | undefined,
  existingFoodNames: string[]
): NewFoodCandidate[] {
  if (!plan?.days) return [];
  const existingSet = new Set(existingFoodNames.map(normalizeFoodName).filter(Boolean));
  const seen = new Map<string, NewFoodCandidate>();

  for (const day of plan.days) {
    for (const meal of day.meals ?? []) {
      for (const item of meal.items ?? []) {
        const raw = (item.name || '').trim();
        const norm = normalizeFoodName(raw);
        if (!norm || norm.length < 2) continue;
        if (STOPWORDS.has(norm)) continue;
        if (existingSet.has(norm)) continue;
        if (seen.has(norm)) continue;
        seen.set(norm, {
          name: raw,
          qtyGrams: item.qtyGrams,
          kcal: Number(item.macros?.kcal) || 0,
          protein: Number(item.macros?.p) || 0,
          carbs: Number(item.macros?.c) || 0,
          fats: Number(item.macros?.g) || 0,
        });
      }
    }
  }
  return Array.from(seen.values());
}