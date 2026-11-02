import type { FolderNode } from '../shared/types';
import { reconcile } from './reconcile';

export async function fullReconcile(): Promise<void> {
  await reconcile(await chrome.bookmarks.getTree());
}

export async function listFolders(): Promise<FolderNode[]> {
  const folders: FolderNode[] = [];
  const walk = (node: chrome.bookmarks.BookmarkTreeNode, depth: number) => {
    if (node.url !== undefined) return;
    if (node.title) folders.push({ id: node.id, title: node.title, depth });
    for (const child of node.children ?? []) walk(child, node.title ? depth + 1 : depth);
  };
  for (const root of await chrome.bookmarks.getTree()) walk(root, 0);
  return folders;
}
