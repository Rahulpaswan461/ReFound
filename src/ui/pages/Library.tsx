import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight, Clock, Eye, Folder, FolderOpen, Inbox, LayoutGrid, List, Search, Sparkles, Undo2, X,
} from 'lucide-react';
import { dismiss, openBookmark, restore, snooze, undoDismiss } from '../../core/actions';
import { buildCandidates, isEligible, statusOf } from '../../recommend/select';
import { ageInDays, savedAgo } from '../../shared/time';
import type { BookmarkRow, FolderNode, HistoryRow } from '../../shared/types';
import { db } from '../../store/db';
import { listFolders } from '../../sync/chromeSync';
import { displayDomain, isRecommendable } from '../../sync/normalize';
import { SnoozeMenu } from '../components/SnoozeMenu';
import { announce, faviconUrl, subscribe, useSettings, useToast } from '../useApp';

type StatusFilter = 'all' | 'eligible' | 'opened' | 'snoozed' | 'dismissed';
type Sort = 'newest' | 'oldest' | 'title' | 'lastShown';
type Layout = 'list' | 'grid';

const VIEWS: { id: StatusFilter; label: string; Icon: typeof Inbox }[] = [
  { id: 'all', label: 'All bookmarks', Icon: Inbox },
  { id: 'eligible', label: 'To revisit', Icon: Sparkles },
  { id: 'opened', label: 'Opened', Icon: Eye },
  { id: 'snoozed', label: 'Snoozed', Icon: Clock },
  { id: 'dismissed', label: 'Dismissed', Icon: X },
];

const PAGE = 100;
const DAY_GROUPS: [number, string][] = [[7, 'This week'], [30, 'This month'], [365, 'This year']];

function groupOf(dateAdded: number, now: number): string {
  const days = ageInDays(dateAdded, now);
  return DAY_GROUPS.find(([limit]) => days < limit)?.[1] ?? 'Older';
}
const LAYOUT_KEY = 'refound.library.layout';

function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function Highlight({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

function FolderTree({
  folders, counts, selected, onSelect,
}: {
  folders: FolderNode[];
  counts: Map<string, number>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [closed, setClosed] = useState(new Set<string>());
  const hasChildren = (i: number) => folders[i + 1]?.depth > folders[i].depth;
  const hiddenBelow: number[] = [];

  return (
    <ul className="tree">
      {folders.map((folder, i) => {
        while (hiddenBelow.length && hiddenBelow.at(-1)! >= folder.depth) hiddenBelow.pop();
        const hidden = hiddenBelow.length > 0;
        const shut = closed.has(folder.id);
        if (shut && hasChildren(i)) hiddenBelow.push(folder.depth);
        if (hidden) return null;
        const Icon = selected === folder.id ? FolderOpen : Folder;
        return (
          <li key={folder.id} style={{ paddingLeft: folder.depth * 14 }}>
            {hasChildren(i) ? (
              <button
                type="button"
                className="twist"
                aria-label={`${shut ? 'Expand' : 'Collapse'} ${folder.title}`}
                aria-expanded={!shut}
                onClick={() => {
                  const next = new Set(closed);
                  if (shut) next.delete(folder.id);
                  else next.add(folder.id);
                  setClosed(next);
                }}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <span className="twist-space" />
            )}
            <button
              type="button"
              className="rail-item"
              aria-pressed={selected === folder.id}
              onClick={() => onSelect(selected === folder.id ? '' : folder.id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{folder.title}</span>
              <small>{(counts.get(folder.id) ?? 0).toLocaleString()}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Library({ initialQuery }: { initialQuery: string }) {
  const settings = useSettings();
  const toast = useToast();
  const [rows, setRows] = useState<BookmarkRow[] | null>(null);
  const [histories, setHistories] = useState<HistoryRow[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [folder, setFolder] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [layout, setLayout] = useState<Layout>(savedLayout);
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setRows(await db.bookmarks.toArray());
      setHistories(await db.history.toArray());
      setFolders(await listFolders().catch(() => []));
    } catch (error) {
      console.warn('ReFound: could not load library', error);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribe(load);
  }, [load]);

  useEffect(() => setQuery(initialQuery), [initialQuery]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || (event.target as HTMLElement).closest('input, textarea, select')) return;
      event.preventDefault();
      search.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const now = Date.now();
  const historyByKey = useMemo(() => new Map(histories.map((h) => [h.urlKey, h])), [histories]);

  const eligibleKeys = useMemo(() => {
    const opts = { now, excludedFolderIds: settings.excludedFolderIds };
    return new Set(buildCandidates(rows ?? [], histories).filter((c) => isEligible(c, opts)).map((c) => c.urlKey));
  }, [rows, histories, settings.excludedFolderIds]);

  const inView = useCallback((r: BookmarkRow, view: StatusFilter) => {
    if (view === 'all') return true;
    if (view === 'eligible') return eligibleKeys.has(r.urlKey);
    const h = historyByKey.get(r.urlKey);
    if (view === 'opened') return !!h?.openedCount;
    return statusOf(h, now) === view;
  }, [eligibleKeys, historyByKey]);

  const counts = useMemo(() => {
    const views = new Map<StatusFilter, number>();
    const inFolder = new Map<string, number>();
    for (const r of rows ?? []) {
      for (const { id } of VIEWS) if (inView(r, id)) views.set(id, (views.get(id) ?? 0) + 1);
      for (const id of r.ancestorIds) inFolder.set(id, (inFolder.get(id) ?? 0) + 1);
    }
    return { views, inFolder };
  }, [rows, inView]);

  const term = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const matches = (r: BookmarkRow) => {
      if (term && !r.title.toLowerCase().includes(term) && !r.url.toLowerCase().includes(term)) return false;
      if (folder && !r.ancestorIds.includes(folder)) return false;
      return inView(r, status);
    };
    const lastShown = (r: BookmarkRow) => historyByKey.get(r.urlKey)?.lastShownAt ?? 0;
    const order: Record<Sort, (a: BookmarkRow, b: BookmarkRow) => number> = {
      newest: (a, b) => b.dateAdded - a.dateAdded,
      oldest: (a, b) => a.dateAdded - b.dateAdded,
      title: (a, b) => a.title.localeCompare(b.title),
      lastShown: (a, b) => lastShown(b) - lastShown(a),
    };
    return (rows ?? []).filter(matches).sort(order[sort]);
  }, [rows, historyByKey, inView, term, status, folder, sort]);

  useEffect(() => setLimit(PAGE), [term, status, folder, sort]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLimit((n) => n + PAGE);
    }, { rootMargin: '400px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible.length > limit]);

  const changeLayout = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // The layout simply won't be remembered.
    }
  };

  const open = async (r: BookmarkRow) => {
    if (isRecommendable(r.url)) {
      await openBookmark(r.urlKey).catch((error) => console.warn('ReFound: could not record open', error));
      window.location.assign(r.url);
    } else if (!r.url.startsWith('javascript:')) {
      void chrome.tabs.update({ url: r.url });
    }
  };

  const remind = async (r: BookmarkRow, until: number) => {
    await snooze(r.urlKey, until);
    announce();
    toast({ text: `We'll remind you on ${new Date(until).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.` });
  };

  const drop = async (r: BookmarkRow) => {
    await dismiss(r.urlKey);
    announce();
    toast({
      text: 'Dismissed. Your Chrome bookmark is safe.',
      undo: async () => {
        await undoDismiss(r.urlKey);
        announce();
      },
    });
  };

  const bringBack = async (r: BookmarkRow) => {
    await restore(r.urlKey);
    announce();
    toast({ text: 'Restored. It can come back in your picks.' });
  };

  const badge = (r: BookmarkRow): ReactNode => {
    const h = historyByKey.get(r.urlKey);
    const state = statusOf(h, now);
    if (state === 'snoozed') {
      return <span className="badge">Until {new Date(h!.snoozedUntil!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>;
    }
    if (state === 'dismissed') return <span className="badge">Dismissed</span>;
    if (state === 'opened') return <span className="badge">Opened</span>;
    return null;
  };

  const actions = (r: BookmarkRow) => {
    if (statusOf(historyByKey.get(r.urlKey), now) === 'dismissed') {
      return (
        <button type="button" className="icon-button" aria-label="Restore" title="Restore" onClick={() => bringBack(r)}>
          <Undo2 size={16} aria-hidden="true" />
        </button>
      );
    }
    if (!isRecommendable(r.url)) return null;
    return (
      <>
        <SnoozeMenu iconOnly onSnooze={(until) => remind(r, until)} />
        <button type="button" className="icon-button" aria-label="Dismiss" title="Dismiss" onClick={() => drop(r)}>
          <X size={16} aria-hidden="true" />
        </button>
      </>
    );
  };

  const title = folder ? folders.find((f) => f.id === folder)?.title : VIEWS.find((v) => v.id === status)?.label;

  return (
    <main className="library">
      <aside className="rail" aria-label="Browse">
        <div className="rail-group">
          {VIEWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="rail-item"
              aria-pressed={status === id && !(id === 'all' && folder)}
              onClick={() => {
                setStatus(id);
                if (id === 'all') setFolder('');
              }}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
              <small>{(counts.views.get(id) ?? 0).toLocaleString()}</small>
            </button>
          ))}
        </div>
        {folders.length > 0 && (
          <div className="rail-group">
            <h2>Folders</h2>
            <FolderTree folders={folders} counts={counts.inFolder} selected={folder} onSelect={setFolder} />
          </div>
        )}
      </aside>

      <section className="shelf" aria-label={title}>
        <div className="shelf-head">
          <div>
            <h1>{title}</h1>
            {rows && !failed && <p>{visible.length.toLocaleString()} of {rows.length.toLocaleString()} bookmarks</p>}
          </div>
          <div className="shelf-tools">
            <label className="shelf-search">
              <Search size={16} aria-hidden="true" />
              <input
                ref={search}
                type="search"
                aria-label="Search bookmarks"
                placeholder="Find a title or website"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest saved</option>
              <option value="oldest">Oldest saved</option>
              <option value="title">Title</option>
              <option value="lastShown">Last shown</option>
            </select>
            <div className="layout-switch" role="group" aria-label="Layout">
              <button type="button" className="icon-button" aria-label="List" aria-pressed={layout === 'list'} onClick={() => changeLayout('list')}>
                <List size={16} aria-hidden="true" />
              </button>
              <button type="button" className="icon-button" aria-label="Grid" aria-pressed={layout === 'grid'} onClick={() => changeLayout('grid')}>
                <LayoutGrid size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {failed && <p className="hint">ReFound couldn't read its local data. Reload this tab to try again.</p>}
        {rows && !failed && visible.length === 0 && (
          <div className="shelf-empty">
            <h2>{rows.length ? 'Nothing here yet' : 'Your library is empty'}</h2>
            <p>{rows.length ? 'Try a different search, view or folder.' : 'Pages you bookmark in Chrome appear here automatically.'}</p>
          </div>
        )}

        <ul className={`items ${layout}`}>
          {visible.slice(0, limit).map((r, i, shown) => {
            const dated = sort === 'newest' || sort === 'oldest';
            const group = groupOf(r.dateAdded, now);
            const startsGroup = dated && (i === 0 || groupOf(shown[i - 1].dateAdded, now) !== group);
            return (
            <Fragment key={r.id}>
            {startsGroup && <li className="group" role="presentation">{group}</li>}
            <li className="item">
              <span className="site"><img src={faviconUrl(r.url)} alt="" width="16" height="16" loading="lazy" /></span>
              <div className="item-text">
                <a
                  href={r.url.startsWith('javascript:') ? undefined : r.url}
                  onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); void open(r); } }}
                >
                  <Highlight text={r.title || displayDomain(r.url)} term={term} />
                </a>
                <small>
                  <Highlight text={displayDomain(r.url)} term={term} />, saved {savedAgo(r.dateAdded, now)}
                  {r.folderPath && !folder && `, in ${r.folderPath.split(' / ').at(-1)}`}
                </small>
              </div>
              {badge(r)}
              <div className="item-actions">{actions(r)}</div>
            </li>
            </Fragment>
            );
          })}
        </ul>
        {visible.length > limit && <div ref={sentinel} className="sentinel" />}
      </section>
    </main>
  );
}
