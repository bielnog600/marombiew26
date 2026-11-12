import { describe, expect, it } from 'vitest';
import {
  buildWeighedItem, checkTare, compareWeighedMeal, latestWeighLogs, mealConsumedTotals, overlayDayWeighLogs, plannedFromMeal,
  buildUnweighedEntries, pendingPlanFoods, sumWeighedItems, type WeighLogRecord,
} from '@/lib/mealWeigh';
import { editWeighedItem, removeWeighedItem, startFromWeighLog, weighFoodForItem } from '@/lib/mealWeigh/editItems';

const FOODS = [
  { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 5, fats: 3, portion_size: 100 },
  { id: 'f-whey', name: 'Whey protein', calories: 400, protein: 80, carbs: 8, fats: 6, portion_size: 100 },
  { id: 'f-mel', name: 'Mel', calories: 300, protein: 0, carbs: 80, fats: 0, portion_size: 100 },
];
const planned = plannedFromMeal({
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Iogurte natural', qty: '150 g', kcal: '90', p: '6', c: '7.5', g: '4.5' },
    { food: 'Whey protein', qty: '30 g', kcal: '120', p: '24', c: '2.4', g: '1.8' },
  ],
} as any);
const iog = buildWeighedItem(FOODS[0], 154, { planIndex: 0, readGrams: 154 });
const whey = buildWeighedItem(FOODS[1], 26, { planIndex: 1, readGrams: 26 });

describe('Pesar refeição — editar item', () => {
  it('mudar as gramas recalcula macros, total e o acumulado da tara', () => {
    const items = [iog, whey];
    expect(sumWeighedItems(items).gramas).toBe(180);
    const food = weighFoodForItem(whey, planned, FOODS);
    const next = editWeighedItem(items, 1, { food, grams: 30, planIndex: 1 });
    // Whey 30 g = previsto do plano (macros do próprio plano escalados).
    expect(next[1]).toMatchObject({ alimento: 'Whey protein', gramas: 30, kcal: 120, p: 24, editado_pelo_aluno: true, gramas_lidas: 26, indice_plano: 1 });
    expect(next[0]).toBe(iog);
    const totals = sumWeighedItems(next);
    expect(totals.gramas).toBe(184);
    expect(totals.kcal).toBe(iog.kcal + 120);
    // Acumulado novo no aviso de balança não zerada: 190 g lidos > 184 → descontar dá 6 g.
    expect(checkTare(190, totals.gramas)).toEqual({ notTared: true, suggestedGrams: 6 });
    expect(checkTare(182, totals.gramas).notTared).toBe(false);
  });

  it('trocar o alimento usa os macros do novo e o previsto × pesado acompanha', () => {
    const next = editWeighedItem([iog, whey], 1, { food: FOODS[2], grams: 20, planIndex: null });
    expect(next[1]).toMatchObject({ alimento: 'Mel', food_id: 'f-mel', gramas: 20, kcal: 60, c: 16, indice_plano: null });
    const cmp = compareWeighedMeal(planned, next);
    expect(cmp.foraDoPlano.map((i) => i.alimento)).toEqual(['Mel']);
    expect(cmp.naoPesados.map((p) => p.alimento)).toEqual(['Whey protein']);
    expect(cmp.consumido.kcal).toBe(iog.kcal + 60);
  });
});

describe('Pesar refeição — apagar item', () => {
  it('apagar tira o item e a foto, recalcula totais/acumulado e marca o alimento do plano como "não comi"', () => {
    const out = removeWeighedItem(planned, [iog, whey], ['foto1', 'foto2'], 1, {});
    expect(out.items).toEqual([iog]);
    expect(out.photos).toEqual(['foto1']);
    expect(out.choices).toEqual({ 1: 'nao_comeu' });
    expect(sumWeighedItems(out.items).gramas).toBe(154);
    // Antes o acumulado era 180 g; agora 160 g lidos já indicam balança não zerada.
    expect(checkTare(160, sumWeighedItems([iog, whey]).gramas).notTared).toBe(false);
    expect(checkTare(160, sumWeighedItems(out.items).gramas)).toEqual({ notTared: true, suggestedGrams: 6 });
    const unweighed = buildUnweighedEntries(pendingPlanFoods(planned, out.items), out.choices);
    expect(mealConsumedTotals(out.items, unweighed).kcal).toBe(iog.kcal);
    expect(compareWeighedMeal(planned, out.items, unweighed).consumido.kcal).toBe(iog.kcal);
  });
});

describe('Pesar refeição — editar pesagem salva', () => {
  const PLANNED = planned.alimentos;
  const oldLog: WeighLogRecord = {
    id: 'log-old', log_date: '2026-11-11', meal_index: 0, created_at: '2026-11-11T16:05:00Z',
    planned: { alimentos: PLANNED }, items: [iog, whey], unweighed: [],
  };

  it('parte do registro do dia e o novo registro substitui o anterior no dia', () => {
    const start = startFromWeighLog(oldLog);
    expect(start.planned.alimentos).toEqual(PLANNED);
    expect(start.items).toEqual([iog, whey]);
    expect(start.photos).toEqual(['', '']);

    const edited = editWeighedItem(start.items, 0, { food: weighFoodForItem(iog, start.planned, FOODS), grams: 150, planIndex: 0 });
    const newLog: WeighLogRecord = { ...oldLog, id: 'log-new', created_at: '2026-11-11T18:00:00Z', items: edited };
    const latest = latestWeighLogs([oldLog, newLog]);
    expect(latest.get('2026-11-11|0')?.id).toBe('log-new');

    const day = overlayDayWeighLogs([{ name: 'Lanche', foods: [] }], '2026-11-11', latest);
    expect(day.weighedIndexes).toEqual([0]);
    const foods = day.meals[0].foods as any[];
    expect(foods[0]).toMatchObject({ food: 'Iogurte natural', qty: '150 g', kcal: '90' });
    expect(foods[1]).toMatchObject({ food: 'Whey protein', qty: '26 g' });
  });

  it('mantém as escolhas "não comi" da pesagem salva', () => {
    const start = startFromWeighLog({ ...oldLog, items: [iog], unweighed: [{ indice_plano: 1, alimento: 'Whey protein', gramas: 30, qty: '30 g', kcal: 120, p: 24, c: 2.4, g: 1.8, escolha: 'nao_comeu' }] });
    expect(start.choices).toEqual({ 1: 'nao_comeu' });
  });
});
