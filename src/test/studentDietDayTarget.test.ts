import { describe, it, expect } from 'vitest';
import { resolveStudentDayTarget } from '@/lib/studentDietDayTarget';

const meals = { kcal: 2452, p: 207, c: 258, g: 67 };

describe('resolveStudentDayTarget', () => {
  it('usa conteudo_json.targets (2452), nunca GET × estratégia (3313)', () => {
    const t = resolveStudentDayTarget({
      publishedTargets: { kcal: 2452, p: 207, c: 258, g: 67, get: 3683 } as any,
      mealsTotal: { kcal: 3313, p: 279, c: 347, g: 89 },
    });
    expect(t).toEqual({ kcal: 2452, p: 207, c: 258, g: 67 });
  });
  it('meta por dia publicada vence a meta geral', () => {
    expect(resolveStudentDayTarget({ dayTarget: { kcal: 2200, p: 207, c: 200, g: 67 }, publishedTargets: meals, mealsTotal: meals }).kcal).toBe(2200);
  });
  it('sem metas publicadas usa soma das refeições', () => {
    expect(resolveStudentDayTarget({ publishedTargets: null, mealsTotal: meals })).toEqual(meals);
  });
});
