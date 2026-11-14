import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { parseTabata } from '@/lib/tabataParser';
import { buildTabataSnapshot } from '@/lib/tabataResume';
import { tabataPlayerSteps } from '@/lib/tabataProgression';

vi.mock('hls.js', () => ({ default: { isSupported: () => false, Events: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/tabata/TabataSummaryShare', () => ({ TabataSummaryShare: () => null }));
const played: string[] = [];
vi.mock('@/lib/tabataVoicePlayer', () => ({
  createTabataVoice: () => ({
    unlock: () => {}, preload: async () => {}, readyKeys: () => ['tabata_preparado'],
    ready: (k: string) => k === 'tabata_preparado', busy: () => false,
    play: async (k: string) => { played.push(k); return true; }, playNext: async () => false, stop: () => {},
  }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const b: any = {
      select: () => b, eq: () => b, order: () => b, limit: () => b, not: () => b, in: () => b, is: () => b,
      maybeSingle: () => b, upsert: async () => ({ error: null }), update: () => b, insert: async () => ({ error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej),
    };
    return b;
  };
  return { supabase: { from: builder, rpc: async () => ({ data: [], error: null }), auth: { getUser: async () => ({ data: { user: { id: 'aluno-1' } } }) } } };
});

import TabataExecucao from '@/pages/TabataExecucao';

const md = `# TABATA SEXTA

## Blocos

### Bloco 1
**Formato:** 2 rounds × 20s / 10s

| # | Exercício | Trabalho | Descanso | Observação |
|---|---|---|---|---|
| 1 | SKIPS | 20s | 10s | ... |
| 2 | BURPEES | 20s | 10s | ... |
`;

beforeEach(() => { played.length = 0; localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('TABATA — Continuar pelo card da home', () => {
  it('volta no round salvo, fala "Tá preparado?" e conta 3, 2, 1 antes de seguir', async () => {
    const tabata = parseTabata(md);
    const now = Date.now();
    const snap = buildTabataSnapshot({
      sessionId: 's-home', studentId: 'aluno-1', planId: 'p-sexta', title: tabata.title, markdown: md,
      phase: 'work', stepIndex: 1, step: tabataPlayerSteps(tabata)[1], remainingMs: 11_000, phaseTotalSeconds: 20,
      startedAt: now - 600_000, totalPauseMs: 0, doneSteps: [0], pausedAt: now - 500_000, reason: 'away',
    }, now - 500_000)!;
    render(
      <MemoryRouter initialEntries={[{ pathname: '/tabata-execucao', state: { tabata, planId: 'p-sexta', resumeSnapshot: snap } }]}>
        <Routes><Route path="/tabata-execucao" element={<TabataExecucao />} /></Routes>
      </MemoryRouter>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(played).toEqual(['tabata_preparado']);
    expect(screen.getByTestId('tabata-resume-countdown')).toHaveTextContent('TÁ PREPARADO?');
    expect(screen.getByTestId('tabata-player-block')).toHaveTextContent('BLOCO 1 · RODADA 2/2');
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByTestId('tabata-resume-countdown')).toHaveTextContent('3');
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.queryByTestId('tabata-resume-countdown')).toBeNull();
    expect(screen.getByTestId('tabata-exercise-name')).toHaveTextContent('BURPEES');
    expect(screen.getByTestId('tabata-ring-seconds')).toHaveTextContent('11');
  });
});
