import { describe, expect, it } from 'vitest';
import {
  bestProteinPortion,
  buildProteinCombinations,
  buildSmartSubstitutionCandidates,
  formatSubstitutionQuantity,
  isProteinEquivalent,
  isProteinSource,
  macrosForFoodQty,
  substitutionWarnings,
  type FoodUnitWeight,
} from '@/lib/canonicalFoodSubstitution';
import { buildFoodIndex, type FoodRecord } from '@/lib/nutritionEngine';
import { replaceWeighedItemWithCombination } from '@/lib/mealWeigh/editItems';
import type { WeighedItem } from '@/lib/mealWeigh';

const food = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number): FoodRecord => ({
  id, name, calories, protein, carbs, fats, portion: '100 g', portion_size: 100,
});

const FRANGO = food('frango', 'Peito de frango grelhado', 159, 32, 0, 2.5);
const OVO = food('ovo', 'Ovo inteiro cozido', 155, 13, 1.1, 11);
const CLARA = food('clara', 'Clara de ovo', 52, 10.9, 0.7, 0.2);
const PERU = food('peru', 'Peito de peru assado', 135, 30, 0, 1);
const ATUM = food('atum', 'Atum em água', 104, 25, 0, 0.5);
const ARROZ = food('arroz', 'Arroz branco cozido', 130, 2.5, 28, 0.2);
const BATATA = food('batata', 'Batata inglesa cozida', 87, 2, 20, 0.1);
const WHEY = food('whey', 'Whey Protein Concentrado', 400, 75, 10, 6);
const FOODS = [FRANGO, OVO, CLARA, PERU, ATUM, ARROZ, BATATA, WHEY];
const INDEX = buildFoodIndex(FOODS);
const TARGET = macrosForFoodQty(FRANGO.id, 100, INDEX);

describe('troca inteligente de fonte de proteína', () => {
  it('detecta proteína pelas kcal ou pela categoria/nome, sem classificar arroz como proteína', () => {
    expect(isProteinSource(FRANGO.name, TARGET)).toBe(true);
    expect(isProteinSource(OVO.name, macrosForFoodQty(OVO.id, 100, INDEX))).toBe(true);
    expect(isProteinSource('Suplemento proteico', { kcal: 100, p: 25, c: 0, g: 0 })).toBe(true);
    expect(isProteinSource(ARROZ.name, macrosForFoodQty(ARROZ.id, 100, INDEX))).toBe(false);
  });

  it('frango 100 g → ovo: mesma proteína é limitada por kcal +10% e mostra a P faltante', () => {
    const option = bestProteinPortion(OVO, TARGET, INDEX)!;
    expect(option.qtyGrams).toBe(100); // 2 ovos: o terceiro passaria do teto de 174,9 kcal
    expect(option.macros.kcal).toBeLessThanOrEqual(TARGET.kcal * 1.1);
    expect(option.macros.p).toBeCloseTo(13, 5);
    expect(option.proteinLimitedByCalories).toBe(true);
    expect(option.proteinShortfall).toBeCloseTo(19, 5);
    expect(option.level).toBe('different');
    expect(formatSubstitutionQuantity(OVO, option.qtyGrams)).toBe('2 ovos (100 g)');
  });

  it('combo ovo + claras é calculado no motor e fica próximo dos 32 g de proteína', () => {
    const combos = buildProteinCombinations(FOODS, TARGET, INDEX);
    const combo = combos.find((c) => c.items.some((i) => i.food.id === OVO.id) && c.items.some((i) => i.food.id === CLARA.id));
    expect(combo).toBeDefined();
    expect(combo!.macros.p).toBeGreaterThanOrEqual(28);
    expect(combo!.macros.p).toBeLessThanOrEqual(36);
    expect(combo!.items).toHaveLength(2);
    expect(combo!.macros.kcal).toBeCloseTo(
      combo!.items.reduce((sum, item) => sum + macrosForFoodQty(item.food.id, item.qtyGrams, INDEX).kcal, 0), 5,
    );
  });

  it('frango → peito de peru e atum ficam Equivalentes pela regra P ±4 g / kcal ±10%', () => {
    for (const substitute of [PERU, ATUM]) {
      const option = bestProteinPortion(substitute, TARGET, INDEX)!;
      expect(Math.abs(option.diff.p)).toBeLessThanOrEqual(4);
      expect(Math.abs(option.diff.kcal)).toBeLessThanOrEqual(TARGET.kcal * 0.1);
      expect(option.level).toBe('equivalent');
      expect(isProteinEquivalent(option.macros, TARGET)).toBe(true);
    }
  });

  it('para original proteico, o ranking usa a opção Mesma proteína e mantém as duas escolhas', () => {
    const result = buildSmartSubstitutionCandidates(FOODS, TARGET, FRANGO.name, INDEX);
    expect(result.proteinSource).toBe(true);
    const egg = result.candidates.find((c) => c.food.id === OVO.id)!;
    expect(egg.sameProtein).not.toBeNull();
    expect(egg.sameCalories.qtyGrams).toBe(100);
    const eggIndex = result.candidates.findIndex((c) => c.food.id === OVO.id);
    const riceIndex = result.candidates.findIndex((c) => c.food.id === ARROZ.id);
    expect(eggIndex).toBeLessThan(riceIndex);
  });

  it('arroz → batata continua pela regra antiga de calorias, sem opção proteica', () => {
    const rice = macrosForFoodQty(ARROZ.id, 100, INDEX);
    const result = buildSmartSubstitutionCandidates(FOODS, rice, ARROZ.name, INDEX);
    const potato = result.candidates.find((c) => c.food.id === BATATA.id)!;
    expect(result.proteinSource).toBe(false);
    expect(potato.sameProtein).toBeNull();
    expect(potato.sameCalories.qtyGrams).toBe(150);
    expect(potato.sameCalories.macros.kcal).toBeCloseTo(130.5, 5);
  });

  it('avisa claramente perda >8 g de proteína e aumento >10% de kcal, sem bloquear', () => {
    const lowProtein = macrosForFoodQty(OVO.id, 100, INDEX);
    expect(substitutionWarnings(lowProtein, TARGET)).toEqual(['Essa troca tira 19 g de proteína da refeição.']);
    expect(substitutionWarnings({ kcal: 190, p: 32, c: 0, g: 3 }, TARGET)).toEqual(['Essa troca aumenta as calorias em 19%.']);
    expect(substitutionWarnings(macrosForFoodQty(PERU.id, 105, INDEX), TARGET)).toEqual([]);
  });

  it('usa food_unit_weights e fallback de 33 g para mostrar unidades de ovo e clara', () => {
    expect(formatSubstitutionQuantity(CLARA, 165)).toBe('5 claras (165 g)');
    const weights: FoodUnitWeight[] = [
      { food_id: OVO.id, tamanho: 'pequeno', gramas: 45 },
      { food_id: OVO.id, tamanho: 'medio', gramas: 55 },
      { food_id: OVO.id, tamanho: 'grande', gramas: 60 },
    ];
    expect(formatSubstitutionQuantity(OVO, 110, weights)).toBe('2 ovos (110 g)');
  });

  it('scanner: o combo grava dois itens, ambos "no lugar de Frango", e preserva as demais fotos', () => {
    const combo = buildProteinCombinations(FOODS, TARGET, INDEX).find((c) => c.items.some((i) => i.food.id === CLARA.id))!;
    const scanned: WeighedItem = {
      alimento: OVO.name, food_id: OVO.id, gramas: 100, kcal: 155, p: 13, c: 1.1, g: 11,
      foto_url: null, editado_pelo_aluno: false, origem: 'escaneado', indice_plano: null,
    };
    const result = replaceWeighedItemWithCombination(
      [scanned], ['foto-original'], 0,
      combo.items.map((item) => ({ food: item.food, grams: item.qtyGrams, planIndex: null })),
      { indice_plano: 2, alimento: FRANGO.name },
    );
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.alimento)).toEqual([OVO.name, CLARA.name]);
    expect(result.items.every((item) => item.substituiu?.alimento === FRANGO.name && item.substituiu.indice_plano === 2)).toBe(true);
    expect(result.photos).toEqual(['foto-original', '']);
  });
});
