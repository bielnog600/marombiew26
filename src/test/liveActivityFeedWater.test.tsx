import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveActivityFeed from '@/components/admin/LiveActivityFeed';

const mock = vi.hoisted(() => ({
  callback: null as null | ((payload: any) => Promise<void>),
  activity: null as any,
  selects: [] as string[],
  tracking: { id: 'tracking', student_id: 'student', date: '2026-10-29', water_glasses: 6, water_ml: 1500, updated_at: '2026-10-29T22:00:00Z', meals_completed: [], workout_completed: false },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const query: any = {
      select: (columns: string) => { if (table === 'daily_tracking') mock.selects.push(columns); return query; },
      or: () => query, order: () => query, gte: () => query, in: () => query, eq: () => query,
      limit: () => Promise.resolve({ data: table === 'daily_tracking' ? [mock.tracking] : [] }),
      then: (resolve: (value: any) => void) => resolve({ data: [{ user_id: 'student', nome: 'Teste' }] }),
      maybeSingle: () => Promise.resolve({ data: { nome: 'Teste' } }),
    };
    return query;
  },
  channel: () => {
    const channel = {
      on: (_event: string, filter: any, callback: any) => {
        if (filter.table === 'daily_tracking') mock.callback = callback;
        return channel;
      },
      subscribe: () => channel,
    };
    return channel;
  },
  removeChannel: vi.fn(),
} }));
vi.mock('@/components/admin/LiveActivityDetailDialog', () => ({ default: (props: any) => { mock.activity = props.activity; return null; } }));
afterEach(cleanup);

describe('water realtime feed integration', () => {
  it('initial load and partial-old realtime keep one daily row and pass the latest addition to the unchanged modal', async () => {
    const { container } = render(<LiveActivityFeed />);
    await waitFor(() => expect(container.querySelectorAll('button')).toHaveLength(1));
    expect(mock.selects[0].split(', ')).toContain('water_ml');
    const callback = mock.callback;
    if (!callback) throw new Error('Missing realtime subscription');
    await act(() => callback({ eventType: 'UPDATE', old: { id: 'tracking' }, new: { ...mock.tracking, water_ml: 1600, updated_at: '2026-10-29T22:01:00Z' } }));
    expect(container.querySelectorAll('button')).toHaveLength(1);
    const button = container.querySelector('button');
    if (!button) throw new Error('Missing daily water row');
    fireEvent.click(button);
    expect(mock.activity).toMatchObject({ key: 'dt-water-student-2026-10-29', studentId: 'student', date: '2026-10-29', at: '2026-10-29T22:01:00Z', addedGlasses: 0.4 });
    await act(() => callback({ eventType: 'UPDATE', old: { id: 'tracking' }, new: { ...mock.tracking, water_ml: 1400, updated_at: '2026-10-29T22:02:00Z' } }));
    fireEvent.click(button);
    expect(mock.activity.at).toBe('2026-10-29T22:01:00Z');
    expect(mock.activity.addedGlasses).toBe(0.4);
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });
});