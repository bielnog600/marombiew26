import { describe, expect, it } from 'vitest';
import type { FoodRecord } from '@/lib/nutritionEngine';
import {
  buildFoodIndex,
} from '@/lib/nutritionEngine';
import {
  buildStudentMealContext,
  countryFromPhone,
  fitBankItems,
  fitBankMeal,
  generatePlanMealOptions,
  optionFitIssues,
  portionRuleFor,
  mealSlotsFor,
  originsForCountry,
  parseRestrictionFlags,
  scaleBankItems,
  sumOptionItems,
  syncMealOptions,
  semanticMealOptions,
  type BankMeal,
} from '@/lib/mealBank';
import { applyStudentMealOptions, studentMealOptionsForDay } from '@/lib/studentStructuredDiet';
import { CLEARED_BY_OPTION_SWITCH, latestWeighLogs, supersededWeighLogIds, type WeighLogRecord } from '@/lib/mealWeigh';
import { buildPublishedSnapshotPlan } from '../../supabase/functions/_shared/dietPublication';
import { buildFoodCatalog } from '../../supabase/functions/_shared/foodCatalog';

const F = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number): FoodRecord =>
  ({ id, name, calories, protein, carbs, fats, portion_size: 100 });

const FOODS: FoodRecord[] = [
  F('ovo', 'Ovo', 143, 12, 1, 9),
  F('pao', 'Pão francês', 300, 8, 58.6, 3.1),
  F('mamao', 'Mamão', 40, 0.5, 10, 0.1),
  F('whey', 'Whey Protein Concentrado', 400, 75, 10, 6),
  F('aveia', 'Aveia em flocos', 394, 14, 66, 8.5),
  F('banana', 'Banana', 89, 1.1, 23, 0.3),
  F('iog', 'Iogurte natural desnatado', 42, 4, 6, 0.2),
  F('frango', 'Frango desfiado', 165, 31, 0, 3.6),
  F('tapioca', 'Tapioca (goma pronta)', 240, 0, 60, 0),
  F('arroz', 'Arroz branco cozido', 128, 2.5, 28, 0.2),
  F('atum', 'Atum em água', 116, 26, 0, 1),
  F('broa', 'Broa de milho', 230, 5, 45, 3),
  F('abacate', 'Abacate', 160, 2, 8.5, 14.7),
  F('paoint', 'Pão integral', 260, 9, 47, 4),
  F('skyr', 'Iogurte Skyr Natural', 59, 10, 4, 0.2),
  F('clara', 'Clara de ovo', 52, 11, 0.7, 0.2),
  F('cottage', 'Queijo cottage', 103, 12.5, 3.3, 4.5),
  F('espinafre', 'Espinafre refogado', 67, 2.7, 4.2, 5.4),
  F('basmati', 'Arroz basmati', 121, 3.5, 25, 0.4),
  F('batata', 'Batata inglesa cozida', 52, 1.2, 11.9, 0),
  F('azeite', 'Azeite de oliva', 884, 0, 0, 100),
  F('maca', 'Maçã', 52, 0.3, 14, 0.2),
  F('tomate', 'Tomate', 18, 0.9, 3.9, 0.2),
  F('peito', 'Peito de frango grelhado', 159, 32, 0, 2.5),
  F('camarao', 'Camarão grelhado', 99, 24, 0.2, 0.3),
  F('abobrinha', 'Abobrinha refogada', 17, 1.2, 3.1, 0.3),
];

const item = (foodId: string, grams: number) => {
  const f = FOODS.find((x) => x.id === foodId)!;
  const k = grams / 100;
  return { foodId, name: f.name, qtyGrams: grams, macros: { kcal: f.calories * k, p: f.protein * k, c: f.carbs * k, g: f.fats * k } };
};

const bm = (code: string, slot: BankMeal['slot'], origin: BankMeal['origin'], name: string, items: Array<[string, number]>): BankMeal => ({
  id: code, code, slot, origin, name, tags: [], prep: `Preparo ${code}`, active: true,
  items: items.map(([foodId, grams], ordem) => ({ foodId, grams, ordem })),
});

const BANK: BankMeal[] = [
  bm('CM01', 'cafe_manha', 'BR', 'Pão com ovo', [['pao', 50], ['ovo', 100], ['mamao', 150]]),
  bm('CM02', 'cafe_manha', 'BR', 'Tapioca de frango', [['tapioca', 60], ['frango', 60]]),
  bm('CM08', 'cafe_manha', 'BR/PT', 'Iogurte com whey e banana', [['iog', 170], ['whey', 15], ['banana', 80]]),
  bm('CM10', 'cafe_manha', 'PT', 'Tostas de broa com ovos', [['broa', 60], ['ovo', 100]]),
  bm('LT09', 'lanche_tarde', 'BR/PT', 'Shake de whey com banana e aveia', [['whey', 30], ['banana', 100], ['aveia', 20]]),
  bm('AL13', 'almoco', 'PT', 'Arroz com atum', [['arroz', 150], ['atum', 80]]),
];

const plan = (meals: any[]) => ({ days: [{ label: 'Padrão', meals }] });
const meal = (name: string, time: string, items: any[]) => ({ id: name, name, time, order: 0, items, totals: sumOptionItems(items) });

describe('Banco de refeições — horário e país', () => {
  it('mapeia o nome da refeição para o horário do banco', () => {
    expect(mealSlotsFor('Café da Manhã')).toEqual(['cafe_manha']);
    expect(mealSlotsFor('Pequeno-almoço')).toEqual(['cafe_manha']);
    expect(mealSlotsFor('Lanche da manhã')).toEqual(['lanche_tarde', 'cafe_manha']);
    expect(mealSlotsFor('Lanche da Tarde')).toEqual(['lanche_tarde', 'cafe_manha']);
    expect(mealSlotsFor('Pré-treino')).toEqual(['pre_treino']);
    expect(mealSlotsFor('Pós-Treino')).toEqual(['pos_treino']);
    expect(mealSlotsFor('Almoço')).toEqual(['almoco']);
    expect(mealSlotsFor('Jantar')).toEqual(['jantar']);
    expect(mealSlotsFor('Ceia')).toEqual(['ceia']);
  });

  it('Portugal usa PT ou BR/PT; Brasil usa BR ou BR/PT', () => {
    expect(countryFromPhone('351911577317')).toBe('PT');
    expect(countryFromPhone('+55 11 99999-0000')).toBe('BR');
    expect(originsForCountry('PT')).toEqual(['PT', 'BR/PT']);
    expect(originsForCountry('BR')).toEqual(['BR', 'BR/PT']);
  });

  it('lê restrições da ficha e ignora "nenhuma"', () => {
    expect([...parseRestrictionFlags('Sem soja')]).toEqual(['soja']);
    expect(parseRestrictionFlags('Intolerância à lactose').has('lactose')).toBe(true);
    expect(parseRestrictionFlags('Nenhuma').size).toBe(0);
  });
});

describe('Banco de refeições — porções reais e limites', () => {
  const index = buildFoodIndex(FOODS);
  const LIMITS: Record<string, [number, number]> = {
    ovo: [50, 200], clara: [0, 200], skyr: [0, 340], iog: [0, 340], whey: [0, 40], pao: [0, 100], paoint: [0, 100],
    broa: [0, 100], banana: [60, 200], maca: [60, 200], mamao: [60, 200], abacate: [0, 100], azeite: [0, 15],
    frango: [80, 250], peito: [80, 250], atum: [80, 250], camarao: [80, 250], abobrinha: [0, 200], tomate: [0, 200],
    espinafre: [0, 200], arroz: [0, 400], basmati: [0, 400], batata: [0, 400], aveia: [0, 100], cottage: [0, 200],
  };
  const expectWithinLimits = (items: Array<{ foodId: string | null; qtyGrams: number }>) => {
    for (const i of items) {
      const [lo, hi] = LIMITS[i.foodId as string] ?? [0, 400];
      expect(i.qtyGrams, `${i.foodId} ${i.qtyGrams} g`).toBeGreaterThanOrEqual(lo);
      expect(i.qtyGrams, `${i.foodId} ${i.qtyGrams} g`).toBeLessThanOrEqual(hi);
    }
  };

  it('limites por alimento: ovo 50–200 g, clara ≤ 200, iogurte/skyr ≤ 340, leite ≤ 400, whey ≤ 40, pão ≤ 100, tortilha ≤ 80, fruta 60–200, abacate ≤ 100, oleaginosas ≤ 30, azeite ≤ 15, carne/peixe 80–250, legumes ≤ 200, arroz/batata ≤ 400', () => {
    const r = (n: string) => portionRuleFor(n);
    expect([r('Ovo').min, r('Ovo').max]).toEqual([50, 200]);
    expect(r('Clara de ovo').max).toBeLessThanOrEqual(200);
    expect(r('Iogurte Skyr Natural').max).toBe(340);
    expect(r('Iogurte natural desnatado').max).toBe(340);
    expect(r('Leite desnatado').max).toBe(400);
    expect(r('Whey Protein Concentrado').max).toBe(40);
    for (const n of ['Pão francês', 'Pão integral', 'Broa de milho', 'Bolo do caco']) expect(r(n).max).toBe(100);
    expect(r('Tortilha integral').max).toBe(80);
    for (const n of ['Banana', 'Maçã', 'Morango', 'Frutas vermelhas congeladas']) {
      expect(r(n).min).toBeGreaterThanOrEqual(60);
      expect(r(n).max).toBeLessThanOrEqual(200);
    }
    expect(r('Abacate').max).toBe(100);
    for (const n of ['Pasta de amendoim', 'Amêndoas', 'Nozes']) expect(r(n).max).toBe(30);
    expect(r('Azeite de oliva').max).toBe(15);
    for (const n of ['Peito de frango grelhado', 'Atum em água', 'Camarão grelhado', 'Bacalhau demolhado cozido', 'Alcatra grelhada']) {
      expect([r(n).min, r(n).max]).toEqual([80, 250]);
    }
    for (const n of ['Abobrinha refogada', 'Abóbora cabotiá / menina cozida', 'Tomate', 'Salada de folhas']) expect(r(n).max).toBe(200);
    for (const n of ['Arroz branco cozido', 'Massa cozida', 'Batata inglesa cozida', 'Cuscuz de milho cozido', 'Macarrão integral cozido']) {
      expect(r(n).kind).toBe('carb');
      expect(r(n).max).toBe(400);
    }
  });

  it('café de 937 kcal: "Torrada integral com abacate e ovo" nunca passa os limites (nada de 5 ovos ou 145 g de abacate)', () => {
    const res = fitBankItems([{ foodId: 'paoint', grams: 50 }, { foodId: 'abacate', grams: 50 }, { foodId: 'ovo', grams: 100 }], index, { kcal: 937 }, { slots: ['cafe_manha'] });
    expectWithinLimits(res.items);
    if (res.ok) expect(Math.abs(sumOptionItems(res.items).kcal - 937)).toBeLessThanOrEqual(93.7);
  });

  it('"Skyr com aveia" não vira 460 g de skyr nem 325 g de maçã', () => {
    const res = fitBankItems([{ foodId: 'skyr', grams: 170 }, { foodId: 'aveia', grams: 30 }, { foodId: 'maca', grams: 100 }], index, { kcal: 937 }, { slots: ['cafe_manha'] });
    expectWithinLimits(res.items);
  });

  it('escala a receita num fator 0,7–1,5 e só o carboidrato cresce além disso', () => {
    // Base 159 + 192 = 351 kcal; alvo 700 kcal (2×).
    const res = fitBankItems([{ foodId: 'peito', grams: 100 }, { foodId: 'arroz', grams: 150 }], index, { kcal: 700 }, { slots: ['almoco'] });
    const g = Object.fromEntries(res.items.map((i) => [i.foodId, i.qtyGrams]));
    expect(g.peito).toBeLessThanOrEqual(150);
    expect(g.arroz).toBeGreaterThan(225);
    expect(g.arroz).toBeLessThanOrEqual(400);
    expect(res.ok).toBe(true);
  });

  it('se ainda faltar kcal, acrescenta acompanhamento do horário: fruta/pão/aveia no café, arroz/batata no jantar', () => {
    const cafe = fitBankItems([{ foodId: 'skyr', grams: 170 }, { foodId: 'whey', grams: 20 }], index, { kcal: 500 }, { slots: ['cafe_manha'] });
    expect(cafe.sides.length).toBeGreaterThan(0);
    expect(cafe.sides.every((n) => ['Banana', 'Pão integral', 'Aveia em flocos', 'Maçã', 'Abacate', 'Pasta de amendoim'].includes(n))).toBe(true);
    expectWithinLimits(cafe.items);
    const jantar = fitBankItems([{ foodId: 'camarao', grams: 150 }, { foodId: 'abobrinha', grams: 150 }], index, { kcal: 600 }, { slots: ['jantar'] });
    expect(jantar.sides[0]).toMatch(/Arroz|Batata/);
    expectWithinLimits(jantar.items);
  });

  it('arroz, massa e batata somados não passam de 400 g na refeição', () => {
    const res = fitBankItems([{ foodId: 'peito', grams: 150 }, { foodId: 'batata', grams: 300 }, { foodId: 'arroz', grams: 150 }], index, { kcal: 1100 }, { slots: ['almoco'] });
    const starch = res.items.filter((i) => ['batata', 'arroz'].includes(i.foodId as string)).reduce((a, i) => a + i.qtyGrams, 0);
    expect(starch).toBeLessThanOrEqual(400);
  });

  it('se não fechar ±10% sem passar os limites, a refeição não serve', () => {
    const res = fitBankItems([{ foodId: 'tomate', grams: 100 }], index, { kcal: 900 }, { slots: ['ceia'] });
    expect(res.ok).toBe(false);
    expectWithinLimits(res.items);
  });

  it('porções reais: múltiplos de 5 g, ovo em 50 g, pão francês em 50 g', () => {
    for (const target of [250, 353, 480, 620]) {
      const items = scaleBankItems([{ foodId: 'pao', grams: 50 }, { foodId: 'ovo', grams: 100 }, { foodId: 'mamao', grams: 150 }], index, target);
      const byId = Object.fromEntries(items.map((i) => [i.foodId, i.qtyGrams]));
      expect(byId.ovo % 50).toBe(0);
      expect(byId.pao % 50).toBe(0);
      items.forEach((i) => expect(i.qtyGrams % 5).toBe(0));
      expectWithinLimits(items);
    }
  });

  it('whey só em doses de 15, 20, 30 ou 40 g', () => {
    for (const target of [200, 300, 420, 700]) {
      const items = scaleBankItems([{ foodId: 'whey', grams: 30 }, { foodId: 'banana', grams: 100 }, { foodId: 'aveia', grams: 20 }], index, target);
      expect([15, 20, 30, 40]).toContain(items.find((i) => i.foodId === 'whey')!.qtyGrams);
    }
  });
});

describe('Banco de refeições — macros parecidos com a Opção 1', () => {
  const index = buildFoodIndex(FOODS);

  it('proteína ±25%, carboidrato ±30%, gordura ±40% (com folga mínima em gramas)', () => {
    const t = { kcal: 500, p: 40, c: 60, g: 10 };
    expect(optionFitIssues({ kcal: 500, p: 40, c: 60, g: 10 }, t)).toEqual([]);
    expect(optionFitIssues({ kcal: 500, p: 51, c: 60, g: 10 }, t)).toEqual(['p']);
    expect(optionFitIssues({ kcal: 500, p: 40, c: 40, g: 10 }, t)).toEqual(['c']);
    expect(optionFitIssues({ kcal: 500, p: 40, c: 60, g: 17 }, t)).toEqual(['g']);
    expect(optionFitIssues({ kcal: 560, p: 40, c: 60, g: 10 }, t)).toEqual(['kcal']);
  });

  it('jantar Atum 160 g + Arroz basmati 280 g não recebe omelete low carb como equivalente', () => {
    const omelete = bm('JA01', 'jantar', 'BR/PT', 'Omelete de cottage e espinafre + salada', [['ovo', 150], ['cottage', 60], ['espinafre', 80], ['tomate', 80]]);
    const target = sumOptionItems([item('atum', 160), item('basmati', 280)]);
    expect(fitBankMeal(omelete, index, target, { slots: ['jantar'] }).ok).toBe(false);
    const p = plan([meal('Jantar', '20:00', [item('atum', 160), item('basmati', 280)])]);
    const res = generatePlanMealOptions(p, [omelete], FOODS, buildStudentMealContext({}));
    expect(res.plan.days[0].meals[0].options).toBeUndefined();
    expect(res.gaps).toEqual([expect.objectContaining({ mealName: 'Jantar', found: 0 })]);
  });

  it('dia de carbo baixo compara com a Opção 1 daquele dia', () => {
    const arrozFrango = bm('AL01', 'almoco', 'BR', 'Frango com arroz', [['peito', 150], ['arroz', 200]]);
    const alto = plan([meal('Almoço', '12:30', [item('peito', 150), item('arroz', 250)])]);
    const baixo = plan([meal('Almoço', '12:30', [item('peito', 200), item('abacate', 100), item('tomate', 150)])]);
    const ctx = buildStudentMealContext({});
    expect(generatePlanMealOptions(alto, [arrozFrango], FOODS, ctx).gaps[0]?.found).toBe(1);
    expect(generatePlanMealOptions(baixo, [arrozFrango], FOODS, ctx).gaps[0]?.found).toBe(0);
  });
});

describe('Banco de refeições — Gerar opções', () => {
  const ptCtx = buildStudentMealContext({ phone: '351911577317', restricoes: ['Sem soja'], alimentos: { alimentos: ['Iogurte natural desnatado', 'Banana', 'Ovo cozido'] } });

  it('opção 1 continua a refeição do plano e as opções 2/3 respeitam horário, país e macros', () => {
    const p = plan([meal('Café da Manhã', '08:00', [item('ovo', 100), item('pao', 50)])]);
    const res = generatePlanMealOptions(p, BANK, FOODS, ptCtx);
    const m = res.plan.days[0].meals[0];
    expect(m.items).toEqual(p.days[0].meals[0].items);
    expect(m.options.length).toBeGreaterThanOrEqual(2);
    expect(m.options[0].source).toBe('plan');
    expect(m.options[0].items.map((i: any) => i.foodId)).toEqual(['ovo', 'pao']);
    const codes = m.options.slice(1).map((o: any) => o.bankCode);
    // Só PT ou BR/PT para Portugal; nunca a refeição BR.
    expect(codes.every((c: string) => ['CM08', 'CM10'].includes(c))).toBe(true);
    const target = sumOptionItems(m.items);
    m.options.slice(1).forEach((o: any) => expect(optionFitIssues(sumOptionItems(o.items), target)).toEqual([]));
  });

  it('sem lactose tira refeições com iogurte/whey', () => {
    const ctx = buildStudentMealContext({ phone: '351911577317', restricoes: ['sem lactose'] });
    const p = plan([meal('Café da Manhã', '08:00', [item('ovo', 100), item('pao', 50)])]);
    const m = generatePlanMealOptions(p, BANK, FOODS, ctx).plan.days[0].meals[0];
    expect((m.options ?? []).map((o: any) => o.bankCode).filter(Boolean)).not.toContain('CM08');
  });

  it('evita a mesma proteína da opção 1 quando outra refeição equivalente existe', () => {
    const bank = [
      bm('AL01', 'almoco', 'BR', 'Frango com arroz', [['peito', 150], ['arroz', 200]]),
      bm('AL02', 'almoco', 'BR', 'Atum com arroz', [['atum', 150], ['arroz', 200]]),
      bm('AL03', 'almoco', 'BR', 'Camarão com arroz', [['camarao', 150], ['arroz', 200]]),
    ];
    const p = plan([meal('Almoço', '12:30', [item('peito', 150), item('arroz', 200)])]);
    const m = generatePlanMealOptions(p, bank, FOODS, buildStudentMealContext({})).plan.days[0].meals[0];
    expect(m.options.slice(1).map((o: any) => o.bankCode)).toEqual(['AL02', 'AL03']);
  });

  it('não repete a mesma refeição do banco em dois horários do dia', () => {
    const p = plan([
      meal('Lanche da manhã', '10:30', [item('banana', 100)]),
      meal('Lanche da tarde', '16:00', [item('banana', 100)]),
    ]);
    const res = generatePlanMealOptions(p, BANK, FOODS, buildStudentMealContext({}));
    const all = res.plan.days[0].meals.flatMap((x: any) => (x.options ?? []).map((o: any) => o.bankCode).filter(Boolean));
    expect(new Set(all).size).toBe(all.length);
  });

  it('dias seguidos (SEG–DOM) não repetem a refeição do banco no mesmo horário quando há alternativa', () => {
    const bank = ['AL01', 'AL02', 'AL03', 'AL04'].map((code, i) =>
      bm(code, 'almoco', 'BR', `Almoço ${i}`, [[['atum', 'camarao', 'atum', 'camarao'][i], 150], ['arroz', 200]]));
    const day = (label: string) => ({ label, meals: [meal('Almoço', '12:30', [item('peito', 150), item('arroz', 200)])] });
    const res = generatePlanMealOptions({ days: [day('Segunda'), day('Terça'), day('Quarta')] }, bank, FOODS, buildStudentMealContext({}));
    const codes = res.plan.days.map((d: any) => d.meals[0].options.slice(1).map((o: any) => o.bankCode));
    expect(codes[0].some((c: string) => codes[1].includes(c))).toBe(false);
    expect(codes[1].some((c: string) => codes[2].includes(c))).toBe(false);
  });

  it('refeição sem opções do banco fica com 1 opção (sem seletor)', () => {
    const synced = syncMealOptions({ ...meal('Ceia', '22:00', [item('iog', 170)]), options: [{ source: 'plan', name: 'x', items: [] }] });
    expect(synced.options).toBeUndefined();
    expect(semanticMealOptions({ name: 'Ceia' })).toEqual({});
  });
});

describe('Publicação com opções', () => {
  it('recalcula as opções do banco pela base e espelha a opção 1', () => {
    const catalog = buildFoodCatalog(FOODS.map((f) => ({ ...f, portion: 'gramas' })) as any);
    const m = {
      ...meal('Café da Manhã', '08:00', [item('ovo', 100)]),
      options: [
        { source: 'plan', name: 'Ovo', items: [] },
        { source: 'bank', bankCode: 'CM08', name: 'Iogurte', items: [{ foodId: 'iog', name: 'Iogurte', qtyGrams: 200, macros: { kcal: 999, p: 0, c: 0, g: 0 } }] },
      ],
    };
    const { plan: out } = buildPublishedSnapshotPlan({ days: [{ label: 'Padrão', meals: [m] }] }, catalog);
    const opts = out.days[0].meals[0].options;
    expect(opts[0].items.map((i: any) => i.foodId)).toEqual(['ovo']);
    expect(opts[1].items[0].macros.kcal).toBe(84);
  });
});

describe('Aluno — escolher a opção', () => {
  const canonical = {
    days: [{
      label: 'Padrão',
      meals: [{
        name: 'Café da Manhã',
        items: [item('ovo', 100)],
        options: [
          { source: 'plan', name: 'Ovo', items: [] },
          { source: 'bank', bankCode: 'CM08', name: 'Iogurte com whey', prep: 'Misturar', items: [item('iog', 170), item('whey', 15)] },
        ],
      }],
    }],
  };
  const shown = [{ name: 'Café da Manhã', foods: [{ food: 'Ovo', qty: '100 g', kcal: '143', p: '12', c: '1', g: '9' }] }];

  it('dieta com um único dia vale para todos os dias da semana', () => {
    for (const wd of [0, 3, 6]) {
      const opts = studentMealOptionsForDay(canonical, wd, shown);
      expect(opts[0]).toHaveLength(2);
    }
  });

  it('Opção 2 troca os alimentos padrão; Opção 1 mantém o plano', () => {
    const opts = studentMealOptionsForDay(canonical, 0, shown);
    const two = applyStudentMealOptions(shown as any, opts, () => 1);
    expect(two[0].foods.map((f) => f.food)).toEqual(['Iogurte natural desnatado', 'Whey Protein Concentrado']);
    expect(two[0].selectedOption).toBe(1);
    expect(two[0].prep).toBe('Misturar');
    const one = applyStudentMealOptions(shown as any, opts, () => 0);
    expect(one[0].foods).toEqual(shown[0].foods);
  });

  it('pesagem apagada pela troca de opção deixa a refeição sem pesagem e fica no histórico', () => {
    const rows: WeighLogRecord[] = [
      { id: 'a', log_date: '2026-11-15', meal_index: 0, items: [], created_at: '2026-11-15T08:00:00Z', planned: { kcal: 300 } as any },
      { id: 'b', log_date: '2026-11-15', meal_index: 0, items: [], created_at: '2026-11-15T09:00:00Z', planned: { cleared: true, motivo: CLEARED_BY_OPTION_SWITCH } as any },
    ];
    expect(latestWeighLogs(rows).size).toBe(0);
    expect([...supersededWeighLogIds(rows)]).toEqual(['a']);
  });
});
