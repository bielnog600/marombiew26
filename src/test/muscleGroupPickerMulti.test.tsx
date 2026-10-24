import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import MuscleGroupPicker, { toggleGroupSelection } from '@/components/admin/MuscleGroupPicker';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const COUNTS: Record<string, number> = { Isquiotibiais: 0, Glúteos: 0, Quadríceps: 0 };

function Harness() {
  const [values, setValues] = useState<string[]>([]);
  return <MuscleGroupPicker values={values} onChange={setValues} counts={COUNTS} onGroupsChanged={() => {}} />;
}

function triggerLabel(): string {
  const trigger = screen.getByRole('combobox');
  return (trigger.querySelector('span')?.textContent ?? '').trim();
}

describe('MuscleGroupPicker — seleção de 1 ou mais grupos', () => {
  it('toggleGroupSelection adiciona na ordem e remove; o primeiro restante assume o principal', () => {
    expect(toggleGroupSelection([], 'Isquiotibiais')).toEqual(['Isquiotibiais']);
    expect(toggleGroupSelection(['Isquiotibiais'], 'Glúteos')).toEqual(['Isquiotibiais', 'Glúteos']);
    // Remove o principal → o próximo vira principal.
    expect(toggleGroupSelection(['Isquiotibiais', 'Glúteos'], 'Isquiotibiais')).toEqual(['Glúteos']);
    // Remove um adicional → principal mantém.
    expect(toggleGroupSelection(['Isquiotibiais', 'Glúteos'], 'Glúteos')).toEqual(['Isquiotibiais']);
  });

  it('permite marcar dois grupos e mostrar o principal; desselecionar o principal promove o outro', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox'));

    fireEvent.click(screen.getByRole('button', { name: 'Isquiotibiais' }));
    expect(triggerLabel()).toBe('Isquiotibiais');

    fireEvent.click(screen.getByRole('button', { name: 'Glúteos' }));
    expect(triggerLabel()).toBe('Isquiotibiais +1');

    // Desseleciona o principal → Glúteos assume. ("principal" entra no nome acessível)
    fireEvent.click(screen.getByRole('button', { name: /Isquiotibiais/ }));
    expect(triggerLabel()).toBe('Glúteos');

    // Remove todos → placeholder.
    fireEvent.click(screen.getByRole('button', { name: /Glúteos/ }));
    expect(triggerLabel()).toBe('Selecionar grupos');
  });
});
