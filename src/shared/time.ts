import type { SnoozeOption } from './types';

export const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Start of a local day, `offset` days from `d`. Calendar-based so DST can't shift it. */
export function startOfDay(d: Date, offset = 0): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
}

export function ageInDays(dateAdded: number, now: number): number {
  return Math.floor((now - dateAdded) / DAY_MS);
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

export function savedAgo(dateAdded: number, now: number): string {
  const days = ageInDays(dateAdded, now);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return plural(days, 'day');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}

const SNOOZE_DAYS: Record<SnoozeOption, number> = { tomorrow: 1, '3days': 3, nextWeek: 7 };

export function snoozeUntil(option: SnoozeOption, now: Date): number {
  return startOfDay(now, SNOOZE_DAYS[option]);
}
