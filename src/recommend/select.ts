import { ageInDays, DAY_MS } from '../shared/time';
import type { BookmarkRow, HistoryRow } from '../shared/types';
import { isRecommendable } from '../sync/normalize';

export const MIN_AGE_DAYS = 7;
export const IGNORED_COOLDOWN_DAYS = 14;
export const OPENED_COOLDOWN_DAYS = 90;
export const AGE_CAP_DAYS = 365;

export interface Candidate {
  urlKey: string;
  url: string;
  dateAdded: number;
  /** One ancestor chain per saved copy of this URL. */
  ancestorChains: string[][];
  history?: HistoryRow;
}

export interface EligibilityOptions {
  now: number;
  excludedFolderIds: string[];
}

export interface SelectOptions extends EligibilityOptions {
  day: string;
  count: number;
}

export interface Pick {
  urlKey: string;
  fallback: boolean;
}

export type BookmarkStatus = 'none' | 'opened' | 'snoozed' | 'dismissed';

export function buildCandidates(rows: BookmarkRow[], histories: HistoryRow[]): Candidate[] {
  const historyByKey = new Map(histories.map((h) => [h.urlKey, h]));
  const byKey = new Map<string, Candidate>();
  for (const row of rows) {
    const existing = byKey.get(row.urlKey);
    if (existing) {
      existing.dateAdded = Math.min(existing.dateAdded, row.dateAdded);
      existing.ancestorChains.push(row.ancestorIds);
    } else {
      byKey.set(row.urlKey, {
        urlKey: row.urlKey,
        url: row.url,
        dateAdded: row.dateAdded,
        ancestorChains: [row.ancestorIds],
        history: historyByKey.get(row.urlKey),
      });
    }
  }
  return [...byKey.values()];
}

/** Every rule except age. The fallback may relax age, and nothing else. */
function passesRules(c: Candidate, { now, excludedFolderIds }: EligibilityOptions): boolean {
  const h = c.history;
  if (!isRecommendable(c.url)) return false;
  if (h?.dismissedAt !== undefined) return false;
  if (h?.snoozedUntil !== undefined && h.snoozedUntil > now) return false;
  if (h?.lastIgnoredAt !== undefined && now - h.lastIgnoredAt < IGNORED_COOLDOWN_DAYS * DAY_MS) return false;
  if (h?.lastOpenedAt !== undefined && now - h.lastOpenedAt < OPENED_COOLDOWN_DAYS * DAY_MS) return false;
  const excluded = new Set(excludedFolderIds);
  return c.ancestorChains.some((chain) => !chain.some((id) => excluded.has(id)));
}

const oldEnough = (c: Candidate, now: number) => ageInDays(c.dateAdded, now) >= MIN_AGE_DAYS;

export function isEligible(c: Candidate, opts: EligibilityOptions): boolean {
  return passesRules(c, opts) && oldEnough(c, opts.now);
}

export function scoreOf(c: Candidate, now: number): number {
  const age = Math.min(ageInDays(c.dateAdded, now), AGE_CAP_DAYS);
  return age * 0.5 ** (c.history?.ignoredCount ?? 0);
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function selectDaily(items: Candidate[], opts: SelectOptions): Pick[] {
  const tieBreak = (c: Candidate) => hash(`${opts.day}|${c.urlKey}`);
  const allowed = items.filter((c) => passesRules(c, opts));

  const due = allowed
    .filter((c) => oldEnough(c, opts.now))
    .map((c) => ({ c, score: scoreOf(c, opts.now), tie: tieBreak(c) }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .slice(0, opts.count)
    .map(({ c }) => ({ urlKey: c.urlKey, fallback: false }));

  const newer = allowed
    .filter((c) => !oldEnough(c, opts.now))
    .sort((a, b) => a.dateAdded - b.dateAdded || tieBreak(a) - tieBreak(b))
    .slice(0, opts.count - due.length)
    .map((c) => ({ urlKey: c.urlKey, fallback: true }));

  return [...due, ...newer];
}

export function statusOf(h: HistoryRow | undefined, now: number): BookmarkStatus {
  if (h?.dismissedAt !== undefined) return 'dismissed';
  if (h?.snoozedUntil !== undefined && h.snoozedUntil > now) return 'snoozed';
  if (h?.openedCount) return 'opened';
  return 'none';
}
