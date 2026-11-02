// Generates the bundled wallpapers and app icons. Run once: node scripts/make-assets.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const W = 2400, H = 1500;

function layer(base, amp, wave, phase, color) {
  let d = `M0 ${H}`;
  for (let x = 0; x <= W; x += 24) {
    const y = base + amp * Math.sin(x / wave + phase) + (amp / 3) * Math.sin(x / (wave / 2.7) + phase * 2);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `<path d="${d} L${W} ${H} Z" fill="${color}"/>`;
}

function scene(sky, layers) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#s)"/>${layers.join('')}</svg>`;
}

const scenes = {
  tide: scene(['#a9d3cf', '#e6d7b8'], [layer(760, 46, 240, 1, '#5fa7a5'), layer(900, 58, 300, 2.4, '#35807f'), layer(1060, 64, 340, 4, '#1f5a60'), layer(1260, 52, 280, .8, '#123c45')]),
  ridge: scene(['#f0c9a4', '#c98f8f'], [layer(640, 150, 420, .4, '#8f6f8f'), layer(830, 170, 360, 2, '#62507a'), layer(1040, 150, 300, 3.3, '#3e3a60'), layer(1250, 110, 260, 5, '#262646')]),
  dune: scene(['#f3d9a6', '#eaa97b'], [layer(780, 90, 620, 1.2, '#d98a5b'), layer(1000, 110, 700, 3.4, '#b9663f'), layer(1240, 90, 560, 5.2, '#8a4530')]),
  night: scene(['#101d3d', '#37507f'], [layer(820, 110, 500, 1.6, '#28406c'), layer(1010, 120, 420, 3.1, '#1b2f55'), layer(1240, 100, 350, 4.6, '#101f3d')]),
};
for (const [name, svg] of Object.entries(scenes)) writeFileSync(`public/wallpapers/${name}.svg`, svg);

// 96px of artwork inside 128px, as the Chrome Web Store asks for square icons. Matches src/ui/components/Logo.tsx.
const icon = (size) => `<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect x="16" y="16" width="96" height="96" rx="24" fill="#f0c778"/>
  <path d="M42 34h28a4 4 0 0 1 4 4v56l-18-12-18 12V38a4 4 0 0 1 4-4z" fill="#2a2110"/>
  <path d="M88 31C90.3 41.7 90.3 41.7 101 44C90.3 46.3 90.3 46.3 88 57C85.7 46.3 85.7 46.3 75 44C85.7 41.7 85.7 41.7 88 31Z" fill="#2a2110"/>
</svg></body>`;

const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(icon(size));
  await page.screenshot({ path: `public/icons/${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
