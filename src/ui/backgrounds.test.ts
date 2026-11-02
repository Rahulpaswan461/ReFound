import { describe, expect, it } from 'vitest';
import { chooseBackground, PRESETS, tonesFromPixels } from './backgrounds';

describe('chooseBackground', () => {
  const fixed = { backgroundMode: 'fixed' as const, randomPool: [] };
  const random = { backgroundMode: 'random' as const, background: 'solid:ink' };

  it('uses the chosen background in fixed mode', () => {
    expect(chooseBackground({ ...fixed, background: 'solid:plum' }, PRESETS, '2026-06-01').ref).toBe('solid:plum');
  });
  it('falls back when an upload no longer exists', () => {
    expect(chooseBackground({ ...fixed, background: 'upload:gone' }, PRESETS, '2026-06-01').ref).toBe('image:alpine-blue');
  });
  it('is stable within a day and stays inside the pool', () => {
    const pool = ['solid:ink', 'solid:plum'];
    const a = chooseBackground({ ...random, randomPool: pool }, PRESETS, '2026-06-01');
    const b = chooseBackground({ ...random, randomPool: pool }, PRESETS, '2026-06-01');
    expect(a).toEqual(b);
    expect(pool).toContain(a.ref);
  });
  it('rotates between days', () => {
    const refs = new Set(
      Array.from({ length: 30 }, (_, i) =>
        chooseBackground({ ...random, randomPool: [] }, PRESETS, `2026-06-${String(i + 1).padStart(2, '0')}`).ref,
      ),
    );
    expect(refs.size).toBeGreaterThan(3);
  });
});

describe('tonesFromPixels', () => {
  /** A 4 by 4 image; each row has one grey value. */
  const image = (rows: number[]) => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    rows.forEach((grey, y) => {
      for (let x = 0; x < 4; x++) data.set([grey, grey, grey, 255], (y * 4 + x) * 4);
    });
    return data;
  };

  it('reads bright and dark images', () => {
    expect(tonesFromPixels(image([240, 240, 240, 240]), 4, 4)).toEqual({ wall: 'light', surface: 'light' });
    expect(tonesFromPixels(image([20, 20, 20, 20]), 4, 4)).toEqual({ wall: 'dark', surface: 'dark' });
  });

  it('judges the top and the middle separately', () => {
    expect(tonesFromPixels(image([240, 20, 20, 20]), 4, 4)).toEqual({ wall: 'light', surface: 'dark' });
  });

  it('treats a dimmed bright image as dark', () => {
    expect(tonesFromPixels(image([240, 240, 240, 240]), 4, 4, 0.6)).toEqual({ wall: 'dark', surface: 'dark' });
  });
});
