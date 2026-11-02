// Captures the main screens with realistic bookmarks: node scripts/screens.mjs [outDir]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'test-results/screens';
const [width, height] = (process.argv[3] ?? '1440x900').split('x').map(Number);
mkdirSync(out, { recursive: true });
const DAY = 86_400_000;
const when = (days) => String((Date.now() - days * DAY + 11_644_473_600_000) * 1000);
let id = 100;
const link = (name, url, days) => ({ id: String(id++), guid: crypto.randomUUID(), type: 'url', name, url, date_added: when(days) });
const dir = (name, children) => ({ id: String(id++), guid: crypto.randomUUID(), type: 'folder', name, children, date_added: when(900), date_modified: '0' });

const profile = mkdtempSync(join(tmpdir(), 'refound-screens-'));
mkdirSync(join(profile, 'Default'));
writeFileSync(join(profile, 'Default', 'Bookmarks'), JSON.stringify({
  version: 1,
  roots: {
    bookmark_bar: { ...dir('Bookmarks bar', [
      dir('Backend', [
        link('Use the index, Luke: a guide to database performance', 'https://use-the-index-luke.com/', 42),
        link('Redis caching strategies for scalable applications', 'https://redis.io/docs/manual/patterns/', 21),
        link('Designing data-intensive applications: notes', 'https://github.com/keyvanakbary/learning-notes', 310),
        link('How Discord stores trillions of messages', 'https://discord.com/blog/how-discord-stores-trillions-of-messages', 96),
      ]),
      dir('Career', [
        link('The staff engineer path, explained', 'https://staffeng.com/guides/staff-archetypes', 130),
        link('How to write a great resume for software engineers', 'https://www.freecodecamp.org/news/writing-a-great-resume', 15),
      ]),
      dir('Videos', [
        link('But what is a neural network?', 'https://www.youtube.com/watch?v=aircAruvnKk', 220),
        link('Rich Hickey: Simple Made Easy', 'https://www.youtube.com/watch?v=SxdOUGdseq4', 480),
      ]),
      link('Linear', 'https://linear.app', 400),
    ]), id: '1' },
    other: { ...dir('Other bookmarks', [
      link('The Rust programming language', 'https://doc.rust-lang.org/book/', 18),
      link('Understanding PostgreSQL indexing', 'https://www.postgresql.org/docs/current/indexes.html', 62),
      link('Laws of UX', 'https://lawsofux.com/', 5),
      link('A complete guide to CSS grid', 'https://css-tricks.com/snippets/css/complete-guide-grid/', 2),
    ]), id: '2' },
    synced: { ...dir('Mobile bookmarks', []), id: '3' },
  },
}));

const dist = resolve('dist');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  viewport: { width, height },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const base = `chrome-extension://${new URL(worker.url()).host}/newtab.html`;
const page = await context.newPage();
const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${name}.png` }); };

await page.goto(`${base}#/welcome`);
await shot('welcome');
await page.getByRole('button', { name: 'Start using ReFound' }).click();
await page.locator('.pick').waitFor();
await shot('today');
await page.getByRole('combobox').fill('redis');
await shot('search');
await page.getByRole('combobox').fill('');
await page.locator('.pick').getByRole('button', { name: 'Remind later' }).click();
await shot('remind');
await page.keyboard.press('Escape');
await page.locator('.topbar').getByRole('link', { name: 'Library' }).click();
await page.locator('.items li').first().hover();
await shot('library');
await page.getByRole('button', { name: 'Grid' }).click();
await shot('library-grid');
await page.getByRole('button', { name: 'List' }).click();
await page.locator('.topbar').getByRole('link', { name: 'Settings' }).click();
await shot('settings');
await page.getByRole('tab', { name: 'Background' }).click();
await shot('settings-background');
await page.goto(`${base}#/`);
await page.reload();
await shot('today-quiet');
await page.goto(`${base}#/settings`);
await page.getByRole('tab', { name: 'Background' }).click();
await page.getByRole('button', { name: 'Fog', exact: true }).click();
await page.waitForTimeout(700);
await page.goto(`${base}#/`);
await page.locator('.pick-quiet').click();
await shot('today-light');
await page.goto(`${base}#/library`);
await shot('library-light');
await page.goto(`${base}#/settings`);
await shot('settings-light');
await page.getByRole('tab', { name: 'Background' }).click();
await page.getByRole('button', { name: 'Dune', exact: true }).click();
await page.waitForTimeout(700);
await page.goto(`${base}#/`);
await page.locator('.pick-quiet').click();
await shot('today-dune');
await page.setViewportSize({ width: 390, height: 780 });
await shot('today-phone');
await page.goto(`${base}#/library`);
await shot('library-phone');
await context.close();
rmSync(profile, { recursive: true, force: true });
