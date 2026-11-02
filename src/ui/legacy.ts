/** Moves preferences this browser saved under the extension's former name, Recall, then removes them. */
export function moveLegacyPreferences(storage: Storage = localStorage): void {
  try {
    const legacy = Object.keys(storage).filter((key) => key.startsWith('recall.'));
    for (const key of legacy) {
      const renamed = `refound.${key.slice('recall.'.length)}`;
      if (storage.getItem(renamed) === null) storage.setItem(renamed, storage.getItem(key)!);
      storage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable; the defaults apply instead.
  }
}
