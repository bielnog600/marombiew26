import { describe, expect, it } from 'vitest';
import { upsertWaterFeedItem, waterFeedKey, waterTotalMl } from '@/lib/liveActivityWater';

const row = { student_id: 'student-a', date: '2026-10-29', water_glasses: 6, water_ml: 1500 };
const water = { key: waterFeedKey(row), detail: 'old', at: 'first', addedGlasses: 1 };
const workout = { key: 'ws-start-session', detail: 'workout', at: 'workout', addedGlasses: 0 };

describe('daily admin water feed', () => {
  it('keys water by student and day, independent of amount', () => {
    expect(waterFeedKey(row)).toBe('dt-water-student-a-2026-10-29');
    expect(waterFeedKey({ ...row, water_ml: 1600 })).toBe(water.key);
    expect(waterFeedKey({ ...row, date: '2026-10-30' })).not.toBe(water.key);
    expect(waterFeedKey({ ...row, student_id: 'student-b' })).not.toBe(water.key);
  });
  it('uses precise ml, including zero, and falls back to 250 ml per glass', () => {
    expect(waterTotalMl({ water_ml: 1600, water_glasses: 6 })).toBe(1600);
    expect(waterTotalMl({ water_ml: 0, water_glasses: 6 })).toBe(0);
    expect(waterTotalMl({ water_ml: null, water_glasses: 6 })).toBe(1500);
  });
  it('fractional additions count even without an increase in glasses', () => {
    const oldMl = waterTotalMl(row);
    const newMl = waterTotalMl({ ...row, water_ml: 1600 });
    expect(newMl > oldMl).toBe(true);
    expect((newMl - oldMl) / 250).toBe(0.4);
  });
  it('replaces a daily line at the top with last addition time and delta', () => {
    const next = { ...water, detail: 'new total', at: 'latest', addedGlasses: 0.4 };
    const result = upsertWaterFeedItem([workout, water], next, true, 40);
    expect(result).toEqual([next, workout]);
    expect(result.filter(item => item.key === water.key)).toHaveLength(1);
  });
  it('creates a missing daily line on increase', () => {
    expect(upsertWaterFeedItem([workout], water, true, 40)).toEqual([water, workout]);
  });
  it('reductions update only total, without moving or changing last addition', () => {
    const result = upsertWaterFeedItem([workout, water], { ...water, detail: '0 L', at: 'correction', addedGlasses: -1 }, false, 40);
    expect(result).toEqual([workout, { ...water, detail: '0 L' }]);
  });
  it('does not introduce a new activity for a decrease outside the feed', () => {
    expect(upsertWaterFeedItem([workout], water, false, 40)).toEqual([workout]);
  });
  it('retains other activities and the existing feed limit', () => {
    expect(upsertWaterFeedItem([workout], water, true, 1)).toEqual([water]);
    expect(workout.detail).toBe('workout');
  });
});