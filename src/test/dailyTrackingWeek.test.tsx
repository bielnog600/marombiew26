import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyTracking } from '@/hooks/useDailyTracking';

const mock = vi.hoisted(() => ({ rows: [] as any[], keys: [] as string[],
  write: vi.fn().mockResolvedValue(undefined), cache: vi.fn(), toast: vi.fn(), event: vi.fn(),
  user: { id: 'week-user' },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/hooks/useEventTracking', () => ({ useEventTracking: () => ({ trackEvent: mock.event }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: mock.toast }));
vi.mock('@/lib/offlineQueue', () => ({ writeWithFallback: mock.write }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/offlineCache', () => ({ setCache: mock.cache, fetchWithCache: async (key: string) => {
  mock.keys.push(key);
  return { data: key.startsWith('tracking-week:') ? mock.rows.filter(row =>
    row.date >= key.slice(-10) && row.date <= (key.endsWith('2026-10-26') ? '2026-11-01' : '2026-11-08')) : null };
} }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 30, 22));
  mock.rows = [{ id: 'thu', date: '2026-10-29', water_glasses: 12, water_ml: 3000,
    meals_completed: [3000, 3001, 3002, 3003], workout_completed: true }];
  mock.keys = []; mock.write.mockClear(); mock.cache.mockClear(); mock.toast.mockClear();
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('week tracking selection and writes', () => {
  it('past Thursday reads saved meals and exact water without refetching on tab change', async () => {
    const { result, rerender } = renderHook(({ date }) => useDailyTracking({ date }), { initialProps: { date: '2026-10-29' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tracking.meals_completed).toEqual([3000, 3001, 3002, 3003]);
    expect(result.current.waterCurrentMl).toBe(3000);
    expect(result.current.weeklyWorkouts).toBe(1);
    const queries = mock.keys.length;
    rerender({ date: '2026-10-30' });
    expect(result.current.tracking.meals_completed).toEqual([]);
    expect(result.current.waterCurrentMl).toBe(0);
    rerender({ date: '2026-10-29' });
    expect(result.current.waterCurrentMl).toBe(3000);
    expect(mock.keys.length).toBe(queries);
  });
  it('toggle and water corrections write Thursday, preserving its other fields', async () => {
    const { result } = renderHook(() => useDailyTracking({ date: '2026-10-29' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.toggleMeal(3002));
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ date: '2026-10-29', meals_completed: [3000, 3001, 3003], water_ml: 3000 });
    act(() => result.current.addWaterMl(100));
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ date: '2026-10-29', water_ml: 3100 });
    expect(localStorage.getItem('water-extra-week-user-2026-10-29')).toBe('100');
    expect(mock.cache.mock.calls.some(([key]) => key === 'tracking-week:week-user:2026-10-26')).toBe(true);
  });
  it('future date blocks meal and both water APIs without local mutations', async () => {
    const { result } = renderHook(() => useDailyTracking({ date: '2026-10-31' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.toggleMeal(5000); result.current.addWaterMl(100); result.current.addWater(); result.current.removeWater(); });
    expect(mock.write).not.toHaveBeenCalled();
    expect(mock.toast).toHaveBeenCalledWith({ title: 'Esse dia ainda não chegou' });
    expect(result.current.waterCurrentMl).toBe(0);
    expect(localStorage.getItem('water-extra-week-user-2026-10-31')).toBeNull();
  });
  it('Monday starts empty and retains previous records without deletes', async () => {
    const { result, unmount } = renderHook(() => useDailyTracking());
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    vi.setSystemTime(new Date(2026, 10, 2, 9));
    const next = renderHook(() => useDailyTracking());
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(next.result.current.weekDates[0]).toBe('2026-11-02');
    expect(next.result.current.weeklyTracking).toEqual({});
    expect(next.result.current.weeklyWorkouts).toBe(0);
    expect(mock.rows[0].meals_completed).toEqual([3000, 3001, 3002, 3003]);
    expect(mock.write).not.toHaveBeenCalled();
  });
  it('default Home consumer writes local today at 22h, including cache and water keys', async () => {
    const { result } = renderHook(() => useDailyTracking());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.addWaterMl(100));
    expect(mock.write.mock.lastCall?.[0].payload.date).toBe('2026-10-30');
    expect(localStorage.getItem('water-extra-week-user-2026-10-30')).toBe('100');
    expect(mock.cache.mock.calls.some(([key]) => key === 'tracking:week-user:2026-10-30')).toBe(true);
  });
});