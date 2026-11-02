import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type BrowserContext, chromium, expect, type Page, test } from '@playwright/test';

const dist = resolve('dist');
const DAY = 86_400_000;
/** Chrome stores dates as microseconds since 1601. */
const chromeTime = (ms: number) => String((ms + 11_644_473_600_000) * 1000);

let server: Server;
let origin: string;
let profile: string;
let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<title>site ${req.url}</title>page ${req.url}`);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => server.close());

function seedBookmarks(dir: string, extra = 0) {
  const node = (id: number, name: string, ageDays: number) => ({
    id: String(id), guid: crypto.randomUUID(), type: 'url', name, url: `${origin}/${id}`,
    date_added: chromeTime(Date.now() - ageDays * DAY),
  });
  const folder = (id: number, name: string, children: unknown[]) => ({
    id: String(id), guid: crypto.randomUUID(), type: 'folder', name, children,
    date_added: chromeTime(Date.now() - 900 * DAY), date_modified: '0',
  });
  mkdirSync(join(dir, 'Default'), { recursive: true });
  writeFileSync(join(dir, 'Default', 'Bookmarks'), JSON.stringify({
    version: 1,
    roots: {
      bookmark_bar: folder(1, 'Bookmarks bar', [
        folder(10, 'Reading', [
          node(11, 'Understanding PostgreSQL Indexing', 21),
          node(12, 'Redis caching patterns', 60),
          node(13, 'Designing data systems', 300),
          node(14, 'Networking basics', 40),
        ]),
        folder(20, 'Daily sites', [node(21, 'Very old daily site', 800)]),
        folder(30, 'Archive', Array.from({ length: extra }, (_, i) => node(1000 + i, `Saved page ${i}`, 10 + (i % 700)))),
      ]),
      other: folder(2, 'Other bookmarks', []),
      synced: folder(3, 'Mobile bookmarks', []),
    },
  }));
}

async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
}

async function openTab(hash = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html${hash}`);
  return page;
}

const changeSettings = (page: Page, patch: object) =>
  page.evaluate(async (changes) => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings as object), ...changes } });
  }, patch);

async function finishSetup(untick?: string, options: { quiet?: boolean } = {}): Promise<Page> {
  const page = await openTab('#/welcome');
  await expect(page.getByRole('heading', { name: 'Bring back what you saved' })).toBeVisible();
  if (untick) await page.getByLabel(untick).uncheck();
  await page.getByRole('button', { name: 'Start using ReFound' }).click();
  await expect(page.locator('.pick')).toBeVisible();
  if (!options.quiet) await changeSettings(page, { quietAfterFirst: false });
  return page;
}

const cardTitles = (page: Page) =>
  page.locator('.pick-dots button').evaluateAll((items) => items.map((b) => b.getAttribute('aria-label') ?? ''));
const picks = (page: Page) => page.locator('.pick-dots button');
const searchBox = (page: Page) => page.getByRole('combobox', { name: /search the web/i });
const showView = (page: Page, name: RegExp) => page.locator('.rail').getByRole('button', { name }).click();
const bookmarkTree = (page: Page) =>
  page.evaluate(async () => JSON.stringify(await chrome.bookmarks.getTree()));

test.beforeEach(async () => {
  profile = mkdtempSync(join(tmpdir(), 'refound-e2e-'));
  seedBookmarks(profile);
  await launch();
});

test.afterEach(async () => {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
});

test('the real new tab page shows ReFound', async () => {
  const page = await context.newPage();
  await page.goto('chrome://newtab');
  await expect(page.getByRole('heading', { name: 'Bring back what you saved' })).toBeVisible();
});

test('first run opens setup and respects unticked folders', async () => {
  await expect.poll(() => context.pages().some((p) => p.url().includes('#/welcome'))).toBe(true);
  const page = await finishSetup('Daily sites');
  expect(await cardTitles(page)).toEqual([
    'Designing data systems',
    'Redis caching patterns',
    'Networking basics',
  ]);
  await expect(page.locator('.pick')).toContainText('Saved');
});

test('picks stay the same across tabs and a browser restart', async () => {
  const first = await cardTitles(await finishSetup());
  expect(first).toHaveLength(3);
  const second = await openTab();
  await expect(picks(second)).toHaveCount(3);
  expect(await cardTitles(second)).toEqual(first);

  await context.close();
  await launch();
  const third = await openTab();
  await expect(picks(third)).toHaveCount(3);
  expect(await cardTitles(third)).toEqual(first);
});

test('read now opens the page and leaves the other picks', async () => {
  const page = await finishSetup();
  const [title, ...rest] = await cardTitles(page);
  await page.locator('.pick').getByRole('button', { name: 'Read now' }).click();
  await expect(page).toHaveURL(new RegExp(`^${origin}/`));

  const again = await openTab();
  await expect(picks(again)).toHaveCount(2);
  expect(await cardTitles(again)).toEqual(rest);
  expect(await cardTitles(again)).not.toContain(title);
});

test('remind later moves a pick to the snoozed list', async () => {
  const page = await finishSetup();
  const [title] = await cardTitles(page);
    await page.locator('.pick').getByRole('button', { name: 'Remind later' }).click();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(picks(page)).toHaveCount(2);

  await page.goto(`chrome-extension://${extensionId}/newtab.html#/library`);
  await showView(page, /Snoozed/);
  await expect(page.locator('.items .item')).toHaveCount(1);
  await expect(page.locator('.items .item')).toContainText(title);
});

test('custom snooze date works', async () => {
  const page = await finishSetup();
    await page.locator('.pick').getByRole('button', { name: 'Remind later' }).click();
  const target = new Date(Date.now() + 20 * DAY);
  const value = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Choose a date').fill(value);
  await page.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(picks(page)).toHaveCount(2);
});

test('dismiss keeps the Chrome bookmark, and undo and restore work', async () => {
  const page = await finishSetup();
  const before = await bookmarkTree(page);
  const [title] = await cardTitles(page);

  await page.locator('.pick').getByRole('button', { name: 'Dismiss' }).click();
  await expect(picks(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(picks(page)).toHaveCount(3);

  await page.locator('.pick').getByRole('button', { name: 'Dismiss' }).click();
  await expect(picks(page)).toHaveCount(2);
  expect(await bookmarkTree(page)).toBe(before);

  await page.goto(`chrome-extension://${extensionId}/newtab.html#/library`);
  await showView(page, /Dismissed/);
  const row = page.locator('.items .item');
  await expect(row).toContainText(title);
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(row).toHaveCount(0);
});

test('acting on every pick shows done for today', async () => {
  const page = await finishSetup();
  for (let left = 3; left > 0; left--) {
    await page.locator('.pick').getByRole('button', { name: 'Dismiss' }).click();
    await expect(picks(page)).toHaveCount(left - 1);
  }
  await expect(page.getByRole('heading', { name: 'Done for today' })).toBeVisible();
});

test('library follows bookmark changes made in Chrome', async () => {
  const page = await finishSetup();
  await page.goto(`chrome-extension://${extensionId}/newtab.html#/library`);
  const rows = page.locator('.items .item');
  await expect(rows).toHaveCount(5);

  const id = await page.evaluate(async (url) => {
    const made = await chrome.bookmarks.create({ title: 'Brand new save', url });
    return made.id;
  }, `${origin}/new`);
  await expect(rows).toHaveCount(6);

  await page.evaluate((i) => chrome.bookmarks.update(i, { title: 'Renamed save' }), id);
  await expect(page.getByText('Renamed save')).toBeVisible();

  await page.evaluate((i) => chrome.bookmarks.move(i, { parentId: '2' }), id);
  await expect(page.locator('.items .item', { hasText: 'Renamed save' })).toContainText('Other bookmarks');

  await page.evaluate((i) => chrome.bookmarks.remove(i), id);
  await expect(rows).toHaveCount(5);
});

test('deleting a bookmark in Chrome removes it from the current picks', async () => {
  const page = await finishSetup();
  const [title] = await cardTitles(page);
  await page.evaluate(async (t) => {
    const [found] = await chrome.bookmarks.search({ title: t });
    await chrome.bookmarks.remove(found.id);
  }, title);
  await expect(picks(page)).toHaveCount(2);
});

test('library search, filter and sort', async () => {
  const page = await finishSetup();
  await page.goto(`chrome-extension://${extensionId}/newtab.html#/library`);
  await page.getByLabel('Search bookmarks').fill('redis');
  await expect(page.locator('.items .item')).toHaveCount(1);
  await page.getByLabel('Search bookmarks').fill('');
  await showView(page, /Daily sites/);
  await expect(page.locator('.items .item')).toHaveCount(1);
  await showView(page, /All bookmarks/);
  await page.getByLabel('Sort').selectOption('oldest');
  await expect(page.locator('.items .item a').first()).toHaveText('Very old daily site');
});

test('search box navigates addresses and sends text to the default engine', async () => {
  await finishSetup();
  const page = await openTab();
  await searchBox(page).fill(`${origin}/typed`);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${origin}/typed`);

  await context.route(/google\./, (route) => route.fulfill({ body: 'results' }));
  const second = await openTab();
  await searchBox(second).fill('postgres indexing');
  await second.keyboard.press('Enter');
  await expect(second).toHaveURL(/postgres(\+|%20)indexing/);
});

test('settings: hide picks, change background, upload, stats', async () => {
  await finishSetup();
  const page = await openTab('#/settings');
  await page.getByRole('tab', { name: 'Background' }).click();
  await page.getByRole('button', { name: 'Plum' }).click();
  await expect(page.locator('.backdrop')).toHaveCSS('background-color', 'rgb(71, 41, 77)');

  await page.locator('input[type=file]').setInputFiles({
    name: 'mine.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.getByRole('button', { name: 'mine.png', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.backdrop')).toHaveCSS('background-image', /blob:/);

  await page.locator('input[type=file]').setInputFiles({
    name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('10 MB');

  await page.getByRole('tab', { name: 'Daily picks' }).click();
  const showPicks = page.getByLabel('Show picks on the new tab page');
  await showPicks.click();
  await expect(showPicks).not.toBeChecked();
  const home = await openTab();
  await expect(searchBox(home)).toBeVisible();
  await expect(home.locator('.pick')).toHaveCount(0);
});

test('turning off every folder explains itself on a fresh day', async () => {
  const page = await openTab('#/welcome');
  await page.getByLabel('Bookmarks bar').uncheck();
  await page.getByLabel('Other bookmarks').uncheck();
  await page.getByRole('button', { name: 'Start using ReFound' }).click();
  await expect(page.getByRole('heading', { name: 'All of your folders are turned off' })).toBeVisible();
});

test('clearing ReFound data keeps Chrome bookmarks and restarts setup', async () => {
  await finishSetup();
  const page = await openTab('#/settings');
  const before = await bookmarkTree(page);
  await page.getByRole('tab', { name: 'Your data' }).click();
  await page.getByRole('button', { name: 'Clear ReFound data' }).click();
  await page.getByRole('button', { name: 'Clear ReFound data' }).click();
  await expect(page.getByRole('heading', { name: 'Bring back what you saved' })).toBeVisible();
  expect(await bookmarkTree(page)).toBe(before);
});

test('makes no requests beyond the extension itself', async () => {
  const outside: string[] = [];
  context.on('request', (r) => {
    if (!r.url().startsWith('chrome-extension://') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) {
      outside.push(r.url());
    }
  });
  await finishSetup();
  await openTab('#/library');
  await openTab('#/settings');
  expect(outside).toEqual([]);
});

test('stays quick with 10,000 bookmarks', async () => {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
  profile = mkdtempSync(join(tmpdir(), 'refound-e2e-'));
  seedBookmarks(profile, 10_000);
  await launch();
  await finishSetup();

  const started = Date.now();
  const home = await openTab();
  await expect(home.locator('.pick')).toBeVisible();
  const tabMs = Date.now() - started;

  const library = await openTab('#/library');
  await expect(library.getByText('10,005 of 10,005 bookmarks')).toBeVisible();
  await expect(library.locator('.items .item')).toHaveCount(100);
  const typed = Date.now();
  await library.getByLabel('Search bookmarks').fill('Saved page 9999');
  await expect(library.locator('.items .item')).toHaveCount(1);
  const searchMs = Date.now() - typed;
  console.log(`new tab ${tabMs}ms, library search ${searchMs}ms`);
  expect(tabMs).toBeLessThan(1500);
  expect(searchMs).toBeLessThan(500);
});

test('the search box suggests saved bookmarks and leads into the library', async () => {
  await finishSetup();
  const page = await openTab();
  await searchBox(page).fill('redis');
  const options = page.getByRole('option');
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText('Web search');
  await expect(options.nth(1)).toContainText('Redis caching patterns');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Search bookmarks')).toHaveValue('redis');
  await expect(page.locator('.items .item')).toHaveCount(1);
  await expect(page.locator('.items mark').first()).toHaveText('Redis');

  await page.keyboard.press('Escape');
  await expect(page.locator('.pick')).toBeVisible();
});

test('opening a saved suggestion counts as opened through ReFound', async () => {
  await finishSetup();
  const page = await openTab();
  await searchBox(page).fill('postgres');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`^${origin}/11`));

  const library = await openTab('#/library');
  await showView(library, /Opened/);
  await expect(library.locator('.items .item')).toContainText('Understanding PostgreSQL Indexing');
});

test('picks can be paged without changing them', async () => {
  const page = await finishSetup();
  const titles = await cardTitles(page);
  await expect(page.locator('.pick-body h2')).toHaveText(titles[0]);
  await page.getByRole('button', { name: 'Next pick' }).click();
  await expect(page.locator('.pick-body h2')).toHaveText(titles[1]);
  await page.locator('body').click({ position: { x: 5, y: 500 } });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.pick-body h2')).toHaveText(titles[2]);
  expect(await cardTitles(page)).toEqual(titles);
});

test('library keeps the wallpaper and top bar, and remembers grid view', async () => {
  await finishSetup();
  const page = await openTab();
  const before = await page.locator('.backdrop').evaluate((e) => getComputedStyle(e).backgroundImage);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.locator('.library')).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  expect(await page.locator('.backdrop').evaluate((e) => getComputedStyle(e).backgroundImage)).toBe(before);

  await page.getByRole('button', { name: 'Grid' }).click();
  await expect(page.locator('.items.grid')).toBeVisible();
  await page.reload();
  await expect(page.locator('.items.grid')).toBeVisible();
});

test('a menu near the bottom of the library stays on screen', async () => {
  await finishSetup();
  const page = await openTab('#/library');
  await page.setViewportSize({ width: 1280, height: 500 });
  const last = page.locator('.items .item').last();
  await last.hover();
  await last.getByRole('button', { name: 'Remind later' }).click();
  const box = await page.locator('.menu').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(500);
});

test('picks stay open until you act on one, then later tabs shrink to one line', async () => {
  const page = await finishSetup(undefined, { quiet: true });
  const before = await openTab();
  await expect(before.locator('.pick')).toBeVisible();
  await expect(before.locator('.pick-quiet')).toHaveCount(0);

  await page.locator('.pick').getByRole('button', { name: 'Dismiss' }).click();
  await expect(picks(page)).toHaveCount(2);
  await expect(page.locator('.pick')).toBeVisible();

  const after = await openTab();
  const reminder = after.locator('.pick-quiet');
  await expect(reminder).toContainText('and 1 more today');
  await expect(after.locator('.pick')).toHaveCount(0);
  await reminder.click();
  await expect(after.locator('.pick')).toBeVisible();
});

test('pausing hides picks across tabs until resumed', async () => {
  const page = await finishSetup();
  await page.getByRole('button', { name: 'Pause for today' }).click();
  await expect(page.getByText('Picks are paused for today.')).toBeVisible();
  const other = await openTab();
  await expect(other.getByText('Picks are paused for today.')).toBeVisible();
  await other.getByRole('button', { name: 'Resume' }).click();
  await expect(other.locator('.pick')).toBeVisible();
  await expect(page.locator('.pick')).toBeVisible();
});

test('a bright uploaded image gets light panels', async () => {
  const page = await finishSetup();
  await page.goto(`chrome-extension://${extensionId}/newtab.html#/settings`);
  await page.getByRole('tab', { name: 'Background' }).click();
  const bright = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(64, 36);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f7f2e4';
    context.fillRect(0, 0, 64, 36);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await changeSettings(page, { backgroundDim: 0 });
  await page.locator('input[type=file]').setInputFiles({ name: 'bright.png', mimeType: 'image/png', buffer: Buffer.from(bright) });
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'light');
});

test('text stays readable on every background', async () => {
  test.setTimeout(240_000);
  const page = await finishSetup();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/newtab.html#/settings`);
  await page.getByRole('tab', { name: 'Background' }).click();
  const names = await page.locator('.swatch > button:first-child').evaluateAll((items) => items.map((b) => b.getAttribute('aria-label')!));
  expect(names.length).toBeGreaterThanOrEqual(20);

  const failures: string[] = [];
  for (const name of names) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(250);
    await page.goto(`chrome-extension://${extensionId}/newtab.html#/`);
    const card = page.locator('.pick');
    await expect(card).toBeVisible();
    await page.waitForTimeout(650);
    const colours = await card.locator('.pick-meta').evaluate((e) => getComputedStyle(e).color);
    await page.addStyleTag({ content: '.pick * { visibility: hidden !important; } .topbar { visibility: hidden; }' });
    const shot = await card.screenshot();
    const worst = await page.evaluate(async ({ png, colour }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const channel = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const lum = (r: number, g: number, b: number) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const [r, g, b, a = 1] = colour.match(/[\d.]+/g)!.map(Number);
      let lowest = 99;
      // Skip the rounded edge and the border.
      for (let y = 26; y < bitmap.height - 26; y += 3) {
        for (let x = 26; x < bitmap.width - 26; x += 3) {
          const at = (y * bitmap.width + x) * 4;
          const bg = [data[at], data[at + 1], data[at + 2]];
          const text = lum(r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a));
          const under = lum(bg[0], bg[1], bg[2]);
          lowest = Math.min(lowest, (Math.max(text, under) + 0.05) / (Math.min(text, under) + 0.05));
        }
      }
      return lowest;
    }, { png: [...shot], colour: colours });
    console.log(`contrast ${name}: ${worst.toFixed(2)}`);
    if (worst < 4.5) failures.push(`${name}: ${worst.toFixed(2)}`);
    await page.goto(`chrome-extension://${extensionId}/newtab.html#/settings`);
    await page.getByRole('tab', { name: 'Background' }).click();
  }
  expect(failures).toEqual([]);
});

test('a copy installed before the rename keeps its history and preferences', async () => {
  const page = await finishSetup();
  // Not one of today's picks, so the new database has no history for it yet, as on a real upgrade.
  const title = 'Understanding PostgreSQL Indexing';
  expect(await cardTitles(page)).not.toContain(title);
  const urlKey = await page.evaluate(async (t) => {
    const [found] = await chrome.bookmarks.search({ title: t });
    return found.url!.replace(/\/$/, '');
  }, title);

  // Recreate what the Recall-era build stored: its database (Dexie version 1 is IndexedDB version 10) and a preference.
  await page.evaluate(async (key) => {
    await new Promise<void>((done, fail) => {
      const open = indexedDB.open('recall', 10);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore('bookmarks', { keyPath: 'id' }).createIndex('urlKey', 'urlKey');
        db.createObjectStore('history', { keyPath: 'urlKey' });
        db.createObjectStore('daily', { keyPath: 'day' });
        db.createObjectStore('wallpapers', { keyPath: 'id' });
      };
      open.onsuccess = () => {
        const tx = open.result.transaction('history', 'readwrite');
        tx.objectStore('history').put({
          urlKey: key, timesShown: 5, ignoredCount: 0, openedCount: 0, snoozedCount: 1,
          snoozedUntil: Date.now() + 20 * 86_400_000,
        });
        tx.oncomplete = () => { open.result.close(); done(); };
        tx.onerror = () => fail(tx.error);
      };
      open.onerror = () => fail(open.error);
    });
    localStorage.setItem('recall.library.layout', 'grid');
  }, urlKey);
  await page.close();

  const library = await openTab('#/library');
  await expect(library.locator('.items.grid')).toBeVisible();
  await library.locator('.rail').getByRole('button', { name: /Snoozed/ }).click();
  await expect(library.locator('.items .item')).toContainText(title);
  const leftovers = await library.evaluate(async () => ({
    databases: (await indexedDB.databases()).map((d) => d.name),
    keys: Object.keys(localStorage).filter((k) => k.startsWith('recall.')),
  }));
  expect(leftovers.databases).not.toContain('recall');
  expect(leftovers.keys).toEqual([]);
});
