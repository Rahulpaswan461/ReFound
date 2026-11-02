import { useEffect, useState } from 'react';
import { dayKey } from '../../shared/time';
import type { WallpaperRow } from '../../shared/types';
import { db } from '../../store/db';
import { type BackgroundOption, chooseBackground, PRESETS, tonesFromPixels, type Tones, uploadOptions } from '../backgrounds';
import { subscribe, useSettings } from '../useApp';

export function useUploads() {
  const [uploads, setUploads] = useState<WallpaperRow[]>([]);
  const [urls, setUrls] = useState(new Map<string, string>());

  useEffect(() => {
    const load = () => db.wallpapers.toArray().then(setUploads).catch(() => setUploads([]));
    void load();
    return subscribe(load);
  }, []);

  useEffect(() => {
    const next = new Map(uploads.map((w) => [w.id, URL.createObjectURL(w.blob)]));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [uploads]);

  const ready = uploads.filter((w) => urls.has(w.id));
  return [...PRESETS, ...uploadOptions(ready, (w) => urls.get(w.id)!)];
}

async function measure(src: string, dim: number): Promise<Tones> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 27;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return tonesFromPixels(data, canvas.width, canvas.height, dim);
}

const cacheKey = (option: BackgroundOption, dim: number) => `refound.tones.${option.ref}.${dim}`;

/** Remembers measured tones, so the next tab paints correctly from its first frame. */
function cachedTones(option: BackgroundOption, dim: number): Tones {
  try {
    const stored = localStorage.getItem(cacheKey(option, dim));
    if (stored) return JSON.parse(stored) as Tones;
  } catch {
    // Fall through to the preset's tone.
  }
  return { wall: option.tone, surface: option.tone };
}

export function Wallpaper() {
  const settings = useSettings();
  const options = useUploads();
  const chosen = chooseBackground(settings, options, dayKey(new Date()));
  const dim = chosen.src ? settings.backgroundDim / 100 : 0;
  const [tones, setTones] = useState(() => cachedTones(chosen, dim));

  useEffect(() => {
    setTones(cachedTones(chosen, dim));
    if (!chosen.src) return;
    let current = true;
    measure(chosen.src, dim)
      .then((measured) => {
        if (!current) return;
        setTones(measured);
        try {
          localStorage.setItem(cacheKey(chosen, dim), JSON.stringify(measured));
        } catch {
          // The next tab simply measures again.
        }
      })
      .catch((error) => console.warn('ReFound: could not measure background', error));
    return () => {
      current = false;
    };
  }, [chosen.ref, chosen.src, dim]);

  useEffect(() => {
    document.documentElement.dataset.wall = tones.wall;
    document.documentElement.dataset.surface = tones.surface;
  }, [tones]);

  return (
    <>
      <div key={chosen.ref} className="backdrop" style={{ background: chosen.css }} />
      <div className="backdrop-dim" style={{ opacity: dim }} />
    </>
  );
}
