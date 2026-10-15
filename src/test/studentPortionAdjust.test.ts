import { describe, it, expect } from 'vitest';
import { adjustStudentPortions } from '@/lib/studentPortionAdjust';
import { carbDayTargetSanityIssues } from '@/lib/carbCycling';

const f = (name: string, qty: string, kcal: number, p: number, c: number, g: number) =>
  ({ name, qty, kcal: String(kcal), p: String(p), c: String(c), g: String(g) }) as any;

describe('Ajustar Dieta do aluno', () => {
  const meals = [
    { name: 'Café', time: '07:00', foods: [f('Ovo', '2 unidades', 140, 12, 1, 10)] },
    { name: 'Almoço', time: '12:00', foods: [f('Frango', '100 g', 165, 31, 0, 4), f('Arroz', '100 g', 130, 3, 28, 0)] },
  ] as any;

  it('mantém alimentos, respeita refeição concluída, arredonda e limita', () => {
    const r = adjustStudentPortions({ meals, lockedMealIndexes: [0], target: { kcal: 600, p: 55, c: 50, g: 14 } });
    expect(r.meals[0]).toBe(meals[0]);
    expect(r.meals[1].foods.map((x: any) => x.name)).toEqual(['Frango', 'Arroz']);
    r.meals[1].foods.forEach((x: any) => {
      const n = parseInt(x.qty);
      expect(n % 5).toBe(0);
      expect(n).toBeGreaterThanOrEqual(50);
      expect(n).toBeLessThanOrEqual(200);
    });
  });

  it('avisa e sugere troca quando não fecha', () => {
    const choc = [{ name: 'Lanche', foods: [f('Chocolate', '30 g', 160, 2, 17, 9)] }] as any;
    const r = adjustStudentPortions({ meals: choc, lockedMealIndexes: [], target: { kcal: 300, p: 40, c: 20, g: 5 } });
    expect(r.ok).toBe(false);
    expect(r.suggestions.join(' ')).toMatch(/Chocolate/);
  });
});

describe('sanidade do ciclo de carbo', () => {
  it('bloqueia gordura absurda', () => {
    expect(carbDayTargetSanityIssues({ kcal: 3203, p: 176, c: 132, g: 219 }, 88, 3310).join()).toMatch(/Gordura/);
  });
});
