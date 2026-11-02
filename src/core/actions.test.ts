import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../store/db';
import { getSettings, saveSettings } from '../store/settings';
import { clearReFoundData, dismiss, openBookmark, pauseToday, restore, resumeToday, snooze, undoDismiss } from './actions';
import { getStats } from './stats';

const key = 'https://a.com';
const now = new Date(2026, 5, 1, 9);
const day = '2026-06-01';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.history.put({ urlKey: key, timesShown: 3, ignoredCount: 2, openedCount: 0, snoozedCount: 0 });
  await db.daily.put({ day, slots: [{ urlKey: key, status: 'active', fallback: false }] });
});

const slot = async () => (await db.daily.get(day))!.slots[0];

describe('actions', () => {
  it('open records the open, resets ignored and empties the slot', async () => {
    await openBookmark(key, now);
    const h = (await db.history.get(key))!;
    expect(h).toMatchObject({ openedCount: 1, lastOpenedAt: now.getTime(), ignoredCount: 0 });
    expect((await slot()).status).toBe('opened');
  });

  it('open works for a bookmark with no history yet', async () => {
    await openBookmark('https://new.com', now);
    expect((await db.history.get('https://new.com'))!.openedCount).toBe(1);
  });

  it('snooze stores the date, resets ignored and empties the slot', async () => {
    await snooze(key, 12345, now);
    expect(await db.history.get(key)).toMatchObject({ snoozedUntil: 12345, snoozedCount: 1, ignoredCount: 0 });
    expect((await slot()).status).toBe('snoozed');
  });

  it('dismiss excludes without touching ignored, and undo puts the slot back', async () => {
    await dismiss(key, now);
    expect((await db.history.get(key))!.dismissedAt).toBe(now.getTime());
    expect((await slot()).status).toBe('dismissed');

    await undoDismiss(key, now);
    expect((await db.history.get(key))!.dismissedAt).toBeUndefined();
    expect((await slot()).status).toBe('active');
  });

  it('restore clears dismissal and ignored, without refilling the slot', async () => {
    await dismiss(key, now);
    await restore(key);
    expect(await db.history.get(key)).toMatchObject({ ignoredCount: 0 });
    expect((await db.history.get(key))!.dismissedAt).toBeUndefined();
    expect((await slot()).status).toBe('dismissed');
  });

  it('does not touch other days', async () => {
    await db.daily.put({ day: '2026-05-31', slots: [{ urlKey: key, status: 'active', fallback: false }] });
    await openBookmark(key, now);
    expect((await db.daily.get('2026-05-31'))!.slots[0].status).toBe('active');
  });
});

describe('clearReFoundData', () => {
  it('removes history, picks, uploads and settings but keeps the bookmark mirror', async () => {
    await saveSettings({ setupComplete: true, dailyCount: 5 });
    await db.wallpapers.put({ id: 'w', name: 'w', blob: new Blob(['x']), addedAt: 1 });
    await db.bookmarks.put({
      id: '1', url: key, urlKey: key, title: 'a', dateAdded: 1, folderId: '1', ancestorIds: ['0'], folderPath: '',
    });
    await clearReFoundData();
    expect(await db.history.count()).toBe(0);
    expect(await db.daily.count()).toBe(0);
    expect(await db.wallpapers.count()).toBe(0);
    expect(await db.bookmarks.count()).toBe(1);
    expect((await getSettings()).dailyCount).toBe(3);
  });
});

describe('getStats', () => {
  it('summarises local history', async () => {
    await db.daily.put({
      day,
      slots: [
        { urlKey: key, status: 'opened', fallback: false },
        { urlKey: 'b', status: 'snoozed', fallback: false },
        { urlKey: 'c', status: 'dismissed', fallback: false },
        { urlKey: 'd', status: 'active', fallback: false },
      ],
    });
    expect(await getStats()).toEqual({ resurfaced: 4, opened: 1, openRate: 25, snoozed: 1, dismissed: 1, daysActive: 1 });
  });
});

describe('pausing today', () => {
  it('hides active picks without counting them as ignored, and resumes them', async () => {
    await db.daily.put({
      day,
      slots: [
        { urlKey: key, status: 'active', fallback: false },
        { urlKey: 'b', status: 'opened', fallback: false },
      ],
    });
    await pauseToday(now);
    expect((await db.daily.get(day))!.slots.map((s) => s.status)).toEqual(['paused', 'opened']);

    await resumeToday(now);
    expect((await db.daily.get(day))!.slots.map((s) => s.status)).toEqual(['active', 'opened']);
  });
});
