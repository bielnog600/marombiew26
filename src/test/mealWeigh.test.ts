import { describe, it, expect } from 'vitest';
import {
  NOT_TARED_MESSAGE, UNREADABLE_MESSAGE,
  buildWeighedItem, canWeighMeals, checkTare, compareWeighedMeal, fitWithin, formatFoodComparison,
  isReadingUnreliable, macrosForGrams, matchWeighFood, parsePlanGrams, plannedFromMeal, resolveWeighFood,
  sumWeighedItems, type WeighFood,
} from '@/lib/mealWeigh';

const ARROZ: WeighFood = { id: 'f-arroz', name: 'Arroz branco cozido', calories: 130, protein: 2.69, carbs: 28.17, fats: 0.28, portion_size: 100 };
const ARROZ_INT: WeighFood = { id: 'f-int', name: 'Arroz integral', calories: 124, protein: 2.74, carbs: 25.83, fats: 0.97, portion_size: 100 };
const FRANGO: WeighFood = { id: 'f-frango', name: 'Peito de frango grelhado', calories: 165, protein: 31, carbs: 0, fats: 3.6, portion_size: 100 };
const FEIJAO: WeighFood = { id: 'f-feijao', name: 'Feijão carioca cozido', calories: 76, protein: 4.8, carbs: 13.6, fats: 0.5, portion_size: 100 };
const OVO: WeighFood = { id: 'f-ovo', name: 'Ovo cozido', calories: 155, protein: 13, carbs: 1.1, fats: 11, portion_size: 50 };
const FOODS = [ARROZ, ARROZ_INT, FRANGO, FEIJAO, OVO];

describe('Pesar refeição — macros por grama', () => {
  it('180 g de arroz branco cozido (130 kcal/100 g) = 234 kcal, P 4,8, C 50,7, G 0,5', () => {
    const item = buildWeighedItem(ARROZ, 180);
    expect(item).toMatchObject({ alimento: 'Arroz branco cozido', food_id: 'f-arroz', gramas: 180, kcal: 234, p: 4.8, c: 50.7, g: 0.5 });
  });

  it('respeita a porção cadastrada (ovo: valores por 50 g → 100 g dobra)', () => {
    expect(macrosForGrams(OVO, 100)).toEqual({ kcal: 310, p: 26, c: 2.2, g: 22 });
  });

  it('0 g ou gramas inválidas dão zero', () => {
    expect(buildWeighedItem(FRANGO, 0)).toMatchObject({ gramas: 0, kcal: 0, p: 0, c: 0, g: 0 });
    expect(buildWeighedItem(FRANGO, Number.NaN)).toMatchObject({ gramas: 0, kcal: 0 });
  });

  it('marca editado_pelo_aluno e soma os itens', () => {
    const a = buildWeighedItem(ARROZ, 150, { edited: true });
    const b = buildWeighedItem(FRANGO, 120);
    expect(a.editado_pelo_aluno).toBe(true);
    expect(b.editado_pelo_aluno).toBe(false);
    expect(sumWeighedItems([a, b])).toEqual({ kcal: 195 + 198, p: 4 + 37.2, c: 42.3, g: 0.4 + 4.3, gramas: 270 });
  });
});

describe('Pesar refeição — casar com a base', () => {
  it('nome igual (sem acento/caixa) casa direto', () => {
    expect(matchWeighFood('feijao carioca cozido', FOODS)?.id).toBe('f-feijao');
  });
  it('nome parecido prefere o alimento do plano da refeição', () => {
    expect(matchWeighFood('Arroz cozido', FOODS, ['Arroz branco cozido'])?.id).toBe('f-arroz');
    expect(matchWeighFood('Frango grelhado', FOODS)?.id).toBe('f-frango');
  });
  it('sem correspondência: escolha pelas 3 alternativas da IA', () => {
    const r = resolveWeighFood(
      { alimento: 'Lasanha', alimento_alternativas: ['Arroz integral', 'Peito de frango grelhado', 'Pizza'], confianca_alimento: 0.9 },
      FOODS,
    );
    expect(r.food).toBeNull();
    expect(r.needsChoice).toBe(true);
    expect(r.alternatives.map((f) => f.id)).toEqual(['f-int', 'f-frango']);
    expect(r.unmatchedNames).toEqual(['Pizza']);
  });
  it('alimento achado mas com confiança baixa também mostra alternativas', () => {
    const r = resolveWeighFood({ alimento: 'Arroz branco cozido', alimento_alternativas: ['Arroz integral'], confianca_alimento: 0.3 }, FOODS);
    expect(r.food?.id).toBe('f-arroz');
    expect(r.needsChoice).toBe(true);
  });
});

describe('Pesar refeição — leitura do visor', () => {
  it('visor ilegível, sem número ou com confiança baixa pede outra foto', () => {
    expect(UNREADABLE_MESSAGE).toBe('Não consegui ler a balança, tira outra foto mais de frente para o visor');
    expect(isReadingUnreliable({ visor_legivel: false, gramas_lidas: 150, confianca_leitura: 0.9 })).toBe(true);
    expect(isReadingUnreliable({ visor_legivel: true, gramas_lidas: null, confianca_leitura: 0.9 })).toBe(true);
    expect(isReadingUnreliable({ visor_legivel: true, gramas_lidas: 150, confianca_leitura: 0.4 })).toBe(true);
    expect(isReadingUnreliable({ visor_legivel: true, gramas_lidas: 150, confianca_leitura: 0.5 })).toBe(false);
  });
});

describe('Pesar refeição — balança não zerada', () => {
  it('peso lido maior que o acumulado avisa e sugere descontar', () => {
    expect(NOT_TARED_MESSAGE).toBe('Parece que a balança não foi zerada');
    // 150 g de arroz já pesados; visor mostra 330 g → sem tara seriam 180 g do novo item.
    expect(checkTare(330, 150)).toEqual({ notTared: true, suggestedGrams: 180 });
  });
  it('peso lido menor ou igual ao acumulado não avisa', () => {
    expect(checkTare(120, 150)).toEqual({ notTared: false, suggestedGrams: null });
    expect(checkTare(150, 150)).toEqual({ notTared: false, suggestedGrams: null });
  });
  it('primeiro item (nada acumulado) nunca avisa', () => {
    expect(checkTare(500, 0).notTared).toBe(false);
  });
});

describe('Pesar refeição — previsto × consumido', () => {
  const meal = {
    name: 'Almoço', time: '12:30',
    foods: [
      { food: 'Arroz branco cozido', qty: '150 g', kcal: '195', p: '4', c: '42.3', g: '0.4' },
      { food: 'Peito de frango grelhado', qty: '120g', kcal: '198', p: '37.2', c: '0', g: '4.3' },
      { food: 'Salada verde', qty: 'à vontade', kcal: '10', p: '1', c: '2', g: '0' },
    ],
  };

  it('lê gramas da quantidade do plano', () => {
    expect(parsePlanGrams('150 g')).toBe(150);
    expect(parsePlanGrams('1 unidade (50g)')).toBe(50);
    expect(parsePlanGrams('0,2 kg')).toBe(200);
    expect(parsePlanGrams('à vontade')).toBeNull();
  });

  it('previsto soma os alimentos da refeição', () => {
    expect(plannedFromMeal(meal)).toMatchObject({ nome: 'Almoço', horario: '12:30', kcal: 403, p: 42.2, c: 44.3, g: 4.7 });
  });

  it('compara totais e alimentos: "Arroz branco cozido: previsto 150 g, pesou 180 g"', () => {
    const items = [buildWeighedItem(ARROZ, 180), buildWeighedItem(FRANGO, 100), buildWeighedItem(FEIJAO, 80)];
    const cmp = compareWeighedMeal(plannedFromMeal(meal), items);
    expect(cmp.previsto).toEqual({ kcal: 403, p: 42.2, c: 44.3, g: 4.7 });
    expect(cmp.consumido).toEqual({ kcal: 460, p: 39.6, c: 61.6, g: 4.5 });
    expect(cmp.diff.kcal).toBe(460 - 403);
    expect(cmp.alimentos.map(formatFoodComparison)).toEqual([
      'Arroz branco cozido: previsto 150 g, pesou 180 g',
      'Peito de frango grelhado: previsto 120 g, pesou 100 g',
    ]);
    expect(cmp.alimentos[0].diffGramas).toBe(30);
    expect(cmp.foraDoPlano.map((i) => i.alimento)).toEqual(['Feijão carioca cozido']);
    expect(cmp.naoPesados.map((f) => f.alimento)).toEqual(['Salada verde']);
  });

  it('dois itens do mesmo alimento somam as gramas', () => {
    const cmp = compareWeighedMeal(plannedFromMeal(meal), [buildWeighedItem(ARROZ, 100), buildWeighedItem(ARROZ, 60)]);
    expect(cmp.alimentos).toEqual([expect.objectContaining({ alimento: 'Arroz branco cozido', pesadoGramas: 160, diffGramas: 10 })]);
    expect(cmp.foraDoPlano).toEqual([]);
  });
});

describe('Pesar refeição — permissão premium', () => {
  it('só premium_scale === true libera', () => {
    expect(canWeighMeals({ premium_scale: true })).toBe(true);
    expect(canWeighMeals({ premium_scale: false })).toBe(false);
    expect(canWeighMeals({ premium_scale: null })).toBe(false);
    expect(canWeighMeals({})).toBe(false);
    expect(canWeighMeals(null)).toBe(false);
  });
});

describe('Pesar refeição — compressão', () => {
  it('lado maior até 1280 px, sem ampliar', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
