import type { Settings, WallpaperRow } from '../shared/types';
import { DEFAULT_SETTINGS } from '../store/settings';

export type Tone = 'dark' | 'light';
export type Group = 'Scenes' | 'Gradients' | 'Colors' | 'Your images';

export interface BackgroundOption {
  ref: string;
  label: string;
  css: string;
  /** Lighter version for the gallery, when the full image is large. */
  thumb?: string;
  group: Group;
  /** The tone of the wallpaper itself, used until an image has been measured. */
  tone: Tone;
  /** Image address, when the background is an image that can be measured. */
  src?: string;
}

export interface Tones {
  /** Behind the greeting, at the top of the page. */
  wall: Tone;
  /** Behind the panels, in the middle of the page. */
  surface: Tone;
}

const image = (file: string) => `url("wallpapers/${file}") center / cover no-repeat`;

function scene(id: string, label: string, file: string, tone: Tone, thumb?: string): BackgroundOption {
  return { ref: `image:${id}`, label, css: image(file), thumb: thumb && image(thumb), group: 'Scenes', tone, src: `wallpapers/${file}` };
}

export const PRESETS: BackgroundOption[] = [
  scene('alpine-blue', 'Alpine blue', 'alpine-blue.webp', 'dark', 'alpine-blue-thumb.webp'),
  scene('coastal-hush', 'Coastal hush', 'coastal-hush.webp', 'dark', 'coastal-hush-thumb.webp'),
  scene('city-afterglow', 'City afterglow', 'city-afterglow.webp', 'dark', 'city-afterglow-thumb.webp'),
  scene('neon-reverie', 'Neon reverie', 'neon-reverie.webp', 'dark', 'neon-reverie-thumb.webp'),
  scene('tide', 'Tide', 'tide.svg', 'light'),
  scene('ridge', 'Ridge', 'ridge.svg', 'light'),
  scene('dune', 'Dune', 'dune.svg', 'light'),
  scene('night', 'Night hills', 'night.svg', 'dark'),
  scene('aurora-veil', 'Aurora veil', 'aurora-veil.svg', 'dark'),
  scene('soft-orbit', 'Soft orbit', 'soft-orbit.svg', 'dark'),
  scene('ink-tide', 'Ink tide', 'ink-tide.svg', 'dark'),
  scene('sage-still', 'Sage still', 'sage-still.svg', 'dark'),
  scene('warm-graphite', 'Warm graphite', 'warm-graphite.svg', 'dark'),
  scene('midnight', 'Midnight sky', 'midnight.svg', 'dark'),
  { ref: 'gradient:pine', label: 'Evergreen', css: 'linear-gradient(160deg, #2c5d4f, #122a2a 75%)', group: 'Gradients', tone: 'dark' },
  { ref: 'gradient:dusk', label: 'Dusk', css: 'linear-gradient(165deg, #5a3f78, #d07a6b)', group: 'Gradients', tone: 'dark' },
  { ref: 'gradient:lagoon', label: 'Lagoon', css: 'linear-gradient(150deg, #1c6e8c, #7fc4b0)', group: 'Gradients', tone: 'dark' },
  { ref: 'gradient:ember', label: 'Ember', css: 'linear-gradient(170deg, #7a2e3a, #e0a34e)', group: 'Gradients', tone: 'dark' },
  { ref: 'solid:midnight', label: 'Midnight', css: '#111a2e', group: 'Colors', tone: 'dark' },
  { ref: 'solid:pine', label: 'Pine', css: '#1f4037', group: 'Colors', tone: 'dark' },
  { ref: 'solid:ink', label: 'Ink', css: '#22304f', group: 'Colors', tone: 'dark' },
  { ref: 'solid:plum', label: 'Plum', css: '#47294d', group: 'Colors', tone: 'dark' },
  { ref: 'solid:fog', label: 'Fog', css: '#c9d1d3', group: 'Colors', tone: 'light' },
];

export function uploadOptions(uploads: WallpaperRow[], urlFor: (w: WallpaperRow) => string): BackgroundOption[] {
  return uploads.map((w) => ({
    ref: `upload:${w.id}`,
    label: w.name,
    css: `url("${urlFor(w)}") center / cover no-repeat`,
    group: 'Your images',
    tone: 'dark',
    src: urlFor(w),
  }));
}

const LIGHT_TEXT_ABOVE = 0.55;
const LIGHT_PANEL_ABOVE = 0.42;

/** Reads RGBA pixels and decides which text and panel tone suits each part of the image. */
export function tonesFromPixels(data: Uint8ClampedArray, width: number, height: number, dim = 0): Tones {
  const brightness = (x0: number, x1: number, y0: number, y1: number) => {
    let total = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const at = (y * width + x) * 4;
        total += (0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2]) / 255;
        count++;
      }
    }
    return (total / Math.max(1, count)) * (1 - dim);
  };
  const toTone = (value: number, limit: number): Tone => (value > limit ? 'light' : 'dark');
  const top = Math.max(1, Math.floor(height * 0.3));
  return {
    wall: toTone(brightness(0, width, 0, top), LIGHT_TEXT_ABOVE),
    surface: toTone(brightness(Math.floor(width / 4), Math.ceil((width * 3) / 4), top, Math.ceil(height * 0.8)), LIGHT_PANEL_ABOVE),
  };
}

function dayIndex(day: string, length: number): number {
  let total = 0;
  for (const ch of day) total = (total * 31 + ch.charCodeAt(0)) % 100_003;
  return total % length;
}

/** Fixed mode uses the chosen background; random mode picks one per day from the pool. */
export function chooseBackground(
  settings: Pick<Settings, 'backgroundMode' | 'background' | 'randomPool'>,
  options: BackgroundOption[],
  day: string,
): BackgroundOption {
  const fallback = options.find((o) => o.ref === DEFAULT_SETTINGS.background) ?? options[0];
  if (settings.backgroundMode === 'fixed') {
    return options.find((o) => o.ref === settings.background) ?? fallback;
  }
  const pooled = options.filter((o) => settings.randomPool.includes(o.ref));
  const pool = pooled.length ? pooled : options;
  return pool[dayIndex(day, pool.length)];
}
