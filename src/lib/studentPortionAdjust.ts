/**
 * "Ajustar Dieta" do aluno: mantém os alimentos atuais (inclusive trocados
 * ou adicionados) e recalcula só as porções das refeições ainda não
 * concluídas para fechar a meta do dia. Determinístico, sem IA.
 *
 * - Cada alimento corrige o macro em que é dominante (P, C ou G).
 * - Ordem: proteína > kcal > gordura > carbo (o carbo absorve as kcal).
 * - Limites: 50%–200% da porção atual; gramas/ml de 5 em 5; unidades inteiras.
 */
import type { ParsedFood, ParsedMeal } from './dietResultParser';
import { foodMacros, sumMealMacros, type Macros } from './dailyDietRebalance';

export const PORTION_MIN = 0.5;
export const PORTION_MAX = 2;
export const TOL = { kcalPct: 0.05, p: 10, c: 10, g: 10 };

type Key = 'p' | 'c' | 'g';

const dominant = (f: ParsedFood): Key | null => {
  const m = foodMacros(f);
  const r: Array<[Key, number]> = [['p', m.p * 4], ['c', m.c * 4], ['g', m.g * 9]];
  r.sort((a, b) => b[1] - a[1]);
  return r[0][1] > 0 ? r[0][0] : null;
};

interface ParsedQty { n: number; unit: string; grams: boolean }
export const parseQty = (qty: string): ParsedQty | null => {
  const m = String(qty ?? '').match(/^\s*([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].trim();
  const grams = /^(g|gr|gramas?|ml|mL)\b/i.test(unit) || unit === '';
  return { n, unit, grams };
};

const roundQty = (q: ParsedQty, factor: number): number => {
  const raw = q.n * factor;
  const minN = q.n * PORTION_MIN;
  const maxN = q.n * PORTION_MAX;
  if (q.grams) {
    let v = Math.round(raw / 5) * 5;
    if (v < minN) v = Math.ceil(minN / 5) * 5;
    if (v > maxN) v = Math.floor(maxN / 5) * 5;
    return Math.max(5, v);
  }
  let v = Math.round(raw);
  if (v < minN) v = Math.ceil(minN);
  if (v > maxN) v = Math.floor(maxN);
  return Math.max(1, v);
};

const fmt = (n: number) => String(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

const applyFactor = (food: ParsedFood, base: ParsedFood, factor: number): ParsedFood => {
  const q = parseQty(base.qty);
  if (!q) return food;
  const n = roundQty(q, factor);
  const real = n / q.n;
  const m = foodMacros(base);
  return {
    ...food,
    qty: q.unit ? `${String(n).replace('.', ',')} ${q.unit}` : String(n),
    kcal: fmt(m.kcal * real),
    p: fmt(m.p * real),
    c: fmt(m.c * real),
    g: fmt(m.g * real),
  };
};

export interface PortionChange {
  mealIndex: number;
  mealName: string;
  foodName: string;
  before: string;
  after: string;
}

export interface PortionAdjustResult {
  meals: ParsedMeal[];
  changes: PortionChange[];
  before: Macros;
  after: Macros;
  target: Macros;
  ok: boolean;
  issues: string[];
  suggestions: string[];
  changedMealIndexes: number[];
}

const MACRO_LABEL: Record<Key, string> = { p: 'Proteína', c: 'Carboidrato', g: 'Gordura' };
const SOURCE_LABEL: Record<Key, string> = {
  p: 'uma fonte de proteína (frango, ovos, peixe, whey)',
  c: 'uma fonte de carboidrato (arroz, batata, aveia, fruta)',
  g: 'uma fonte de gordura (azeite, castanhas, pasta de amendoim)',
};

export const adjustStudentPortions = (input: {
  meals: ParsedMeal[];
  lockedMealIndexes: number[];
  target: Macros;
}): PortionAdjustResult => {
  const { meals, lockedMealIndexes, target } = input;
  const locked = new Set(lockedMealIndexes);
  const before = sumMealMacros(meals);

  // Fator acumulado por alimento ajustável (mealIdx-foodIdx).
  const factors = new Map<string, number>();
  const adjustable: Array<{ mi: number; fi: number; food: ParsedFood; key: Key }> = [];
  meals.forEach((m, mi) => {
    if (locked.has(mi)) return;
    (m.foods ?? []).forEach((f, fi) => {
      const key = dominant(f);
      if (!key || !parseQty(f.qty)) return;
      adjustable.push({ mi, fi, food: f, key });
      factors.set(`${mi}-${fi}`, 1);
    });
  });

  const build = (): ParsedMeal[] =>
    meals.map((m, mi) =>
      locked.has(mi)
        ? m
        : {
            ...m,
            foods: (m.foods ?? []).map((f, fi) => {
              const k = factors.get(`${mi}-${fi}`);
              return k == null || Math.abs(k - 1) < 0.005 ? f : applyFactor(f, f, k);
            }),
          },
    );

  const correct = (key: Key, wantDelta: (cur: Macros) => number, perUnit: (f: ParsedFood) => number) => {
    const group = adjustable.filter((a) => a.key === key);
    if (group.length === 0) return;
    for (let iter = 0; iter < 4; iter++) {
      const cur = sumMealMacros(build());
      const delta = wantDelta(cur);
      const contrib = group.reduce((s, a) => s + perUnit(a.food) * (factors.get(`${a.mi}-${a.fi}`) ?? 1), 0);
      if (contrib <= 0 || Math.abs(delta) < 1) return;
      const ratio = (contrib + delta) / contrib;
      group.forEach((a) => {
        const id = `${a.mi}-${a.fi}`;
        const next = Math.min(PORTION_MAX, Math.max(PORTION_MIN, (factors.get(id) ?? 1) * ratio));
        factors.set(id, next);
      });
    }
  };

  // 1) proteína  2) gordura  3) carbo fecha as kcal restantes
  correct('p', (cur) => target.p - cur.p, (f) => foodMacros(f).p);
  correct('g', (cur) => target.g - cur.g, (f) => foodMacros(f).g);
  correct('c', (cur) => (target.kcal - cur.kcal) / 4, (f) => foodMacros(f).c);

  const out = build();
  const after = sumMealMacros(out);

  const changes: PortionChange[] = [];
  const changedMealIndexes = new Set<number>();
  out.forEach((m, mi) =>
    (m.foods ?? []).forEach((f, fi) => {
      const prev = meals[mi]?.foods?.[fi];
      if (prev && prev.qty !== f.qty) {
        changes.push({ mealIndex: mi, mealName: m.name, foodName: f.food, before: prev.qty, after: f.qty });
        changedMealIndexes.add(mi);
      }
    }),
  );

  const issues: string[] = [];
  const failing: Key[] = [];
  if (target.kcal > 0 && Math.abs(after.kcal - target.kcal) > target.kcal * TOL.kcalPct) {
    issues.push(`Calorias: ${Math.round(after.kcal)} de ${Math.round(target.kcal)} kcal`);
  }
  (['p', 'g', 'c'] as Key[]).forEach((k) => {
    if (Math.abs(after[k] - target[k]) > TOL[k]) {
      failing.push(k);
      issues.push(`${MACRO_LABEL[k]}: ${Math.round(after[k])} g de ${Math.round(target[k])} g`);
    }
  });

  // Sugestão: trocar o alimento que mais pesa no macro errado.
  const suggestions: string[] = [];
  failing.forEach((k) => {
    const short = after[k] < target[k];
    const pool = adjustable.filter((a) => (short ? a.key !== k : a.key === k));
    const worst = pool.sort((a, b) => foodMacros(b.food).kcal - foodMacros(a.food).kcal)[0];
    if (short && worst) {
      suggestions.push(`${MACRO_LABEL[k]} não fecha: troque "${worst.food.food}" (${meals[worst.mi]?.name}) por ${SOURCE_LABEL[k]}.`);
    } else if (short) {
      suggestions.push(`${MACRO_LABEL[k]} não fecha: adicione ${SOURCE_LABEL[k]} numa refeição ainda não feita.`);
    } else if (worst) {
      suggestions.push(`${MACRO_LABEL[k]} acima da meta: troque "${worst.food.food}" (${meals[worst.mi]?.name}) por um alimento com menos ${MACRO_LABEL[k].toLowerCase()}.`);
    }
  });

  return {
    meals: out,
    changes,
    before,
    after,
    target,
    ok: issues.length === 0,
    issues,
    suggestions,
    changedMealIndexes: [...changedMealIndexes],
  };
};
