import { describe, expect, it } from 'vitest';
import {
  applySubstitution, buildUnweighedEntries, compareWeighedMeal, dayMealFoodsFromLog, dropStaleSubstitutions,
  formatSwapLine, formatUnweighedLine, latestWeighLogs, mealConsumedTotals, outOfPlanItemIndexes,
  overlayDayWeighLogs, pendingPlanFoods, plannedFromMeal, supersededWeighLogIds, substitutionQuestion,
  type WeighLogRecord, type WeighedItem,
} from '@/lib/mealWeigh';

const meal = {
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Banana', qty: '100 g', kcal: '89', p: '1', c: '23', g: '0.3' },
    { food: 'Aveia', qty: '30 g', kcal: '117', p: '4', c: '20', g: '2' },
  ],
};
const planned = plannedFromMeal(meal as any);
const item = (over: Partial<WeighedItem>): WeighedItem => ({
  alimento: 'Banana', food_id: null, gramas: 150, kcal: 134, p: 1.5, c: 34.5, g: 0.5, foto_url: null, editado_pelo_aluno: false, indice_plano: 0, ...over,
});
const banana = item({});
const pasta = item({ alimento: 'Pasta de amendoim', gramas: 57, kcal: 335, p: 14, c: 11, g: 28, indice_plano: null });

describe('Pesar refeição — itens não pesados', () => {
  it('"Comi sem pesar" (padrão) conta a quantidade prevista', () => {
    const unweighed = buildUnweighedEntries(pendingPlanFoods(planned, [banana]));
    expect(unweighed).toHaveLength(1);
    expect(unweighed[0]).toMatchObject({ alimento: 'Aveia', escolha: 'comeu_sem_pesar' });
    expect(mealConsumedTotals([banana], unweighed)).toEqual({ kcal: 134 + 117, p: 5.5, c: 54.5, g: 2.5 });
    expect(formatUnweighedLine(unweighed[0])).toBe('Aveia: comeu sem pesar (previsto 30 g)');
    expect(compareWeighedMeal(planned, [banana], unweighed).naoPesados).toEqual([]);
  });

  it('"Não comi" conta zero', () => {
    const unweighed = buildUnweighedEntries(pendingPlanFoods(planned, [banana]), { 1: 'nao_comeu' });
    expect(mealConsumedTotals([banana], unweighed)).toEqual({ kcal: 134, p: 1.5, c: 34.5, g: 0.5 });
    expect(formatUnweighedLine(unweighed[0])).toBe('Aveia: não comeu');
  });
});

describe('Pesar refeição — fora do plano substituiu?', () => {
  it('salva "Trocou Aveia → Pasta de amendoim" ou "Extra: Pasta de amendoim"', () => {
    const items = [banana, pasta];
    expect(outOfPlanItemIndexes(planned, items)).toEqual([1]);
    expect(substitutionQuestion('Pasta de amendoim')).toBe('A Pasta de amendoim substituiu algum item?');
    const unweighed = buildUnweighedEntries(pendingPlanFoods(planned, items), { 1: 'nao_comeu' });
    const swapped = applySubstitution(items, 1, unweighed[0]);
    expect(swapped[1].substituiu).toEqual({ indice_plano: 1, alimento: 'Aveia' });
    expect(formatSwapLine(swapped[1])).toBe('Trocou Aveia → Pasta de amendoim');
    const extra = applySubstitution(items, 1, null);
    expect(extra[1]).toMatchObject({ extra: true, substituiu: null });
    expect(formatSwapLine(extra[1])).toBe('Extra: Pasta de amendoim');
    // Voltou para "Comi sem pesar": a troca deixa de valer.
    const eaten = buildUnweighedEntries(pendingPlanFoods(planned, items));
    expect(dropStaleSubstitutions(swapped, eaten)[1].substituiu).toBeNull();
  });
});

const log = (over: Partial<WeighLogRecord>): WeighLogRecord => ({
  id: 'a', log_date: '2026-10-30', meal_index: 0, created_at: '2026-10-30T12:00:00Z',
  planned: { alimentos: planned.alimentos },
  items: [banana, { ...pasta, substituiu: { indice_plano: 1, alimento: 'Aveia' } }],
  unweighed: buildUnweighedEntries(pendingPlanFoods(planned, [banana, pasta]), { 1: 'nao_comeu' }),
  ...over,
});

describe('Pesar refeição — registro do dia', () => {
  it('a refeição do dia mostra o consumido: pesado, não comido e fora do plano', () => {
    const foods = dayMealFoodsFromLog(log({}));
    expect(foods.map((f) => [f.food, f.qty, f.kcal, f.weigh.status])).toEqual([
      ['Banana', '150 g', '134', 'pesado'],
      ['Aveia', '30 g', '0', 'nao_comeu'],
      ['Pasta de amendoim', '57 g', '335', 'fora_do_plano'],
    ]);
    expect(foods[0].weigh).toMatchObject({ gramas: 150, previstoGramas: 100 });
    expect(foods[2].weigh.substituiu).toBe('Aveia');
  });

  it('só a data e a refeição pesadas mudam; o resto fica como no plano', () => {
    const logs = latestWeighLogs([log({})]);
    const day = overlayDayWeighLogs([meal, { ...meal, name: 'Jantar' }], '2026-10-30', logs);
    expect(day.weighedIndexes).toEqual([0]);
    expect(day.meals[0].foods.reduce((s: number, f: any) => s + Number(f.kcal), 0)).toBe(134 + 335);
    expect(day.meals[1].foods).toEqual(meal.foods);
    expect(overlayDayWeighLogs([meal], '2026-10-31', logs).weighedIndexes).toEqual([]);
  });

  it('pesar de novo no mesmo dia substitui a anterior (histórico continua)', () => {
    const old = log({ id: 'old', created_at: '2026-10-30T12:00:00Z' });
    const fresh = log({ id: 'new', created_at: '2026-10-30T12:30:00Z', items: [item({ gramas: 100, kcal: 89, p: 1, c: 23, g: 0.3 })], unweighed: [] });
    const other = log({ id: 'other-day', log_date: '2026-10-29' });
    const latest = latestWeighLogs([fresh, old, other]);
    expect(latest.get('2026-10-30|0')?.id).toBe('new');
    expect(latest.get('2026-10-29|0')?.id).toBe('other-day');
    expect(Array.from(supersededWeighLogIds([old, fresh, other]))).toEqual(['old']);
    const day = overlayDayWeighLogs([meal], '2026-10-30', latest);
    expect(day.meals[0].foods.map((f: any) => [f.food, f.kcal])).toEqual([['Banana', '89'], ['Aveia', '117']]);
  });
});
