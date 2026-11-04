/**
 * Ciclo de carboidratos aplicado a uma dieta JÁ gerada (editor canônico).
 *
 * Puro e determinístico: parte do dia base ("Padrão"), cria um dia por
 * weekday com meta própria e reescala SOMENTE as fontes de carboidrato
 * (foodMacroRole === 'carb') em porções arredondadas. Proteína e gordura
 * ficam iguais à base, salvo override explícito do nível.
 *
 * Persistência compatível com a publicação diária existente:
 *  - plan.days: 7 dias com weekday (seg..dom), cada um com `targets`;
 *  - protocols.weekly_day_targets[wd] = {kcal,p,c,g,type,label};
 *  - plan.targets permanece como base; meta.strategy = 'carb_cycling'.
 */
import type { DietPlan } from '@/lib/dietSchema';
import { foodMacroRole, type FoodRecord } from '@/lib/nutritionEngine';
import { recomputeDayFromFoods } from '@/lib/dietFoodResolution';

export const CARB_CYCLE_WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
export type CarbCycleWeekday = (typeof CARB_CYCLE_WEEKDAYS)[number];
export const CARB_CYCLE_WEEKDAY_LABELS: Record<CarbCycleWeekday, string> = {
  seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
};

export type CarbLevel = 'alto' | 'medio' | 'baixo' | 'base';
export const CARB_LEVEL_LABELS: Record<CarbLevel, string> = {
  alto: 'Carbo alto', medio: 'Carbo médio', baixo: 'Carbo baixo', base: 'Padrão',
};
const LEVEL_TYPE: Record<CarbLevel, 'HIGH' | 'MEDIUM' | 'LOW' | null> = {
  alto: 'HIGH', medio: 'MEDIUM', baixo: 'LOW', base: null,
};

export interface CarbLevelAdjust {
  /** Ajuste de kcal: % sobre a base ou valor absoluto (kcal). */
  kcalMode: 'pct' | 'kcal';
  kcalValue: number;
  /** auto = o extra/déficit de kcal vem todo do carbo; g/pct = ajuste explícito do carbo. */
  carbMode: 'auto' | 'g' | 'pct';
  carbValue: number;
  /** Overrides opcionais (null = igual à base). */
  p?: number | null;
  g?: number | null;
}

export const DEFAULT_CARB_LEVELS: Record<Exclude<CarbLevel, 'base'>, CarbLevelAdjust> = {
  alto: { kcalMode: 'pct', kcalValue: 15, carbMode: 'auto', carbValue: 0, p: null, g: null },
  medio: { kcalMode: 'pct', kcalValue: 7, carbMode: 'auto', carbValue: 0, p: null, g: null },
  baixo: { kcalMode: 'pct', kcalValue: -15, carbMode: 'auto', carbValue: 0, p: null, g: null },
};

export interface MacroTargetValue { kcal: number; p: number; c: number; g: number }

export interface CarbCycleConfig {
  assignments: Partial<Record<CarbCycleWeekday, CarbLevel>>;
  levels: Record<Exclude<CarbLevel, 'base'>, CarbLevelAdjust>;
}

const r = (n: number) => Math.round(n);
const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Meta do nível a partir da base. Carbo explícito → kcal recalculada pelos macros. */
export const computeLevelTarget = (base: MacroTargetValue, adj: CarbLevelAdjust): MacroTargetValue => {
  const p = finite(adj.p) ?? base.p;
  const g = finite(adj.g) ?? base.g;
  if (adj.carbMode === 'auto') {
    const kcal = adj.kcalMode === 'pct'
      ? base.kcal * (1 + (Number(adj.kcalValue) || 0) / 100)
      : base.kcal + (Number(adj.kcalValue) || 0);
    const c = Math.max(0, (kcal - p * 4 - g * 9) / 4);
    return { kcal: r(p * 4 + c * 4 + g * 9), p: r(p), c: r(c), g: r(g) };
  }
  const c = Math.max(0, adj.carbMode === 'g'
    ? base.c + (Number(adj.carbValue) || 0)
    : base.c * (1 + (Number(adj.carbValue) || 0) / 100));
  return { kcal: r(p * 4 + c * 4 + g * 9), p: r(p), c: r(c), g: r(g) };
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Porção real: múltiplos de 5 g, nunca abaixo de 5 g. */
export const roundPortion = (grams: number): number => Math.max(5, Math.round(grams / 5) * 5);

const dayTotals = (day: any) => day?.totals ?? { kcal: 0, p: 0, c: 0, g: 0 };

const carbItems = (day: any, byId: Map<string, FoodRecord>) => {
  const out: Array<{ item: any; food: FoodRecord }> = [];
  for (const meal of day?.meals ?? []) {
    for (const item of meal?.items ?? []) {
      const food = item?.foodId ? byId.get(String(item.foodId)) : undefined;
      if (!food || !(Number(item.qtyGrams) > 0)) continue;
      if (foodMacroRole(food) === 'carb') out.push({ item, food });
    }
  }
  return out;
};

const carbPerGram = (f: FoodRecord) => (Number(f.carbs) || 0) / (Number(f.portion_size) || 100);

/**
 * Escala só as fontes de carbo até `targetC`, em porções arredondadas,
 * e fecha o resíduo na maior fonte. Muta e devolve o dia.
 */
export const scaleDayCarbs = (day: any, targetC: number, foods: FoodRecord[]): { day: any; ok: boolean } => {
  const byId = new Map(foods.map((f) => [String(f.id), f]));
  recomputeDayFromFoods(day, foods);
  const sources = carbItems(day, byId);
  if (!sources.length) return { day, ok: false };
  const fromSources = sources.reduce((a, s) => a + carbPerGram(s.food) * Number(s.item.qtyGrams), 0);
  const current = Number(dayTotals(day).c) || 0;
  const delta = targetC - current;
  if (fromSources <= 0) return { day, ok: false };
  const factor = Math.max(0, 1 + delta / fromSources);
  for (const s of sources) s.item.qtyGrams = roundPortion(Number(s.item.qtyGrams) * factor);
  recomputeDayFromFoods(day, foods);
  // Fecha o resíduo na maior fonte (ainda em porção real).
  const residual = targetC - (Number(dayTotals(day).c) || 0);
  const biggest = [...sources].sort(
    (a, b) => carbPerGram(b.food) * b.item.qtyGrams - carbPerGram(a.food) * a.item.qtyGrams,
  )[0];
  const cpg = carbPerGram(biggest.food);
  if (cpg > 0 && Math.abs(residual) >= 3) {
    biggest.item.qtyGrams = roundPortion(Number(biggest.item.qtyGrams) + residual / cpg);
    recomputeDayFromFoods(day, foods);
  }
  for (const s of sources) {
    s.item.manualLocked = false;
    if (/^\s*\d+([.,]\d+)?\s*g\s*$/i.test(String(s.item.portionLabel ?? ''))) s.item.portionLabel = `${s.item.qtyGrams} g`;
  }
  return { day, ok: true };
};

/** Dia base do ciclo: snapshot salvo, senão o primeiro dia do plano. */
export const carbCycleBaseDay = (plan: DietPlan): any => {
  const saved = (plan.meta as any)?.carbCycle?.baseDay;
  return clone(saved ?? plan.days[0]);
};

export const readCarbCycleConfig = (plan: DietPlan | null | undefined): CarbCycleConfig => {
  const saved = (plan?.meta as any)?.carbCycle;
  return {
    assignments: { ...(saved?.assignments ?? {}) },
    levels: {
      alto: { ...DEFAULT_CARB_LEVELS.alto, ...(saved?.levels?.alto ?? {}) },
      medio: { ...DEFAULT_CARB_LEVELS.medio, ...(saved?.levels?.medio ?? {}) },
      baixo: { ...DEFAULT_CARB_LEVELS.baixo, ...(saved?.levels?.baixo ?? {}) },
    },
  };
};

export interface ApplyCarbCycleResult {
  plan: DietPlan;
  protocols: any;
  warnings: string[];
}

export const applyCarbCycle = (
  plan: DietPlan,
  protocols: any,
  config: CarbCycleConfig,
  foods: FoodRecord[],
): ApplyCarbCycleResult => {
  const warnings: string[] = [];
  const baseDay = carbCycleBaseDay(plan);
  recomputeDayFromFoods(baseDay, foods);
  const base: MacroTargetValue = {
    kcal: r(Number(plan.targets.kcal) || 0),
    p: r(Number(plan.targets.p) || 0),
    c: r(Number(plan.targets.c) || 0),
    g: r(Number(plan.targets.g) || 0),
  };
  const weekly: Record<string, any> = {};
  const days = CARB_CYCLE_WEEKDAYS.map((wd) => {
    const level: CarbLevel = config.assignments[wd] ?? 'base';
    const day = clone(baseDay);
    const label = CARB_CYCLE_WEEKDAY_LABELS[wd];
    day.weekday = wd;
    if (level === 'base') {
      day.label = label;
      delete day.carbLevel;
      delete day.carbBias;
      day.targets = { ...base };
      weekly[wd] = { ...base };
      return day;
    }
    const target = computeLevelTarget(base, config.levels[level]);
    const res = scaleDayCarbs(day, target.c, foods);
    if (!res.ok) warnings.push(`${label}: nenhuma fonte de carboidrato para ajustar.`);
    day.label = `${label} — ${CARB_LEVEL_LABELS[level]}`;
    day.carbLevel = level;
    day.carbBias = level === 'alto' ? 'high' : level === 'baixo' ? 'low' : 'normal';
    day.targets = { ...target };
    weekly[wd] = { ...target, type: LEVEL_TYPE[level], label: CARB_LEVEL_LABELS[level] };
    return day;
  });

  const nextPlan: any = clone(plan);
  const prevStrategy = (plan.meta as any)?.carbCycle?.previousStrategy ?? plan.meta?.strategy ?? null;
  nextPlan.days = days;
  nextPlan.meta = {
    ...nextPlan.meta,
    strategy: 'carb_cycling',
    carbCycle: {
      assignments: { ...config.assignments },
      levels: clone(config.levels),
      baseDay: clone(carbCycleBaseDay(plan)),
      previousStrategy: prevStrategy,
    },
  };
  const nextProtocols = { ...(protocols ?? {}), weekly_day_targets: weekly };
  return { plan: nextPlan as DietPlan, protocols: nextProtocols, warnings };
};

/** Nível de carbo do dia publicado (para o selo do aluno). */
export const dayCarbLevelLabel = (day: any, weeklyEntry?: any): string | null => {
  const lvl = day?.carbLevel as CarbLevel | undefined;
  if (lvl && lvl !== 'base' && CARB_LEVEL_LABELS[lvl]) return CARB_LEVEL_LABELS[lvl];
  const l = weeklyEntry?.label;
  return typeof l === 'string' && /carbo/i.test(l) ? l : null;
};
