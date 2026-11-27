import type { TrainingPhase } from '@/lib/trainingPhase';

export interface CyclePlanLike {
  id: string;
  fase?: string | null;
  fase_inicio_data?: string | null;
  block_start_date?: string | null;
  is_draft?: boolean | null;
}

const cycleKey = (p: CyclePlanLike): string | null =>
  (p.fase_inicio_data || p.block_start_date || null)?.slice(0, 10) ?? null;

/**
 * Planos do CICLO ATUAL: o plano publicado mais recente e os que têm a mesma
 * data de início de fase (fase_inicio_data ou block_start_date). Planos de
 * ciclos antigos nunca entram, então nunca viram o treino atual.
 * A lista chega ordenada por created_at desc.
 */
export function currentCyclePlans<T extends CyclePlanLike>(plans: T[] | null | undefined): T[] {
  const published = (plans ?? []).filter((p) => p && p.is_draft !== true);
  const newest = published[0];
  if (!newest) return [];
  const key = cycleKey(newest);
  if (!key) return [newest];
  return published.filter((p) => cycleKey(p) === key);
}

/** Plano da fase pedida dentro do ciclo atual; sem ele, o mais recente. */
export function planForPhase<T extends CyclePlanLike>(
  cyclePlans: T[],
  phase: TrainingPhase | string | null | undefined,
): T | undefined {
  return cyclePlans.find((p) => p.fase === phase) ?? cyclePlans[0];
}
