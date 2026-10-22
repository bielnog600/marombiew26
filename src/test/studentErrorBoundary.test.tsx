import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StudentErrorBoundary from '@/components/StudentErrorBoundary';

const Boom = (): never => {
  throw new Error('falha de render simulada');
};

afterEach(() => cleanup());

describe('StudentErrorBoundary', () => {
  it('mostra mensagem amigável + botão Recarregar em vez de tela vazia', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <StudentErrorBoundary>
        <Boom />
      </StudentErrorBoundary>,
    );
    expect(screen.getByText(/Algo deu errado ao carregar esta tela/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('registra mensagem do erro e rota no console e mostra detalhe técnico recolhível', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <StudentErrorBoundary>
        <Boom />
      </StudentErrorBoundary>,
    );
    const logged = spy.mock.calls.find((c) => c[0] === '[StudentErrorBoundary]');
    expect(logged).toBeTruthy();
    const payload = logged![1] as { rota: string; mensagem: string };
    expect(payload.mensagem).toContain('falha de render simulada');
    expect(payload.rota).toBe(window.location.pathname);
    expect(screen.getByText('Detalhes técnicos')).toBeInTheDocument();
    expect(screen.getByText(/falha de render simulada/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renderiza os filhos normalmente quando não há erro', () => {
    render(
      <StudentErrorBoundary>
        <p>conteúdo ok</p>
      </StudentErrorBoundary>,
    );
    expect(screen.getByText('conteúdo ok')).toBeInTheDocument();
  });
});
