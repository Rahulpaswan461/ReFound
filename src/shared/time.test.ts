import { describe, expect, it } from 'vitest';
import { DAY_MS, dayKey, savedAgo, snoozeUntil } from './time';

describe('dayKey', () => {
  it('uses the local calendar day', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 0, 6, 0, 1))).toBe('2026-01-06');
  });
});

describe('savedAgo', () => {
  const now = new Date(2026, 5, 1).getTime();
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [3, '3 days ago'],
    [15, '15 days ago'],
    [29, '29 days ago'],
    [30, '1 month ago'],
    [90, '3 months ago'],
    [364, '12 months ago'],
    [365, '1 year ago'],
    [800, '2 years ago'],
  ])('%d days', (days, text) => {
    expect(savedAgo(now - days * DAY_MS, now)).toBe(text);
  });
});

describe('snoozeUntil', () => {
  const now = new Date(2026, 5, 1, 15, 30);
  it('returns the start of the target local day', () => {
    expect(snoozeUntil('tomorrow', now)).toBe(new Date(2026, 5, 2).getTime());
    expect(snoozeUntil('3days', now)).toBe(new Date(2026, 5, 4).getTime());
    expect(snoozeUntil('nextWeek', now)).toBe(new Date(2026, 5, 8).getTime());
  });
});
