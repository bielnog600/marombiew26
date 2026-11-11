import { describe, expect, it } from 'vitest';
import {
  REPEATED_FOOD_MESSAGE, buildScanWeighRequest, buildWeighedItem, findRepeatedFood, pendingPlanFoods,
  plannedFromMeal, resolveScanWeigh, visibleWeighObservation, weighedChipsLabel,
  type WeighFood,
} from '@/lib/mealWeigh';

const meal = {
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Iogurte natural', qty: '150 g', kcal: '90', p: '6', c: '7', g: '4.5' },
    { food: 'Whey protein', qty: '30 g', kcal: '120', p: '24', c: '3', g: '1.5' },
    { food: 'Chia', qty: '15 g', kcal: '73', p: '2.5', c: '6.3', g: '4.6' },
  ],
};
const planned = plannedFromMeal(meal as any);
const foods: WeighFood[] = [
  { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 4.7, fats: 3, portion_size: 100 },
  { id: 'f-whey', name: 'Whey protein', calories: 400, protein: 80, carbs: 10, fats: 5, portion_size: 100 },
  { id: 'f-chia', name: 'Chia', calories: 486, protein: 16.5, carbs: 42, fats: 30.7, portion_size: 100 },
  { id: 'f-linh', name: 'Linhaça', calories: 495, protein: 14, carbs: 43, fats: 32, portion_size: 100 },
];
const iogurte = buildWeighedItem(foods[0], 154, { planIndex: 0, aiName: 'Iogurte natural' });
const whey = buildWeighedItem(foods[1], 26, { planIndex: 1, aiName: 'Whey' });
const ai = (alimento: string, alts: string[] = []) => ({ alimento, alimento_alternativas: alts, confianca_alimento: 0.9 });

describe('Escanear prato — alimento repetido', () => {
  it('IA devolve um alimento já pesado: não aceita sozinho e pede a escolha', () => {
    const r = resolveScanWeigh(ai('Iogurte natural', ['Chia', 'Iogurte grego']), foods, planned, [iogurte, whey]);
    expect(r.food).toBeNull();
    expect(r.planIndex).toBeNull();
    expect(r.repeated?.alimento).toBe('Iogurte natural');
    expect(r.needsChoice).toBe(true);
    expect(r.pending.map((p) => p.food.alimento)).toEqual(['Chia']);
    expect(REPEATED_FOOD_MESSAGE).toBe('Esse alimento já foi pesado. O que você adicionou?');
  });

  it('repetido também pelo nome que a IA usou antes ou pelo mesmo id da base', () => {
    expect(findRepeatedFood({ name: 'Whey' }, [whey])).toBe(whey);
    expect(findRepeatedFood({ name: 'Proteína isolada', foodId: 'f-whey' }, [whey])).toBe(whey);
    expect(findRepeatedFood({ name: 'Chia' }, [iogurte, whey])).toBeNull();
  });

  it('alternativas da IA não repetem o que já foi pesado', () => {
    const r = resolveScanWeigh(ai('Iogurte natural', ['Whey protein', 'Linhaça']), foods, planned, [iogurte, whey]);
    expect(r.alternatives.map((a) => a.name)).toEqual(['Linhaça']);
  });

  it('primeiro item nunca é tratado como repetido', () => {
    const r = resolveScanWeigh(ai('Iogurte natural'), foods, planned, []);
    expect(r.repeated).toBeNull();
    expect(r.planIndex).toBe(0);
  });
});

describe('Escanear prato — candidatos não pesados priorizados', () => {
  it('lista só os previstos ainda não pesados, na ordem da refeição', () => {
    expect(pendingPlanFoods(planned, [iogurte]).map((p) => p.index)).toEqual([1, 2]);
    expect(pendingPlanFoods(planned, [iogurte, whey]).map((p) => p.food.alimento)).toEqual(['Chia']);
    // Item escolhido pela busca (sem índice do plano) com o mesmo nome também conta como pesado.
    const byName = buildWeighedItem(foods[2], 13);
    expect(pendingPlanFoods(planned, [byName]).map((p) => p.food.alimento)).toEqual(['Iogurte natural', 'Whey protein']);
  });

  it('nome compatível com um previsto não pesado casa com ele (macros do plano)', () => {
    const r = resolveScanWeigh(ai('Sementes de chia'), foods, planned, [iogurte, whey]);
    expect(r.planIndex).toBe(2);
    expect(r.food?.name).toBe('Chia');
    expect(r.repeated).toBeNull();
  });

  it('a chamada da IA leva os não pesados como candidatos', () => {
    const body = buildScanWeighRequest({ photo: 'p3', items: [iogurte, whey], photos: ['p1', 'p2'], mealName: 'Lanche', planned });
    expect(body.pendingPlanFoods).toEqual(['Chia']);
    expect(body.planFoods).toEqual(['Iogurte natural', 'Whey protein', 'Chia']);
  });
});

describe('Escanear prato — foto anterior sempre a partir do 2º item', () => {
  it('1º item sem foto anterior; depois sempre a última foto confirmada + itens pesados', () => {
    expect(buildScanWeighRequest({ photo: 'p1', items: [], photos: [], mealName: 'Lanche', planned }).previousImage).toBeNull();
    const second = buildScanWeighRequest({ photo: 'p2', items: [iogurte], photos: ['p1'], mealName: 'Lanche', planned });
    expect(second.previousImage).toBe('p1');
    expect(second.addedFoods).toEqual([{ alimento: 'Iogurte natural', gramas: 154 }]);
    const third = buildScanWeighRequest({ photo: 'p3', items: [iogurte, whey], photos: ['p1', 'p2'], mealName: 'Lanche', planned });
    expect(third.previousImage).toBe('p2');
  });

  it('chips do topo: "Iogurte natural 154 g · Whey protein 26 g"', () => {
    expect(weighedChipsLabel([iogurte, whey])).toBe('Iogurte natural 154 g · Whey protein 26 g');
  });
});

describe('Observação da IA sobre tara', () => {
  it('sem suspeita real, comentário de tara/tigela some', () => {
    expect(visibleWeighObservation('Há uma tigela na balança; confira a tara.', { tareSuspected: false })).toBe('');
    expect(visibleWeighObservation('Balança parece não ter sido zerada', { tareSuspected: false })).toBe('');
  });
  it('com suspeita (peso acima do acumulado) aparece; outras observações sempre aparecem', () => {
    expect(visibleWeighObservation('Balança parece não ter sido zerada', { tareSuspected: true })).toBe('Balança parece não ter sido zerada');
    expect(visibleWeighObservation('Reflexo no visor', { tareSuspected: false })).toBe('Reflexo no visor');
  });
});
