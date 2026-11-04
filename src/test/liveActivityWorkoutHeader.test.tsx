import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LiveActivityDetailDialog from '@/components/admin/LiveActivityDetailDialog';

const mock = vi.hoisted(() => ({
  session: null as any,
  logs: [] as any[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    from: (table: string) => {
      const rows = () => (table === 'workout_sessions'
        ? (mock.session ? [mock.session] : [])
        : table === 'exercise_set_logs' ? mock.logs : []);
      const query: any = {
        select: () => query,
        eq: () => query, in: () => query, lt: () => query, gte: () => query,
        order: () => query, range: () => query, limit: () => query,
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null }),
        then: (resolve: (value: any) => void) => Promise.resolve({ data: rows() }).then(resolve),
      };
      return query;
    },
    channel: () => channel,
    removeChannel: vi.fn(),
  } };
});

afterEach(cleanup);

const STARTED = '2026-11-04T10:33:00.000Z';
const FINISHED = '2026-11-04T10:33:10.000Z';

const sessionState = {
  exerciseNames: ['Agachamento'],
  exerciseSlotIds: ['slot-1'],
  plannedSets: [3],
  currentIndex: 0,
  sets: { 0: [{ reps: 10, weight: 60, completed: true }] },
};

const logs = [{
  exercise_name: 'Agachamento', exercise_slot_id: 'slot-1', set_number: 1,
  reps: 10, weight_kg: 60, rpe: null, rir: null, set_type: 'trabalho',
  sub_records: null, performed_at: '2026-11-04T10:35:00.000Z',
}];

const open = (session: any) => render(
  <MemoryRouter>
    <LiveActivityDetailDialog
      activity={{ kind: 'workout_start', studentId: 'student', studentName: 'Teste', at: STARTED, sessionId: 'session' }}
      onClose={vi.fn()}
    />
  </MemoryRouter>,
);

describe('live workout header', () => {
  it('hides the end time while the session is still live, even when a stale completed_at exists', async () => {
    mock.logs = logs;
    mock.session = {
      id: 'session', student_id: 'student', status: 'in_progress', day_name: 'QUARTA-FEIRA',
      started_at: STARTED, started_at_real: STARTED,
      last_active_at: new Date().toISOString(),
      completed_at: FINISHED, completed_at_real: FINISHED,
      session_state: sessionState,
    };
    open(mock.session);
    const line = await screen.findByText(/Início/);
    expect(line.textContent).toContain('Início');
    expect(line.textContent).not.toContain('Fim');
    expect(await screen.findByText('Ao vivo')).toBeInTheDocument();
  });

  it('shows the end time only once the session is finalized', async () => {
    mock.logs = logs;
    mock.session = {
      id: 'session', student_id: 'student', status: 'completed', day_name: 'QUARTA-FEIRA',
      started_at: STARTED, started_at_real: STARTED,
      last_active_at: FINISHED,
      completed_at: FINISHED, completed_at_real: FINISHED,
      session_state: sessionState,
    };
    open(mock.session);
    const line = await screen.findByText(/Início/);
    expect(line.textContent).toContain('Fim');
    expect(await screen.findByText('Finalizado')).toBeInTheDocument();
    await waitFor(() => expect(mock.session.status).toBe('completed'));
  });
});
