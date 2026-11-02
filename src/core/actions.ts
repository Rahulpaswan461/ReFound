import { dayKey } from '../shared/time';
import type { HistoryRow, SlotStatus } from '../shared/types';
import { db } from '../store/db';
import { resetSettings } from '../store/settings';

function record(
  urlKey: string,
  now: Date,
  change: (h: HistoryRow) => HistoryRow,
  slot?: { from?: SlotStatus; to: SlotStatus },
): Promise<void> {
  return db.transaction('rw', db.history, db.daily, async () => {
    const h = (await db.history.get(urlKey)) ?? {
      urlKey, timesShown: 0, ignoredCount: 0, openedCount: 0, snoozedCount: 0,
    };
    await db.history.put(change(h));
    if (!slot) return;
    const today = await db.daily.get(dayKey(now));
    const target = today?.slots.find((s) => s.urlKey === urlKey);
    if (!today || !target || (slot.from && target.status !== slot.from)) return;
    target.status = slot.to;
    await db.daily.put(today);
  });
}

export function openBookmark(urlKey: string, now = new Date()): Promise<void> {
  return record(
    urlKey,
    now,
    (h) => ({ ...h, openedCount: h.openedCount + 1, lastOpenedAt: now.getTime(), ignoredCount: 0 }),
    { to: 'opened' },
  );
}

export function snooze(urlKey: string, until: number, now = new Date()): Promise<void> {
  return record(
    urlKey,
    now,
    (h) => ({ ...h, snoozedUntil: until, snoozedCount: h.snoozedCount + 1, ignoredCount: 0 }),
    { to: 'snoozed' },
  );
}

export function dismiss(urlKey: string, now = new Date()): Promise<void> {
  return record(urlKey, now, (h) => ({ ...h, dismissedAt: now.getTime() }), { to: 'dismissed' });
}

export function undoDismiss(urlKey: string, now = new Date()): Promise<void> {
  return record(urlKey, now, (h) => ({ ...h, dismissedAt: undefined }), { from: 'dismissed', to: 'active' });
}

export function restore(urlKey: string, now = new Date()): Promise<void> {
  return record(urlKey, now, (h) => ({ ...h, dismissedAt: undefined, ignoredCount: 0 }));
}

async function moveSlots(from: SlotStatus, to: SlotStatus, now: Date): Promise<void> {
  await db.transaction('rw', db.daily, async () => {
    const today = await db.daily.get(dayKey(now));
    if (!today) return;
    today.slots = today.slots.map((s) => (s.status === from ? { ...s, status: to } : s));
    await db.daily.put(today);
  });
}

/** Paused picks are not shown, and don't count as ignored tomorrow. */
export const pauseToday = (now = new Date()) => moveSlots('active', 'paused', now);
export const resumeToday = (now = new Date()) => moveSlots('paused', 'active', now);

/** Clears everything ReFound created. Chrome bookmarks and their mirror are untouched. */
export async function clearReFoundData(): Promise<void> {
  await db.transaction('rw', db.history, db.daily, db.wallpapers, async () => {
    await Promise.all([db.history.clear(), db.daily.clear(), db.wallpapers.clear()]);
  });
  await resetSettings();
}
