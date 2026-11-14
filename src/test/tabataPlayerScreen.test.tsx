import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { parseTabata } from '@/lib/tabataParser';

vi.mock('hls.js', () => ({ default: { isSupported: () => false, Events: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/tabata/TabataSummaryShare', () => ({ TabataSummaryShare: () => null }));

const inserts: any[] = [];
const writes: { table: string; op: string; row: any }[] = [];
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let single = false;
    const b: any = {
      select: () => b, eq: () => b, order: () => b, limit: () => b, not: () => b, in: () => b, is: () => b,
      maybeSingle: () => { single = true; return b; },
      insert: async (row: any) => { inserts.push({ table, row }); writes.push({ table, op: 'insert', row }); return { error: null }; },
      upsert: async (row: any) => { writes.push({ table, op: 'upsert', row }); return { error: null }; },
      update: (row: any) => { writes.push({ table, op: 'update', row }); return b; },
      then: (res: any, rej: any) => Promise.resolve({ data: single ? null : [], error: null }).then(res, rej),
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

beforeEach(() => { inserts.length = 0; writes.length = 0; localStorage.clear(); });

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
    await waitFor(() => expect(writes.some(w => w.row?.rpe === 8)).toBe(true));
    const saved = writes.find(w => w.row?.rpe === 8)!;
    expect(saved.table).toBe('tabata_sessions');
    expect(saved.row).toMatchObject({ student_id: 'aluno-1', plan_id: 'plan-q', rpe: 8, status: 'abandoned', total_rounds: 4 });
    // Mesma linha que acompanhou o treino (em andamento → encerrada).
    const progress = writes.find(w => w.row?.status === 'in_progress');
    expect(progress?.row.id).toBe(saved.row.id);
  });

  it('pré-visualização do admin não salva sessão', () => {
    open({ preview: true });
    click(/Iniciar/); click(/^Pausar$/);
    fireEvent.click(screen.getByRole('button', { name: /Encerrar treino/ }));
    expect(screen.getByText('Pré-visualização: nada é salvo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar e enviar/ })).toBeNull();
  });
});

const pairedMd = `# TABATA PAR

## 🔥 Aquecimento (0:40 min)

### Bloco 0 — Aquecimento
**Formato:** 2 rounds × 10s trabalho / 10s intervalo
**Intensidade:** Leve (RPE 3–4)

| Round | Exercício | Trabalho | Descanso | Observação |
|---|---|---|---|---|
| 1 | MOBILIDADE DE QUADRIL | 10s | 10s | Lado DIREITO. Círculos amplos |
| 2 | MOBILIDADE DE QUADRIL | 10s | 10s | Lado ESQUERDO. Círculos amplos |

**Descanso após bloco:** 10s

## Blocos

### Bloco 1
**Formato:** 1 rounds × 20s / 10s

| # | Exercício | Trabalho | Descanso | Observação |
|---|---|---|---|---|
| 1 | SKIPS | 20s | 10s | ... |
`;

describe('Player do TABATA — aquecimento em par', () => {
  it('roda 10s por lado e mostra o lado em destaque, também no "A seguir"', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/tabata-execucao', state: { tabata: parseTabata(pairedMd), preview: true } }]}>
        <Routes><Route path="/tabata-execucao" element={<TabataExecucao />} /></Routes>
      </MemoryRouter>,
    );
    click(/Iniciar/);
    click(/Avançar/); // Fique pronto → lado direito
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('AQUECIMENTO · 1/2');
    expect(screen.getByTestId('tabata-exercise-name')).toHaveTextContent('MOBILIDADE DE QUADRIL');
    expect(screen.getByTestId('tabata-side')).toHaveTextContent('Lado direito');
    expect(screen.getByTestId('tabata-ring-seconds')).toHaveTextContent('10');
    expect(screen.getByText('Círculos amplos')).toBeInTheDocument();
    click(/Avançar/); // descanso → a seguir lado esquerdo
    expect(screen.getByTestId('tabata-next-side')).toHaveTextContent('Lado esquerdo');
    click(/Avançar/);
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('AQUECIMENTO · 2/2');
    expect(screen.getByTestId('tabata-side')).toHaveTextContent('Lado esquerdo');
  });
});

// ───────────── Sair do app e voltar (pausa automática e retomada) ─────────────

let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
const setVisible = (v: DocumentVisibilityState) => {
  visibility = v;
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(20); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const localSnapshot = () => JSON.parse(localStorage.getItem('marombiew:tabata_active_session') || 'null');

/** Iniciar → aquecimento → transição → Bloco 1, rodada 1 (SKIPS, 20s). */
const goToFirstRound = () => { click(/Iniciar/); click(/Avançar/); click(/Avançar/); click(/Avançar/); };

describe('Player do TABATA — sair e voltar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    visibility = 'visible';
  });
  afterEach(() => { vi.useRealTimers(); });

  it('sair 5 s pausa, salva o ponto e retoma sozinho com 3, 2, 1', async () => {
    open();
    await flush();
    goToFirstRound();
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('BLOCO 1 · RODADA 1/2');
    setVisible('hidden');
    const snap = localSnapshot();
    expect(snap).toMatchObject({ phase: 'work', stepIndex: 1, remainingMs: 20000, reason: 'away', planId: 'plan-q' });
    expect(writes.some(w => w.op === 'upsert' && w.row.status === 'paused' && w.row.id === snap.sessionId)).toBe(true);
    await advance(5000);
    setVisible('visible');
    expect(screen.getByTestId('tabata-resume-countdown')).toHaveTextContent('3');
    expect(screen.queryByTestId('tabata-resume-card')).toBeNull();
    await advance(1000);
    expect(screen.getByTestId('tabata-resume-countdown')).toHaveTextContent('2');
    await advance(2100);
    expect(screen.queryByTestId('tabata-resume-countdown')).toBeNull();
    expect(screen.getByRole('button', { name: /^Pausar$/ })).toBeInTheDocument();
    expect(screen.getByTestId('tabata-ring-seconds')).toHaveTextContent('20');
  });

  it('sair 1 min mostra o card; Continuar fala "Tá preparado?", conta 3, 2, 1 e volta no mesmo round', async () => {
    open();
    await flush();
    goToFirstRound();
    setVisible('hidden');
    await advance(60_000);
    setVisible('visible');
    const card = screen.getByTestId('tabata-resume-card');
    expect(card).toHaveTextContent('TABATA em andamento');
    expect(within(card).getByTestId('tabata-resume-where')).toHaveTextContent('TABATA QUINTA, Bloco 1 · Round 1/2');
    expect(screen.queryByTestId('tabata-resume-stale')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /Continuar/ }));
    expect(screen.getByTestId('tabata-resume-countdown')).toHaveTextContent('TÁ PREPARADO?');
    await advance(900);
    expect(screen.getByTestId('tabata-resume-countdown')).toHaveTextContent('3');
    await advance(3100);
    expect(screen.queryByTestId('tabata-resume-countdown')).toBeNull();
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('BLOCO 1 · RODADA 1/2');
    expect(screen.getByTestId('tabata-ring-seconds')).toHaveTextContent('20');
  });

  it('recarregar a página mostra o card Continuar e retoma no ponto salvo', async () => {
    const first = open();
    await flush();
    goToFirstRound();
    await advance(5000); // 5 s de SKIPS feitos
    setVisible('hidden');
    first.unmount();
    setVisible('visible');
    await advance(30_000);

    open();
    await flush();
    const card = screen.getByTestId('tabata-resume-card');
    expect(within(card).getByTestId('tabata-resume-where')).toHaveTextContent('Bloco 1 · Round 1/2');
    expect(card).toHaveTextContent('faltavam 15s de SKIPS');
    fireEvent.click(within(card).getByRole('button', { name: /Continuar/ }));
    await advance(4100);
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('BLOCO 1 · RODADA 1/2');
    expect(screen.getByTestId('tabata-ring-seconds')).toHaveTextContent('15');
  });

  it('parado há mais de 2 h: o card avisa para aquecer antes de continuar', async () => {
    const first = open();
    await flush();
    goToFirstRound();
    setVisible('hidden');
    first.unmount();
    setVisible('visible');
    vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1000);
    open();
    await flush();
    expect(screen.getByTestId('tabata-resume-stale')).toHaveTextContent('Faz uns 2 min de aquecimento antes de continuar');
  });

  it('parado há mais de 24 h: a sessão vira abandonada e o card não aparece', async () => {
    const first = open();
    await flush();
    goToFirstRound();
    setVisible('hidden');
    const id = localSnapshot().sessionId;
    first.unmount();
    setVisible('visible');
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    open();
    await flush();
    expect(screen.queryByTestId('tabata-resume-card')).toBeNull();
    expect(localSnapshot()).toBeNull();
    expect(writes.some(w => w.op === 'update' && w.row.status === 'abandoned')).toBe(true);
    expect(id).toBeTruthy();
  });

  it('Recomeçar cria sessão nova e fecha a anterior como abandonada', async () => {
    const first = open();
    await flush();
    goToFirstRound();
    setVisible('hidden');
    const oldId = localSnapshot().sessionId;
    first.unmount();
    setVisible('visible');
    open();
    await flush();
    fireEvent.click(within(screen.getByTestId('tabata-resume-card')).getByRole('button', { name: /Recomeçar/ }));
    await flush();
    expect(writes.some(w => w.op === 'update' && w.row.status === 'abandoned')).toBe(true);
    expect(screen.getByTestId('tabata-phrase')).toHaveTextContent('TÁ PREPARADO?'); // Fique pronto da sessão nova
    expect(localSnapshot().sessionId).not.toBe(oldId);
  });

  it('concluir normalmente: tempo pausado não conta, sessão "completed" com o RPE e nada fica em andamento', async () => {
    open();
    await flush();
    goToFirstRound();
    setVisible('hidden');
    await advance(60_000);
    setVisible('visible');
    fireEvent.click(within(screen.getByTestId('tabata-resume-card')).getByRole('button', { name: /Continuar/ }));
    await advance(4100);
    for (let i = 0; i < 6 && !screen.queryByTestId('tabata-done'); i++) click(/Avançar/);
    expect(screen.getByTestId('tabata-done')).toHaveTextContent('TABATA concluído');
    await flush();
    expect(localSnapshot()).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'RPE 7' }));
    click(/Salvar e enviar ao Fabiew/);
    await flush();
    const saved = writes.find(w => w.row?.rpe === 7)!;
    expect(saved.row).toMatchObject({ status: 'completed', rpe: 7, total_rounds: 4 });
    expect(saved.row.total_pause_ms).toBeGreaterThanOrEqual(60_000);
    expect(saved.row.duration_seconds).toBeLessThan(30);
  });

  it('pré-visualização do admin: sair não pausa nem grava nada', async () => {
    open({ preview: true });
    await flush();
    goToFirstRound();
    setVisible('hidden');
    await advance(2000);
    setVisible('visible');
    expect(screen.queryByTestId('tabata-paused')).toBeNull();
    expect(screen.queryByTestId('tabata-resume-countdown')).toBeNull();
    expect(screen.getByRole('button', { name: /^Pausar$/ })).toBeInTheDocument();
    expect(localSnapshot()).toBeNull();
    expect(writes).toHaveLength(0);
  });
});
