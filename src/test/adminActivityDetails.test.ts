import { describe, it, expect } from 'vitest';
import { buildActivityDiet, decodeActivityMeal, resolveActivityMeals } from '@/lib/adminActivityMeals';
import { activitySetDisplay } from '@/lib/adminActivitySets';

const meal = { name: 'Café da Manhã', time: '07:00', foods: [{ food: 'Ovos mexidos', qty: '72.6 g', kcal: '154', p: '10', c: '1.5', g: '11.7' }, { food: 'Pão integral', qty: '40.8 g', kcal: '106', p: '3.7', c: '19.3', g: '1.7' }] };
const plan = {
  is_draft: false,
  conteudo_json: { meta: { foodContractVersion: '1.0' }, targets: { kcal: 1608, p: 152, c: 142, g: 48 }, days: [{ label: 'Padrão', totals: { kcal: 154, p: 12.5, c: 1.1, g: 10.6 }, meals: [{ id: 'm1', order: 0, name: 'Café da Manhã', totals: { kcal: 154, p: 12.5, c: 1.1, g: 10.6 }, items: [{ name: 'Ovo cozido', qtyGrams: 100, macros: { kcal: 154, p: 12.5, c: 1.1, g: 10.6 } }] }] }] },
};
describe('admin activity meal read model', () => {
  it('resolves 3000 to Thursday breakfast, student foods and the canonical 1608/152/142/48 target', () => {
    const diet = buildActivityDiet(plan, { groups: { 3: { student: [meal] } } });
    const result = resolveActivityMeals(diet, [3000], '2026-10-29');
    expect(result.day).toBe(3);
    expect(diet.student[3][0].foods?.[0].food).toBe('Ovos mexidos');
    expect(diet.prescribed[3][0].foods?.[0].food).toBe('Ovo cozido');
    expect(result.consumed.kcal).toBe(260);
    expect(result.consumed.p).toBeCloseTo(13.7);
    expect(result.consumed.c).toBeCloseTo(20.8);
    expect(result.consumed.g).toBeCloseTo(13.4);
    expect(result.target).toEqual({ kcal: 1608, p: 152, c: 142, g: 48 });
  });
  it('supports old unprefixed meal indices for the activity weekday', () => {
    expect(decodeActivityMeal(0, '2026-10-29')).toEqual({ day: 3, meal: 0 });
  });
  it('sums each marked meal once across today and selects the clicked event', () => {
    const diet = buildActivityDiet(plan, { groups: { 3: { student: [meal, meal] } } });
    const result = resolveActivityMeals(diet, [3000, 3001, 3000, 9999], '2026-10-29', 3000);
    expect(result.consumed.kcal).toBe(520);
    expect(result.doneCount).toBe(2);
    expect(result.ordered).toEqual([0, 1]);
  });
  it('keeps weekday meals in the correct day rather than compacting sparse weekdays', () => {
    const diet = buildActivityDiet({ ...plan, conteudo_json: { ...plan.conteudo_json, days: [{ ...plan.conteudo_json.days[0], weekday: 'qui' }] } });
    expect(diet.prescribed[3][0].name).toBe('Café da Manhã');
    expect(diet.prescribed[0]).toEqual([]);
  });
});
describe('admin activity performed sets', () => {
  it('never presents prescribed reps or draft input as performed in an incomplete set', () => {
    expect(activitySetDisplay({ completed: false, weight: 30, reps: 12, rpe: 7 }, '12-15')).toEqual({ done: false, weight: '—', reps: '—', target: '12-15', effort: '' });
  });
  it('shows only the real reps and load for a completed set', () => {
    expect(activitySetDisplay({ completed: true, weight: 32.5, reps: 11, rir: 2 }, '12-15')).toEqual({ done: true, weight: '32,5 kg', reps: '11', target: null, effort: 'RIR 2' });
  });
});