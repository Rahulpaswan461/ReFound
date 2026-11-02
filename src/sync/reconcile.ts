import type { BookmarkRow } from '../shared/types';
import { db } from '../store/db';
import { normalizeUrl } from './normalize';

type Node = chrome.bookmarks.BookmarkTreeNode;

export function flattenTree(nodes: Node[]): BookmarkRow[] {
  const rows: BookmarkRow[] = [];
  const walk = (node: Node, ancestorIds: string[], path: string[]) => {
    if (node.url !== undefined) {
      rows.push({
        id: node.id,
        url: node.url,
        urlKey: normalizeUrl(node.url),
        title: node.title,
        dateAdded: node.dateAdded ?? 0,
        folderId: ancestorIds.at(-1) ?? '',
        ancestorIds,
        folderPath: path.join(' / '),
      });
      return;
    }
    const childPath = node.title ? [...path, node.title] : path;
    for (const child of node.children ?? []) walk(child, [...ancestorIds, node.id], childPath);
  };
  for (const node of nodes) walk(node, [], []);
  return rows;
}

/** Makes the local mirror match Chrome. ReFound history is never deleted here. */
export async function reconcile(nodes: Node[]): Promise<void> {
  const next = flattenTree(nodes);
  const nextById = new Map(next.map((r) => [r.id, r]));
  const nextKeys = new Set(next.map((r) => r.urlKey));

  await db.transaction('rw', db.bookmarks, db.history, db.daily, async () => {
    const previous = await db.bookmarks.toArray();
    const previousById = new Map(previous.map((r) => [r.id, r]));
    const renamed = new Map<string, string>();

    for (const old of previous) {
      const current = nextById.get(old.id);
      if (!current || current.urlKey === old.urlKey) continue;
      renamed.set(old.urlKey, current.urlKey);
      const history = await db.history.get(old.urlKey);
      if (!history) continue;
      if (!(await db.history.get(current.urlKey))) {
        await db.history.put({ ...history, urlKey: current.urlKey });
      }
      if (!nextKeys.has(old.urlKey)) await db.history.delete(old.urlKey);
    }

    await db.bookmarks.bulkDelete(previous.filter((r) => !nextById.has(r.id)).map((r) => r.id));
    await db.bookmarks.bulkPut(
      next.filter((r) => JSON.stringify(r) !== JSON.stringify(previousById.get(r.id))),
    );

    const latest = await db.daily.orderBy('day').last();
    if (!latest) return;
    const seen = new Set<string>();
    const slots = latest.slots
      .map((s) => (!nextKeys.has(s.urlKey) && renamed.has(s.urlKey) ? { ...s, urlKey: renamed.get(s.urlKey)! } : s))
      .filter((s) => nextKeys.has(s.urlKey) && !seen.has(s.urlKey) && seen.add(s.urlKey));
    if (JSON.stringify(slots) !== JSON.stringify(latest.slots)) {
      await db.daily.put({ ...latest, slots });
    }
  });
}
