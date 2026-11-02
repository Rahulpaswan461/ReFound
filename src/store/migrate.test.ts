import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LEGACY_NAME, ReFoundDB, SCHEMA } from './db';

const history = (urlKey: string, timesShown: number) => ({
  urlKey, timesShown, ignoredCount: 0, openedCount: 0, snoozedCount: 0,
});

async function seedLegacy() {
  const old = new Dexie(LEGACY_NAME);
  old.version(1).stores(SCHEMA);
  await old.open();
  await old.table('history').bulkPut([history('https://kept.com', 4), history('https://both.com', 9)]);
  await old.table('daily').put({ day: '2026-11-01', slots: [{ urlKey: 'https://kept.com', status: 'opened', fallback: false }] });
  await old.table('wallpapers').put({ id: 'w1', name: 'mine.png', blob: new Blob(['x']), addedAt: 1 });
  await old.table('bookmarks').put({ id: '1', url: 'u', urlKey: 'u', title: 't', dateAdded: 1, folderId: '1', ancestorIds: ['0'], folderPath: '' });
  old.close();
}

describe('moving data from the old database name', () => {
  it('copies history, picks and uploads, then removes the old database', async () => {
    await seedLegacy();
    const db = new ReFoundDB();
    expect(await db.history.get('https://kept.com')).toMatchObject({ timesShown: 4 });
    expect(await db.daily.get('2026-11-01')).toBeDefined();
    expect((await db.wallpapers.get('w1'))!.name).toBe('mine.png');
    expect(await Dexie.exists(LEGACY_NAME)).toBe(false);
    db.close();
    await db.delete();
  });

  it('never overwrites data already in the new database', async () => {
    const db = new ReFoundDB();
    await db.history.put(history('https://both.com', 1));
    db.close();
    await seedLegacy();

    const reopened = new ReFoundDB();
    expect((await reopened.history.get('https://both.com'))!.timesShown).toBe(1);
    expect(await reopened.history.get('https://kept.com')).toBeDefined();
    reopened.close();
    await reopened.delete();
  });

  it('does nothing when there is no old database', async () => {
    const db = new ReFoundDB();
    expect(await db.history.count()).toBe(0);
    expect(await Dexie.exists(LEGACY_NAME)).toBe(false);
    db.close();
    await db.delete();
  });
});
