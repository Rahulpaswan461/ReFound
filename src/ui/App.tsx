import { Component, type ReactNode, useEffect } from 'react';
import { BookMarked, Settings2, Sun } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../store/settings';
import { Logo } from './components/Logo';
import { Wallpaper } from './components/Wallpaper';
import { SearchBox } from './components/SearchBox';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { SettingsPanel } from './pages/SettingsPanel';
import { Welcome } from './pages/Welcome';
import { SettingsContext, ToastProvider, useLiveSettings, useRoute } from './useApp';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="quiet-card">
        <h2>This part of ReFound didn't load</h2>
        <p>Search still works. Reload the tab to try again.</p>
      </div>
    );
  }
}

const TABS = [
  { href: '#/', name: 'today', label: 'Today', Icon: Sun },
  { href: '#/library', name: 'library', label: 'Library', Icon: BookMarked },
  { href: '#/settings', name: 'settings', label: 'Settings', Icon: Settings2 },
] as const;

export function App() {
  const settings = useLiveSettings();
  const route = useRoute();

  useEffect(() => {
    document.title = route.name === 'library' ? 'Library' : route.name === 'settings' ? 'Settings' : 'New Tab';
  }, [route.name]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (route.name === 'library' || route.name === 'settings') window.location.hash = '#/';
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [route.name]);

  const setup = settings && (!settings.setupComplete || route.name === 'welcome');

  return (
    <ToastProvider>
      <Boundary>
        {settings && (
          <SettingsContext.Provider value={settings}>
            <Wallpaper />
          </SettingsContext.Provider>
        )}
      </Boundary>

      <header className="topbar">
        <a className="brand" href="#/" aria-label="ReFound home">
          <Logo />
          ReFound
        </a>
        <nav aria-label="ReFound">
          {TABS.map(({ href, name, label, Icon }) => (
            <a key={name} href={href} aria-current={route.name === name ? 'page' : undefined}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Boundary>
        <SettingsContext.Provider value={settings ?? DEFAULT_SETTINGS}>
          {route.name === 'library' && settings ? (
            <Library key="library" initialQuery={route.query} />
          ) : (
            <main className="today" key="today">
              <SearchBoxWithGreeting />
              {settings && !setup && <Home />}
            </main>
          )}
          {settings && route.name === 'settings' && !setup && <SettingsPanel />}
          {setup && <Welcome />}
        </SettingsContext.Provider>
      </Boundary>
    </ToastProvider>
  );
}

function SearchBoxWithGreeting() {
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <>
      <div className="greeting">
        <p>{time}, {date}</p>
        <h1>Good {part}.</h1>
      </div>
      <SearchBox />
    </>
  );
}
