import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), insert: () => Promise.resolve({ error: null }) }) },
}));

import LiveCorrectionScreen from '@/components/liveCorrection/LiveCorrectionScreen';

describe('Correção ao vivo — tela inicial por exercício', () => {
  it('teste do admin: seletor de exercício; búlgaro pede perna da frente e o banco', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="Agachamento (teste)" depthLevelPicker exercisePicker onClose={() => undefined} />);
    const start = screen.getByRole('button', { name: 'Começar' });
    expect(start).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Agachamento' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Búlgaro / afundo' }));
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('Coloca o celular no chão, de lado, com o banco aparecendo');
    expect(screen.getByRole('button', { name: 'Começar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Direita' }));
    expect(screen.getByRole('button', { name: 'Começar' })).toBeEnabled();
    expect(screen.getByText('joelho da frente até 105°')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Stiff' }));
    expect(screen.queryByTestId('live-front-leg-picker')).toBeNull();
    expect(screen.getByText('tronco inclinado pelo menos 55°')).toBeInTheDocument();
  });

  it('no treino, a regra vem do nome do exercício', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="AFUNDO HALTERES" onClose={() => undefined} />);
    expect(screen.getByTestId('live-front-leg-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('live-exercise-picker')).toBeNull();
    expect(screen.getByTestId('live-instruction')).not.toHaveTextContent('banco');
  });

  it('agachamento continua sem seletor de perna', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="GLOBET SQUATS" onClose={() => undefined} />);
    expect(screen.queryByTestId('live-front-leg-picker')).toBeNull();
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('Coloca o celular no chão, de lado pra você, com o corpo inteiro aparecendo');
    expect(screen.getByRole('button', { name: 'Começar' })).toBeEnabled();
  });
});
