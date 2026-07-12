// Mirror of src/lib/splitSlugs.ts — kept in sync manually.
// Additive & backward compatible normalization of training split slugs.

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

export function normalizeSplitSlug(value: unknown): CanonicalSplitSlug | null {
  if (!value || typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return LEGACY_MAP[key] ?? null;
}

/**
 * Build a prompt block describing the requested split + 7-day guardrail.
 * Returns empty string when no split_slug / days_available are provided,
 * so the agent behavior stays identical for legacy callers.
 */
export function buildSplitContextBlock(input: {
  split_slug?: string | null;
  split_slug_legacy?: string | null;
  days_available?: number | null;
  requested_strength_days?: number | null;
}): string {
  const canonical =
    normalizeSplitSlug(input.split_slug) ??
    normalizeSplitSlug(input.split_slug_legacy);
  const days = typeof input.days_available === 'number' ? input.days_available : null;

  if (!canonical && !days) return '';

  const lines: string[] = [];
  lines.push('\n\n=== DIVISÃO SOLICITADA (PHASE 1 — CAMPOS ESTRUTURADOS) ===');
  if (days) lines.push(`Dias disponíveis para treinar: ${days}`);
  if (canonical) {
    lines.push(`Divisão canônica: ${canonical} (${SPLIT_LABELS[canonical]})`);
    if (canonical === 'ai_decides') {
      lines.push(
        'IA deve ESCOLHER a divisão ideal com base no nível, dias disponíveis, objetivo e condições de saúde. Justifique brevemente no Resumo do protocolo.',
      );
    }
    if (canonical === 'body_part') {
      lines.push('Um grupo muscular por sessão (maior concentração de volume).');
    }
  }

  // 7-day guardrail — REGRA DE NEGÓCIO, não apenas texto visual.
  if (days && days >= 7) {
    const maxStrength =
      typeof input.requested_strength_days === 'number' && input.requested_strength_days > 0
        ? Math.min(input.requested_strength_days, 6)
        : 6;
    lines.push('');
    lines.push('REGRA DE 7 DIAS DISPONÍVEIS (OBRIGATÓRIA):');
    lines.push(`- Máximo de ${maxStrength} sessões pesadas de musculação por semana.`);
    lines.push('- Pelo menos 1 dia deve ser descanso, mobilidade, cardio leve ou recuperação ativa.');
    lines.push('- NUNCA gere 7 sessões pesadas consecutivas de musculação automaticamente.');
    lines.push('- Marque explicitamente o(s) dia(s) de recuperação no plano.');
  }

  return lines.join('\n');
}