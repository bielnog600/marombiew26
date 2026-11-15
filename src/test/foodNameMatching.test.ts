// Casamento de nomes na pesagem/scanner: cor e preparo não casam alimentos sozinhos.
import { describe, expect, it } from 'vitest';
import {
  findRepeatedFood, foodNameSimilarity, matchPlanFood, matchWeighFood, pairItemsToPlan, plannedFromMeal, resolveWeighFood,
  type WeighFood, type WeighedItem,
} from '@/lib/mealWeigh';

const food = (id: string, name: string): WeighFood => ({ id, name, calories: 30, protein: 1, carbs: 6, fats: 0.2, portion_size: 100 } as WeighFood);
const UVA = food('f-uva', 'Uva verde');
const PIM_VERM = food('f-pv', 'Pimentão vermelho');
const PIMENTO = food('f-pim', 'Pimento (pimentão)');
const PIM_AMAR = food('f-pa', 'Pimentão amarelo');
const ARROZ = food('f-arroz', 'Arroz cozido');
const FRANGO = food('f-frango', 'Frango');
const FEIJAO = food('f-feijao', 'Feijão carioca cozido');
const FOODS = [UVA, PIM_VERM, PIMENTO, PIM_AMAR, ARROZ, FRANGO, FEIJAO];

const item = (alimento: string, extra: Partial<WeighedItem> = {}): WeighedItem => ({
  alimento, food_id: null, gramas: 100, kcal: 30, p: 1, c: 6, g: 0.2, foto_url: null, editado_pelo_aluno: false, indice_plano: null, ...extra,
});
const meal = (names: string[]) => plannedFromMeal({ name: 'Almoço', foods: names.map((n) => ({ food: n, qty: '100 g', kcal: '30', p: '1', c: '6', g: '0.2' })) } as any);

describe('casamento de nomes de alimentos', () => {
  it('"Pimentão verde" não casa com "Uva verde": a cor sozinha não basta', () => {
    expect(foodNameSimilarity('Pimentão verde', 'Uva verde')).toBe(0);
    expect(matchWeighFood('Pimentão verde', [UVA])).toBeNull();
    expect(matchPlanFood('Pimentão verde', meal(['Uva verde']).alimentos)).toBeNull();
    expect(pairItemsToPlan(meal(['Uva verde']), [item('Pimentão verde')]).size).toBe(0);
    expect(findRepeatedFood({ name: 'Pimentão verde' }, [item('Uva verde')])).toBeNull();
    // Preparo/estado também não: leite e iogurte desnatados são alimentos diferentes.
    expect(foodNameSimilarity('Leite desnatado', 'Iogurte desnatado')).toBe(0);
  });

  it('"Pimentão verde" casa com "Pimento (pimentão)" (sinônimo PT-PT)', () => {
    expect(matchWeighFood('Pimentão verde', FOODS)?.id).toBe('f-pim');
    expect(matchWeighFood('Pimento', [UVA, PIMENTO])?.id).toBe('f-pim');
    expect(foodNameSimilarity('Ananás', 'Abacaxi')).toBe(1);
    expect(foodNameSimilarity('Fiambre de peru', 'Presunto de peru')).toBe(1);
    expect(foodNameSimilarity('Natas', 'Creme de leite')).toBe(1);
  });

  it('sem alimento com o mesmo nome principal, ninguém é escolhido e as opções do mesmo alimento vêm primeiro', () => {
    const res = resolveWeighFood(
      { alimento: 'Pimentão verde', alimento_alternativas: ['Uva verde', 'Pimentão vermelho'], confianca_alimento: 0.9 },
      [UVA, PIM_VERM, PIM_AMAR].map((f, i) => (i === 0 ? f : { ...f, name: f.name.replace('Pimentão', 'Pimentão recheado assado com queijo') })),
    );
    expect(res.food).toBeNull();
    expect(res.needsChoice).toBe(true);
    expect(res.alternatives.map((a) => a.id)).toEqual(['f-pv', 'f-pa', 'f-uva']);
  });

  it('o que já funcionava continua: arroz, frango e feijão', () => {
    expect(matchWeighFood('Arroz branco cozido', FOODS)?.id).toBe('f-arroz');
    expect(matchWeighFood('Frango grelhado', FOODS)?.id).toBe('f-frango');
    expect(matchPlanFood('Frango grelhado', meal(['Arroz cozido', 'Peito de frango grelhado']).alimentos)).toBe(1);
    expect(matchWeighFood('Feijão carioca cozido', FOODS)?.id).toBe('f-feijao');
    expect(foodNameSimilarity('Feijão carioca', 'Feijão carioca cozido')).toBeCloseTo(0.8);
    expect(pairItemsToPlan(meal(['Arroz cozido', 'Feijão carioca cozido']), [item('Feijão carioca'), item('Arroz branco cozido')]))
      .toEqual(new Map([[0, 1], [1, 0]]));
  });
});
