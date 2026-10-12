import { describe, expect, it } from 'vitest';
import { applyMealTimeAndSort, shiftTime, sortMealsByTime } from '@/lib/dietMealTime';

const m = (name: string, time?: string, q = 100) => ({ name, time, items: [{ q }] });

describe('dietMealTime', () => {
  it('Pós-treino 23:00 → 17:00 passa antes do Jantar 19:00 em todos os dias', () => {
    const d = () => ({ meals: [m('Café', '07:00'), m('Jantar', '19:00'), m('Pós-treino', '23:00', 55)] });
    const other = { meals: [m('Café', '07:00'), m('Pos-Treino', '23:00'), m('Lanche', '16:00'), m('Jantar', '19:00')] };
    const { days, newIndex } = applyMealTimeAndSort([d(), other], 0, 2, '17:00', false);
    expect(days[0].meals!.map((x) => x.name)).toEqual(['Café', 'Pós-treino', 'Jantar']);
    expect(newIndex).toBe(1);
    expect(days[0].meals![1].items).toEqual([{ q: 55 }]);
    // outro dia: achado pelo nome mesmo em posição diferente
    expect(days[1].meals!.map((x) => x.name)).toEqual(['Café', 'Lanche', 'Pos-Treino', 'Jantar']);
    expect(days[1].meals![2].time).toBe('17:00');
  });

  it('ceia 00:30 fica por último', () => {
    const { days } = applyMealTimeAndSort([{ meals: [m('Ceia', '22:00'), m('Café', '07:00'), m('Jantar', '19:00')] }], 0, 0, '00:30', true);
    expect(days[0].meals!.map((x) => x.name)).toEqual(['Café', 'Jantar', 'Ceia']);
  });

  it('sem horário acompanha a refeição anterior; ordem estável', () => {
    expect(sortMealsByTime([m('A', '12:00'), m('B'), m('C', '08:00'), m('D', '08:00')]).map((x) => x.name))
      .toEqual(['C', 'D', 'A', 'B']);
  });

  it('só neste dia e limpar', () => {
    const days = [{ meals: [m('Café', '07:00')] }, { meals: [m('Café', '07:00')] }];
    const r = applyMealTimeAndSort(days, 1, 0, undefined, true).days;
    expect(r[0].meals![0].time).toBe('07:00');
    expect(r[1].meals![0].time).toBeUndefined();
  });

  it('shift', () => {
    expect(shiftTime('00:15', -30)).toBe('23:45');
  });
});
