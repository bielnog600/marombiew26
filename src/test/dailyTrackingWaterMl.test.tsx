import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyTracking } from '@/hooks/useDailyTracking';

const mock = vi.hoisted(() => ({
  row: null as any,
  write: vi.fn().mockResolvedValue(undefined),
  user: { id: 'water-test-user' },
  event: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/hooks/useEventTracking', () => ({ useEventTracking: () => ({ trackEvent: mock.event }) }));
vi.mock('@/lib/offlineQueue', () => ({ writeWithFallback: mock.write }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/offlineCache', () => ({ fetchWithCache: async (key: string) =>
  key.startsWith('tracking:') ? mock.row : key.startsWith('weekly:') ? [] : null,
}));
beforeEach(() => { mock.write.mockClear(); localStorage.clear(); mock.row = null; });
afterEach(cleanup);
const open = async () => {
  const hook = renderHook(() => useDailyTracking());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};
describe('precise daily water persistence', () => {
  it('persists a 100ml addition even with zero full glasses, and removal in ml', async () => {
    const { result } = await open();
    act(() => result.current.addWaterMl(100));
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ water_glasses: 0, water_ml: 100 });
    expect(result.current.waterCurrentMl).toBe(100);
    act(() => result.current.addWaterMl(-50));
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ water_glasses: 0, water_ml: 50 });
  });
  it('hydrates exact ml and preserves its remainder when adding/removing a glass', async () => {
    mock.row = { water_glasses: 2, water_ml: 600, meals_completed: [], workout_completed: false };
    const { result } = await open();
    expect(result.current.waterCurrentMl).toBe(600);
    act(() => result.current.addWater());
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ water_glasses: 3, water_ml: 850 });
    act(() => result.current.removeWater());
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ water_glasses: 2, water_ml: 600 });
    act(() => result.current.toggleMeal(0));
    expect(mock.write.mock.lastCall?.[0].payload.water_ml).toBe(600);
    expect(result.current.waterTargetMl).toBe(2000);
  });
  it('keeps legacy local fractions and records the exact total on the next water edit', async () => {
    mock.row = { water_glasses: 2, water_ml: null, meals_completed: [], workout_completed: false };
    localStorage.setItem(`water-extra-${mock.user.id}-${new Date().toISOString().slice(0, 10)}`, '100');
    const { result } = await open();
    expect(result.current.waterCurrentMl).toBe(600);
    act(() => result.current.addWaterMl(200));
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ water_glasses: 3, water_ml: 800 });
    act(() => result.current.addWaterMl(-1000));
    expect(mock.write.mock.lastCall?.[0].payload).toMatchObject({ water_glasses: 0, water_ml: 0 });
  });
});