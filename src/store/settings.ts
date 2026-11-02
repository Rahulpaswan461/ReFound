import type { Settings } from '../shared/types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  setupComplete: false,
  showRecommendations: true,
  quietAfterFirst: true,
  dailyCount: 3,
  defaultSnooze: '3days',
  excludedFolderIds: [],
  backgroundMode: 'fixed',
  background: 'image:alpine-blue',
  randomPool: [],
  backgroundDim: 20,
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function resetSettings(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
