import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkoutLogTransition } from '@/lib/adminWorkoutLogTransition';
import { buildActivityExercises } from '@/lib/adminActivityExercises';

afterEach(() => vi.useRealTimers());
const live = {
  status: 'in_progress',
  session_state: { exerciseNames: ['PULLDOWN'], sets: [[
    { completed: true, reps: 12, weight: 40 }, { completed: true, reps: 10, weight: 40 },
  ]] },
};
const completed = { status: 'completed', session_state: { status: 'completed' } };

describe('admin completion log transition', () => {
  it('keeps both live sets when completion arrives before empty/partial logs and retries at 2s and 5s', () => {
    vi.useFakeTimers();
    const publish = vi.fn(); const reload = vi.fn();
    const bridge = createWorkoutLogTransition(publish, reload);
    bridge.receiveSession(live); bridge.receiveSession(completed);
    expect(bridge.receiveLogs(0)).toBe(false);
    expect(buildActivityExercises(publish.mock.lastCall?.[0], [], null)[0].sets).toHaveLength(2);
    expect(bridge.receiveLogs(1)).toBe(false);
    vi.advanceTimersByTime(1999); expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000); expect(reload).toHaveBeenCalledTimes(2);
    bridge.dispose();
  });
  it('uses complete persisted logs and cancels pending retries', () => {
    vi.useFakeTimers();
    const publish = vi.fn(); const reload = vi.fn();
    const bridge = createWorkoutLogTransition(publish, reload);
    bridge.receiveSession(live); bridge.receiveSession(completed); bridge.receiveLogs(1);
    expect(bridge.receiveLogs(2)).toBe(true);
    expect(publish).toHaveBeenLastCalledWith(completed);
    vi.advanceTimersByTime(5000); expect(reload).not.toHaveBeenCalled();
  });
  it('retries an initially completed empty session, and clears timers on unmount', () => {
    vi.useFakeTimers();
    const reload = vi.fn(); const bridge = createWorkoutLogTransition(vi.fn(), reload);
    bridge.receiveSession(completed); expect(bridge.receiveLogs(0)).toBe(false);
    bridge.dispose(); vi.advanceTimersByTime(5000); expect(reload).not.toHaveBeenCalled();
  });
});