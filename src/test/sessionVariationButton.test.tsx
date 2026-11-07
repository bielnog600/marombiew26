import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MethodExerciseCard } from '@/components/training/MethodExerciseCard';
import { toggleSessionVariation } from '@/lib/sessionVariation';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}) } }));
afterEach(cleanup);

const group = [
  { id: 'a', exercise: 'TRÍCEPS CORDA', variation: 'TRÍCEPS CORDA 2', series: '3', series2: '', reps: '10-12', rir: '', pause: '60s', description: '', grupo_id: 'g', tipo_grupo: 'superset' as const, ordem_grupo: 'A' as const },
  { id: 'b', exercise: 'BÍCEPS MARTELO', variation: '', series: '3', series2: '', reps: '10-12', rir: '', pause: '60s', description: '', grupo_id: 'g', tipo_grupo: 'superset' as const, ordem_grupo: 'B' as const },
];
const sets = { 0: [{ weight: '', reps: '' }, { weight: '', reps: '' }, { weight: '', reps: '' }], 1: [{ weight: '', reps: '' }, { weight: '', reps: '' }, { weight: '', reps: '' }] };
const card = (exercises: any[], onToggle = vi.fn()) => render(
  <MethodExerciseCard exercises={exercises} indices={[0, 1]} sets={sets} onChange={vi.fn()} onComplete={vi.fn()} media={[]} studentId="s" onToggleVariation={onToggle} />,
);

describe('Modo Treino admin — variation button on a superset', () => {
  it('shows the plan variation name on the group exercise and toggles that exercise', () => {
    const onToggle = vi.fn();
    card(group, onToggle);
    fireEvent.click(screen.getByRole('button', { name: /Variação: TRÍCEPS CORDA 2/ }));
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('after the swap the card shows the variation and offers going back to the original', () => {
    card([toggleSessionVariation(group[0])!, group[1]]);
    expect(screen.getByText('TRÍCEPS CORDA 2', { selector: 'p' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Original: TRÍCEPS CORDA/ })).toBeTruthy();
  });

  it('no button when the exercise has no variation in the plan', () => {
    card(group);
    fireEvent.click(screen.getAllByText(/BÍCEPS MARTELO/)[0]);
    expect(screen.queryByRole('button', { name: /Variação:/ })).toBeNull();
  });
});
