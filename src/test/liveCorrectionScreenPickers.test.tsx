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

  it('elevação lateral e pélvica: instrução própria e começa sem escolher perna', () => {
    const { unmount } = render(<LiveCorrectionScreen studentId="u1" exerciseName="ELEVAÇÃO LATERAL" onClose={() => undefined} />);
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('Coloca o celular no chão ou apoiado, de frente pra você, com o corpo da cintura pra cima e os braços aparecendo');
    expect(screen.queryByTestId('live-front-leg-picker')).toBeNull();
    expect(screen.getByRole('button', { name: 'Começar' })).toBeEnabled();
    unmount();
    render(<LiveCorrectionScreen studentId="u1" exerciseName="ELEVAÇÃO PÉLVICA" onClose={() => undefined} />);
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('Celular no chão, de lado, na altura do banco, com o corpo inteiro aparecendo');
  });

  it('teste do admin lista os 8 exercícios', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="x" exercisePicker onClose={() => undefined} />);
    expect(screen.getAllByRole('radio', { name: /Agachamento|Stiff|Búlgaro|Elevação lateral|Elevação pélvica|Rosca|Tríceps francês|Desenvolvimento/ })).toHaveLength(8);
  });

  it('rosca, francês e desenvolvimento: instrução própria, sem corpo inteiro', () => {
    const { unmount } = render(<LiveCorrectionScreen studentId="u1" exerciseName="ROSCA DIRETA C/ HALTERES" onClose={() => undefined} />);
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('Celular de lado, com o corpo da cintura pra cima e o braço aparecendo');
    expect(screen.getByText(/da cintura pra cima, parado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar' })).toBeEnabled();
    unmount();
    const r2 = render(<LiveCorrectionScreen studentId="u1" exerciseName="TRÍCEPS FRANCÊS" onClose={() => undefined} />);
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('acima da cabeça');
    r2.unmount();
    render(<LiveCorrectionScreen studentId="u1" exerciseName="DESENV. ARNOLD" onClose={() => undefined} />);
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('de frente pra você');
    expect(screen.getByText(/aparecer de frente, parado/)).toBeInTheDocument();
  });

  it('teste do admin lista os 11 exercícios', () => {
    render(<LiveCorrectionScreen studentId="u1" exerciseName="x" exercisePicker onClose={() => undefined} />);
    expect(screen.getAllByRole('radio', { name: /Agachamento|Stiff|Búlgaro|Elevação|Rosca|Tríceps|Desenvolvimento|Supino|Leg press|Prancha/ })).toHaveLength(11);
  });

  it('supino, leg press e prancha: instrução própria', () => {
    const r1 = render(<LiveCorrectionScreen studentId="u1" exerciseName="SUPINO RETO HALTERES" onClose={() => undefined} />);
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('Celular no chão, de lado do banco, com o tronco e os braços aparecendo');
    r1.unmount();
    const r2 = render(<LiveCorrectionScreen studentId="u1" exerciseName="LEG PRESS 45 ART" onClose={() => undefined} />);
    expect(screen.getByTestId('live-instruction')).toHaveTextContent('Celular de lado da máquina, com quadril, joelho e pé aparecendo');
    r2.unmount();
    render(<LiveCorrectionScreen studentId="u1" exerciseName="PRANCHA FRONTAL" onClose={() => undefined} />);
    expect(screen.getByText(/O cronômetro começa sozinho/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar' })).toBeEnabled();
  });
});
