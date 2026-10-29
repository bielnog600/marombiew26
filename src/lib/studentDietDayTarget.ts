import type { Macros } from './dailyDietRebalance';

/**
 * Meta diária exibida ao aluno. Fonte única: metas publicadas pelo treinador
 * (meta do dia quando houver, senão conteudo_json.targets). Nunca recalcula a
 * partir de GET/TMB/estratégia; sem metas publicadas, usa a soma das refeições.
 */
export function resolveStudentDayTarget(params: {
  dayTarget?: Partial<Macros> | null;
  publishedTargets?: Partial<Macros> | null;
  mealsTotal: Macros;
}): Macros {
  const pick = (t?: Partial<Macros> | null): Macros | null => {
    const kcal = Number(t?.kcal);
    if (!t || !Number.isFinite(kcal) || kcal <= 0) return null;
    return {
      kcal: Math.round(kcal),
      p: Math.round(Number(t.p) || 0),
      c: Math.round(Number(t.c) || 0),
      g: Math.round(Number(t.g) || 0),
    };
  };
  return pick(params.dayTarget) ?? pick(params.publishedTargets) ?? params.mealsTotal;
}
