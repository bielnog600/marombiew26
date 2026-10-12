import { describe, expect, it } from 'vitest';
import { applyMealTime, mealTimesOutOfOrder, shiftTime } from '@/lib/dietMealTime';

const day = (names: string[], extra = {}) => ({ meals: names.map((n) => ({ name: n, time: '07:00', items: [{ q: 100 }], ...extra })) });

describe('dietMealTime', () => {
  it('aplica em todos os dias por índice e nome, sem mexer em itens', () => {
    const days = [day(['Café', 'Almoço']), day(['Café', 'Almoço']), day(['Desjejum', 'Almoço']), day(['Outro'])];
    const out = applyMealTime(days, 0, 0, '07:30', false);
    expect(out.map((d) => d.meals[0].time)).toEqual(['07:30', '07:30', '07:30', '07:00']);
    expect(out[1].meals[0].items).toEqual([{ q: 100 }]);
    expect(out[0].meals[1].time).toBe('07:00');
  });
  it('só neste dia', () => {
    const out = applyMealTime([day(['Café']), day(['Café'])], 1, 0, '08:00', true);
    expect(out.map((d) => d.meals[0].time)).toEqual(['07:00', '08:00']);
  });
  it('limpar remove o horário', () => {
    expect(applyMealTime([day(['Café'])], 0, 0, undefined, true)[0].meals[0].time).toBeUndefined();
  });
  it('shift e ordem', () => {
    expect(shiftTime('00:15', -30)).toBe('23:45');
    expect(mealTimesOutOfOrder([{ time: '11:00' }, { time: '10:00' }])).toBe(true);
    expect(mealTimesOutOfOrder([{ time: '07:00' }, {}, { time: '10:00' }])).toBe(false);
  });
});
