import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/diet/AddFoodDialog', () => ({ default: () => null }));
vi.mock('@/components/diet/FoodSubstitutionDialog', () => ({ default: () => null }));

import StudentMealCard from '@/components/diet/StudentMealCard';

afterEach(cleanup);

const food = (name: string, kcal: string, extra: Record<string, unknown> = {}) =>
  ({ food: name, qty: '100 g', kcal, p: '10', c: '10', g: '5', ...extra }) as any;

const options = [
  { name: 'Ovo e pão', source: 'plan' as const, foods: [food('Ovo', '143')], kcal: 143 },
  { name: 'Iogurte com whey', source: 'bank' as const, foods: [food('Iogurte', '100')], kcal: 160, prep: 'Misturar' },
  { name: 'Tapioca de frango', source: 'bank' as const, foods: [food('Tapioca', '150')], kcal: 150 },
];

const base = {
  expanded: true,
  onToggleExpand: () => {},
  onFoodsChange: () => {},
  moveTargets: [{ index: 1, name: 'Almoço' }],
  onMoveFood: () => {},
};

describe('StudentMealCard — opções', () => {
  it('mostra o selo "Opção N" e o nome da opção na linha de baixo', () => {
    render(<StudentMealCard {...base} meal={{ name: 'Café da manhã', foods: options[1].foods }} options={options} selectedOption={1} />);
    expect(screen.getByTestId('meal-option-badge').textContent).toBe('Opção 2');
    expect(screen.getByText(/Aprox\. 100 kcal · 1 item · Iogurte com whey/)).toBeTruthy();
  });

  it('tocar num cartão de opção avisa a escolha', () => {
    const onSelect = vi.fn();
    render(<StudentMealCard {...base} meal={{ name: 'Café da manhã', foods: options[0].foods }} options={options} onSelectOption={onSelect} prep="Misturar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Opção 3: Tapioca de frango' }));
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.getByTestId('meal-option-prep').textContent).toContain('Como preparar:');
  });

  it('opção pesada/alterada mostra a marca no cartão atual', () => {
    render(<StudentMealCard {...base} meal={{ name: 'Café da manhã', foods: options[0].foods }} options={options} optionEdited />);
    expect(screen.getByTestId('meal-option-edited').textContent).toContain('pesada / alterada');
  });

  it('cartão Receitas: "N que batem", abre a folha e, escolhida, mostra o nome da receita', () => {
    const onOpen = vi.fn();
    const two = options.slice(0, 2);
    const { rerender } = render(<StudentMealCard {...base} meal={{ name: 'Café da manhã', foods: options[0].foods }} options={two} recipeCount={4} onOpenRecipes={onOpen} />);
    expect(screen.getByTestId('meal-recipes-card').textContent).toContain('4 que batem');
    fireEvent.click(screen.getByTestId('meal-recipes-card'));
    expect(onOpen).toHaveBeenCalled();
    rerender(<StudentMealCard {...base} meal={{ name: 'Café da manhã', foods: options[2].foods }} options={two} selectedOption={-1} recipe={options[2]} recipeCount={4} onOpenRecipes={onOpen} />);
    expect(screen.getByTestId('meal-option-badge').textContent).toBe('Receita');
    expect(screen.getByTestId('meal-recipes-card').textContent).toContain('Tapioca de frango');
    expect(screen.getByRole('button', { name: /^Opção 1/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('só Opção 1 com Receitas mostra os dois cartões', () => {
    render(<StudentMealCard {...base} meal={{ name: 'Café da manhã', foods: options[0].foods }} options={[options[0]]} onOpenRecipes={() => {}} />);
    expect(screen.getByTestId('meal-option-picker')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Opção 2/ })).toBeNull();
    expect(screen.getByTestId('meal-recipes-card')).toBeTruthy();
  });

  it('com uma só opção não aparece seletor', () => {
    render(<StudentMealCard {...base} meal={{ name: 'Café da manhã', foods: options[0].foods }} options={[options[0]]} />);
    expect(screen.queryByTestId('meal-option-picker')).toBeNull();
    expect(screen.queryByTestId('meal-option-badge')).toBeNull();
  });
});

describe('StudentMealCard — alimentos pesados', () => {
  it('alimento pesado mantém mover e remover', () => {
    const onRemove = vi.fn();
    const weighed = food('Ovo', '143', { weigh: { status: 'pesado', gramas: 100, planIndex: 0, itemIndexes: [0] } });
    render(<StudentMealCard {...base} weighed meal={{ name: 'Café da manhã', foods: [weighed] }} onRemoveWeighedFood={onRemove} onMoveWeighedFood={() => {}} />);
    expect(screen.getByRole('button', { name: 'Mover Ovo para outra refeição' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remover Ovo' }));
    expect(onRemove).toHaveBeenCalledWith(weighed);
  });
});
