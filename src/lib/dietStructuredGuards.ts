/**
 * FASE 5.1 — identificação de plano STRUCTURED e resolução de metas
 * persistidas por dia.
 *
 * Regras:
 *  - STRUCTURED é definido pelo CONTRATO (`meta.foodContractVersion`), não pela
 *    presença de `foodId`. Um plano com todos os itens unresolved continua
 *    structured (e continua bloqueado para publicação).
 *  - A meta final de cada dia vem do que foi PERSISTIDO:
 *      1. protocols.weekly_day_targets[weekday] (carb cycling)
 *      2. meta já materializada no próprio dia
 *      3. targets globais do plano — SOMENTE quando carb cycling está inativo
 *    Carb cycling ativo sem meta para o weekday → null (nunca cai no global).
 */
import type { DietPlan } from '@/lib/dietSchema';
import type { DayTarget } from '@/lib/dietDayTargets';

export const SUPPORTED_FOOD_CONTRACT_VERSION = 1;

const majorVersion = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^v?(\d+)/i);
  return m ? Number(m[1]) : null;
};

/** Plano gerado sob o contrato {foodId, qtyGrams}. */
export const isStructuredCanonicalPlan = (plan: any): boolean => {
  if (!plan || typeof plan !== 'object') return false;
  const major = majorVersion(plan?.meta?.foodContractVersion);
  if (major !== null && major >= SUPPORTED_FOOD_CONTRACT_VERSION) return true;
  // Compatibilidade legada: planos antigos sem meta, mas já com foodId.
  return (plan?.days ?? []).some((d: any) =>
    (d?.meals ?? []).some((m: any) => (m?.items ?? []).some((i: any) => !!i?.foodId)),
  );
};

export const hasUnresolvedCanonicalItems = (plan: any): boolean =>
  (plan?.days ?? []).some((d: any) =>
    (d?.meals ?? []).some((m: any) =>
      (m?.items ?? []).some(
        (i: any) => !i?.foodId || i?.resolutionStatus === 'unresolved',
      ),
    ),
  );

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toTarget = (raw: any): DayTarget | null => {
  if (!raw || typeof raw !== 'object') return null;
  const kcal = num(raw.kcal);
  if (kcal === null || kcal <= 0) return null;
  const p = num(raw.p) ?? 0;
  const c = num(raw.c) ?? 0;
  const g = num(raw.g) ?? 0;
  if (p < 0 || c < 0 || g < 0) return null;
  return { kcal, p, c, g };
};

export interface ResolvePersistedTargetsInput {
  plan: DietPlan | any;
  /** Linha `ai_plans.protocols` como persistida. */
  protocols?: any;
}

/**
 * Metas finais por índice de dia materializado do plano canônico.
 * Retorna `null` no dia sem meta confiável — o optimizer trata como
 * `invalid_target` em vez de ajustar contra um alvo inventado.
 */
export const resolvePersistedTargetsByDay = ({
  plan,
  protocols,
}: ResolvePersistedTargetsInput): Array<DayTarget | null> => {
  const days: any[] = plan?.days ?? [];
  const carbCyclingActive = !!protocols?.carb_cycling?.enabled;
  const weeklyTargets = protocols?.weekly_day_targets ?? null;
  const globalTarget = toTarget(plan?.targets);

  return days.map((day) => {
    const weekday = String(day?.weekday ?? '').toLowerCase();
    const weekly = weekday && weeklyTargets ? toTarget(weeklyTargets[weekday]) : null;
    if (weekly) return weekly;

    const materialized = toTarget(day?.targets ?? day?.target);
    if (materialized) return materialized;

    // Carb cycling ativo: jamais usar a meta global como substituta.
    if (carbCyclingActive) return null;
    return globalTarget;
  });
};
