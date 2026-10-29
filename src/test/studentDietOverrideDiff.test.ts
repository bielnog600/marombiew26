import { describe, it, expect } from 'vitest';
import { diffMealFoods, diffDay, sumMeals, hasOverrideGroups } from '@/lib/studentDietOverrideDiff';

const f = (name: string, qty: string, kcal = '100') => ({ name, qty, kcal, p: '10', c: '10', g: '2' });

describe('studentDietOverrideDiff', () => {
  it('detecta porção, troca, adição e remoção', () => {
    const ch = diffMealFoods(
      [f('Arroz', '100 g'), f('Frango', '120 g'), f('Pera', '1 un')],
      [f('Arroz', '150 g'), f('Tilápia', '120 g'), f('Banana', '1 un'), f('Aveia', '30 g')],
    );
    expect(ch.map((c) => c.kind)).toEqual(['qty', 'replaced', 'replaced', 'added']);
    expect(diffMealFoods([f('Arroz', '100 g'), f('Ovo', '2 un')], [f('Arroz', '100g')]).map((c) => c.kind))
      .toEqual(['same', 'removed']);
  });
  it('diffDay marca refeições alteradas e soma totais', () => {
    const d = diffDay([{ name: 'Almoço', foods: [f('Arroz', '100 g')] }], [{ name: 'Almoço', foods: [f('Arroz', '100 g')] }]);
    expect(d[0].changed).toBe(false);
    expect(sumMeals([{ foods: [f('A', '1', '120'), f('B', '1', '80')] }]).kcal).toBe(200);
    expect(hasOverrideGroups({})).toBe(false);
    expect(hasOverrideGroups({ '0': {} })).toBe(true);
  });
});

import { diffMealFoods as dmf, foodName as fn } from '@/lib/studentDietOverrideDiff';
describe('formato com chave food', () => {
  it('lê o nome em food e detecta porção editada', () => {
    const c = dmf([{ food: 'Salmão grelhado', qty: '150 g' }], [{ food: 'Salmão grelhado', qty: '120 g' }]);
    expect(c[0].kind).toBe('qty');
    expect(fn(c[0].before)).toBe('Salmão grelhado');
  });
});
