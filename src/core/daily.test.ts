import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../store/db';
import { saveSettings } from '../store/settings';
import { DAY_MS } from '../shared/time';
import type { BookmarkRow } from '../shared/types';
import { ensureToday, prepareToday } from './daily';

const day1 = new Date(2026, 5, 1, 9);
const day2 = new Date(2026, 5, 2, 9);
const day5 = new Date(2026, 5, 5, 9);

const row = (id: string, ageDays: number): BookmarkRow => ({
  id,
  url: `https://${id}.com`,
  urlKey: `https://${id}.com`,
  title: id,
  dateAdded: day1.getTime() - ageDays * DAY_MS,
  folderId: '1',
  ancestorIds: ['0', '1'],
  folderPath: 'Bookmarks bar',
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await saveSettings({ setupComplete: true, showRecommendations: true, dailyCount: 2, excludedFolderIds: [] });
  await db.bookmarks.bulkPut([row('a', 300), row('b', 200), row('c', 100), row('d', 50)]);
});

describe('ensureToday', () => {
  it('selects once and returns the same picks on later calls', async () => {
    const first = await ensureToday(day1);
    await db.bookmarks.put(row('z', 900));
    const second = await ensureToday(day1);
    expect(first!.slots.map((s) => s.urlKey)).toEqual(['https://a.com', 'https://b.com']);
    expect(second).toEqual(first);
  });

  it('counts each pick as shown once per day', async () => {
    await ensureToday(day1);
    await ensureToday(day1);
    expect((await db.history.get('https://a.com'))!.timesShown).toBe(1);
  });

  it('handles two tabs racing on the first open of a day', async () => {
    await ensureToday(day1);
    const [x, y] = await Promise.all([ensureToday(day2), ensureToday(day2)]);
    expect(x).toEqual(y);
    expect((await db.history.get('https://a.com'))!.ignoredCount).toBe(1);
    expect(await db.daily.count()).toBe(2);
  });

  it('settles ignored picks at rollover and rests them', async () => {
    await ensureToday(day1);
    const next = await ensureToday(day2);
    const h = await db.history.get('https://a.com');
    expect(h!.ignoredCount).toBe(1);
    expect(h!.lastIgnoredAt).toBeDefined();
    expect(next!.slots.map((s) => s.urlKey)).toEqual(['https://c.com', 'https://d.com']);
  });

  it('does not count acted-on picks as ignored', async () => {
    const today = await ensureToday(day1);
    today!.slots[0].status = 'opened';
    await db.daily.put(today!);
    await ensureToday(day2);
    expect((await db.history.get('https://a.com'))!.ignoredCount).toBe(0);
    expect((await db.history.get('https://b.com'))!.ignoredCount).toBe(1);
  });

  it('settles only once across a gap of several days', async () => {
    await ensureToday(day1);
    await ensureToday(day5);
    expect((await db.history.get('https://a.com'))!.ignoredCount).toBe(1);
    expect(await db.daily.count()).toBe(2);
  });

  it('does nothing before setup or when recommendations are off', async () => {
    await saveSettings({ setupComplete: false });
    expect(await ensureToday(day1)).toBeNull();
    await saveSettings({ setupComplete: true, showRecommendations: false });
    expect(await ensureToday(day1)).toBeNull();
    expect(await db.daily.count()).toBe(0);
  });

  it('keeps showing today after count changes', async () => {
    await ensureToday(day1);
    await saveSettings({ dailyCount: 1 });
    expect((await ensureToday(day1))!.slots).toHaveLength(2);
  });

  it('saves an empty day when nothing qualifies', async () => {
    await db.bookmarks.clear();
    expect((await ensureToday(day1))!.slots).toEqual([]);
  });
});

describe('an empty day', () => {
  it('selects again once something qualifies, without settling twice', async () => {
    await ensureToday(day1);
    const saved = await db.daily.get('2026-06-01');
    await db.bookmarks.clear();
    await ensureToday(day2);
    expect(await db.daily.get('2026-06-02')).toMatchObject({ slots: [] });
    await db.bookmarks.put(row('e', 90));
    const retried = await ensureToday(day2);
    expect(retried!.slots.map((s) => s.urlKey)).toEqual(['https://e.com']);
    expect((await db.history.get(saved!.slots[0].urlKey))!.ignoredCount).toBe(1);
  });

  it('prepareToday syncs again while the day is empty', async () => {
    await db.bookmarks.clear();
    await ensureToday(day1);
    const sync = vi.fn(async () => {
      await db.bookmarks.put(row('e', 90));
    });
    const today = await prepareToday(sync, day1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(today!.slots).toHaveLength(1);
  });
});

describe('prepareToday', () => {
  it('reconciles once, only for the first tab of a day', async () => {
    const sync = vi.fn(async () => {});
    await prepareToday(sync, day1);
    await prepareToday(sync, day1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('still selects when reconciling fails', async () => {
    const today = await prepareToday(async () => {
      throw new Error('bookmarks unavailable');
    }, day1);
    expect(today!.slots).toHaveLength(2);
  });
});
