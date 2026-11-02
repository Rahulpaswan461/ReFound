import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BellOff, Check, ChevronDown, Moon, Sparkles, Sprout, X } from 'lucide-react';
import { dismiss, openBookmark, pauseToday, resumeToday, snooze, undoDismiss } from '../../core/actions';
import { activePicks, type PickView, prepareToday } from '../../core/daily';
import { ageInDays, savedAgo } from '../../shared/time';
import type { BookmarkRow } from '../../shared/types';
import { db } from '../../store/db';
import { fullReconcile } from '../../sync/chromeSync';
import { displayDomain } from '../../sync/normalize';
import { SnoozeMenu } from '../components/SnoozeMenu';
import { announce, faviconUrl, subscribe, useSettings, useToast } from '../useApp';

type View =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'picks'; picks: PickView[] }
  | { kind: 'off' }
  | { kind: 'paused' }
  | { kind: 'noBookmarks' }
  | { kind: 'allExcluded' }
  | { kind: 'nothingDue' }
  | { kind: 'done' };

function whyPicked(pick: PickView): string {
  if (pick.fallback) return 'A newer save. Nothing older is due.';
  if (ageInDays(pick.dateAdded, Date.now()) >= 180) return 'One of your older saves.';
  return "You haven't seen this in a while.";
}

function capitalize(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}

function Pick({ pick, folder, header }: { pick: PickView; folder?: string; header: React.ReactNode }) {
  const toast = useToast();

  const read = async () => {
    await openBookmark(pick.urlKey).catch((error) => console.warn('ReFound: could not record open', error));
    announce();
    window.location.assign(pick.url);
  };

  const remind = async (until: number) => {
    await snooze(pick.urlKey, until);
    announce();
    toast({ text: `We'll remind you on ${new Date(until).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.` });
  };

  const drop = async () => {
    await dismiss(pick.urlKey);
    announce();
    toast({
      text: 'Dismissed. Your Chrome bookmark is safe.',
      undo: async () => {
        await undoDismiss(pick.urlKey);
        announce();
      },
    });
  };

  return (
    <article className="pick">
      {header}
      <div className="pick-body" key={pick.urlKey}>
      <p className="pick-source">
        <span className="site"><img src={faviconUrl(pick.url)} alt="" width="16" height="16" /></span>
        {displayDomain(pick.url)}
      </p>
      <h2>
        <a href={pick.url} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); void read(); } }}>
          {pick.title || displayDomain(pick.url)}
        </a>
      </h2>
      <p className="pick-meta">
        Saved {savedAgo(pick.dateAdded, Date.now())}{folder ? `, in ${folder}` : ''}. {whyPicked(pick)}
      </p>
      </div>
      <div className="pick-actions">
        <button type="button" className="primary" onClick={read}>
          Read now <ArrowUpRight size={17} aria-hidden="true" />
        </button>
        <SnoozeMenu onSnooze={remind} />
        <button type="button" className="ghost push" onClick={drop}>
          <X size={17} aria-hidden="true" /> Dismiss
        </button>
      </div>
    </article>
  );
}

function Quiet({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="quiet-card">
      {icon}
      <h2>{title}</h2>
      {children}
    </div>
  );
}

const libraryLink = <a href="#/library">Explore your library</a>;

export function Home() {
  const settings = useSettings();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [rows, setRows] = useState<BookmarkRow[]>([]);
  const [quiet, setQuiet] = useState(false);
  const decided = useRef(false);

  const load = useCallback(async () => {
    try {
      const today = settings.showRecommendations ? await prepareToday(fullReconcile) : null;
      const all = await db.bookmarks.toArray();
      setRows(all);
      if (!today) return setView({ kind: 'off' });
      const picks = await activePicks(today);
      if (picks.length) {
        if (!decided.current) {
          decided.current = true;
          // Stay open until a pick has been dealt with today; after that, later tabs show one line.
          const actedToday = today.slots.some((slot) => slot.status !== 'active');
          setQuiet(actedToday && settings.quietAfterFirst);
        }
        return setView({ kind: 'picks', picks });
      }
      if (today.slots.some((s) => s.status === 'paused')) return setView({ kind: 'paused' });
      if (today.slots.length) return setView({ kind: 'done' });
      if (!all.length) return setView({ kind: 'noBookmarks' });
      const excluded = new Set(settings.excludedFolderIds);
      const allOut = all.every((r) => r.ancestorIds.some((id) => excluded.has(id)));
      setView({ kind: allOut ? 'allExcluded' : 'nothingDue' });
    } catch (error) {
      console.warn('ReFound: could not load picks', error);
      setView({ kind: 'failed' });
    }
  }, [settings.showRecommendations, settings.quietAfterFirst, settings.excludedFolderIds]);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const off = subscribe(load);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', load);
    return () => {
      off();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', load);
    };
  }, [load]);

  const picks = view.kind === 'picks' ? view.picks : [];
  const current = Math.min(index, Math.max(0, picks.length - 1));
  const pick = picks[current];

  useEffect(() => {
    if (picks.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      if (event.key === 'ArrowRight') setIndex((current + 1) % picks.length);
      if (event.key === 'ArrowLeft') setIndex((current - 1 + picks.length) % picks.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, picks.length]);

  const recent = useMemo(() => {
    const shown = new Set(picks.map((p) => p.urlKey));
    return [...rows].filter((r) => !shown.has(r.urlKey)).sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 3);
  }, [rows, picks]);

  const folderOf = (urlKey: string) => rows.find((r) => r.urlKey === urlKey)?.folderPath.split(' / ').at(-1);

  return (
    <>
      {view.kind === 'picks' && quiet && (
        <button type="button" className="pick-quiet" aria-expanded="false" onClick={() => setQuiet(false)}>
          <Sparkles size={16} aria-hidden="true" />
          <span>{picks[0].title || displayDomain(picks[0].url)}</span>
          {picks.length > 1 && <small>and {picks.length - 1} more today</small>}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
      {view.kind === 'picks' && !quiet && (
        <section className="rediscover" aria-label="Today's picks">
          <Pick
            pick={pick}
            folder={folderOf(pick.urlKey)}
            header={
              <div className="section-head">
                <h2>Worth a second look</h2>
                <div className="pick-pager">
                  <div className="pick-dots" role="tablist" aria-label="Choose a pick">
                    {picks.map((p, i) => (
                      <button
                        key={p.urlKey}
                        type="button"
                        role="tab"
                        aria-selected={i === current}
                        aria-label={p.title || displayDomain(p.url)}
                        onClick={() => setIndex(i)}
                      />
                    ))}
                  </div>
                  <span>{current + 1} of {picks.length} today</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Pause for today"
                    title="Pause for today"
                    onClick={() => pauseToday().then(announce)}
                  >
                    <BellOff size={15} aria-hidden="true" />
                  </button>
                  {picks.length > 1 && (
                    <>
                      <button type="button" className="icon-button" aria-label="Previous pick" onClick={() => setIndex((current - 1 + picks.length) % picks.length)}>
                        <ArrowLeft size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-button" aria-label="Next pick" onClick={() => setIndex((current + 1) % picks.length)}>
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            }
          />
        </section>
      )}

      {view.kind === 'paused' && (
        <p className="quiet-line">
          Picks are paused for today.
          <button type="button" onClick={() => resumeToday().then(announce)}>Resume</button>
        </p>
      )}
      {view.kind === 'failed' && (
        <Quiet icon={<Moon />} title="ReFound couldn't open its local data">
          <p>Search still works. Reload this tab to try again.</p>
        </Quiet>
      )}
      {view.kind === 'noBookmarks' && (
        <Quiet icon={<Sprout />} title="Good ideas start with a bookmark">
          <p>Save a page with ⌘D on Mac or Ctrl+D on Windows. ReFound will bring it back here when you've had time to forget it.</p>
        </Quiet>
      )}
      {view.kind === 'allExcluded' && (
        <Quiet icon={<Moon />} title="All of your folders are turned off">
          <p><a href="#/settings">Choose folders in Settings</a> to get picks again.</p>
        </Quiet>
      )}
      {view.kind === 'nothingDue' && (
        <Quiet icon={<Moon />} title="Nothing to resurface today">
          <p>Your bookmarks are resting. {libraryLink}</p>
        </Quiet>
      )}
      {view.kind === 'done' && (
        <Quiet icon={<Check />} title="Done for today">
          <p>New picks arrive tomorrow. {libraryLink}</p>
        </Quiet>
      )}

      {view.kind !== 'loading' && view.kind !== 'paused' && !quiet && recent.length > 0 && (
        <section className="recent" aria-label="Recently saved">
          <h2>Recently saved</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <a href={r.url} title={r.title}>
                  <span className="site"><img src={faviconUrl(r.url)} alt="" width="16" height="16" /></span>
                  <span>
                    <strong>{r.title || displayDomain(r.url)}</strong>
                    <small>{capitalize(savedAgo(r.dateAdded, Date.now()))}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

    </>
  );
}
