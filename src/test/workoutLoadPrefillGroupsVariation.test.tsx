import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: { id: 'prefill-student' },
  exercises: [
    { id: 'slot-0', exercise: 'SUPINO RETO', series: '2', reps: '8-10', grupo_id: 'g1', tipo_grupo: 'biset', ordem_grupo: 'A' },
    { id: 'slot-1', exercise: 'CRUCIFIXO', series: '2', reps: '10-12', grupo_id: 'g1', tipo_grupo: 'biset', ordem_grupo: 'B' },
    { id: 'slot-2', exercise: 'HACK MACHINE', variation: 'AGACHAMENTO LIVRE', series: '2', reps: '8-12', targetLoadKg: 120 },
    { id: 'slot-3', exercise: 'LEG PRESS', variation: 'LEG PRESS HORIZONTAL', series: '2', reps: '10' },
    { id: 'slot-4', exercise: 'AGACHAMENTO SMITH', series: '3', reps: '6-8', pause: '90s', setScheme: { mode: 'per_set', sets: [
      { set_number: 1, set_type: 'warmup', target_reps: '12-15' },
      { set_number: 2, set_type: 'preparatory', target_reps: '10' },
      { set_number: 3, set_type: 'work', target_reps: '6-8' },
    ] } },
  ] as any[],
  history: {
    'SUPINO RETO': 40, CRUCIFIXO: 14, 'HACK MACHINE': 100, 'AGACHAMENTO LIVRE': 60, 'LEG PRESS': 200, 'AGACHAMENTO SMITH': 100,
  } as Record<string, number>,
  currentIndex: 0,
  updates: [] as any[],
  noop: vi.fn(),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mock.noop,
  useLocation: () => ({ key: 'prefill-test', state: { exercises: mock.exercises, dayName: 'SEGUNDA-FEIRA', phase: 'semana_2' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/hooks/useDailyTracking', () => ({ useDailyTracking: () => ({ completeWorkout: mock.noop }) }));
vi.mock('@/hooks/useActiveWorkoutSession', () => ({ useActiveWorkoutSession: () => ({ session: null, refresh: mock.noop, clear: mock.noop, setLocal: mock.noop }) }));
vi.mock('@/hooks/useSessionProgression', () => ({ useSessionProgression: () => ({ snapshot: null }) }));
vi.mock('@/lib/offlineCache', () => ({
  fetchWithCache: async (_key: string, fetcher: () => Promise<unknown>) => ({ data: await fetcher(), fromCache: false }),
  getCached: async () => null, setCache: async () => {},
}));
vi.mock('@/lib/workoutSessionResolution', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/workoutSessionResolution')>(),
  resolveStaleWorkoutSessionsThrottled: async () => {},
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    let operation = 'select'; let name = ''; let selected = '';
    const result = () => {
      if (table === 'workout_sessions' && operation === 'select') return { data: {
        id: 'b1d5e4b2-1111-4cbc-b3fe-6f49f85e71c8', started_at: new Date().toISOString(), last_active_at: new Date().toISOString(),
        day_name: 'SEGUNDA-FEIRA', phase: 'semana_2', status: 'in_progress',
        session_state: { currentIndex: mock.currentIndex, sets: {} },
      }, error: null };
      if (table === 'exercises') return { data: mock.exercises.flatMap(ex => [ex.exercise, ex.variation].filter(Boolean).map((nome: string) => ({
        id: nome, nome, imagem_url: null, video_embed: null, grupo_muscular: 'GERAL',
      }))), error: null };
      if (table === 'exercise_set_logs') {
        const kg = mock.history[name];
        if (kg == null) return { data: [], error: null };
        if (selected.startsWith('session_id')) return { data: [{ session_id: `prev-${name}`, performed_at: '2026-11-01T10:00:00Z' }], error: null };
        return { data: [
          { set_number: 1, reps: 10, weight_kg: kg, set_type: null, performed_at: '2026-11-01T10:00:00Z' },
          { set_number: 2, reps: 9, weight_kg: kg, set_type: null, performed_at: '2026-11-01T10:05:00Z' },
        ], error: null };
      }
      return { data: [], error: null };
    };
    const q: any = {};
    for (const method of ['eq', 'neq', 'order', 'limit', 'lt', 'gte', 'in', 'range']) q[method] = () => q;
    q.select = (cols: string) => { selected = String(cols ?? ''); return q; };
    q.ilike = (_col: string, value: string) => { name = value; return q; };
    q.update = (value: any) => { operation = 'update'; mock.updates.push(value); return q; };
    q.upsert = () => { operation = 'upsert'; return q; };
    q.maybeSingle = q.single = async () => result();
    q.then = (resolve: any) => Promise.resolve(result()).then(resolve);
    return q;
  },
} }));

import TreinoExecucao from '@/pages/TreinoExecucao';
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); localStorage.clear(); mock.updates.length = 0; mock.currentIndex = 0; });

const weights = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')).map((el) => el.value);

describe('student load prefill — bi-set and variation', () => {
  it('prefills each exercise of a bi-set with its own last work load', async () => {
    render(<TreinoExecucao />);
    await screen.findByText('SUPINO RETO', { selector: 'h1' });
    await waitFor(() => expect(weights()).toEqual(['40', '40']));
    fireEvent.click(screen.getAllByText(/CRUCIFIXO/)[0]);
    await screen.findByText('CRUCIFIXO', { selector: 'h1' });
    await waitFor(() => expect(weights()).toEqual(['14', '14']));
  });

  it('variation uses its own history (never the plan target), and the original comes back on return', async () => {
    mock.currentIndex = 2;
    render(<TreinoExecucao />);
    await screen.findByText('HACK MACHINE', { selector: 'h1' });
    await waitFor(() => expect(weights()).toEqual(['120', '120']));
    fireEvent.click(screen.getByText('Variação', { selector: 'button' }));
    await screen.findByText('AGACHAMENTO LIVRE', { selector: 'h1' });
    await waitFor(() => expect(weights()).toEqual(['60', '60']));
    fireEvent.click(screen.getByText('Original', { selector: 'button' }));
    await screen.findByText('HACK MACHINE', { selector: 'h1' });
    await waitFor(() => expect(weights()).toEqual(['120', '120']));
  });

  it('variation without history stays empty instead of reusing the original load', async () => {
    mock.currentIndex = 3;
    render(<TreinoExecucao />);
    await screen.findByText('LEG PRESS', { selector: 'h1' });
    await waitFor(() => expect(weights()).toEqual(['200', '200']));
    fireEvent.click(screen.getByText('Variação', { selector: 'button' }));
    await screen.findByText('LEG PRESS HORIZONTAL', { selector: 'h1' });
    await waitFor(() => expect(weights()).toEqual(['', '']));
  });
});

describe('student rest by set type', () => {
  it('Aquecimento 60s, Preparatória 120s and Trabalho 180s, showing which rest is running', async () => {
    mock.currentIndex = 4;
    render(<TreinoExecucao />);
    await screen.findByText('AGACHAMENTO SMITH', { selector: 'h1' });
    fireEvent.click(screen.getByLabelText('Confirmar série 1'));
    await screen.findByText(/Descanso · Aquecimento 1 min/);
    expect(document.querySelector('[data-testid="inline-rest"] [role="timer"]')?.textContent).toBe('1:00');
    fireEvent.click(screen.getByLabelText('Confirmar série 2'));
    await screen.findByText(/Descanso · Preparatória 2 min/);
    expect(document.querySelector('[data-testid="inline-rest"] [role="timer"]')?.textContent).toBe('2:00');
    fireEvent.click(screen.getByLabelText('Confirmar série 3'));
    await screen.findByText(/Descanso · Trabalho 3 min/);
    expect(document.querySelector('[data-testid="inline-rest"] [role="timer"]')?.textContent).toBe('3:00');
  });

  it('exercise without set types keeps the plan pause, with no type label', async () => {
    mock.currentIndex = 3;
    render(<TreinoExecucao />);
    await screen.findByText('LEG PRESS', { selector: 'h1' });
    fireEvent.click(screen.getByLabelText('Confirmar série 1'));
    await screen.findByText('DESCANSO');
    expect(document.querySelector('[data-testid="inline-rest"] [role="timer"]')?.textContent).toBe('1:00');
    expect(screen.queryByText(/Descanso · /)).toBeNull();
  });
});
