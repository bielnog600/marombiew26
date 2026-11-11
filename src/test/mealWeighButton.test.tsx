import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StudentMealCard from '@/components/diet/StudentMealCard';

vi.mock('@/components/diet/AddFoodDialog', () => ({ default: () => null }));
vi.mock('@/components/diet/FoodSubstitutionDialog', () => ({ default: () => null }));

const meal = { name: 'Almoço', time: '12:30', foods: [{ food: 'Arroz branco cozido', qty: '150 g', kcal: '195', p: '4', c: '42', g: '0' }] };
const base = { meal, expanded: true, onToggleExpand: () => {}, onFoodsChange: () => {}, moveTargets: [], onMoveFood: () => {} };

describe('Botão Pesar refeição (premium)', () => {
  it('sem premium não aparece', () => {
    render(<StudentMealCard {...base} />);
    expect(screen.queryByRole('button', { name: /Pesar refeição/ })).toBeNull();
  });
  it('com premium aparece e abre a pesagem', () => {
    const onWeigh = vi.fn();
    render(<StudentMealCard {...base} onWeigh={onWeigh} />);
    fireEvent.click(screen.getByRole('button', { name: /Pesar refeição/ }));
    expect(onWeigh).toHaveBeenCalledTimes(1);
  });
  it('ícone de balança em cada alimento só com premium', () => {
    const onWeighFood = vi.fn();
    const { unmount } = render(<StudentMealCard {...base} />);
    expect(screen.queryByRole('button', { name: 'Pesar Arroz branco cozido' })).toBeNull();
    unmount();
    render(<StudentMealCard {...base} onWeighFood={onWeighFood} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pesar Arroz branco cozido' }));
    expect(onWeighFood).toHaveBeenCalledWith(0);
  });
});
