import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import MuscleGroupPicker from '@/components/admin/MuscleGroupPicker';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const GROUPS = Array.from({ length: 30 }, (_, i) => `Grupo ${i + 1}`);
const COUNTS: Record<string, number> = Object.fromEntries(GROUPS.map(g => [g, 1]));

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
  it('limite máximo de altura cresce com a viewport e a lista pode rolar até o último grupo', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox'));

    const list = findScrollContainer();
    expect(list).not.toBeNull();
    expect(list!.scrollHeight).toBeGreaterThan(list!.clientHeight);

    list!.scrollTop = list!.scrollHeight;
    fireEvent.scroll(list!);
    expect(list!.scrollTop).toBeGreaterThan(0);
    expect(list!.scrollTop).toBe(list!.scrollHeight - list!.clientHeight);

    // O último grupo existe e fica dentro do contêiner rolável.
    expect(screen.getByRole('button', { name: /Grupo 30/ }).closest('div.overflow-y-auto')).toBe(list);
  });
});
