import { describe, it, expect } from 'vitest';
import {
  SCALE_ONLY_UNREADABLE_MESSAGE, buildPlanWeighedItem, compareWeighedMeal, formatPlanWeighLine, nextPlanFoodIndex,
  planFoodToWeighFood, planProgressLabel, plannedFromMeal, resolveWeighFood, scaleOnlyHint, type WeighFood,
} from '@/lib/mealWeigh';

const meal = {
  name: 'Almoço', time: '12:30',
  foods: [
    { food: 'Arroz branco', qty: '150 g', kcal: '195', p: '4', c: '42', g: '0.4' },
    { food: 'Peito de frango grelhado', qty: '120 g', kcal: '198', p: '37.2', c: '0', g: '4.2' },
    { food: 'Ovo cozido', qty: '2 unidades', kcal: '155', p: '13', c: '1', g: '11' },
  ],
};
const planned = plannedFromMeal(meal);
const OVO: WeighFood = { id: 'f-ovo', name: 'Ovo cozido', calories: 155, protein: 13, carbs: 1.1, fats: 11, portion_size: 100 };
const FRANGO: WeighFood = { id: 'f-frango', name: 'Peito de frango grelhado', calories: 165, protein: 31, carbs: 0, fats: 3.5, portion_size: 100 };
const FOODS = [OVO, FRANGO];

describe('Pesar alimentos da dieta — macros pelo peso lido', () => {
  it('182 g de arroz do plano (150 g = 195 kcal, P 4, C 42, G 0,4) → 237 kcal, P 4,9, C 51, G 0,5', () => {
    const item = buildPlanWeighedItem(planned.alimentos[0], 0, 182, FOODS, { readGrams: 182 });
    expect(item).toMatchObject({ alimento: 'Arroz branco', gramas: 182, kcal: 237, p: 4.9, c: 51, g: 0.5, indice_plano: 0, editado_pelo_aluno: false });
    // Arroz não está na base: o item fica sem food_id, mas com os macros do plano.
    expect(item?.food_id).toBeNull();
  });

  it('pesar exatamente o previsto dá exatamente os macros previstos', () => {
    const item = buildPlanWeighedItem(planned.alimentos[1], 1, 120, FOODS, { readGrams: 120 });
    expect(item).toMatchObject({ kcal: 198, p: 37.2, c: 0, g: 4.2, food_id: 'f-frango' });
  });

  it('alimento do plano sem gramas usa a base com o mesmo nome (ovo 100 g = 155 kcal)', () => {
    expect(planFoodToWeighFood(planned.alimentos[2], FOODS)?.id).toBe('f-ovo');
    expect(buildPlanWeighedItem(planned.alimentos[2], 2, 100, FOODS)).toMatchObject({ alimento: 'Ovo cozido', kcal: 155, p: 13 });
    expect(buildPlanWeighedItem(planned.alimentos[2], 2, 100, [])).toBeNull();
  });

  it('gramas corrigidas pelo aluno ficam marcadas como editadas', () => {
    expect(buildPlanWeighedItem(planned.alimentos[0], 0, 170, FOODS, { readGrams: 182 })?.editado_pelo_aluno).toBe(true);
    expect(buildPlanWeighedItem(planned.alimentos[0], 0, 170, FOODS, { readGrams: null })?.editado_pelo_aluno).toBe(true);
  });
});

describe('Pesar alimentos da dieta — previsto × pesado', () => {
  it('"Arroz branco — pesou 182 g (previsto 150 g, +32 g)"', () => {
    expect(formatPlanWeighLine('Arroz branco', 182, planned.alimentos[0])).toBe('Arroz branco — pesou 182 g (previsto 150 g, +32 g)');
    expect(formatPlanWeighLine('Peito de frango grelhado', 100, planned.alimentos[1])).toBe('Peito de frango grelhado — pesou 100 g (previsto 120 g, −20 g)');
    expect(formatPlanWeighLine('Ovo cozido', 110, planned.alimentos[2])).toBe('Ovo cozido — pesou 110 g (previsto 2 unidades)');
  });

  it('resumo compara pelo alimento do plano e soma a diferença', () => {
    const items = [
      buildPlanWeighedItem(planned.alimentos[0], 0, 182, FOODS)!,
      buildPlanWeighedItem(planned.alimentos[1], 1, 100, FOODS)!,
    ];
    const cmp = compareWeighedMeal(planned, items);
    expect(cmp.alimentos.map((a) => [a.alimento, a.previstoGramas, a.pesadoGramas, a.diffGramas])).toEqual([
      ['Arroz branco', 150, 182, 32],
      ['Peito de frango grelhado', 120, 100, -20],
    ]);
    expect(cmp.consumido.kcal).toBe(237 + 165);
    expect(cmp.diff.kcal).toBe(237 + 165 - 548);
    expect(cmp.naoPesados.map((f) => f.alimento)).toEqual(['Ovo cozido']);
    expect(cmp.foraDoPlano).toEqual([]);
  });
});

describe('Pesar alimentos da dieta — fluxo', () => {
  it('textos da câmera e do visor ilegível', () => {
    expect(scaleOnlyHint('Arroz branco')).toBe('Coloca o Arroz branco na balança e enquadra o visor');
    expect(SCALE_ONLY_UNREADABLE_MESSAGE).toBe('Não consegui ler a balança, tira outra foto de frente pro visor');
  });
  it('progresso "2 de 5" e próximo alimento ainda não pesado na ordem', () => {
    expect(planProgressLabel(1, 5)).toBe('2 de 5');
    expect(nextPlanFoodIndex(0, 5, [0])).toBe(1);
    expect(nextPlanFoodIndex(1, 5, [0, 1, 2])).toBe(3);
    expect(nextPlanFoodIndex(4, 5, [0, 1, 2, 3, 4])).toBeNull();
  });
});

describe('Escanear prato — casa com o alimento do plano', () => {
  it('alimento identificado que está no plano usa o item do plano', () => {
    const r = resolveWeighFood({ alimento: 'Arroz branco cozido', alimento_alternativas: [], confianca_alimento: 0.9 }, FOODS, [], planned.alimentos);
    expect(r.planIndex).toBe(0);
    expect(r.food?.name).toBe('Arroz branco');
    expect(r.needsChoice).toBe(false);
  });
  it('fora do plano segue a base', () => {
    const r = resolveWeighFood({ alimento: 'Banana prata', alimento_alternativas: [], confianca_alimento: 0.9 }, FOODS, [], planned.alimentos);
    expect(r.planIndex).toBeNull();
    expect(r.food).toBeNull();
  });
});
