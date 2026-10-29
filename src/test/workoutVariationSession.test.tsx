import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildActivityExercises } from '@/lib/adminActivityExercises';
import { exerciseProgress } from '@/lib/adminExerciseProgress';
import { buildSessionStateLogRows } from '@/lib/workoutSessionResolution';

const mock = vi.hoisted(() => ({
  user: { id: 'variation-student' },
  exercises: [
    { id: 'slot-0', exercise: 'MOBILIDADE', series: '1', reps: '10' },
    { id: 'slot-1', exercise: 'LEG PRESS', series: '1', reps: '10' },
    { id: 'slot-2', exercise: 'HACK MACHINE', variation: 'AGACHAMENTO LIVRE', series: '2', reps: '8-12' },
  ],
  updates: [] as any[],
  local: vi.fn(),
  noop: vi.fn(),
  stored: {} as Record<string, unknown>,
  fail: false,
  sets: { 2: [{ weight: '60', reps: '10', completed: true }, { weight: '55', reps: '12', completed: false }] },
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mock.noop,
  useLocation: () => ({ key: 'variation-test', state: { exercises: mock.exercises, dayName: 'QUINTA-FEIRA', phase: 'semana_2' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/hooks/useDailyTracking', () => ({ useDailyTracking: () => ({ completeWorkout: mock.noop }) }));
vi.mock('@/hooks/useActiveWorkoutSession', () => ({ useActiveWorkoutSession: () => ({ session: null, refresh: mock.noop, clear: mock.noop, setLocal: mock.local }) }));
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
    let operation = 'select'; let payload: any;
    const result = () => {
      if (table === 'workout_sessions' && operation === 'select') return { data: {
        id: 'df07c002-ca46-4cbc-b3fe-6f49f85e71c8', started_at: new Date().toISOString(), last_active_at: new Date().toISOString(),
        day_name: 'QUINTA-FEIRA', phase: 'semana_2', status: 'in_progress',
        session_state: { currentIndex: 2, sets: mock.sets },
      }, error: null };
      if (table === 'exercises') return { data: mock.exercises.flatMap(ex => [ex.exercise, ex.variation].filter(Boolean).map(nome => ({
        id: nome, nome, imagem_url: null, video_embed: null, grupo_muscular: 'PERNAS',
      }))), error: null };
      if (table === 'student_exercise_adjustments') {
        if (operation === 'upsert' && !mock.fail) mock.stored = payload.valores;
        return { data: operation === 'select' ? { valores: mock.stored } : null, error: operation === 'upsert' && mock.fail ? { message: 'failed' } : null };
      }
      return { data: [], error: null };
    };
    const q: any = {};
    for (const method of ['select', 'eq', 'neq', 'ilike', 'order', 'limit', 'lt', 'gte', 'in', 'range']) q[method] = () => q;
    q.update = (value: any) => { operation = 'update'; mock.updates.push(value); return q; };
    q.upsert = (value: any) => { operation = 'upsert'; payload = value; return q; };
    q.maybeSingle = q.single = async () => result();
    q.then = (resolve: any) => Promise.resolve(result()).then(resolve);
    return q;
  },
} }));

import TreinoExecucao from '@/pages/TreinoExecucao';
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); localStorage.clear(); mock.updates.length = 0; mock.stored = {}; mock.fail = false; });

describe('active variation session identity', () => {
  it('flushes slot 2 immediately in both directions, retains sets, and supplies the executed name to recovery/admin history', async () => {
    render(<TreinoExecucao />);
    await screen.findByRole('heading', { name: 'HACK MACHINE' });
    await waitFor(() => expect(mock.local).toHaveBeenCalled());
    mock.updates.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Variação' }));
    expect(mock.updates[0].session_state.exerciseNames).toEqual(['MOBILIDADE', 'LEG PRESS', 'AGACHAMENTO LIVRE']);
    const state = mock.updates[0].session_state;
    expect(state.exerciseSlotIds).toEqual(['slot-0', 'slot-1', 'slot-2']);
    expect(state.sets).toEqual(mock.sets);
    await screen.findByRole('heading', { name: 'AGACHAMENTO LIVRE' });
    const recovery = buildSessionStateLogRows({ id: 'session', student_id: mock.user.id, phase: 'semana_2', day_name: 'QUINTA-FEIRA' }, state, '2026-10-29T22:00:00Z');
    expect(recovery.rows[0].exercise_name).toBe('AGACHAMENTO LIVRE');
    expect(recovery.totalSets).toBe(1);
    const card = buildActivityExercises({ session_state: state }, [], mock.exercises)[2];
    expect(card.name).toBe('AGACHAMENTO LIVRE');
    expect(card.variationOf).toBe('HACK MACHINE');
    const progress = exerciseProgress(card.name, card.sets, [
      { exercise_name: 'HACK MACHINE', session_id: 'other', performed_at: '2026-10-28T21:00:00Z', weight_kg: 100, reps: 10 },
      { exercise_name: 'AGACHAMENTO LIVRE', session_id: 'previous', performed_at: '2026-10-27T21:00:00Z', weight_kg: 50, reps: 10 },
    ], 'session', '2026-10-29T22:00:00Z');
    expect(progress.lastLoad).toBe(50);
    await act(async () => {});
    mock.updates.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /Original/ }));
    expect(mock.updates[0].session_state.exerciseNames[2]).toBe('HACK MACHINE');
    expect(mock.updates[0].session_state.sets).toEqual(mock.sets);
    await screen.findByRole('heading', { name: 'HACK MACHINE' });
  });
});