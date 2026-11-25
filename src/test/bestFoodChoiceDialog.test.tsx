import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CanonicalFoodSubstitutionDialog from '@/components/diet/CanonicalFoodSubstitutionDialog';
import type { FoodRecord } from '@/lib/nutritionEngine';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn((table: string) => table === 'students_profile'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { objetivo: 'Definição' }, error: null }) }) }) }
    : { select: vi.fn().mockResolvedValue({ data: [], error: null }) }) },
}));

const food = (id: string, name: string, kcal: number, p: number, c: number): FoodRecord => ({
  id, name, categoria: 'massa', calories: kcal, protein: p, carbs: c, fats: 1, portion_size: 100,
});
const FOODS = [
  food('original', 'Massa cozida', 158, 5.8, 30.9),
  food('milaneza', 'Massa de ovo Milaneza (cozida)', 146, 5.6, 27.6),
  food('integral', 'Macarrão integral cozido', 124, 5.3, 26.5),
  food('drelli', 'Massa High Protein Drelli (cozida)', 138, 11.6, 17.6),
  { ...food('frango', 'Frango grelhado', 165, 31, 0), categoria: 'carne_branca' },
];
const YOGURT_FOODS: FoodRecord[] = [
  { id: 'greek', name: 'Iogurte grego natural', calories: 106, protein: 3.8, carbs: 4.2, fats: 8.2, categoria: 'laticinio' },
  { id: 'skyr', name: 'Skyr natural', calories: 59, protein: 10, carbs: 4, fats: 0.2, categoria: 'laticinio' },
  { id: 'peanut', name: 'Amendoim torrado', calories: 600, protein: 26, carbs: 20, fats: 48, categoria: 'gordura_boa' },
  { id: 'cream', name: 'Creme de leite light', calories: 160, protein: 3, carbs: 4, fats: 15, categoria: 'laticinio' },
];

describe('Melhor para você no diálogo compartilhado', () => {
  it('lê o objetivo do perfil e mantém oleaginosas/creme fora dos substitutos principais', async () => {
    render(<CanonicalFoodSubstitutionDialog open onOpenChange={() => {}} foods={YOGURT_FOODS}
      currentFoodId="greek" currentName="Iogurte grego natural" currentQtyGrams={170}
      currentMacros={{ kcal: 180.2, p: 6.46, c: 7.14, g: 13.94 }} studentId="student-test"
      onSelect={() => {}} onSelectCombination={() => {}} />);
    expect(await screen.findByTestId('best-food-skyr')).toHaveTextContent('Mais proteína');
    const primary = screen.getByTestId('primary-substitutes');
    expect(within(primary).getByTestId('substitution-food-skyr')).toBeInTheDocument();
    expect(within(primary).queryByTestId('substitution-food-peanut')).not.toBeInTheDocument();
    expect(within(primary).queryByTestId('substitution-food-cream')).not.toBeInTheDocument();
    expect(screen.getByTestId('other-substitutes')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Outras opções'));
    expect(screen.getByTestId('other-substitutes')).toHaveAttribute('open');
  });
  it('mostra Drelli no topo, com quantidade e motivo, sem remover a lista antiga', async () => {
    const onSelect = vi.fn();
    render(<CanonicalFoodSubstitutionDialog
      open onOpenChange={() => {}} foods={FOODS}
      currentName="Massa cozida" currentQtyGrams={100}
      currentMacros={{ kcal: 158, p: 5.8, c: 30.9, g: 0.9 }}
      objective="Definição" mealName="Almoço"
      onSelect={onSelect} onSelectCombination={() => {}}
    />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('best-food-choices')).toBeInTheDocument();
    const best = screen.getByTestId('best-food-drelli');
    expect(best).toHaveTextContent('Mais proteína');
    expect(best).toHaveTextContent(/menos carbo/i);
    expect(best).toHaveTextContent(/\d+ g/);
    expect(screen.getByTestId('substitution-food-drelli')).toBeInTheDocument();
    expect(screen.queryByTestId('best-food-frango')).not.toBeInTheDocument();
    fireEvent.click(best);
    expect(best).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('confirm-substitution'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'drelli' }), expect.any(Number));
    await act(async () => { await Promise.resolve(); });
  });
});
