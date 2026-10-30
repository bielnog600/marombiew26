import { describe, expect, it } from 'vitest';
import { canRegisterTrackingDate, emptyDailyTracking, getWeekRange, localDateKey, summarizeDietWeek } from '@/lib/localTrackingWeek';

describe('local tracking calendar', () => {
  it('uses Monday through Sunday for Friday October 30', () => {
    expect(getWeekRange(new Date(2026, 9, 30)).dates).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
  });
  it('Sunday is the last date, Monday opens the next week', () => {
    expect(getWeekRange(new Date(2026, 10, 1)).start).toBe('2026-10-26');
    expect(getWeekRange(new Date(2026, 10, 2)).start).toBe('2026-11-02');
  });
  it('uses local calendar fields, not the UTC date after 22h in UTC−3', () => {
    // This file is also run under TZ=America/Sao_Paulo to test the real offset.
    const localNight = new Date(2026, 9, 30, 22);
    expect(localDateKey(localNight)).toBe('2026-10-30');
    if (localNight.getTimezoneOffset() === 180) {
      expect(localNight.toISOString().slice(0, 10)).toBe('2026-10-31');
      expect(localDateKey(new Date('2026-10-31T01:00:00Z'))).toBe('2026-10-30');
    }
  });
  it('allows corrections from this week, blocks future and previous week', () => {
    expect(canRegisterTrackingDate('2026-10-29', '2026-10-30')).toBe(true);
    expect(canRegisterTrackingDate('2026-10-31', '2026-10-30')).toBe(false);
    expect(canRegisterTrackingDate('2026-10-25', '2026-10-30')).toBe(false);
  });
});

describe('prescribed weekly adherence', () => {
  const row = { ...emptyDailyTracking(), meals_completed: [3000, 3001, 3002, 3003] };
  it('counts only elapsed registered dates, with inclusive ±50 kcal', () => {
    const summary = summarizeDietWeek([
      { date: '2026-10-26', tracking: row, consumedKcal: 2402, targetKcal: 2452 },
      { date: '2026-10-27', tracking: row, consumedKcal: 2502, targetKcal: 2452 },
      { date: '2026-10-28', tracking: row, consumedKcal: 2401, targetKcal: 2452 },
      { date: '2026-10-29', tracking: row, consumedKcal: 2651, targetKcal: 2452 },
      { date: '2026-10-30', consumedKcal: 0, targetKcal: 2452 },
      { date: '2026-10-31', tracking: row, consumedKcal: 2452, targetKcal: 2452 },
    ], '2026-10-30');
    expect(summary).toEqual({ within: 2, registered: 4, statuses: ['within', 'within', 'below', 'above', null, null] });
  });
  it('compares each day with its own target, counts water-only records as below', () => {
    expect(summarizeDietWeek([
      { date: '2026-10-29', tracking: row, consumedKcal: 1600, targetKcal: 1600 },
      { date: '2026-10-30', tracking: { ...emptyDailyTracking(), water_ml: 100 }, consumedKcal: 0, targetKcal: 2452 },
    ], '2026-10-30')).toEqual({ within: 1, registered: 2, statuses: ['within', 'below'] });
  });
});