import { describe, it, expect } from 'vitest';
import { groupScans, productKey, mapGroupToFood, findDuplicates } from '@/lib/foodScanReview';

const base = { image_url: null, score: 60, score_label: 'Bom', nutriments: {}, aluno_id: 'a1', created_at: '2026-10-01T00:00:00Z' };

describe('foodScanReview', () => {
  it('agrupa por barcode e, sem barcode, por nome + marca', () => {
    const g = groupScans([
      { ...base, id: '1', barcode: '789', product_name: 'Atum', brand: 'X' },
      { ...base, id: '2', barcode: '789', product_name: 'Atum', brand: 'X', aluno_id: 'a2', created_at: '2026-10-02T00:00:00Z' },
      { ...base, id: '3', barcode: null, product_name: 'Pão Integral', brand: 'Y' },
      { ...base, id: '4', barcode: null, product_name: 'pao integral', brand: 'y' },
    ]);
    expect(g).toHaveLength(2);
    const atum = g.find((x) => x.key === 'bc:789')!;
    expect(atum.count).toBe(2);
    expect(atum.alunoIds).toEqual(['a2', 'a1']);
    expect(atum.lastScanAt).toBe('2026-10-02T00:00:00Z');
    expect(productKey({ barcode: null, product_name: 'Pão Integral', brand: 'Y' })).toBe('nm:pao integral|y');
  });

  it('mapeia macros por 100 g para foods', () => {
    const [g] = groupScans([{ ...base, id: '1', barcode: '1', product_name: 'Iogurte', brand: 'Z',
      nutriments: { 'energy-kcal_100g': 94, proteins_100g: 3.4, carbohydrates_100g: 4.4, fat_100g: 7.5 } }]);
    expect(mapGroupToFood(g)).toMatchObject({ portion_size: 100, calories: 94, protein: 3.4, carbs: 4.4, fats: 7.5, barcode: '1', brand: 'Z' });
  });

  it('detecta duplicado por barcode ou nome muito parecido', () => {
    const foods = [
      { id: 'f1', name: 'Atum ao natural', brand: null, barcode: null },
      { id: 'f2', name: 'Arroz', brand: null, barcode: '555' },
    ];
    expect(findDuplicates({ name: 'Atum ao Natural', barcode: null }, foods).map((f) => f.id)).toEqual(['f1']);
    expect(findDuplicates({ name: 'Outro', barcode: '555' }, foods).map((f) => f.id)).toEqual(['f2']);
    expect(findDuplicates({ name: 'Feijão', barcode: null }, foods)).toEqual([]);
  });
});
