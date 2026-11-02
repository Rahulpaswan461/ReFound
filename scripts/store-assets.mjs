// Draws the Chrome Web Store promo tiles: node scripts/store-assets.mjs <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = resolve(process.argv[2] ?? 'store/upload');
mkdirSync(out, { recursive: true });
const file = (path) => pathToFileURL(resolve(path)).href;
const serif = file('node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2');
const sans = file('node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2');
const wall = file('public/wallpapers/alpine-blue.webp');

const logo = `<svg viewBox="16 16 96 96"><rect x="16" y="16" width="96" height="96" rx="24" fill="#f0c778"/>
  <path d="M42 34h28a4 4 0 0 1 4 4v56l-18-12-18 12V38a4 4 0 0 1 4-4z" fill="#2a2110"/>
  <path d="M88 31C90.3 41.7 90.3 41.7 101 44C90.3 46.3 90.3 46.3 88 57C85.7 46.3 85.7 46.3 75 44C85.7 41.7 85.7 41.7 88 31Z" fill="#2a2110"/></svg>`;

const page = ({ width, height, scale }) => `<!doctype html><html><head><style>
  @font-face { font-family: RFDisplay; src: url(${serif}); }
  @font-face { font-family: RFBody; src: url(${sans}); }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; color: #f6f3ec; font-family: RFBody;
    background: linear-gradient(90deg, rgb(10 15 28 / .82), rgb(10 15 28 / .35) 70%), url(${wall}) center 62% / cover; }
  .wrap { display: flex; flex-direction: column; justify-content: center; height: 100%; padding: 0 ${48 * scale}px; }
  .brand { display: flex; align-items: center; gap: ${14 * scale}px; font: ${40 * scale}px/1 RFDisplay; }
  .brand svg { width: ${52 * scale}px; height: ${52 * scale}px; border-radius: ${14 * scale}px; }
  h1 { margin-top: ${18 * scale}px; max-width: ${330 * scale}px; font: ${34 * scale}px/1.08 RFDisplay; }
  p { margin-top: ${12 * scale}px; max-width: ${330 * scale}px; color: rgb(246 243 236 / .84); font-size: ${14.5 * scale}px; line-height: 1.4; }
  .card { position: absolute; right: ${40 * scale}px; top: 50%; translate: 0 -50%; width: ${330 * scale}px; padding: ${18 * scale}px ${20 * scale}px;
    border: 1px solid rgb(255 255 255 / .12); border-radius: ${18 * scale}px; background: rgb(14 20 33 / .82); box-shadow: 0 18px 44px rgb(4 8 16 / .35); }
  .card small { color: rgb(246 243 236 / .76); font-size: ${12.5 * scale}px; }
  .card h2 { margin: ${8 * scale}px 0; font: ${24 * scale}px/1.15 RFDisplay; font-weight: 400; }
  .card b { display: inline-block; margin-top: ${10 * scale}px; padding: ${7 * scale}px ${13 * scale}px; border-radius: ${10 * scale}px; background: #f0c778; color: #2a2110; font-size: ${13 * scale}px; }
</style></head><body><div class="wrap">%CONTENT%</div></body></html>`;

const tiles = [
  {
    name: 'promo-small-440x280.png', width: 440, height: 280, scale: 0.9,
    content: `<div class="brand">${logo}ReFound</div><h1>Find what you saved, again.</h1>`,
  },
  {
    name: 'promo-marquee-1400x560.png', width: 1400, height: 560, scale: 1.75,
    content: `<div class="brand">${logo}ReFound</div><h1>Find what you saved, again.</h1>
      <p>A few forgotten bookmarks on every new tab. Private, on your device.</p>
      <div class="card"><small>Saved 1 year ago, in Videos</small><h2>Rich Hickey: Simple Made Easy</h2><b>Read now</b></div>`,
  },
];

const browser = await chromium.launch();
for (const tile of tiles) {
  const html = resolve(out, '.tile.html');
  writeFileSync(html, page(tile).replace('%CONTENT%', tile.content));
  const tab = await browser.newPage({ viewport: { width: tile.width, height: tile.height } });
  await tab.goto(pathToFileURL(html).href);
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: resolve(out, tile.name) });
  await tab.close();
}
await browser.close();
