import { describe, expect, it } from 'vitest';
import { moveLegacyPreferences } from './legacy';

function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as Storage;
  return new Proxy(storage, { ownKeys: () => [...map.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
}

describe('moveLegacyPreferences', () => {
  it('renames old keys and keeps newer values', () => {
    const storage = memoryStorage({
      'recall.library.layout': 'grid',
      'recall.tones.image:tide.0.2': '{}',
      'refound.tones.image:tide.0.2': '{"new":1}',
      other: 'x',
    });
    moveLegacyPreferences(storage);
    expect(storage.getItem('refound.library.layout')).toBe('grid');
    expect(storage.getItem('refound.tones.image:tide.0.2')).toBe('{"new":1}');
    expect(storage.getItem('recall.library.layout')).toBeNull();
    expect(storage.getItem('other')).toBe('x');
  });
});
