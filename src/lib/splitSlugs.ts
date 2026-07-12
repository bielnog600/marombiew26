// Central normalization for training split slugs.
// Additive & backward compatible: accepts legacy values (fullbody, abcde, decida)
// and returns the canonical Phase 1 slug.

export type CanonicalSplitSlug =
  | 'full_body'
  | 'upper_lower'
  | 'push_pull_legs'
  | 'push_pull'
  | 'upper_lower_ppl'
  | 'torso_limbs'
  | 'specialization'
  | 'body_part'
  | 'custom'
  | 'ai_decides';

const LEGACY_MAP: Record<string, CanonicalSplitSlug> = {
  fullbody: 'full_body',
  full_body: 'full_body',
  abcde: 'body_part',
  body_part: 'body_part',
  decida: 'ai_decides',
  ai_decides: 'ai_decides',
  upper_lower: 'upper_lower',
  push_pull_legs: 'push_pull_legs',
  push_pull: 'push_pull',
  upper_lower_ppl: 'upper_lower_ppl',
  torso_limbs: 'torso_limbs',
  specialization: 'specialization',
  custom: 'custom',
};

export function normalizeSplitSlug(value: unknown): CanonicalSplitSlug | null {
  if (!value || typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return LEGACY_MAP[key] ?? null;
}

export const SPLIT_LABELS: Record<CanonicalSplitSlug, string> = {
  full_body: 'Full Body',
  upper_lower: 'Upper/Lower',
  push_pull_legs: 'Push/Pull/Legs',
  push_pull: 'Push/Pull',
  upper_lower_ppl: 'Upper/Lower + PPL',
  torso_limbs: 'Torso / Membros',
  specialization: 'Especialização',
  body_part: 'Divisão por grupos musculares',
  custom: 'Selecionar grupos',
  ai_decides: 'Decida por mim',
};

// Recommended splits per number of available training days.
// Order matters — first item is the primary recommendation.
export const RECOMMENDED_SPLITS_BY_DAYS: Record<number, CanonicalSplitSlug[]> = {
  2: ['full_body', 'ai_decides'],
  3: ['full_body', 'push_pull_legs', 'ai_decides'],
  4: ['upper_lower', 'push_pull', 'ai_decides'],
  5: ['upper_lower_ppl', 'specialization', 'body_part', 'ai_decides'],
  6: ['push_pull_legs', 'upper_lower', 'torso_limbs', 'ai_decides'],
  7: ['ai_decides', 'specialization', 'upper_lower_ppl'],
};

export function isRecommended(
  slug: CanonicalSplitSlug,
  daysAvailable: number | null | undefined,
): boolean {
  if (!daysAvailable) return false;
  const list = RECOMMENDED_SPLITS_BY_DAYS[daysAvailable];
  return !!list?.includes(slug);
}