import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CanonicalFoodSubstitutionDialog from '@/components/diet/CanonicalFoodSubstitutionDialog';
import type { FoodRecord } from '@/lib/nutritionEngine';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [], error: null }) })) },
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

describe('Melhor para você no diálogo compartilhado', () => {
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
    expect(best).toHaveTextContent('Menos carbo');
    expect(best).toHaveTextContent(/\d+ g/);
    expect(screen.getByTestId('substitution-food-drelli')).toBeInTheDocument();
    expect(screen.queryByTestId('best-food-frango')).not.toBeInTheDocument();
    fireEvent.click(best);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'drelli' }), expect.any(Number));
    await act(async () => { await Promise.resolve(); });
  });
});
