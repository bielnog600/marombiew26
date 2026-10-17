import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WorkoutGroupTabs } from '@/components/training/WorkoutGroupTabs';
import type { ParsedExercise } from '@/lib/trainingResultParser';

afterEach(cleanup);

const exercises = [
  { id: 'a', exercise: 'PUXADA ALTA ABERTA', variation: 'PUXADA ALTA FECHADA', tipo_grupo: 'superset', ordem_grupo: 'A', series: '3', reps: '10' },
  { id: 'b', exercise: 'PUXADA ALTA NEUTRA', variation: 'PUXADA ALTA TRIÂNGULO', tipo_grupo: 'superset', ordem_grupo: 'B', series: '3', reps: '10' },
] as unknown as ParsedExercise[];
const sets = { 0: [{ reps: '10', weight: '', completed: false }], 1: [{ reps: '10', weight: '', completed: false }] };

describe('superset com variação ativa no B', () => {
  it('aba B mostra o nome da variação com ⇄ e a aba A fica com o original', () => {
    render(<WorkoutGroupTabs
      exercises={exercises} indices={[0, 1]} currentIndex={1} sets={sets} onSelect={() => {}}
      nameOf={(ex) => (ex.id === 'b' ? ex.variation! : ex.exercise)}
      variationOf={(ex) => ex.id === 'b'}
    />);
    expect(screen.getByText('PUXADA ALTA TRIÂNGULO')).toBeTruthy();
    expect(screen.getByText('PUXADA ALTA ABERTA')).toBeTruthy();
    expect(screen.queryByText('PUXADA ALTA NEUTRA')).toBeNull();
    expect(screen.getAllByLabelText('Variação ativa')).toHaveLength(1);
  });
  it('sem variação ativa, abas mostram os nomes originais e sem ⇄', () => {
    render(<WorkoutGroupTabs
      exercises={exercises} indices={[0, 1]} currentIndex={0} sets={sets} onSelect={() => {}}
      nameOf={(ex) => ex.exercise} variationOf={() => false}
    />);
    expect(screen.getByText('PUXADA ALTA NEUTRA')).toBeTruthy();
    expect(screen.queryByLabelText('Variação ativa')).toBeNull();
  });
  it('sem nameOf, mantém o comportamento anterior (nome original)', () => {
    render(<WorkoutGroupTabs exercises={exercises} indices={[0, 1]} currentIndex={0} sets={sets} onSelect={() => {}} />);
    expect(screen.getByText('PUXADA ALTA NEUTRA')).toBeTruthy();
  });
});
