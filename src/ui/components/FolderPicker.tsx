import { useEffect, useState } from 'react';
import { Check, Folder } from 'lucide-react';
import type { FolderNode } from '../../shared/types';
import { listFolders } from '../../sync/chromeSync';

interface Props {
  excluded: string[];
  onChange: (excluded: string[]) => void;
}

export function FolderPicker({ excluded, onChange }: Props) {
  const [folders, setFolders] = useState<FolderNode[] | null>(null);
  useEffect(() => {
    listFolders().then(setFolders).catch(() => setFolders([]));
  }, []);

  if (!folders) return null;
  if (!folders.length) return <p className="hint">Chrome didn't return any bookmark folders.</p>;

  const set = new Set(excluded);
  const blockedAt: number[] = [];
  return (
    <ul className="folder-picker">
      {folders.map((folder) => {
        while (blockedAt.length && blockedAt.at(-1)! >= folder.depth) blockedAt.pop();
        const inherited = blockedAt.length > 0;
        const off = set.has(folder.id);
        if (off) blockedAt.push(folder.depth);
        return (
          <li key={folder.id} style={{ paddingLeft: folder.depth * 22 }}>
            <label className={inherited ? 'is-off' : undefined}>
              <input
                type="checkbox"
                disabled={inherited}
                checked={!off && !inherited}
                onChange={(e) =>
                  onChange(e.target.checked ? excluded.filter((id) => id !== folder.id) : [...excluded, folder.id])
                }
              />
              <span className="tick" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
              <Folder size={16} aria-hidden="true" />
              {folder.title}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
