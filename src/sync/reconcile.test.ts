import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../store/db';
import type { HistoryRow } from '../shared/types';
import { flattenTree, reconcile } from './reconcile';

type Node = chrome.bookmarks.BookmarkTreeNode;

const link = (id: string, parentId: string, url: string, title = id): Node =>
  ({ id, parentId, url, title, dateAdded: 1000, syncing: false }) as Node;
const folder = (id: string, title: string, children: Node[]): Node =>
  ({ id, title, children, syncing: false }) as Node;
const tree = (...bar: Node[]): Node[] => [folder('0', '', [folder('1', 'Bookmarks bar', bar)])];

const history = (urlKey: string, extra: Partial<HistoryRow> = {}): HistoryRow => ({
  urlKey, timesShown: 1, ignoredCount: 0, openedCount: 0, snoozedCount: 0, ...extra,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('flattenTree', () => {
  it('records ancestors and a readable folder path', () => {
    const rows = flattenTree(tree(folder('5', 'Dev', [link('9', '5', 'https://a.com/')])));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: '9',
      urlKey: 'https://a.com',
      folderId: '5',
      ancestorIds: ['0', '1', '5'],
      folderPath: 'Bookmarks bar / Dev',
    });
  });
});

describe('reconcile', () => {
  it('adds, updates and removes rows', async () => {
    await reconcile(tree(link('a', '1', 'https://a.com'), link('b', '1', 'https://b.com')));
    expect(await db.bookmarks.count()).toBe(2);

    await reconcile(tree(link('a', '1', 'https://a.com', 'Renamed')));
    expect(await db.bookmarks.count()).toBe(1);
    expect((await db.bookmarks.get('a'))!.title).toBe('Renamed');
  });

  it('updates the folder when a bookmark moves', async () => {
    await reconcile(tree(link('a', '1', 'https://a.com')));
    await reconcile(tree(folder('5', 'Dev', [link('a', '5', 'https://a.com')])));
    expect((await db.bookmarks.get('a'))!.ancestorIds).toEqual(['0', '1', '5']);
  });

  it('keeps history when a bookmark is deleted, so re-saving restores it', async () => {
    await db.history.put(history('https://a.com', { dismissedAt: 5 }));
    await reconcile(tree(link('a', '1', 'https://a.com')));
    await reconcile(tree());
    expect(await db.history.get('https://a.com')).toBeDefined();
  });

  it('moves history and the daily slot when a URL is edited', async () => {
    await reconcile(tree(link('a', '1', 'https://old.com')));
    await db.history.put(history('https://old.com', { snoozedUntil: 99 }));
    await db.daily.put({ day: 'd', slots: [{ urlKey: 'https://old.com', status: 'active', fallback: false }] });

    await reconcile(tree(link('a', '1', 'https://new.com')));

    expect(await db.history.get('https://old.com')).toBeUndefined();
    expect((await db.history.get('https://new.com'))!.snoozedUntil).toBe(99);
    expect((await db.daily.get('d'))!.slots[0].urlKey).toBe('https://new.com');
  });

  it('copies history when another saved copy keeps the old URL', async () => {
    await reconcile(tree(link('a', '1', 'https://old.com'), link('b', '1', 'https://old.com')));
    await db.history.put(history('https://old.com'));
    await reconcile(tree(link('a', '1', 'https://new.com'), link('b', '1', 'https://old.com')));
    expect(await db.history.get('https://old.com')).toBeDefined();
    expect(await db.history.get('https://new.com')).toBeDefined();
  });

  it('removes a deleted bookmark from the current picks', async () => {
    await reconcile(tree(link('a', '1', 'https://a.com'), link('b', '1', 'https://b.com')));
    await db.daily.put({
      day: 'd',
      slots: [
        { urlKey: 'https://a.com', status: 'active', fallback: false },
        { urlKey: 'https://b.com', status: 'active', fallback: false },
      ],
    });
    await reconcile(tree(link('b', '1', 'https://b.com')));
    expect((await db.daily.get('d'))!.slots.map((s) => s.urlKey)).toEqual(['https://b.com']);
  });

  it('keeps a pick when one of two copies is deleted', async () => {
    await reconcile(tree(link('a', '1', 'https://a.com'), link('b', '1', 'https://a.com')));
    await db.daily.put({ day: 'd', slots: [{ urlKey: 'https://a.com', status: 'active', fallback: false }] });
    await reconcile(tree(link('b', '1', 'https://a.com')));
    expect((await db.daily.get('d'))!.slots).toHaveLength(1);
  });

  it('never changes past days', async () => {
    await reconcile(tree(link('a', '1', 'https://a.com')));
    await db.daily.bulkPut([
      { day: '2026-01-01', slots: [{ urlKey: 'https://gone.com', status: 'opened', fallback: false }] },
      { day: '2026-01-02', slots: [] },
    ]);
    await reconcile(tree(link('a', '1', 'https://a.com')));
    expect((await db.daily.get('2026-01-01'))!.slots).toHaveLength(1);
  });
});
