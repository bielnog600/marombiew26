import { describe, expect, it } from 'vitest';
import type { FoodRecord } from '@/lib/nutritionEngine';
import {
  buildFoodIndex,
} from '@/lib/nutritionEngine';
import {
  buildStudentMealContext,
  countryFromPhone,
  generatePlanMealOptions,
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

describe('Banco de refeições — gramas escaladas', () => {
  const index = buildFoodIndex(FOODS);

  it('fica a ±10% da kcal da opção 1 com porções reais', () => {
    for (const target of [250, 353, 480, 620]) {
      const items = scaleBankItems([{ foodId: 'pao', grams: 50 }, { foodId: 'ovo', grams: 100 }, { foodId: 'mamao', grams: 150 }], index, target);
      const kcal = sumOptionItems(items).kcal;
      expect(Math.abs(kcal - target)).toBeLessThanOrEqual(target * 0.1);
      const byId = Object.fromEntries(items.map((i) => [i.foodId, i.qtyGrams]));
      expect(byId.ovo % 50).toBe(0);
      expect(byId.pao % 50).toBe(0);
      items.forEach((i) => expect(i.qtyGrams % 5).toBe(0));
    }
  });

  it('whey só em doses de 15, 20 ou 30 g', () => {
    for (const target of [200, 300, 420]) {
      const items = scaleBankItems([{ foodId: 'whey', grams: 30 }, { foodId: 'banana', grams: 100 }, { foodId: 'aveia', grams: 20 }], index, target);
      expect([15, 20, 30]).toContain(items.find((i) => i.foodId === 'whey')!.qtyGrams);
    }
  });
});

describe('Banco de refeições — Gerar opções', () => {
  const ptCtx = buildStudentMealContext({ phone: '351911577317', restricoes: ['Sem soja'], alimentos: { alimentos: ['Iogurte natural desnatado', 'Banana', 'Ovo cozido'] } });

  it('opção 1 continua a refeição do plano e as opções 2/3 respeitam horário e país', () => {
    const p = plan([meal('Café da Manhã', '08:00', [item('ovo', 100), item('pao', 50)])]);
    const res = generatePlanMealOptions(p, BANK, FOODS, ptCtx);
    const m = res.plan.days[0].meals[0];
    expect(m.items).toEqual(p.days[0].meals[0].items);
    expect(m.options).toHaveLength(3);
    expect(m.options[0].source).toBe('plan');
    expect(m.options[0].items.map((i: any) => i.foodId)).toEqual(['ovo', 'pao']);
    const codes = m.options.slice(1).map((o: any) => o.bankCode);
    // Só PT ou BR/PT para Portugal; nunca a refeição BR.
    expect(codes.every((c: string) => ['CM08', 'CM10'].includes(c))).toBe(true);
    const target = sumOptionItems(m.items).kcal;
    m.options.slice(1).forEach((o: any) => expect(Math.abs(sumOptionItems(o.items).kcal - target)).toBeLessThanOrEqual(target * 0.1));
  });

  it('sem lactose tira refeições com iogurte/whey', () => {
    const ctx = buildStudentMealContext({ phone: '351911577317', restricoes: ['sem lactose'] });
    const p = plan([meal('Café da Manhã', '08:00', [item('ovo', 100), item('pao', 50)])]);
    const m = generatePlanMealOptions(p, BANK, FOODS, ctx).plan.days[0].meals[0];
    expect(m.options.map((o: any) => o.bankCode).filter(Boolean)).toEqual(['CM10']);
  });

  it('prioriza alimentos da ficha e evita a mesma proteína da opção 1', () => {
    const brCtx = buildStudentMealContext({ phone: '5511999990000', alimentos: { alimentos: ['Frango desfiado', 'Tapioca'] } });
    const p = plan([meal('Café da Manhã', '08:00', [item('frango', 100), item('pao', 50)])]);
    const m = generatePlanMealOptions(p, BANK, FOODS, brCtx).plan.days[0].meals[0];
    const codes = m.options.slice(1).map((o: any) => o.bankCode);
    expect(codes).not.toContain('CM02'); // frango igual à opção 1
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
