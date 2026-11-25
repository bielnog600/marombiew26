import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FoodRecord } from '@/lib/nutritionEngine';
import { buildFoodIndex } from '@/lib/nutritionEngine';
import { macrosForFoodQty } from '@/lib/canonicalFoodSubstitution';
import CanonicalFoodSubstitutionDialog from '@/components/diet/CanonicalFoodSubstitutionDialog';
import FoodSubstitutionDialog from '@/components/diet/FoodSubstitutionDialog';
import MealOptionPanel from '@/components/diet/MealOptionPanel';

const food = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number): FoodRecord => ({
  id, name, calories, protein, carbs, fats, portion: '100 g', portion_size: 100,
});
const FRANGO = food('frango', 'Peito de frango grelhado', 159, 32, 0, 2.5);
const OVO = food('ovo', 'Ovo inteiro cozido', 155, 13, 1.1, 11);
// Neste cenário a clara sozinha passa do teto calórico: o combo deve aparecer.
const CLARA = food('clara', 'Clara de ovo', 100, 10.9, 0.7, 0.2);
const FOODS = [FRANGO, OVO, CLARA];
const INDEX = buildFoodIndex(FOODS);
const TARGET = macrosForFoodQty(FRANGO.id, 100, INDEX);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'food_unit_weights') return { select: async () => ({ data: [], error: null }) };
      if (table === 'foods') return { select: () => ({ order: async () => ({ data: FOODS, error: null }) }) };
      throw new Error(`Tabela inesperada: ${table}`);
    },
  },
}));

const renderWithQuery = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

afterEach(cleanup);

describe('diálogo de troca proteica', () => {
  it('mostra Mesma proteína destacada, unidades, aviso e o limite de calorias', async () => {
    const onSelect = vi.fn();
    renderWithQuery(<CanonicalFoodSubstitutionDialog
      open onOpenChange={() => {}} foods={FOODS} currentName={FRANGO.name} currentQtyGrams={100}
      currentMacros={TARGET} onSelect={onSelect} onSelectCombination={() => {}}
    />);
    const egg = await screen.findByTestId('substitution-option-ovo-protein');
    expect(egg).toHaveTextContent('2 ovos (100 g)');
    expect(egg).toHaveClass('min-h-[60px]');
    expect(egg).not.toHaveTextContent('Refeição depois');
    fireEvent.click(egg);
    expect(egg).toHaveAttribute('aria-pressed', 'true');
    expect(egg.className).toContain('border-primary');
    const summary = screen.getByTestId('selected-substitution-summary');
    expect(summary).toHaveTextContent('−19 g P por causa do limite de calorias');
    expect(summary).toHaveTextContent('Essa troca tira 19 g de proteína da refeição.');
    fireEvent.click(screen.getByTestId('confirm-substitution'));
    expect(onSelect).toHaveBeenCalledWith(OVO, 100);
  });

  it('aluno: escolher ovo + claras devolve os dois ParsedFood para substituir o original', async () => {
    const onSubstitute = vi.fn();
    renderWithQuery(<FoodSubstitutionDialog
      open onOpenChange={() => {}}
      originalFood={{ food: FRANGO.name, qty: '100 g', kcal: '159', p: '32', c: '0', g: '2,5' }}
      onSubstitute={onSubstitute}
    />);
    const section = await screen.findByTestId('protein-substitution-combinations');
    const combo = within(section).getByTestId('substitution-combo-ovo-clara');
    expect(combo).toHaveTextContent('1 ovo + 6 claras');
    expect(combo).toHaveTextContent('50 g + 198 g');
    fireEvent.click(combo);
    fireEvent.click(screen.getByTestId('confirm-substitution'));
    const replacements = onSubstitute.mock.calls[0][0];
    expect(Array.isArray(replacements)).toBe(true);
    expect(replacements.map((f: any) => f.food)).toEqual([OVO.name, CLARA.name]);
    expect(replacements.reduce((sum: number, f: any) => sum + Number(f.p), 0)).toBeGreaterThanOrEqual(28);
    expect(replacements.every((f: any) => / g$/.test(f.qty))).toBe(true);
  });

  it('admin: o combo entra como dois itens na opção de refeição, no lugar de um', async () => {
    const onChange = vi.fn();
    renderWithQuery(<MealOptionPanel
      option={{ source: 'plan', name: 'Opção 1', items: [{ foodId: FRANGO.id, name: FRANGO.name, qtyGrams: 100, macros: TARGET }] }}
      optionNumber={1} planKcal={159} foods={FOODS} index={INDEX} onChange={onChange} onSwap={() => {}}
    />);
    fireEvent.click(screen.getByRole('button', { name: `Substituir ${FRANGO.name}` }));
    const section = await screen.findByTestId('protein-substitution-combinations');
    fireEvent.click(within(section).getByTestId('substitution-combo-ovo-clara'));
    fireEvent.click(screen.getByTestId('confirm-substitution'));
    const next = onChange.mock.calls[0][0];
    expect(next.items).toHaveLength(2);
    expect(next.items.map((item: any) => item.foodId)).toEqual([OVO.id, CLARA.id]);
    expect(next.items.every((item: any) => item.qtyGrams > 0)).toBe(true);
  });

  it('alterna Mesma proteína/Mesmas calorias em toda a lista e mostra o impacto só no rodapé', async () => {
    const ISOLADA = food('isolada', 'Proteína isolada', 100, 40, 0, 0);
    renderWithQuery(<CanonicalFoodSubstitutionDialog
      open onOpenChange={() => {}} foods={[...FOODS, ISOLADA]} currentFoodId={FRANGO.id} currentName={FRANGO.name} currentQtyGrams={100}
      currentMacros={TARGET} mealTotals={{ kcal: 500, p: 50, c: 40, g: 20 }}
      onSelect={() => {}} onSelectCombination={() => {}}
    />);
    const protein = await screen.findByTestId('substitution-option-isolada-protein');
    expect(protein).toHaveTextContent('80 g');
    expect(screen.getByTestId('substitution-option-clara-protein')).toHaveTextContent('5 claras (165 g)');
    expect(screen.queryByTestId('substitution-food-frango')).not.toBeInTheDocument();
    expect(screen.getByTestId('substitution-close')).toHaveClass('h-11', 'w-11', 'min-h-11', 'min-w-11');
    fireEvent.click(screen.getByTestId('substitution-mode-calories'));
    const calories = screen.getByTestId('substitution-option-isolada-calories');
    expect(calories).toHaveTextContent('160 g');
    fireEvent.click(calories);
    expect(screen.getByTestId('selected-substitution-summary')).toHaveTextContent('Refeição depois:');
    expect(screen.getByTestId('substitution-footer')).toHaveTextContent('Trocar por Proteína isolada');
  });
});
