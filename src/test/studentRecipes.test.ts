import { describe, expect, it } from 'vitest';
import { buildFoodIndex, type FoodRecord } from '@/lib/nutritionEngine';
import { buildStudentMealContext, type BankMeal } from '@/lib/mealBank';
import {
  autoBankOptionsForWeek,
  defaultRecipeFilters,
  foodHasEgg,
  foodHasLactose,
  mealArticle,
  studentRecipesFor,
} from '@/lib/mealBank/studentRecipes';

const f = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number): FoodRecord =>
  ({ id, name, calories, protein, carbs, fats, portion: 'gramas', portion_size: 100, brand: null, source: null, barcode: null, sourceFoodId: null }) as FoodRecord;
const foods = [
  f('arroz', 'Arroz branco cozido', 130, 2.5, 28.5, 0.3),
  f('feijao', 'Feijão carioca cozido', 76, 4.8, 13.6, 0.5),
  f('frango', 'Peito de frango grelhado', 160, 32, 0, 2.5),
  f('atum', 'Atum em água', 116, 26, 0, 1),
  f('broc', 'Brócolis cozido', 25, 2.4, 4, 0.4),
  f('azeite', 'Azeite de oliva', 884, 0, 0, 100),
  f('ovo', 'Ovo', 143, 12.6, 0.7, 9.5),
  f('iog', 'Iogurte natural', 61, 3.5, 4.7, 3.3),
];
const index = buildFoodIndex(foods);
const meal = (code: string, name: string, items: Array<[string, number]>, origin: BankMeal['origin'] = 'BR/PT', tags: string[] = []): BankMeal =>
  ({ id: code, code, slot: 'almoco', name, origin, tags, prep: null, active: true, items: items.map(([foodId, grams], ordem) => ({ foodId, grams, ordem })) });
const bank: BankMeal[] = [
  meal('AL01', 'Frango com arroz e feijão', [['frango', 150], ['arroz', 150], ['feijao', 80], ['azeite', 5]], 'BR'),
  meal('AL02', 'Atum com arroz e brócolis', [['atum', 150], ['arroz', 150], ['broc', 80], ['azeite', 5]]),
  meal('AL03', 'Omelete com arroz', [['ovo', 150], ['arroz', 150], ['broc', 60]], 'PT'),
  meal('AL04', 'Frango com arroz e brócolis', [['frango', 160], ['arroz', 140], ['broc', 80], ['azeite', 5]], 'PT'),
];
const ctxPT = buildStudentMealContext({ phone: '351911000000' });
const almoco = (id: string) => ({
  name: 'Almoço', time: '13:00',
  items: [
    { foodId: 'frango', name: 'Peito de frango grelhado', qtyGrams: 150, macros: { kcal: 240, p: 48, c: 0, g: 3.8 } },
    { foodId: 'arroz', name: 'Arroz branco cozido', qtyGrams: 150, macros: { kcal: 195, p: 3.8, c: 42.8, g: 0.5 } },
    { foodId: 'azeite', name: 'Azeite de oliva', qtyGrams: 5, macros: { kcal: 44, p: 0, c: 0, g: 5 } },
  ],
  id,
});
const target = { kcal: 479, p: 51.8, c: 42.8, g: 9.3 };

describe('Receitas — filtros', () => {
  it('sem ovo tira ovo, clara e omelete', () => {
    expect(foodHasEgg('Ovo cozido')).toBe(true);
    expect(foodHasEgg('Clara de ovo')).toBe(true);
    expect(foodHasEgg('Omelete simples')).toBe(true);
    expect(foodHasEgg('Peito de frango')).toBe(false);
  });

  it('sem lactose tira leite, iogurte, skyr, queijo, requeijão e cottage, menos os "sem lactose"', () => {
    for (const n of ['Leite desnatado', 'Iogurte natural', 'Iogurte Skyr Natural', 'Queijo minas', 'Requeijão light', 'Queijo cottage']) {
      expect(foodHasLactose(n)).toBe(true);
    }
    expect(foodHasLactose('Leite sem lactose')).toBe(false);
    expect(foodHasLactose('Iogurte natural sem lactose')).toBe(false);
  });

  it('país do aluno já vem ligado; PT mostra PT e BR/PT', () => {
    const list = studentRecipesFor({ bank, index, ctx: ctxPT, slots: ['almoco'], target, filters: defaultRecipeFilters('PT') });
    expect(list.map((r) => r.meal.code)).not.toContain('AL01');
    const all = studentRecipesFor({ bank, index, ctx: ctxPT, slots: ['almoco'], target, filters: { ...defaultRecipeFilters('PT'), countries: [] } });
    expect(all.map((r) => r.meal.code)).toContain('AL01');
  });

  it('as que batem vêm primeiro; as que não batem ficam no fim', () => {
    const list = studentRecipesFor({ bank, index, ctx: ctxPT, slots: ['almoco'], target, filters: { ...defaultRecipeFilters(null) } });
    const firstBad = list.findIndex((r) => !r.ok);
    expect(firstBad === -1 || list.slice(firstBad).every((r) => !r.ok)).toBe(true);
    for (const r of list.filter((x) => x.ok)) {
      expect(Math.abs(r.totals.kcal - target.kcal)).toBeLessThanOrEqual(target.kcal * 0.1);
      expect(r.diff.kcal).toBeCloseTo(r.totals.kcal - target.kcal, 5);
    }
  });

  it('Sem ovo esconde a omelete', () => {
    const list = studentRecipesFor({ bank, index, ctx: ctxPT, slots: ['almoco'], target, filters: { ...defaultRecipeFilters(null), semOvo: true } });
    expect(list.map((r) => r.meal.code)).not.toContain('AL03');
  });
});

describe('Opção 2 automática', () => {
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((d) => [almoco(`m${d}`)]);

  it('é sempre a mesma para o mesmo plano/dia/refeição', () => {
    const a = autoBankOptionsForWeek({ planId: 'plano-1', weekDays, bank, index, ctx: ctxPT });
    const b = autoBankOptionsForWeek({ planId: 'plano-1', weekDays, bank, index, ctx: ctxPT });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0][0]?.bankCode).toBeTruthy();
  });

  it('respeita o país do aluno (PT nunca recebe refeição só BR)', () => {
    const a = autoBankOptionsForWeek({ planId: 'plano-1', weekDays, bank, index, ctx: ctxPT });
    expect(a.flat().every((o) => o?.bankCode !== 'AL01')).toBe(true);
  });

  it('não repete a mesma refeição do banco em dias seguidos quando há alternativa', () => {
    const a = autoBankOptionsForWeek({ planId: 'plano-1', weekDays, bank, index, ctx: ctxPT });
    const codes = a.map((d) => d[0]?.bankCode ?? null);
    const fitting = new Set(codes.filter(Boolean));
    if (fitting.size > 1) for (let i = 1; i < codes.length; i++) expect(codes[i]).not.toBe(codes[i - 1]);
  });

  it('opção salva pelo admin vale como Opção 2', () => {
    const saved = { ...almoco('s'), options: [
      { source: 'plan', name: 'Frango', items: [] },
      { source: 'bank', bankCode: 'AL99', name: 'Salva', items: [{ foodId: 'atum', name: 'Atum em água', qtyGrams: 100, macros: { kcal: 116, p: 26, c: 0, g: 1 } }] },
    ] };
    const a = autoBankOptionsForWeek({ planId: 'p', weekDays: [[saved]], bank, index, ctx: ctxPT });
    expect(a[0][0]?.bankCode).toBe('AL99');
  });

  it('sem refeição do banco que bata, fica sem Opção 2', () => {
    const tiny = { name: 'Almoço', time: '13:00', items: [{ foodId: 'broc', name: 'Brócolis cozido', qtyGrams: 100, macros: { kcal: 25, p: 2.4, c: 4, g: 0.4 } }] };
    const a = autoBankOptionsForWeek({ planId: 'p', weekDays: [[tiny]], bank, index, ctx: ctxPT });
    expect(a[0][0]).toBeNull();
  });
});

describe('Artigo da refeição', () => {
  it('"o Almoço", "a Ceia"', () => {
    expect(mealArticle('Almoço')).toBe('o');
    expect(mealArticle('Ceia')).toBe('a');
    expect(mealArticle('Café da manhã')).toBe('o');
  });
});
