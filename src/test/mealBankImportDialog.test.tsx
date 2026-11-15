import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as XLSX from 'xlsx';
import type { FoodRecord } from '@/lib/nutritionEngine';
import type { BankMeal } from '@/lib/mealBank';
import { buildBankExportSheets } from '@/lib/mealBank/spreadsheet';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import MealBankImportDialog from '@/components/mealBank/MealBankImportDialog';

const food = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number): FoodRecord =>
  ({ id, name, calories, protein, carbs, fats, portion_size: 100, portion: 'gramas' }) as FoodRecord;
const FOODS = [
  food('f-ovo', 'Ovo', 143, 13, 1, 10),
  food('f-pao', 'Pão francês', 290, 9, 58, 3),
  food('f-batata', 'Batata-doce cozida', 77, 0.6, 18, 0.1),
  food('f-atum', 'Atum em água', 104, 24, 0, 1),
];
const BANK: BankMeal[] = [
  { id: 'm1', code: 'CM01', slot: 'cafe_manha', name: 'Pão com ovo', origin: 'BR', tags: [], prep: null, active: true,
    items: [{ foodId: 'f-pao', grams: 50, ordem: 0 }, { foodId: 'f-ovo', grams: 100, ordem: 1 }] },
  { id: 'm2', code: 'CM02', slot: 'cafe_manha', name: 'Ovos', origin: 'BR', tags: [], prep: null, active: true,
    items: [{ foodId: 'f-ovo', grams: 150, ordem: 0 }] },
];

const editedFile = () => {
  const sheets = buildBankExportSheets(BANK, FOODS);
  sheets[0].rows[1][2] = 'Pão com ovo mexido';
  sheets[0].rows.push(['', 'Jantar', 'Atum com batata-doce', 'PT', 'peixe', 'Atum ao natural 120g; Batata-doce cozida 200g; Farinha de aveia 30g', 0, 0, 0, 0, 'Cozer a batata.']);
  sheets[2].rows.push(['Farinha de aveia', 390, 14, 66, 8]);
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows as unknown[][]), s.name);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File([buf], 'banco.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!(file as any).arrayBuffer) (file as any).arrayBuffer = () => Promise.resolve(buf);
  return file;
};

describe('Importar planilha — pré-visualização', () => {
  beforeEach(() => rpc.mockReset());

  it('liga "Atum ao natural" sozinho, cria o alimento novo da aba Alimentos e grava tudo de uma vez ao confirmar', async () => {
    rpc.mockResolvedValue({ data: { novas: 1, atualizadas: 1, alimentos_criados: 0, desativadas: 0 }, error: null });
    const onImported = vi.fn();
    render(<MealBankImportDialog open onOpenChange={() => {}} bank={BANK} foods={FOODS} onImported={onImported} />);

    fireEvent.change(screen.getByTestId('import-file'), { target: { files: [editedFile()] } });
    await screen.findByTestId('import-counts');
    expect(screen.getByTestId('import-counts').textContent).toContain('1 novas');
    expect(screen.getByTestId('import-counts').textContent).toContain('1 atualizadas');
    expect(screen.getByTestId('import-counts').textContent).toContain('1 sem mudança');

    const confirm = screen.getByTestId('import-confirm');
    expect(confirm).not.toBeDisabled();
    expect(confirm.textContent).toContain('Importar 2 refeições');

    const linked = screen.getByTestId('linked-foods');
    expect(linked.textContent).toContain('Ligados automaticamente (1)');
    expect(linked.textContent).toContain('"Atum ao natural" → Atum em água');
    const created = screen.getByTestId('new-foods');
    expect(created.textContent).toContain('Novos alimentos (1)');
    expect(created.textContent).toContain('Farinha de aveia');
    expect(created.textContent).toContain('390 kcal');
    // 120 g atum (125) + 200 g batata-doce (154) + 30 g farinha de aveia (117)
    expect(screen.getByTestId('import-meal-JA01').textContent).toContain('396 kcal');

    fireEvent.click(confirm);
    await screen.findByTestId('import-result');
    expect(screen.getByTestId('import-result').textContent).toContain('1 nova, 1 atualizada');
    expect(onImported).toHaveBeenCalled();
    const [fn, args] = rpc.mock.calls[0] as [string, any];
    expect(fn).toBe('import_meal_bank');
    expect(args._aliases).toEqual([{ alias: 'atum ao natural', food_id: 'f-atum' }]);
    expect(args._deactivate_codes).toEqual([]);
    expect(args._meals.map((m: any) => m.code)).toEqual(['CM01', 'JA01']);
    expect(args._foods).toEqual([{ temp_id: 'novo:farinha aveia', name: 'Farinha de aveia', kcal: 390, p: 14, c: 66, g: 8 }]);
    expect(args._meals[1].items).toEqual([{ food_id: 'f-atum', grams: 120 }, { food_id: 'f-batata', grams: 200 }, { food_id: 'novo:farinha aveia', grams: 30 }]);
  });
});
