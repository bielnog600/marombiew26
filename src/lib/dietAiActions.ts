import type { ParsedFood, ParsedMeal } from './dietResultParser';
import { scaleMealsToTarget, computeDayTotals } from './dietMarkdownSerializer';

export interface DietAiAction {
  op:
    | 'add'
    | 'modify'
    | 'remove'
    | 'replace'
    | 'scale_meal'
    | 'scale_day'
    | 'set_meal_time'
    | 'rename_meal'
    | 'remove_meal'
    | 'add_meal'
    | 'carb_cycle';
  mealMatch?: string;
  mealIndex?: number;
  foodMatch?: string;
  foodIndex?: number;
  food?: Partial<ParsedFood>;
  targetKcal?: number;
  factor?: number;
  newName?: string;
  newTime?: string;
  carbCycle?: {
    lowCarbDays?: string[];
    highCarbDays?: string[];
    lowCarbReduction?: number;
    highCarbIncrease?: number;
    strategy?: string;
  };
}

const norm = (v: string) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const num = (v?: string | number) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return '0';
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const findMealIndex = (meals: ParsedMeal[], a: DietAiAction): number => {
  if (typeof a.mealIndex === 'number' && a.mealIndex >= 0 && a.mealIndex < meals.length) return a.mealIndex;
  if (a.mealMatch) {
    const q = norm(a.mealMatch);
    const idx = meals.findIndex((m) => norm(m.name).includes(q) || q.includes(norm(m.name)));
    if (idx >= 0) return idx;
  }
  return -1;
};

const findFoodIndex = (meal: ParsedMeal, a: DietAiAction): number => {
  if (typeof a.foodIndex === 'number' && a.foodIndex >= 0 && a.foodIndex < meal.foods.length) return a.foodIndex;
  if (a.foodMatch) {
    const q = norm(a.foodMatch);
    const idx = meal.foods.findIndex((f) => norm(f.food).includes(q) || q.includes(norm(f.food)));
    if (idx >= 0) return idx;
  }
  return -1;
};

const sanitizeFood = (raw: Partial<ParsedFood>): ParsedFood => ({
  food: String(raw.food || '').trim() || 'Alimento',
  qty: String(raw.qty || '').trim() || '100 g',
  kcal: String(num(raw.kcal as any) || ''),
  p: String(num(raw.p as any) || ''),
  c: String(num(raw.c as any) || ''),
  g: String(num(raw.g as any) || ''),
  sub: raw.sub,
});

export interface ApplyResult {
  meals: ParsedMeal[];
  notes: string[];
}

export const applyDietActions = (meals: ParsedMeal[], actions: DietAiAction[]): ApplyResult => {
  let next = meals.map((m) => ({ ...m, foods: m.foods.map((f) => ({ ...f })) }));
  const notes: string[] = [];

  for (const a of actions) {
    try {
      switch (a.op) {
        case 'scale_day': {
          const totals = computeDayTotals(next);
          let target = a.targetKcal;
          if (!target && a.factor && totals.kcal > 0) target = totals.kcal * a.factor;
          if (target && target > 0) next = scaleMealsToTarget(next, target);
          break;
        }
        case 'scale_meal': {
          const mi = findMealIndex(next, a);
          if (mi < 0) break;
          const meal = next[mi];
          const current = meal.foods.reduce((s, f) => s + num(f.kcal), 0);
          let target = a.targetKcal;
          if (!target && a.factor && current > 0) target = current * a.factor;
          if (!target || current <= 0) break;
          const factor = target / current;
          next[mi] = {
            ...meal,
            foods: meal.foods.map((f) => {
              const qtyN = num(String(f.qty).replace(/g/i, ''));
              return {
                ...f,
                qty: qtyN > 0 ? `${fmt(qtyN * factor)} g` : f.qty,
                kcal: fmt(num(f.kcal) * factor),
                p: fmt(num(f.p) * factor),
                c: fmt(num(f.c) * factor),
                g: fmt(num(f.g) * factor),
              };
            }),
          };
          break;
        }
        case 'add': {
          const mi = findMealIndex(next, a);
          if (mi < 0 || !a.food) break;
          next[mi] = { ...next[mi], foods: [...next[mi].foods, sanitizeFood(a.food)] };
          break;
        }
        case 'remove': {
          const mi = findMealIndex(next, a);
          if (mi < 0) break;
          const fi = findFoodIndex(next[mi], a);
          if (fi < 0) break;
          next[mi] = { ...next[mi], foods: next[mi].foods.filter((_, i) => i !== fi) };
          break;
        }
        case 'modify': {
          const mi = findMealIndex(next, a);
          if (mi < 0) break;
          const fi = findFoodIndex(next[mi], a);
          if (fi < 0) break;
          const orig = next[mi].foods[fi];
          next[mi] = {
            ...next[mi],
            foods: next[mi].foods.map((f, i) => (i === fi ? { ...f, ...sanitizeFood({ ...orig, ...a.food }) } : f)),
          };
          break;
        }
        case 'replace': {
          const mi = findMealIndex(next, a);
          if (mi < 0 || !a.food) break;
          const fi = findFoodIndex(next[mi], a);
          if (fi < 0) break;
          next[mi] = {
            ...next[mi],
            foods: next[mi].foods.map((f, i) => (i === fi ? sanitizeFood(a.food!) : f)),
          };
          break;
        }
        case 'add_meal': {
          next.push({
            name: a.newName || 'Nova Refeição',
            time: a.newTime,
            foods: a.food ? [sanitizeFood(a.food)] : [],
          });
          break;
        }
        case 'remove_meal': {
          const mi = findMealIndex(next, a);
          if (mi < 0) break;
          next = next.filter((_, i) => i !== mi);
          break;
        }
        case 'rename_meal': {
          const mi = findMealIndex(next, a);
          if (mi < 0 || !a.newName) break;
          next[mi] = { ...next[mi], name: a.newName };
          break;
        }
        case 'set_meal_time': {
          const mi = findMealIndex(next, a);
          if (mi < 0 || !a.newTime) break;
          next[mi] = { ...next[mi], time: a.newTime };
          break;
        }
        case 'carb_cycle': {
          const cc = a.carbCycle || {};
          const parts: string[] = ['🔄 **Ciclo de Carboidratos**'];
          if (cc.strategy) parts.push(cc.strategy);
          if (cc.lowCarbDays?.length) parts.push(`Low Carb: ${cc.lowCarbDays.join(', ')}${cc.lowCarbReduction ? ` (carbo x${cc.lowCarbReduction})` : ''}`);
          if (cc.highCarbDays?.length) parts.push(`High Carb: ${cc.highCarbDays.join(', ')}${cc.highCarbIncrease ? ` (carbo x${cc.highCarbIncrease})` : ''}`);
          notes.push(parts.join('\n'));
          break;
        }
      }
    } catch (e) {
      console.error('Action failed', a, e);
    }
  }

  return { meals: next, notes };
};