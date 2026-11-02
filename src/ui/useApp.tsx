import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Settings } from '../shared/types';
import { DEFAULT_SETTINGS, getSettings } from '../store/settings';

const channel = new BroadcastChannel('refound');
const here = new EventTarget();

/** Tells this tab and every other ReFound tab that data changed. */
export function announce(): void {
  channel.postMessage('changed');
  here.dispatchEvent(new Event('changed'));
}

export function subscribe(listener: () => void): () => void {
  channel.addEventListener('message', listener);
  here.addEventListener('changed', listener);
  return () => {
    channel.removeEventListener('message', listener);
    here.removeEventListener('changed', listener);
  };
}

export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);
export const useSettings = () => useContext(SettingsContext);

export function useLiveSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const load = () => getSettings().then(setSettings).catch(() => setSettings(DEFAULT_SETTINGS));
    load();
    chrome.storage.onChanged.addListener(load);
    return () => chrome.storage.onChanged.removeListener(load);
  }, []);
  return settings;
}

export interface Route {
  name: 'today' | 'library' | 'settings' | 'welcome';
  query: string;
}

function readRoute(): Route {
  const [path, params] = window.location.hash.replace(/^#\/?/, '').split('?');
  const name = path === 'library' || path === 'settings' || path === 'welcome' ? path : 'today';
  return { name, query: new URLSearchParams(params).get('q') ?? '' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

export function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '32');
  return url.toString();
}

interface Toast {
  text: string;
  undo?: () => void | Promise<void>;
}

const ToastContext = createContext<(toast: Toast) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((next: Toast) => {
    clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), next.undo ? 7000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                setToast(null);
                void toast.undo?.();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
