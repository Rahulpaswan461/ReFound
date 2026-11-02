import { buildCandidates, selectDaily } from '../recommend/select';
import { dayKey } from '../shared/time';
import type { DailyRow, HistoryRow } from '../shared/types';
import { db } from '../store/db';
import { getSettings } from '../store/settings';

export interface PickView {
  urlKey: string;
  url: string;
  title: string;
  dateAdded: number;
  fallback: boolean;
}

function startOfKey(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

const emptyHistory = (urlKey: string): HistoryRow => ({
  urlKey, timesShown: 0, ignoredCount: 0, openedCount: 0, snoozedCount: 0,
});

/** Picks left untouched on the most recent day count as ignored, once. */
async function settlePreviousDay(today: string): Promise<void> {
  const previous = await db.daily.where('day').below(today).last();
  if (!previous) return;
  for (const slot of previous.slots) {
    if (slot.status !== 'active') continue;
    const h = (await db.history.get(slot.urlKey)) ?? emptyHistory(slot.urlKey);
    await db.history.put({
      ...h,
      ignoredCount: h.ignoredCount + 1,
      lastIgnoredAt: startOfKey(previous.day),
    });
  }
}

/** Returns today's saved picks, selecting them if this is the day's first tab. */
export async function ensureToday(now = new Date()): Promise<DailyRow | null> {
  const settings = await getSettings();
  const day = dayKey(now);
  if (!settings.setupComplete) return null;
  const saved = await db.daily.get(day);
  if (saved?.slots.length) return saved;
  if (!settings.showRecommendations) return saved ?? null;

  return db.transaction('rw', db.bookmarks, db.history, db.daily, async () => {
    const raced = await db.daily.get(day);
    if (raced?.slots.length) return raced;

    // An empty day stays open, so restoring a folder or saving a page gives picks at once.
    if (!raced) await settlePreviousDay(day);
    const candidates = buildCandidates(await db.bookmarks.toArray(), await db.history.toArray());
    const picks = selectDaily(candidates, {
      day,
      count: settings.dailyCount,
      now: now.getTime(),
      excludedFolderIds: settings.excludedFolderIds,
    });

    const row: DailyRow = {
      day,
      slots: picks.map((p) => ({ urlKey: p.urlKey, fallback: p.fallback, status: 'active' })),
    };
    for (const { urlKey } of picks) {
      const h = (await db.history.get(urlKey)) ?? emptyHistory(urlKey);
      await db.history.put({ ...h, timesShown: h.timesShown + 1, lastShownAt: now.getTime() });
    }
    await db.daily.put(row);
    return row;
  });
}

/** The entry point for a tab: catches up with Chrome before the day's selection. */
export async function prepareToday(sync: () => Promise<void>, now = new Date()): Promise<DailyRow | null> {
  const saved = await db.daily.get(dayKey(now));
  if (saved?.slots.length) return saved;
  await sync().catch((error) => console.warn('ReFound: bookmark sync failed', error));
  return ensureToday(now);
}

export async function activePicks(row: DailyRow): Promise<PickView[]> {
  const views: PickView[] = [];
  for (const slot of row.slots) {
    if (slot.status !== 'active') continue;
    const copies = await db.bookmarks.where('urlKey').equals(slot.urlKey).toArray();
    if (!copies.length) continue;
    const oldest = copies.reduce((a, b) => (b.dateAdded < a.dateAdded ? b : a));
    views.push({
      urlKey: slot.urlKey,
      url: oldest.url,
      title: oldest.title,
      dateAdded: oldest.dateAdded,
      fallback: slot.fallback,
    });
  }
  return views;
}
