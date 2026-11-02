export interface BookmarkRow {
  id: string;
  url: string;
  urlKey: string;
  title: string;
  dateAdded: number;
  folderId: string;
  /** Folder IDs from the tree root down to the direct parent. */
  ancestorIds: string[];
  folderPath: string;
}

export interface HistoryRow {
  urlKey: string;
  timesShown: number;
  lastShownAt?: number;
  ignoredCount: number;
  lastIgnoredAt?: number;
  openedCount: number;
  lastOpenedAt?: number;
  snoozedCount: number;
  snoozedUntil?: number;
  dismissedAt?: number;
}

export type SlotStatus = 'active' | 'paused' | 'opened' | 'snoozed' | 'dismissed';

export interface DailySlot {
  urlKey: string;
  status: SlotStatus;
  fallback: boolean;
}

export interface DailyRow {
  day: string;
  slots: DailySlot[];
}

export interface WallpaperRow {
  id: string;
  name: string;
  blob: Blob;
  addedAt: number;
}

export type SnoozeOption = 'tomorrow' | '3days' | 'nextWeek';

export interface Settings {
  setupComplete: boolean;
  showRecommendations: boolean;
  /** Once a pick has been acted on today, later tabs shrink the rest to a one-line reminder. */
  quietAfterFirst: boolean;
  dailyCount: number;
  defaultSnooze: SnoozeOption;
  excludedFolderIds: string[];
  backgroundMode: 'fixed' | 'random';
  /** Reference such as `solid:pine`, `gradient:dusk`, `image:tide`, `upload:<id>`. */
  background: string;
  /** Backgrounds in random rotation. Empty means all of them. */
  randomPool: string[];
  /** Darkens image backgrounds, 0 to 70. */
  backgroundDim: number;
}

export interface FolderNode {
  id: string;
  title: string;
  depth: number;
}
