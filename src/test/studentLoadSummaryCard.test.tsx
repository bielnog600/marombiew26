import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StudentLoadSummaryCard } from '@/components/training/StudentLoadSummaryCard';

afterEach(cleanup);
describe('card de cargas do aluno', () => {
  it('oculta o card quando não existem dados', () => {
    render(<StudentLoadSummaryCard previousLine={null} suggestionLine={null} />);
    expect(screen.queryByTestId('student-load-summary')).not.toBeInTheDocument();
  });
  it('destaca histórico, data e sugestão numérica separadamente', () => {
    render(<StudentLoadSummaryCard previousLine="Última vez: 60 kg × 10 · 05/10" suggestionLine="Sugestão: 62,5 kg · 8–10 reps" />);
    expect(screen.getByText('60 kg × 10')).toHaveClass('text-foreground', 'font-semibold');
    expect(screen.getByText('05/10')).toBeInTheDocument();
    expect(screen.getByText('62,5 kg')).toHaveClass('text-foreground', 'text-xl');
    expect(screen.getByText('8–10 reps')).toBeInTheDocument();
  });
  it('texto qualitativo permanece legível', () => {
    render(<StudentLoadSummaryCard previousLine={null} suggestionLine="Sugestão: Mantenha a carga e busque mais reps." />);
    expect(screen.getByText('Mantenha a carga e busque mais reps.')).toHaveClass('text-foreground', 'font-semibold');
  });
  it('carga do professor ganha destaque primário', () => {
    render(<StudentLoadSummaryCard previousLine={null} suggestionLine="Carga alvo: 65 kg · 6–10 reps" />);
    expect(screen.getByText('Carga alvo')).toBeInTheDocument();
    expect(screen.getByText('65 kg')).toHaveClass('text-primary');
    expect(screen.queryByText('Sugestão')).not.toBeInTheDocument();
  });
  it('alvos por série usam chips e vencem a sugestão automática', () => {
    render(<StudentLoadSummaryCard previousLine={null} suggestionLine="Sugestão: 62,5 kg · 8–10 reps" perSet={[{ set_number: 1, load_kg: 40 }, { set_number: 2, load_kg: 65 }]} />);
    expect(screen.getByText('1° set 40 kg')).toHaveClass('text-primary');
    expect(screen.getByText('2° set 65 kg')).toBeInTheDocument();
    expect(screen.queryByText('62,5 kg')).not.toBeInTheDocument();
  });
});