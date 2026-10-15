/**
 * Edição manual da meta (kcal + macros) de uma dieta existente.
 * Puro: não chama IA e não troca alimentos. Só reescala porções se pedido.
 */
import type { DietPlan } from '@/lib/dietSchema';

export interface MacroTarget { kcal: number; p: number; c: number; g: number }

export const kcalFromMacros = (p: number, c: number, g: number): number =>
  Math.round(p * 4 + c * 4 + g * 9);

/** Mesma regra dos "Ajustes Finos": mantém P e G, fecha no carboidrato. */
export const redistributeFromKcal = (kcal: number, p: number, g: number): MacroTarget => {
  const c = Math.max(0, Math.round((kcal - p * 4 - g * 9) / 4));
  return { kcal: Math.round(kcal), p: Math.round(p), c, g: Math.round(g) };
};

const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const withPct = (t: MacroTarget) => ({
  kcal: t.kcal, p: t.p, c: t.c, g: t.g,
  pPct: t.kcal > 0 ? Math.round((t.p * 400) / t.kcal) : 0,
  cPct: t.kcal > 0 ? Math.round((t.c * 400) / t.kcal) : 0,
  gPct: t.kcal > 0 ? Math.round((t.g * 900) / t.kcal) : 0,
});

const scaleMacros = (m: any, f: number) => {
  const p = (m?.p ?? 0) * f, c = (m?.c ?? 0) * f, g = (m?.g ?? 0) * f;
  return { kcal: Math.round((m?.kcal ?? 0) * f), p: Math.round(p * 10) / 10, c: Math.round(c * 10) / 10, g: Math.round(g * 10) / 10 };
};

/**
 * Aplica a nova meta ao plano canônico (targets global + metas materializadas
 * por dia) e, se houver camada weekly_day_targets, atualiza cada dia dela.
 * `rescale` multiplica as quantidades de cada item pelo fator de kcal do dia.
 */
export const applyTargetToPlan = (
  plan: DietPlan,
  target: MacroTarget,
  protocols: any,
  rescale: boolean,
): { plan: DietPlan; protocols: any } => {
  const t = withPct(target);
  const days = (plan.days || []).map((day: any) => {
    let meals = day.meals;
    if (rescale) {
      const dayKcal = (day.meals || []).reduce(
        (a: number, m: any) => a + (m.items || []).reduce((s: number, it: any) => s + (it.macros?.kcal ?? 0), 0), 0);
      const f = dayKcal > 0 ? target.kcal / dayKcal : 1;
      meals = (day.meals || []).map((meal: any) => ({
        ...meal,
        items: (meal.items || []).map((it: any) => {
          const q = typeof it.qtyGrams === 'number' ? Math.max(1, Math.round(it.qtyGrams * f)) : it.qtyGrams;
          const real = typeof it.qtyGrams === 'number' && it.qtyGrams > 0 ? q / it.qtyGrams : f;
          return {
            ...it,
            qtyGrams: q,
            portionLabel: typeof it.qtyGrams === 'number' && /^\s*\d+([.,]\d+)?\s*g\s*$/i.test(String(it.portionLabel ?? '')) ? `${q} g` : it.portionLabel,
            macros: scaleMacros(it.macros, real),
          };
        }),
      }));
    }
    const next: any = { ...day, meals };
    if (day.targets) next.targets = { ...day.targets, kcal: t.kcal, p: t.p, c: t.c, g: t.g };
    if (day.target) next.target = { ...day.target, kcal: t.kcal, p: t.p, c: t.c, g: t.g };
    return next;
  });

  let nextProtocols = protocols;
  const weekly = protocols?.weekly_day_targets;
  if (weekly && typeof weekly === 'object') {
    const w: any = { ...weekly };
    for (const k of WEEKDAYS) {
      if (w[k] && typeof w[k] === 'object') w[k] = { ...w[k], kcal: t.kcal, p: t.p, c: t.c, g: t.g };
    }
    nextProtocols = { ...protocols, weekly_day_targets: w };
  }

  return {
    plan: { ...plan, days, targets: { ...(plan.targets || {}), ...t } } as DietPlan,
    protocols: nextProtocols,
  };
};

/** Atualiza a linha "**Meta diária:**" de um markdown legado. */
export const replaceMetaLine = (markdown: string, t: MacroTarget): string => {
  const line = `**Meta diária:** ${t.kcal} kcal · ${t.p}g P · ${t.c}g C · ${t.g}g G`;
  return /\*\*Meta diária:\*\*.*$/m.test(markdown)
    ? markdown.replace(/\*\*Meta diária:\*\*.*$/m, line)
    : `${line}\n\n${markdown}`;
};
