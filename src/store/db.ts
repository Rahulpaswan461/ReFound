import Dexie, { type EntityTable } from 'dexie';
import type { BookmarkRow, DailyRow, HistoryRow, WallpaperRow } from '../shared/types';

export const DB_NAME = 'refound';
/** The database name used before the rename to ReFound. */
export const LEGACY_NAME = 'recall';

export const SCHEMA = {
  bookmarks: 'id, urlKey',
  history: 'urlKey',
  daily: 'day',
  wallpapers: 'id',
};

/** Tables worth keeping. The bookmark mirror is rebuilt from Chrome on the next sync. */
const CARRIED_OVER = ['history', 'daily', 'wallpapers'] as const;

export class ReFoundDB extends Dexie {
  bookmarks!: EntityTable<BookmarkRow, 'id'>;
  history!: EntityTable<HistoryRow, 'urlKey'>;
  daily!: EntityTable<DailyRow, 'day'>;
  wallpapers!: EntityTable<WallpaperRow, 'id'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores(SCHEMA);
    this.on('ready', () => this.carryOverLegacy());
  }

  /**
   * Moves data saved under the old name into this database, once, before anything else reads it.
   * Rows already here win, so running it twice or from two tabs at once is harmless.
   */
  private async carryOverLegacy(): Promise<void> {
    if (!(await Dexie.exists(LEGACY_NAME))) return;
    const legacy = new Dexie(LEGACY_NAME);
    legacy.version(1).stores(SCHEMA);
    try {
      await legacy.open();
      for (const name of CARRIED_OVER) {
        const target = this.table(name);
        const rows = await legacy.table(name).toArray();
        const key = target.schema.primKey.keyPath as string;
        const existing = new Set(await target.toCollection().primaryKeys());
        const missing = rows.filter((row) => !existing.has(row[key]));
        await target.bulkPut(missing);
      }
      legacy.close();
      await Dexie.delete(LEGACY_NAME);
    } catch (error) {
      // Keep the old database so nothing is lost; the next start tries again.
      legacy.close();
      console.warn('ReFound: could not move data from the previous version', error);
    }
  }
}

export const db = new ReFoundDB();
