/**
 * MICRO-HOTFIX — impressão digital SEMÂNTICA de uma dieta structured.
 *
 * Serve para distinguir "nova versão real" de "publicou de novo sem alterar
 * nada". Compara conteúdo funcional (plano canônico + protocolos) e ignora
 * metadados de publicação e valores derivados/recalculáveis.
 *
 * Determinístico: keys ordenadas, nenhum Date.now, nenhum campo de publicação.
 */

/** Campos IGNORADOS (metadata/derivados, nunca edição do treinador). */
export const IGNORED_META_KEYS = [
  'publishedAt',
  'publishedBy',
  'publicationRevision',
  'nutritionSnapshotVersion',
  'generatedAt',
  'recomputedAt',
] as const;

const round = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
};

const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

const semanticItem = (item: any) => ({
  foodId: str(item?.foodId),
  name: str(item?.name),
  qtyGrams: round(item?.qtyGrams),
  manualLocked: item?.manualLocked === true,
  resolutionStatus: str(item?.resolutionStatus),
  substitutions: Array.isArray(item?.substitutions)
    ? item.substitutions.map((s: any) => ({
        foodId: str(s?.foodId),
        name: str(s?.name),
        qtyGrams: round(s?.qtyGrams),
      }))
    : null,
});

const semanticMeal = (meal: any) => ({
  name: str(meal?.name),
  time: str(meal?.time),
  notes: str(meal?.notes),
  items: (meal?.items ?? []).map(semanticItem),
});

const semanticDay = (day: any) => ({
  label: str(day?.label),
  weekday: str(day?.weekday),
  carbBias: str(day?.carbBias),
  trainingDay: day?.trainingDay === true,
  target: day?.target
    ? {
        kcal: round(day.target.kcal),
        p: round(day.target.p),
        c: round(day.target.c),
        g: round(day.target.g),
      }
    : null,
  meals: (day?.meals ?? []).map(semanticMeal),
});

const semanticTargets = (t: any) =>
  t
    ? {
        kcal: round(t.kcal),
        p: round(t.p),
        c: round(t.c),
        g: round(t.g),
        tmb: round(t.tmb),
        get: round(t.get),
        adjustmentPct: round(t.adjustmentPct),
      }
    : null;

/** Protocolos sem os ajustes gerados deterministicamente pelo servidor. */
const semanticProtocols = (protocols: any) => {
  if (!protocols || typeof protocols !== 'object') return null;
  const copy = JSON.parse(JSON.stringify(protocols));
  if (copy?.weekly_energy_schedule && typeof copy.weekly_energy_schedule === 'object') {
    delete copy.weekly_energy_schedule.generated_adjustments;
  }
  return copy;
};

export function buildDietSemanticPayload(plan: any, protocols: any) {
  const meta = plan?.meta ?? {};
  const cleanMeta: Record<string, unknown> = {};
  Object.keys(meta)
    .filter((k) => !(IGNORED_META_KEYS as readonly string[]).includes(k))
    .forEach((k) => {
      cleanMeta[k] = meta[k];
    });

  return {
    meta: cleanMeta,
    objective: str(plan?.objective),
    strategy: str(plan?.strategy),
    style: str(plan?.style),
    targets: semanticTargets(plan?.targets),
    trainingContext: plan?.trainingContext ?? null,
    days: (plan?.days ?? []).map(semanticDay),
    tips: Array.isArray(plan?.tips) ? plan.tips.map(str) : null,
    notes: Array.isArray(plan?.notes) ? plan.notes.map(str) : null,
    protocols: semanticProtocols(protocols),
  };
}

/** JSON estável: keys ordenadas em qualquer profundidade. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as any)[k])}`)
    .join(',')}}`;
}

export function dietSemanticFingerprint(plan: any, protocols: any): string {
  return stableStringify(buildDietSemanticPayload(plan, protocols));
}

export function areDietsSemanticallyEqual(
  aPlan: any,
  aProtocols: any,
  bPlan: any,
  bProtocols: any,
): boolean {
  return dietSemanticFingerprint(aPlan, aProtocols) === dietSemanticFingerprint(bPlan, bProtocols);
}

/**
 * Decide se um rascunho é publicação no-op: mesmo conteúdo semântico do pai
 * já publicado. Nunca decide nada sobre a versão publicada em si.
 */
export function shouldDiscardRedundantDraft(
  draft: { is_draft?: boolean | null; parent_plan_id?: string | null; conteudo_json?: any; protocols?: any },
  parent: { id?: string; tipo?: string | null; is_draft?: boolean | null; conteudo_json?: any; protocols?: any } | null,
): boolean {
  if (!draft || draft.is_draft !== true || !draft.parent_plan_id) return false;
  if (!parent || parent.tipo !== "dieta" || parent.is_draft !== false) return false;
  return areDietsSemanticallyEqual(
    draft.conteudo_json,
    draft.protocols,
    parent.conteudo_json,
    parent.protocols,
  );
}
