import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookMarked, Globe, Search } from 'lucide-react';
import { openBookmark } from '../../core/actions';
import type { BookmarkRow } from '../../shared/types';
import { db } from '../../store/db';
import { displayDomain, isRecommendable } from '../../sync/normalize';
import { parseInput } from '../parseInput';
import { faviconUrl, subscribe } from '../useApp';

const MAX_MATCHES = 5;

function run(text: string) {
  const parsed = parseInput(text);
  if (parsed.kind === 'url') window.location.assign(parsed.url);
  else void chrome.search.query({ text: parsed.text, disposition: 'CURRENT_TAB' });
}

async function openSaved(row: BookmarkRow) {
  await openBookmark(row.urlKey).catch((error) => console.warn('ReFound: could not record open', error));
  window.location.assign(row.url);
}

/** One box, like the address bar: search, addresses and saved bookmarks. */
export function SearchBox() {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rows, setRows] = useState<BookmarkRow[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => db.bookmarks.toArray().then(setRows).catch(() => setRows([]));
    void load();
    return subscribe(load);
  }, []);

  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target.closest('input, textarea, select, [role="dialog"]')) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  const term = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!term) return [];
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (!isRecommendable(r.url) || seen.has(r.urlKey)) return false;
      if (!r.title.toLowerCase().includes(term) && !r.url.toLowerCase().includes(term)) return false;
      seen.add(r.urlKey);
      return true;
    });
  }, [rows, term]);

  const visible = matches.slice(0, MAX_MATCHES);
  const parsed = parseInput(text);
  const showList = open && !!term;
  const optionCount = 1 + visible.length + (matches.length ? 1 : 0);
  const libraryHref = `#/library?q=${encodeURIComponent(text.trim())}`;

  const choose = (index: number) => {
    if (index === 0) run(text);
    else if (index <= visible.length) void openSaved(visible[index - 1]);
    else window.location.hash = libraryHref;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (term) choose(showList ? active : 0);
    } else if (event.key === 'Escape' && showList) {
      event.preventDefault();
      setOpen(false);
    } else if (showList && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + optionCount) % optionCount);
    }
  };

  return (
    <div className="search" role="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <div className="search-field">
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          type="text"
          role="combobox"
          aria-label="Search the web, bookmarks, or enter an address"
          aria-expanded={showList}
          aria-controls="search-options"
          aria-activedescendant={showList ? `search-option-${active}` : undefined}
          placeholder="Search the web or your bookmarks"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {!text && <kbd aria-hidden="true">/</kbd>}
      </div>

      {showList && (
        <ul id="search-options" className="search-options" role="listbox" aria-label="Suggestions">
          <li
            id="search-option-0"
            role="option"
            aria-selected={active === 0}
            onMouseEnter={() => setActive(0)}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(0);
            }}
          >
            {parsed.kind === 'url' ? <ArrowUpRight size={17} aria-hidden="true" /> : <Globe size={17} aria-hidden="true" />}
            <span className="option-title">{parsed.kind === 'url' ? `Go to ${displayDomain(parsed.url)}` : text.trim()}</span>
            <small>{parsed.kind === 'url' ? 'Address' : 'Web search'}</small>
          </li>
          {visible.map((row, index) => (
            <li
              key={row.urlKey}
              id={`search-option-${index + 1}`}
              role="option"
              aria-selected={active === index + 1}
              onMouseEnter={() => setActive(index + 1)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(index + 1);
              }}
            >
              <img src={faviconUrl(row.url)} alt="" width="17" height="17" />
              <span className="option-title">{row.title || displayDomain(row.url)}</span>
              <small>{displayDomain(row.url)}</small>
            </li>
          ))}
          {matches.length > 0 && (
            <li
              id={`search-option-${visible.length + 1}`}
              role="option"
              aria-selected={active === visible.length + 1}
              className="option-all"
              onMouseEnter={() => setActive(visible.length + 1)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(visible.length + 1);
              }}
            >
              <BookMarked size={17} aria-hidden="true" />
              <span className="option-title">
                See {matches.length === 1 ? 'it' : `all ${matches.length.toLocaleString()}`} in Library
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
