import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import MuscleGroupPicker from '@/components/admin/MuscleGroupPicker';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const GROUPS = Array.from({ length: 30 }, (_, i) => `Grupo ${i + 1}`);
const COUNTS: Record<string, number> = Object.fromEntries(GROUPS.map(g => [g, 0]));

function Harness() {
  const [value, setValue] = useState('');
  return <MuscleGroupPicker value={value} onChange={setValue} counts={COUNTS} onGroupsChanged={() => {}} />;
}

function findScrollContainer(): HTMLElement | null {
  // The scrollable list is the div that holds the group buttons (touch-pan-y class marks it).
  const buttons = screen.getAllByRole('button', { name: /Grupo \d+/ });
  return buttons[0].closest('div.overflow-y-auto');
}

describe('MuscleGroupPicker — lista rolável', () => {
  it('a lista de grupos é o contêiner rolável (overflow-y + pan-y) e o popover limita a altura', () => {
    const { container } = render(<div data-testid="painel"><Harness /></div>);
    fireEvent.click(screen.getByRole('combobox'));

    const list = findScrollContainer();
    expect(list).not.toBeNull();
    // Rolagem própria da lista, não do popover inteiro nem da página.
    expect(list!.className).toContain('overflow-y-auto');
    expect(list!.className).toContain('touch-pan-y');
    expect(list!.className).toContain('min-h-0');
    // Balão renderizado dentro do painel (sem portal), senão o trava-rolagem do painel bloqueia o toque.
    expect(container.contains(list)).toBe(true);
    // Popover limita a altura total para caber na tela.
    const popover = list!.closest('[data-radix-popper-content-wrapper]')?.firstElementChild as HTMLElement | null;
    expect(popover?.style.maxHeight).toContain('520px');

    // O último grupo existe e fica dentro do contêiner rolável.
    expect(screen.getByRole('button', { name: 'Grupo 30' }).closest('div.overflow-y-auto')).toBe(list);
  });
});
