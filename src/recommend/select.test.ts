import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../shared/time';
import type { BookmarkRow, HistoryRow } from '../shared/types';
import { buildCandidates, isEligible, scoreOf, selectDaily, statusOf, type Candidate } from './select';

const now = new Date(2026, 5, 1, 12).getTime();
const day = '2026-06-01';

function candidate(key: string, ageDays: number, history?: Partial<HistoryRow>, chains = [['0', '1']]): Candidate {
  return {
    urlKey: key,
    url: `https://${key}.com`,
    dateAdded: now - ageDays * DAY_MS,
    ancestorChains: chains,
    history: history && {
      urlKey: key,
      timesShown: 0,
      ignoredCount: 0,
      openedCount: 0,
      snoozedCount: 0,
      ...history,
    },
  };
}
const opts = { now, excludedFolderIds: [] as string[] };

describe('isEligible', () => {
  it('needs an age of at least 7 days', () => {
    expect(isEligible(candidate('a', 7), opts)).toBe(true);
    expect(isEligible(candidate('a', 6), opts)).toBe(false);
  });
  it('rejects dismissed bookmarks', () => {
    expect(isEligible(candidate('a', 30, { dismissedAt: now - DAY_MS }), opts)).toBe(false);
  });
  it('respects snooze until it expires', () => {
    expect(isEligible(candidate('a', 30, { snoozedUntil: now + 1 }), opts)).toBe(false);
    expect(isEligible(candidate('a', 30, { snoozedUntil: now }), opts)).toBe(true);
  });
  it('applies the 14-day ignored cooldown', () => {
    expect(isEligible(candidate('a', 30, { lastIgnoredAt: now - 13 * DAY_MS }), opts)).toBe(false);
    expect(isEligible(candidate('a', 30, { lastIgnoredAt: now - 14 * DAY_MS }), opts)).toBe(true);
  });
  it('applies the 90-day opened cooldown', () => {
    expect(isEligible(candidate('a', 200, { lastOpenedAt: now - 89 * DAY_MS }), opts)).toBe(false);
    expect(isEligible(candidate('a', 200, { lastOpenedAt: now - 90 * DAY_MS }), opts)).toBe(true);
  });
  it('rejects non-web URLs', () => {
    const c = { ...candidate('a', 30), url: 'chrome://settings' };
    expect(isEligible(c, opts)).toBe(false);
  });
  it('excludes a folder and everything inside it', () => {
    const c = candidate('a', 30, undefined, [['0', '1', '55', '66']]);
    expect(isEligible(c, { now, excludedFolderIds: ['55'] })).toBe(false);
  });
  it('stays eligible when one copy sits in an included folder', () => {
    const c = candidate('a', 30, undefined, [['0', '55'], ['0', '77']]);
    expect(isEligible(c, { now, excludedFolderIds: ['55'] })).toBe(true);
  });
});

describe('scoreOf', () => {
  it('uses age capped at 365', () => {
    expect(scoreOf(candidate('a', 100), now)).toBe(100);
    expect(scoreOf(candidate('a', 900), now)).toBe(365);
  });
  it('halves per ignored showing', () => {
    expect(scoreOf(candidate('a', 100, { ignoredCount: 2 }), now)).toBe(25);
  });
});

describe('selectDaily', () => {
  const base = { day, now, excludedFolderIds: [] as string[] };

  it('ranks by score and respects the count', () => {
    const picks = selectDaily([candidate('young', 10), candidate('old', 300), candidate('mid', 100)], {
      ...base,
      count: 2,
    });
    expect(picks).toEqual([
      { urlKey: 'old', fallback: false },
      { urlKey: 'mid', fallback: false },
    ]);
  });

  it('fills the remainder from newer saves, oldest first', () => {
    const picks = selectDaily([candidate('new1', 1), candidate('new5', 5), candidate('old', 30)], {
      ...base,
      count: 2,
    });
    expect(picks).toEqual([
      { urlKey: 'old', fallback: false },
      { urlKey: 'new5', fallback: true },
    ]);
  });

  it('relaxes only age in the fallback', () => {
    const picks = selectDaily([candidate('gone', 1, { dismissedAt: now }), candidate('later', 2, { snoozedUntil: now + DAY_MS })], {
      ...base,
      count: 3,
    });
    expect(picks).toEqual([]);
  });

  it('breaks ties deterministically', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((k) => candidate(k, 50));
    const first = selectDaily(items, { ...base, count: 3 });
    const second = selectDaily([...items].reverse(), { ...base, count: 3 });
    expect(second).toEqual(first);
  });
});

describe('buildCandidates', () => {
  const row = (id: string, urlKey: string, dateAdded: number, ancestorIds: string[]): BookmarkRow => ({
    id, urlKey, url: urlKey, title: id, dateAdded, folderId: ancestorIds.at(-1)!, ancestorIds, folderPath: '',
  });

  it('merges copies of one URL, keeping the oldest date and every folder', () => {
    const out = buildCandidates([row('1', 'k', 500, ['0', 'x']), row('2', 'k', 100, ['0', 'y'])], []);
    expect(out).toHaveLength(1);
    expect(out[0].dateAdded).toBe(100);
    expect(out[0].ancestorChains).toEqual([['0', 'x'], ['0', 'y']]);
  });
});

describe('statusOf', () => {
  const h = (extra: Partial<HistoryRow>): HistoryRow => ({
    urlKey: 'k', timesShown: 0, ignoredCount: 0, openedCount: 0, snoozedCount: 0, ...extra,
  });
  it('prefers dismissed, then snoozed, then opened', () => {
    expect(statusOf(undefined, now)).toBe('none');
    expect(statusOf(h({ openedCount: 1 }), now)).toBe('opened');
    expect(statusOf(h({ openedCount: 1, snoozedUntil: now + 1 }), now)).toBe('snoozed');
    expect(statusOf(h({ openedCount: 1, snoozedUntil: now - 1 }), now)).toBe('opened');
    expect(statusOf(h({ dismissedAt: now, snoozedUntil: now + 1 }), now)).toBe('dismissed');
  });
});
