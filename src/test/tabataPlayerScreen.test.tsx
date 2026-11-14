import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { parseTabata } from '@/lib/tabataParser';

vi.mock('hls.js', () => ({ default: { isSupported: () => false, Events: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/tabata/TabataSummaryShare', () => ({ TabataSummaryShare: () => null }));

const inserts: any[] = [];
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b: any = {
      select: () => b, eq: () => b, order: () => b, limit: () => b, not: () => b,
      insert: async (row: any) => { inserts.push({ table, row }); return { error: null }; },
      then: (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej),
    };
    return b;
  };
  return {
    supabase: {
      from: builder,
      rpc: async () => ({ data: [], error: null }),
      storage: { from: () => ({ download: async () => ({ data: null, error: new Error('x') }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'aluno-1' } } }) },
    },
  };
});

import TabataExecucao from '@/pages/TabataExecucao';

const md = `# TABATA QUINTA

## Aquecimento
- POLICHINELO — 1 min

## Blocos

### Bloco 1
**Formato:** 2 rounds × 20s / 10s

| # | Exercício | Trabalho | Descanso | Observação |
|---|---|---|---|---|
| 1 | SKIPS | 20s | 10s | Joelho alto |
| 2 | BURPEES | 20s | 10s | Ritmo constante |

**Descanso após bloco:** 1 min

### Bloco 2
**Formato:** 2 rounds × 20s / 10s

| # | Exercício | Trabalho | Descanso | Observação |
|---|---|---|---|---|
| 1 | POLICHINELO | 20s | 10s | ... |
| 2 | JUMPS | 20s | 10s | Aterrissa leve |
`;

const open = (state: Record<string, unknown> = {}) => render(
  <MemoryRouter initialEntries={[{ pathname: '/tabata-execucao', state: { tabata: parseTabata(md), planId: 'plan-q', ...state } }]}>
    <Routes><Route path="/tabata-execucao" element={<TabataExecucao />} /></Routes>
  </MemoryRouter>,
);
const click = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => { inserts.length = 0; });

describe('Player do TABATA — tela nova', () => {
  it('pré-tela mostra cada bloco com a intensidade (plano antigo = Moderado → Máximo)', () => {
    open();
    const pre = screen.getByTestId('tabata-pre-screen');
    expect(within(pre).getByText('● Leve · RPE 3–4')).toBeInTheDocument();
    expect(within(pre).getByText('● Moderado · RPE 6–7')).toBeInTheDocument();
    expect(within(pre).getByText('▲▲ Máximo · RPE 9–10')).toBeInTheDocument();
  });

  it('bloco moderado mostra a intensidade e nunca "vai com tudo"', () => {
    open();
    click(/Iniciar/);
    click(/Avançar/); // Fique pronto → aquecimento
    click(/Avançar/); // aquecimento → transição para o Bloco 1
    expect(screen.getByTestId('tabata-block-transition')).toHaveTextContent('Aquecimento concluído ✓');
    expect(screen.getByTestId('tabata-block-transition')).toHaveTextContent('BLOCO 1');
    click(/Avançar/); // Bloco 1, rodada 1
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('BLOCO 1 · RODADA 1/2');
    expect(screen.getByTestId('tabata-player-intensity')).toHaveTextContent('● Moderado · RPE 6–7');
    expect(screen.getByTestId('tabata-phrase').textContent).not.toMatch(/VAI COM TUDO/);
  });

  it('no descanso o topo já mostra a próxima rodada e o card "A seguir"', () => {
    open();
    click(/Iniciar/); click(/Avançar/); click(/Avançar/); click(/Avançar/);
    click(/Avançar/); // rodada 1 → descanso
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('BLOCO 1 · RODADA 2/2');
    expect(screen.getByTestId('tabata-next-card')).toHaveTextContent('BURPEES');
    expect(screen.getByTestId('tabata-player-intensity')).toHaveTextContent('Respira · solta');
  });

  it('transição entre blocos: "BLOCO 1 CONCLUÍDO ✓", sobe para o bloco 2 e lista os exercícios', () => {
    open();
    click(/Iniciar/); click(/Avançar/); click(/Avançar/); click(/Avançar/);
    click(/Avançar/); click(/Avançar/); click(/Avançar/); // rodada 2 → transição
    const t = screen.getByTestId('tabata-block-transition');
    expect(t).toHaveTextContent('Bloco 1 concluído ✓');
    expect(t).toHaveTextContent('BLOCO 2');
    expect(t).toHaveTextContent('Sobe a intensidade · Máximo');
    expect(t).toHaveTextContent('POLICHINELO');
    expect(t).toHaveTextContent('JUMPS');
    expect(t).toHaveTextContent('2 rodadas · 20s / 10s');
  });

  it('pausado mostra o overlay; encerrar leva ao resumo e salva o RPE na sessão', async () => {
    open();
    click(/Iniciar/); click(/Avançar/); click(/Avançar/); click(/Avançar/);
    click(/^Pausar$/);
    const paused = screen.getByTestId('tabata-paused');
    expect(paused).toHaveTextContent('PAUSADO');
    expect(paused).toHaveTextContent('BLOCO 1 · RODADA 1/2');
    expect(paused).toHaveTextContent(/Faltam \d+s de SKIPS/);
    fireEvent.click(within(paused).getByRole('button', { name: /Encerrar treino/ }));
    const done = screen.getByTestId('tabata-done');
    expect(done).toHaveTextContent('TABATA encerrado');
    expect(screen.getByRole('button', { name: /Escolha o RPE/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'RPE 8' }));
    click(/Salvar e enviar ao Fabiew/);
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0].table).toBe('tabata_sessions');
    expect(inserts[0].row).toMatchObject({ student_id: 'aluno-1', plan_id: 'plan-q', rpe: 8, status: 'abandoned', total_rounds: 4 });
  });

  it('pré-visualização do admin não salva sessão', () => {
    open({ preview: true });
    click(/Iniciar/); click(/^Pausar$/);
    fireEvent.click(screen.getByRole('button', { name: /Encerrar treino/ }));
    expect(screen.getByText('Pré-visualização: nada é salvo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar e enviar/ })).toBeNull();
  });
});
