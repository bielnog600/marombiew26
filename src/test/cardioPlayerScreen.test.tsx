import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { normalizeCardioIntervals } from '@/lib/cardioIntervals';
import { buildEquipment } from '@/lib/officeWizard/cardioWizard';
import type { CardioProtocol } from '@/lib/cardioParser';

const voiceSpy = vi.fn();
vi.mock('@/lib/tabataVoicePlayer', () => ({ createTabataVoice: (...a: unknown[]) => { voiceSpy(...a); throw new Error('sem voz no cardio'); } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'aluno-1' }, role: 'aluno', isAdmin: false }) }));

const writes: { table: string; op: string; row: any }[] = [];
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let single = false;
    const b: any = {
      select: () => b, eq: () => b, order: () => b, limit: () => b, not: () => b, in: () => b, is: () => b, neq: () => b,
      maybeSingle: () => { single = true; return b; },
      insert: async (row: any) => { writes.push({ table, op: 'insert', row }); return { error: null }; },
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

import CardioExecucao from '@/pages/CardioExecucao';

// HIIT 2:00 a 6 km/h / 1:00 a 4 km/h × 8, como sai do cardio-agent depois do ajuste
const base: CardioProtocol = {
  title: 'HIIT Esteira', modality: 'passadeira', objective: 'Condicionamento', level: 'intermediario', intensity: 'intensa',
  structure: 'hiit', totalDurationMin: 32, frequencyPerWeek: 3,
  blocks: [
    { name: 'Aquecimento', type: 'aquecimento', durationSec: 300, intensityLabel: 'leve', targetZone: 'Z1', speedKmh: 4 },
    { name: 'Tiro', type: 'pico', durationSec: 60, intensityLabel: 'forte' },
    { name: 'Trote', type: 'recuperacao', durationSec: 60, intensityLabel: 'leve' },
    { name: 'Desaceleração', type: 'desaceleracao', durationSec: 180, intensityLabel: 'leve', targetZone: 'Z1', speedKmh: 4 },
  ],
};
const protocol = normalizeCardioIntervals(base, {
  style: 'hiit', equipment: buildEquipment({ tSpeedHard: '6', tSpeedEasy: '4', tWorkSec: '120', tRestSec: '60', rounds: '8' }),
}).payload;

const open = () => render(
  <MemoryRouter initialEntries={['/', { pathname: '/cardio-execucao', state: { protocol, planId: 'plan-c' } }]} initialIndex={1}>
    <Routes>
      <Route path="/" element={<p>home</p>} />
      <Route path="/cardio-execucao" element={<CardioExecucao />} />
    </Routes>
  </MemoryRouter>,
);
const click = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => { writes.length = 0; localStorage.clear(); voiceSpy.mockClear(); });

describe('Execução do cardio — tela cheia', () => {
  it('INICIAR CARDIO da tela Cardio começa direto no Prepare-se, sem a tela inicial, com o título curto', async () => {
    render(
      <MemoryRouter initialEntries={['/', { pathname: '/cardio-execucao', state: { protocol, planId: 'plan-c', protocolIndex: 1, autoStart: true } }]} initialIndex={1}>
        <Routes>
          <Route path="/" element={<p>home</p>} />
          <Route path="/cardio-execucao" element={<CardioExecucao />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByTestId('cardio-pre-screen')).toBeNull();
    expect(screen.getByTestId('cardio-phase-count')).toHaveTextContent('Prepare-se');
    expect(screen.getByTestId('cardio-player')).toHaveTextContent('HIIT na Passadeira');
    expect(screen.getByTestId('cardio-next-card')).toHaveTextContent('Próximo: Aquecimento');
  });

  it('Executar do admin (pré-visualização) continua abrindo na tela inicial', async () => {
    open();
    await act(async () => {});
    expect(screen.getByTestId('cardio-pre-screen')).toBeInTheDocument();
  });

  it('mostra as 18 fases, o pico com 6 km/h e a recuperação a seguir', async () => {
    open();
    await act(async () => {});
    expect(screen.getByTestId('cardio-pre-screen')).toHaveTextContent('Pico forte');
    click(/Iniciar/);
    expect(screen.getByTestId('cardio-next-card')).toHaveTextContent('Próximo: Aquecimento');
    click(/Próxima fase/); // → aquecimento
    expect(screen.getByTestId('cardio-phase-count')).toHaveTextContent('Fase 1 de 18');
    click(/Próxima fase/); // → pico 1
    expect(screen.getByTestId('cardio-phase-name')).toHaveTextContent('Pico forte');
    expect(screen.getByTestId('cardio-intensity-tag')).toHaveTextContent('Alta');
    expect(screen.getByTestId('cardio-ring-time')).toHaveTextContent('2:00');
    expect(screen.getByTestId('cardio-params')).toHaveTextContent('6');
    expect(screen.getByTestId('cardio-params')).toHaveTextContent('km/h');
    expect(screen.getByTestId('cardio-segments').children).toHaveLength(18);
    click(/Fase anterior/);
    expect(screen.getByTestId('cardio-phase-name')).toHaveTextContent('Aquecimento');
  });

  it('cardio não usa as falas gravadas do Fabiew (só bipes)', async () => {
    open();
    await act(async () => {});
    click(/Iniciar/); click(/Próxima fase/); click(/Próxima fase/);
    expect(voiceSpy).not.toHaveBeenCalled();
  });

  it('Finalizar sessão abre a tela final e o Concluir salva Como foi?, estrelas e modalidade', async () => {
    open();
    await act(async () => {});
    click(/Iniciar/);
    click(/Próxima fase/); click(/Próxima fase/); click(/Próxima fase/); // aquecimento + pico 1 feitos
    fireEvent.click(screen.getByText(/Finalizar sessão/));
    click(/^Finalizar$/);
    expect(screen.getByTestId('cardio-finish')).toHaveTextContent('Boa! Sessão concluída!');
    expect(screen.getByTestId('cardio-finish-duration')).toHaveTextContent('2 fases de 18');
    expect(screen.getByRole('radio', { name: 'Esteira' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('cardio-kcal-estimate')).toHaveTextContent(/~\d+ kcal estimado/);

    fireEvent.click(screen.getByRole('radio', { name: 'Moderado' }));
    expect(screen.getByTestId('cardio-effort-label')).toHaveTextContent('Moderado');
    fireEvent.click(screen.getByRole('radio', { name: '4 estrelas' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Bike' }));
    click(/Concluir cardio/);

    await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument());
    const saved = writes.filter(w => w.table === 'cardio_sessions' && w.op === 'upsert').pop()!.row;
    expect(saved).toMatchObject({ status: 'completed', rpe: 3, rating: 4, modality: 'bike', completed_blocks: 2, total_blocks: 18, plan_id: 'plan-c', student_id: 'aluno-1' });
  });
});
